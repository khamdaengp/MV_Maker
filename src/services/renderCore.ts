import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { StyleConfig } from '../types';
import { OfflineAudioAnalyzer } from './fft';
import { renderVisualizerFrame, DrawableImage } from './renderer';

export interface TrackInterval {
  title: string;
  artist: string;
  startTime: number;
  duration: number;
}

export interface RenderParams {
  width: number;
  height: number;
  fps: number;
  duration: number;
  videoBitrateMbps: number;
  audioBitrateKbps: number;
  audioCodec: 'aac' | 'opus';
  audioCodecMime: string;
  videoCodec: string;
  style: StyleConfig;
  sampleRate: number;
  numberOfChannels: number;
  audioChannels: Float32Array[];
  images: DrawableImage[];
  beatTimestamps: number[];
  trackIntervals: TrackInterval[];
  onProgress: (progress: {
    currentFrame: number;
    totalFrames: number;
    progressPercent: number;
    fpsEstimate: number;
    etaSeconds: number;
  }) => void;
  isCancelled: () => boolean;
}

/**
 * Executes frame-by-frame offline rendering and WebCodecs muxing to MP4.
 */
export async function executeRenderPipeline(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  params: RenderParams
): Promise<ArrayBuffer> {
  const {
    width,
    height,
    fps,
    duration,
    videoBitrateMbps,
    audioBitrateKbps,
    audioCodec,
    audioCodecMime,
    videoCodec,
    style,
    sampleRate,
    numberOfChannels,
    audioChannels,
    images,
    beatTimestamps,
    trackIntervals,
    onProgress,
    isCancelled,
  } = params;

  // Force even dimensions for H.264
  const evenWidth = width - (width % 2);
  const evenHeight = height - (height % 2);
  canvas.width = evenWidth;
  canvas.height = evenHeight;

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (!ctx) {
    throw new Error('Failed to create canvas 2D rendering context');
  }

  // 1. Initialize mp4-muxer
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width: evenWidth,
      height: evenHeight,
    },
    audio: {
      codec: audioCodec === 'opus' ? 'opus' : 'aac',
      sampleRate,
      numberOfChannels,
    },
    fastStart: 'in-memory',
  });

  let encoderError: Error | null = null;

  // 2. Initialize VideoEncoder
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
      } catch (err) {
        encoderError = err as Error;
      }
    },
    error: (e) => {
      encoderError = new Error(`VideoEncoder error: ${e.message}`);
    },
  });

  // Determine resolution-compatible AVC / H.264 level codec
  // 4K (3840x2160) exceeds Level 4.0 coded area and requires Level 5.1/5.2 (0x33/0x34)
  const totalPixels = evenWidth * evenHeight;
  let candidateCodecs: string[] = [];

  if (totalPixels > 3686400) {
    // 4K UHD (3840x2160 = 8,294,400 pixels) -> Level 5.2 / 5.1
    candidateCodecs = [
      fps > 30 ? 'avc1.640034' : 'avc1.640033', // High Profile Level 5.2 / 5.1
      fps > 30 ? 'avc1.4d0034' : 'avc1.4d0033', // Main Profile Level 5.2 / 5.1
      fps > 30 ? 'avc1.420034' : 'avc1.420033', // Baseline Profile Level 5.2 / 5.1
      'avc1.640034',
      'avc1.640033',
      'avc1.4d0034',
      'avc1.4d0033',
    ];
  } else if (totalPixels > 2097152) {
    // 1440p / 2K -> Level 5.0 (0x32)
    candidateCodecs = [
      'avc1.640032',
      'avc1.4d0032',
      'avc1.420032',
      'avc1.640033',
      'avc1.4d0033',
    ];
  } else if (totalPixels > 921600) {
    // 1080p -> Level 4.2 / 4.0
    candidateCodecs = [
      fps > 30 ? 'avc1.64002a' : 'avc1.640028',
      fps > 30 ? 'avc1.4d002a' : 'avc1.4d0028',
      'avc1.640028',
      'avc1.4d0028',
      'avc1.420028',
    ];
  } else {
    // 720p or lower -> Level 3.1
    candidateCodecs = [
      'avc1.64001f',
      'avc1.4d001f',
      'avc1.42001f',
    ];
  }

  // Prepend or append requested videoCodec if provided
  if (videoCodec) {
    if (totalPixels > 3686400) {
      if (videoCodec.endsWith('33') || videoCodec.endsWith('34')) {
        candidateCodecs.unshift(videoCodec);
      } else {
        candidateCodecs.push(videoCodec);
      }
    } else {
      candidateCodecs.unshift(videoCodec);
    }
  }

  let finalVideoCodec = candidateCodecs[0];
  if (typeof VideoEncoder !== 'undefined' && 'isConfigSupported' in VideoEncoder) {
    for (const c of candidateCodecs) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec: c,
          width: evenWidth,
          height: evenHeight,
          bitrate: Math.round(videoBitrateMbps * 1_000_000),
          framerate: fps,
        });
        if (support.supported) {
          finalVideoCodec = c;
          break;
        }
      } catch {}
    }
  }

  videoEncoder.configure({
    codec: finalVideoCodec,
    width: evenWidth,
    height: evenHeight,
    bitrate: Math.round(videoBitrateMbps * 1_000_000),
    framerate: fps,
  });

  // 3. Initialize AudioEncoder with verified supported bitrate
  const isAacCodec = audioCodec === 'aac' || (audioCodecMime && audioCodecMime.includes('mp4a'));
  const supportedAacRates = [192000, 160000, 128000, 96000];
  let finalAudioBitrate = 192000;

  if (isAacCodec) {
    const reqBps = audioBitrateKbps * 1000;
    // Find closest supported AAC bitrate
    let closest = supportedAacRates[0];
    let minDiff = Math.abs(reqBps - closest);
    for (const rate of supportedAacRates) {
      const diff = Math.abs(reqBps - rate);
      if (diff < minDiff) {
        minDiff = diff;
        closest = rate;
      }
    }
    finalAudioBitrate = closest;
  } else {
    finalAudioBitrate = Math.max(64000, Math.min(320000, Math.round(audioBitrateKbps * 1000)));
  }

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

  const selectedAudioMime = audioCodecMime || (audioCodec === 'opus' ? 'opus' : 'mp4a.40.2');

  audioEncoder.configure({
    codec: selectedAudioMime,
    sampleRate,
    numberOfChannels,
    bitrate: finalAudioBitrate,
  });

  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  onProgress({
    currentFrame: 0,
    totalFrames,
    progressPercent: 1,
    fpsEstimate: 0,
    etaSeconds: 0,
  });

  // 4. Encode Audio Chunks
  const audioChunkFrames = 2048;
  const totalAudioSamples = Math.floor(duration * sampleRate);
  let audioSampleOffset = 0;

  while (audioSampleOffset < totalAudioSamples) {
    if (isCancelled()) {
      throw new Error('Render cancelled by user');
    }
    if (encoderError) throw encoderError;

    const framesInChunk = Math.min(audioChunkFrames, totalAudioSamples - audioSampleOffset);
    // Create planar float32 buffer: channel 0 followed by channel 1
    const planarBuffer = new Float32Array(framesInChunk * numberOfChannels);

    for (let ch = 0; ch < numberOfChannels; ch++) {
      const channelData = audioChannels[ch] || audioChannels[0];
      const channelOffset = ch * framesInChunk;
      for (let i = 0; i < framesInChunk; i++) {
        const srcIdx = audioSampleOffset + i;
        planarBuffer[channelOffset + i] = srcIdx < channelData.length ? channelData[srcIdx] : 0;
      }
    }

    const timestampUs = Math.round((audioSampleOffset / sampleRate) * 1_000_000);

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

    audioSampleOffset += framesInChunk;
  }

  // 5. Initialize FFT Audio Analyzer for frame-exact frequency & waveform data
  const audioAnalyzer = new OfflineAudioAnalyzer(1024, style.visualizer.smoothing);
  const primaryChannel = audioChannels[0];

  const startTime = performance.now();
  let lastReportTime = startTime;

  // 6. Frame-by-Frame Video Encoding Loop
  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    if (isCancelled()) {
      throw new Error('Render cancelled by user');
    }
    if (encoderError) throw encoderError;

    // Backpressure: pause if encoder queue is filling up
    while (videoEncoder.encodeQueueSize > 4) {
      if (isCancelled()) throw new Error('Render cancelled by user');
      await new Promise((r) => setTimeout(r, 10));
    }

    const currentTime = frameIdx / fps;
    const sampleIdx = Math.floor(currentTime * sampleRate);

    // Compute exact FFT frame data
    const { frequencyData, timeDomainData } = audioAnalyzer.getFrameData(
      primaryChannel,
      sampleIdx
    );

    // Determine current & next image based on Slideshow Mode
    let currentImage: DrawableImage | null = null;
    let nextImage: DrawableImage | null = null;
    let crossfadeAlpha = 0;

    if (images.length > 0) {
      if (style.slideshowMode === 'single' || images.length === 1) {
        currentImage = images[0];
      } else if (style.slideshowMode === 'even') {
        const imgDuration = duration / images.length;
        const rawIdx = Math.floor(currentTime / imgDuration);
        const curIdx = rawIdx % images.length;
        const nxtIdx = (curIdx + 1) % images.length;
        currentImage = images[curIdx];
        nextImage = images[nxtIdx];

        // Transition in the last crossfadeDuration seconds of each segment
        const timeInSegment = currentTime - rawIdx * imgDuration;
        const transStart = Math.max(0, imgDuration - style.crossfadeDuration);
        if (timeInSegment > transStart && style.crossfadeDuration > 0) {
          crossfadeAlpha = (timeInSegment - transStart) / style.crossfadeDuration;
        }
      } else if (style.slideshowMode === 'beat_synced') {
        // Find which beat interval currentTime belongs to
        let beatIdx = 0;
        for (let b = 0; b < beatTimestamps.length; b++) {
          if (currentTime >= beatTimestamps[b]) {
            beatIdx = b + 1;
          } else {
            break;
          }
        }
        const curIdx = beatIdx % images.length;
        const nxtIdx = (curIdx + 1) % images.length;
        currentImage = images[curIdx];
        nextImage = images[nxtIdx];

        // Fast crossfade (0.3s) at each beat boundary
        const nextBeatTime = beatTimestamps[beatIdx] ?? duration;
        const transStart = Math.max(0, nextBeatTime - 0.3);
        if (currentTime > transStart) {
          crossfadeAlpha = (currentTime - transStart) / 0.3;
        }
      }
    }

    // Determine active song title & artist for current timestamp
    let activeTrack = trackIntervals[0];
    for (const track of trackIntervals) {
      if (
        currentTime >= track.startTime &&
        currentTime < track.startTime + track.duration + 0.1
      ) {
        activeTrack = track;
        break;
      }
    }

    const songLocalTime = activeTrack ? Math.max(0, currentTime - activeTrack.startTime) : currentTime;
    const songDuration = activeTrack ? activeTrack.duration : duration;

    // Draw frame to canvas
    renderVisualizerFrame(ctx, {
      width: evenWidth,
      height: evenHeight,
      currentImage,
      nextImage,
      crossfadeAlpha,
      frequencyData,
      timeDomainData,
      style,
      currentTime: songLocalTime,
      text: activeTrack
        ? {
            title: activeTrack.title,
            artist: activeTrack.artist,
            currentTime: songLocalTime,
            trackDuration: songDuration,
          }
        : undefined,
    });

    // Create VideoFrame and encode
    const frameTimestampUs = Math.round(currentTime * 1_000_000);
    const frameDurationUs = Math.round((1 / fps) * 1_000_000);

    const videoFrame = new VideoFrame(canvas, {
      timestamp: frameTimestampUs,
      duration: frameDurationUs,
    });

    const isKeyFrame = frameIdx % (fps * 2) === 0;
    videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
    videoFrame.close();

    // Report progress periodically
    const now = performance.now();
    if (now - lastReportTime > 150 || frameIdx === 0 || frameIdx === totalFrames - 1) {
      const elapsedSec = (now - startTime) / 1000;
      const fpsEstimate = elapsedSec > 0 ? Math.round((frameIdx + 1) / elapsedSec) : 0;
      const remainingFrames = totalFrames - (frameIdx + 1);
      const etaSeconds = fpsEstimate > 0 ? Math.ceil(remainingFrames / fpsEstimate) : 0;

      onProgress({
        currentFrame: frameIdx + 1,
        totalFrames,
        progressPercent: Math.round(((frameIdx + 1) / totalFrames) * 100),
        fpsEstimate,
        etaSeconds,
      });

      lastReportTime = now;
      // Yield to allow UI or event loop to breathe
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // 7. Flush Encoders and Finalize MP4 Muxer
  await videoEncoder.flush();
  await audioEncoder.flush();
  videoEncoder.close();
  audioEncoder.close();

  if (encoderError) {
    throw encoderError;
  }

  muxer.finalize();
  return target.buffer;
}
