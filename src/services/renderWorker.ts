import { executeRenderPipeline, TrackInterval } from './renderCore';
import { StyleConfig } from '../types';

let isCancelledFlag = false;

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'CANCEL') {
    isCancelledFlag = true;
    return;
  }

  if (type === 'START') {
    isCancelledFlag = false;
    try {
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
        imageBitmaps,
        beatTimestamps,
        trackIntervals,
      }: {
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
      } = payload;

      const canvas = new OffscreenCanvas(width, height);

      const buffer = await executeRenderPipeline(canvas, {
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
        images: imageBitmaps,
        beatTimestamps,
        trackIntervals,
        onProgress: (progress) => {
          self.postMessage({ type: 'PROGRESS', progress });
        },
        isCancelled: () => isCancelledFlag,
      });

      // Transfer buffer
      self.postMessage({ type: 'DONE', buffer }, [buffer]);
    } catch (err: unknown) {
      const error = err as Error;
      self.postMessage({
        type: 'ERROR',
        error: error.message || 'Render failed in worker',
      });
    }
  }
};
