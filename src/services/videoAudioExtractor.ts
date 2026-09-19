import { AudioTrack } from '../types';
import { parseFromFilename } from './audioDecoder';
import {
  SupportedAudioFormat,
  convertAudioBufferToFormat,
} from '../utils/audioFormatConverter';

export interface ExtractedAudioResult {
  baseName: string;
  format: SupportedAudioFormat;
  fileName: string;
  suggestedTitle: string;
  suggestedArtist: string;
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  audioBuffer: AudioBuffer;
  blob: Blob;
  url: string;
  createAudioTrack: () => AudioTrack;
}

/**
 * Extracts the audio track from a video file (.mp4, .webm, .mov, etc.)
 * directly in the browser and encodes it into the chosen audio format.
 */
export async function extractAudioFromVideo(
  videoFile: File,
  targetFormat: SupportedAudioFormat = 'mp3',
  bitrateKbps: number = 192,
  onProgress?: (percent: number, message: string) => void
): Promise<ExtractedAudioResult> {
  onProgress?.(10, 'Reading video file data...');

  const arrayBuffer = await videoFile.arrayBuffer();
  onProgress?.(40, 'Demuxing and decoding audio stream...');

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    audioCtx.close();
    throw new Error(
      `Failed to extract audio from ${videoFile.name}. The video may not contain a standard audio track or uses an unsupported codec.`
    );
  } finally {
    audioCtx.close();
  }

  onProgress?.(70, `Encoding to ${targetFormat.toUpperCase()} format...`);

  const { blob, extension } = await convertAudioBufferToFormat(
    audioBuffer,
    targetFormat,
    bitrateKbps,
    (pct) => onProgress?.(70 + Math.round(pct * 0.25), `Encoding to ${targetFormat.toUpperCase()} (${pct}%)...`)
  );

  const url = URL.createObjectURL(blob);
  const fallback = parseFromFilename(videoFile.name);
  const baseName = videoFile.name.replace(/\.[^/.]+$/, '');
  const fileName = `${baseName}.${extension}`;

  const rawChannels: Float32Array[] = [];
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    rawChannels.push(new Float32Array(audioBuffer.getChannelData(i)));
  }

  onProgress?.(100, `Audio extracted successfully as .${extension}!`);

  return {
    baseName,
    format: targetFormat,
    fileName,
    suggestedTitle: fallback.title,
    suggestedArtist: fallback.artist,
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels,
    audioBuffer,
    blob,
    url,
    createAudioTrack: () => {
      const audioFile = new File([blob], fileName, { type: blob.type });
      return {
        id: `extracted-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file: audioFile,
        name: fileName,
        title: fallback.title,
        artist: fallback.artist,
        duration: audioBuffer.duration,
        audioBuffer,
        rawChannelData: rawChannels,
        sampleRate: audioBuffer.sampleRate,
        url,
      };
    },
  };
}
