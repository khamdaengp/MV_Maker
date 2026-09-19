import { Mp3Encoder } from '@breezystack/lamejs';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { audioBufferToWav } from './wavEncoder';

export type SupportedAudioFormat = 'mp3' | 'wav' | 'm4a';

export interface FormatConvertOptions {
  format: SupportedAudioFormat;
  bitrateKbps?: number; // for mp3/aac e.g. 192, 320
}

/**
 * Converts float32 audio samples (-1 to 1) to Int16Array (-32768 to 32767).
 */
function floatToInt16(floatSamples: Float32Array): Int16Array {
  const int16 = new Int16Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i++) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

/**
 * Encodes an AudioBuffer into an MP3 Blob using LAME.
 */
export async function encodeAudioBufferToMp3(
  audioBuffer: AudioBuffer,
  bitrateKbps: number = 192,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const numChannels = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const encoder = new Mp3Encoder(numChannels, sampleRate, bitrateKbps);

  const leftInt16 = floatToInt16(audioBuffer.getChannelData(0));
  const rightInt16 =
    numChannels > 1
      ? floatToInt16(audioBuffer.getChannelData(1))
      : leftInt16;

  const chunkSize = 1152; // standard MP3 frame size
  const mp3DataChunks: BlobPart[] = [];
  const totalSamples = leftInt16.length;

  for (let i = 0; i < totalSamples; i += chunkSize) {
    const leftChunk = leftInt16.subarray(i, i + chunkSize);
    const rightChunk = rightInt16.subarray(i, i + chunkSize);

    const mp3buf =
      numChannels === 1
        ? encoder.encodeBuffer(leftChunk)
        : encoder.encodeBuffer(leftChunk, rightChunk);

    if (mp3buf && mp3buf.length > 0) {
      mp3DataChunks.push(new Uint8Array(mp3buf));
    }

    if (onProgress && i % (chunkSize * 20) === 0) {
      onProgress(Math.round((i / totalSamples) * 100));
      // Yield to event loop
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const endBuf = encoder.flush();
  if (endBuf && endBuf.length > 0) {
    mp3DataChunks.push(new Uint8Array(endBuf));
  }

  onProgress?.(100);
  return new Blob(mp3DataChunks, { type: 'audio/mp3' });
}

/**
 * Encodes an AudioBuffer into an M4A / AAC file using WebCodecs AudioEncoder and mp4-muxer.
 */
export async function encodeAudioBufferToM4a(
  audioBuffer: AudioBuffer,
  bitrateKbps: number = 192
): Promise<Blob> {
  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;
  const duration = audioBuffer.duration;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    audio: {
      codec: 'aac',
      sampleRate,
      numberOfChannels,
    },
    fastStart: 'in-memory',
  });

  let encoderError: Error | null = null;
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addAudioChunk(chunk, meta);
      } catch (err) {
        encoderError = err as Error;
      }
    },
    error: (e) => {
      encoderError = new Error(`AudioEncoder error: ${e.message}`);
    },
  });

  // Clamp to supported browser AAC bitrate
  const supportedAacRates = [192000, 160000, 128000, 96000];
  let finalBitrate = 192000;
  const targetBps = bitrateKbps * 1000;
  let minDiff = Math.abs(targetBps - finalBitrate);
  for (const r of supportedAacRates) {
    const diff = Math.abs(targetBps - r);
    if (diff < minDiff) {
      minDiff = diff;
      finalBitrate = r;
    }
  }

  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate,
    numberOfChannels,
    bitrate: finalBitrate,
  });

  const chunkSize = 2048;
  const totalSamples = Math.floor(duration * sampleRate);
  let offset = 0;

  while (offset < totalSamples) {
    if (encoderError) throw encoderError;

    const framesInChunk = Math.min(chunkSize, totalSamples - offset);
    const planarBuffer = new Float32Array(framesInChunk * numberOfChannels);

    for (let ch = 0; ch < numberOfChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      const chOffset = ch * framesInChunk;
      for (let i = 0; i < framesInChunk; i++) {
        planarBuffer[chOffset + i] = offset + i < channelData.length ? channelData[offset + i] : 0;
      }
    }

    const timestampUs = Math.round((offset / sampleRate) * 1_000_000);
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: framesInChunk,
      numberOfChannels,
      timestamp: timestampUs,
      data: planarBuffer,
    });

    audioEncoder.encode(audioData);
    audioData.close();
    offset += framesInChunk;
  }

  await audioEncoder.flush();
  audioEncoder.close();

  if (encoderError) throw encoderError;

  muxer.finalize();
  return new Blob([target.buffer], { type: 'audio/mp4' });
}

/**
 * Universal AudioBuffer to target format converter.
 */
export async function convertAudioBufferToFormat(
  audioBuffer: AudioBuffer,
  format: SupportedAudioFormat,
  bitrateKbps: number = 192,
  onProgress?: (percent: number) => void
): Promise<{ blob: Blob; mimeType: string; extension: string }> {
  if (format === 'mp3') {
    const blob = await encodeAudioBufferToMp3(audioBuffer, bitrateKbps, onProgress);
    return { blob, mimeType: 'audio/mp3', extension: 'mp3' };
  } else if (format === 'm4a') {
    const blob = await encodeAudioBufferToM4a(audioBuffer, bitrateKbps);
    return { blob, mimeType: 'audio/mp4', extension: 'm4a' };
  } else {
    // Default WAV
    const blob = audioBufferToWav(audioBuffer);
    onProgress?.(100);
    return { blob, mimeType: 'audio/wav', extension: 'wav' };
  }
}
