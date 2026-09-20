import { zipSync } from 'fflate';
import { AudioTrack, ImageItem, OutputConfig, RenderJob, StyleConfig } from '../types';
import { detectAudioBeats } from './beatDetector';
import { checkBrowserWebCodecsSupport, getOptimalVideoCodecForResolution } from './webcodecsChecker';
import { executeRenderPipeline, executeMediaRecorderPipeline, TrackInterval } from './renderCore';

/**
 * Sanitizes a string for use as a safe filename.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .substring(0, 100);
}

/**
 * Creates ImageBitmap instances from an array of ImageItems.
 */
export async function prepareImageBitmaps(images: ImageItem[]): Promise<ImageBitmap[]> {
  const bitmaps: ImageBitmap[] = [];
  for (const img of images) {
    try {
      const resp = await fetch(img.url);
      const blob = await resp.blob();
      const bitmap = await createImageBitmap(blob);
      bitmaps.push(bitmap);
    } catch {
      // Create fallback bitmap
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 360;
      const b = await createImageBitmap(c);
      bitmaps.push(b);
    }
  }
  return bitmaps;
}

/**
 * Concatenates multiple audio tracks into a single continuous pair of channels,
 * with support for seamless direct cut, silence gap, or crossfade.
 */
export function buildCombinedAudioTimeline(
  tracks: AudioTrack[],
  output: OutputConfig
): {
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  channels: Float32Array[];
  trackIntervals: TrackInterval[];
} {
  if (tracks.length === 0) {
    throw new Error('No tracks available to combine');
  }

  const sampleRate = tracks[0].sampleRate || 44100;
  const numberOfChannels = 2;
  const transitionType = output.combinedTransition;
  const transDuration = Math.max(0, output.combinedTransitionDuration);

  const trackIntervals: TrackInterval[] = [];
  let currentTimelineSample = 0;

  // Calculate total samples needed
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const trackSamples = Math.floor(track.duration * sampleRate);
    const startTimeSec = currentTimelineSample / sampleRate;

    trackIntervals.push({
      title: track.title,
      artist: track.artist,
      startTime: startTimeSec,
      duration: track.duration,
    });

    if (i < tracks.length - 1) {
      if (transitionType === 'gap') {
        const gapSamples = Math.floor(transDuration * sampleRate);
        currentTimelineSample += trackSamples + gapSamples;
      } else if (transitionType === 'crossfade') {
        const xfadeSamples = Math.floor(Math.min(transDuration, track.duration) * sampleRate);
        currentTimelineSample += Math.max(0, trackSamples - xfadeSamples);
      } else {
        // seamless direct
        currentTimelineSample += trackSamples;
      }
    } else {
      currentTimelineSample += trackSamples;
    }
  }

  const totalLength = currentTimelineSample;
  const left = new Float32Array(totalLength);
  const right = new Float32Array(totalLength);

  // Blend samples into timeline
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const interval = trackIntervals[i];
    const startSample = Math.floor(interval.startTime * sampleRate);
    const trackSamples = Math.floor(track.duration * sampleRate);

    const srcLeft = track.rawChannelData?.[0] || new Float32Array(trackSamples);
    const srcRight = track.rawChannelData?.[1] || srcLeft;

    const isCrossfading = transitionType === 'crossfade' && transDuration > 0;
    const xfadeSamples = Math.floor(transDuration * sampleRate);

    for (let s = 0; s < trackSamples; s++) {
      const destIdx = startSample + s;
      if (destIdx >= totalLength) break;

      let gain = 1.0;
      // Crossfade in if not the first track
      if (isCrossfading && i > 0 && s < xfadeSamples) {
        gain = s / xfadeSamples;
      }
      // Crossfade out if not the last track
      if (isCrossfading && i < tracks.length - 1 && s > trackSamples - xfadeSamples) {
        gain = Math.max(0, (trackSamples - s) / xfadeSamples);
      }

      left[destIdx] += (srcLeft[s] || 0) * gain;
      right[destIdx] += (srcRight[s] || 0) * gain;
    }
  }

  return {
    duration: totalLength / sampleRate,
    sampleRate,
    numberOfChannels,
    channels: [left, right],
    trackIntervals,
  };
}

export class ExportManager {
  private activeWorker: Worker | null = null;
  private isCancelledFlag = false;

  cancelCurrentJob() {
    this.isCancelledFlag = true;
    if (this.activeWorker) {
      this.activeWorker.postMessage({ type: 'CANCEL' });
      this.activeWorker.terminate();
      this.activeWorker = null;
    }
  }

  /**
   * Renders a single job using Web Worker or fallback to Main Thread.
   */
  async renderJob(
    _job: RenderJob,
    jobConfig: {
      track: AudioTrack;
      images: ImageItem[];
      style: StyleConfig;
      output: OutputConfig;
      combinedTracks?: AudioTrack[];
    },
    onProgress: (progress: {
      currentFrame: number;
      totalFrames: number;
      progressPercent: number;
      fpsEstimate: number;
      etaSeconds: number;
    }) => void
  ): Promise<Blob> {
    this.isCancelledFlag = false;

    // Check codecs
    const codecSupport = await checkBrowserWebCodecsSupport();
    if (!codecSupport.hasWebCodecs && !codecSupport.hasMediaRecorder) {
      throw new Error(codecSupport.errorMessage || 'Video rendering is not supported in this browser');
    }

    const { images, style, output } = jobConfig;
    const isCombined = output.mode === 'combined';

    let duration: number;
    let sampleRate: number;
    let numberOfChannels: number;
    let audioChannels: Float32Array[];
    let trackIntervals: TrackInterval[];

    if (isCombined && jobConfig.combinedTracks && jobConfig.combinedTracks.length > 0) {
      const combined = buildCombinedAudioTimeline(jobConfig.combinedTracks, output);
      duration = combined.duration;
      sampleRate = combined.sampleRate;
      numberOfChannels = combined.numberOfChannels;
      audioChannels = combined.channels;
      trackIntervals = combined.trackIntervals;
    } else {
      const track = jobConfig.track;
      duration = track.duration;
      sampleRate = track.sampleRate || 44100;
      numberOfChannels = 2;
      audioChannels = [
        track.rawChannelData?.[0] || new Float32Array(Math.floor(duration * sampleRate)),
        track.rawChannelData?.[1] || track.rawChannelData?.[0] || new Float32Array(Math.floor(duration * sampleRate)),
      ];
      trackIntervals = [
        {
          title: track.title,
          artist: track.artist,
          startTime: 0,
          duration: track.duration,
        },
      ];
    }

    // Precompute beats for slideshow
    const beatTimestamps = detectAudioBeats(audioChannels[0], sampleRate, style.beatMinInterval);

    // Prepare image bitmaps
    const imageBitmaps = await prepareImageBitmaps(images);

    // Determine selected audio codec based on output configuration
    const selectedAudioCodec = output.audioCodecPreference || codecSupport.supportedAudioCodec || 'aac';
    const selectedAudioMime = selectedAudioCodec === 'opus' ? 'opus' : (codecSupport.audioCodecMime || 'mp4a.40.2');

    // Dynamically resolve optimal video codec (e.g. AVC Level 5.1/5.2 for 4K, 4.2 for 1080p60)
    const optimalVideoCodec = (await getOptimalVideoCodecForResolution(
      output.width,
      output.height,
      output.fps,
      output.videoBitrateMbps
    )) || codecSupport.supportedVideoCodec || 'avc1.42001f';

    // Route A: MediaRecorder Fallback (Firefox, Safari, non-secure HTTP contexts)
    if (!codecSupport.hasWebCodecs && codecSupport.hasMediaRecorder) {
      const canvas = document.createElement('canvas');
      const { blob, mimeType } = await executeMediaRecorderPipeline(
        canvas,
        {
          width: output.width,
          height: output.height,
          fps: output.fps,
          duration,
          videoBitrateMbps: output.videoBitrateMbps,
          audioBitrateKbps: output.audioBitrateKbps,
          audioCodec: selectedAudioCodec,
          audioCodecMime: selectedAudioMime,
          videoCodec: optimalVideoCodec,
          style,
          sampleRate,
          numberOfChannels,
          audioChannels,
          images: imageBitmaps,
          beatTimestamps,
          trackIntervals,
          onProgress,
          isCancelled: () => this.isCancelledFlag,
        },
        codecSupport.recorderMimeType
      );

      // If recorded as WebM instead of MP4, adjust fileName
      if (mimeType.includes('webm') && _job.fileName.endsWith('.mp4')) {
        _job.fileName = _job.fileName.replace(/\.mp4$/, '.webm');
      }

      return blob;
    }

    // Route B: High-Performance Hardware WebCodecs (Worker or Main Thread fallback)
    try {
      const buffer = await this.renderInWorker({
        width: output.width,
        height: output.height,
        fps: output.fps,
        duration,
        videoBitrateMbps: output.videoBitrateMbps,
        audioBitrateKbps: output.audioBitrateKbps,
        audioCodec: selectedAudioCodec,
        audioCodecMime: selectedAudioMime,
        videoCodec: optimalVideoCodec,
        style,
        sampleRate,
        numberOfChannels,
        audioChannels,
        imageBitmaps,
        beatTimestamps,
        trackIntervals,
        onProgress,
      });

      return new Blob([buffer], { type: 'video/mp4' });
    } catch (workerErr: unknown) {
      const err = workerErr as Error;
      if (err.message === 'Render cancelled by user' || this.isCancelledFlag) {
        throw new Error('Render cancelled by user');
      }

      console.warn('Worker render failed or unsupported, falling back to main thread:', err);

      // Re-prepare image bitmaps as worker transfer detaches them
      const fallbackBitmaps = await prepareImageBitmaps(images);

      // Main Thread execution fallback
      const canvas = document.createElement('canvas');
      const buffer = await executeRenderPipeline(canvas, {
        width: output.width,
        height: output.height,
        fps: output.fps,
        duration,
        videoBitrateMbps: output.videoBitrateMbps,
        audioBitrateKbps: output.audioBitrateKbps,
        audioCodec: selectedAudioCodec,
        audioCodecMime: selectedAudioMime,
        videoCodec: optimalVideoCodec,
        style,
        sampleRate,
        numberOfChannels,
        audioChannels,
        images: fallbackBitmaps,
        beatTimestamps,
        trackIntervals,
        onProgress,
        isCancelled: () => this.isCancelledFlag,
      });

      return new Blob([buffer], { type: 'video/mp4' });
    }
  }

  private renderInWorker(params: {
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
    imageBitmaps: ImageBitmap[];
    beatTimestamps: number[];
    trackIntervals: TrackInterval[];
    onProgress: (p: {
      currentFrame: number;
      totalFrames: number;
      progressPercent: number;
      fpsEstimate: number;
      etaSeconds: number;
    }) => void;
  }): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(new URL('./renderWorker.ts', import.meta.url), {
          type: 'module',
        });
        this.activeWorker = worker;

        worker.onmessage = (e: MessageEvent) => {
          const { type, progress, buffer, error } = e.data;
          if (type === 'PROGRESS') {
            params.onProgress(progress);
          } else if (type === 'DONE') {
            this.activeWorker = null;
            worker.terminate();
            resolve(buffer);
          } else if (type === 'ERROR') {
            this.activeWorker = null;
            worker.terminate();
            reject(new Error(error || 'Worker render error'));
          }
        };

        worker.onerror = (err) => {
          this.activeWorker = null;
          worker.terminate();
          reject(new Error(err.message || 'Worker initialization failed'));
        };

        // Transfer ImageBitmaps and Float32Array buffers
        const transferables: Transferable[] = [...params.imageBitmaps];
        params.audioChannels.forEach((ch) => {
          // Copy buffer to avoid detaching primary channel in main thread
          transferables.push(ch.buffer.slice(0));
        });

        worker.postMessage(
          {
            type: 'START',
            payload: params,
          },
          transferables
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Bundles all finished MP4 blobs into a ZIP file using fflate.
   */
  static async createZipArchive(jobs: RenderJob[]): Promise<Blob> {
    const completedJobs = jobs.filter((j) => j.status === 'completed' && j.outputBlob);
    if (completedJobs.length === 0) {
      throw new Error('No completed videos to download');
    }

    const files: Record<string, Uint8Array> = {};
    for (const job of completedJobs) {
      if (job.outputBlob) {
        const arrayBuf = await job.outputBlob.arrayBuffer();
        files[job.fileName] = new Uint8Array(arrayBuf);
      }
    }

    const zipped = zipSync(files, { level: 0 }); // Store/no recompression since MP4 is already compressed
    return new Blob([zipped], { type: 'application/zip' });
  }
}

export const exportManager = new ExportManager();
