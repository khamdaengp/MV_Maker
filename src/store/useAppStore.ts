import { create } from 'zustand';
import {
  AudioTrack,
  ImageItem,
  StyleConfig,
  OutputConfig,
  RenderJob,
  AspectPreset,
  ResolutionPreset,
  VisualizerConfig,
  TextOverlayConfig,
  VisualEffectsConfig,
} from '../types';
import { checkBrowserWebCodecsSupport, CodecSupportResult } from '../services/webcodecsChecker';
import { generateDemoAudioTrack, generateDemoImages } from '../services/demoGenerator';
import { exportManager, sanitizeFilename } from '../services/exportManager';

export type AppStep = 1 | 2 | 3 | 4 | 5;

const initialStyleConfig: StyleConfig = {
  slideshowMode: 'even',
  imageFit: 'contain_blur',
  crossfadeDuration: 1.5,
  beatMinInterval: 2.0,
  visualizer: {
    style: 'bars',
    colorMode: 'gradient',
    primaryColor: '#00f2fe',
    secondaryColor: '#4facfe',
    position: 'bottom',
    posX: 50,
    posY: 88,
    barCount: 48,
    barSpacing: 4,
    thickness: 4,
    radius: 50,
    opacity: 0.9,
    smoothing: 0.8,
    sensitivity: 1.2,
    mirror: true,
  },
  textOverlay: {
    enabled: false,
    fontFamily: 'Inter, sans-serif',
    titleSize: 42,
    artistSize: 24,
    textColor: '#ffffff',
    dropShadow: true,
    position: 'bottom-left',
    timingMode: 'fade_in_out',
    displayDuration: 6,
    fadeDuration: 1.5,
  },
  effects: {
    bassShake: false,
    bassShakeIntensity: 0.6,
    glowBloom: true,
    glowIntensity: 15,
    particlesOverlay: false,
    particleSpeed: 1.0,
    filmGrain: false,
    filmGrainOpacity: 0.15,
    vignetteIntensity: 0.45,
    chromaticAberration: false,
  },
};

const initialOutputConfig: OutputConfig = {
  mode: 'per_song',
  aspectPreset: '16:9',
  resolutionPreset: '1080p',
  width: 1920,
  height: 1080,
  fps: 30,
  videoBitrateMbps: 8,
  audioBitrateKbps: 192,
  audioCodecPreference: 'aac',
  combinedTransition: 'none',
  combinedTransitionDuration: 1.0,
};

// Preset resolution resolution map
export const RESOLUTION_MAP: Record<
  AspectPreset,
  Record<ResolutionPreset, { width: number; height: number }>
> = {
  '16:9': {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '4k': { width: 3840, height: 2160 },
    custom: { width: 1920, height: 1080 },
  },
  '9:16': {
    '720p': { width: 720, height: 1280 },
    '1080p': { width: 1080, height: 1920 },
    '4k': { width: 2160, height: 3840 },
    custom: { width: 1080, height: 1920 },
  },
  '1:1': {
    '720p': { width: 720, height: 720 },
    '1080p': { width: 1080, height: 1080 },
    '4k': { width: 2160, height: 2160 },
    custom: { width: 1080, height: 1080 },
  },
  custom: {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '4k': { width: 3840, height: 2160 },
    custom: { width: 1920, height: 1080 },
  },
};

interface AppState {
  theme: 'light' | 'dark';
  currentStep: AppStep;
  tracks: AudioTrack[];
  images: ImageItem[];
  activeTrackId: string | null;
  style: StyleConfig;
  output: OutputConfig;
  renderQueue: RenderJob[];
  isRendering: boolean;
  codecSupport: CodecSupportResult | null;
  isLoadingDemo: boolean;
  isVideoToAudioOpen: boolean;
  isImportLinkOpen: boolean;

  // Actions
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setCurrentStep: (step: AppStep) => void;
  checkCodecSupport: () => Promise<void>;
  setVideoToAudioOpen: (open: boolean) => void;
  setImportLinkOpen: (open: boolean) => void;

  addTracks: (newTracks: AudioTrack[]) => void;
  updateTrack: (id: string, updates: Partial<AudioTrack>) => void;
  removeTrack: (id: string) => void;
  reorderTracks: (tracks: AudioTrack[]) => void;
  setActiveTrackId: (id: string | null) => void;

  addImages: (newImages: ImageItem[]) => void;
  removeImage: (id: string) => void;
  reorderImages: (images: ImageItem[]) => void;

  updateStyle: (updates: Partial<StyleConfig>) => void;
  updateVisualizer: (updates: Partial<VisualizerConfig>) => void;
  updateTextOverlay: (updates: Partial<TextOverlayConfig>) => void;
  updateEffects: (updates: Partial<VisualEffectsConfig>) => void;

  updateOutput: (updates: Partial<OutputConfig>) => void;
  setOutputPreset: (aspect: AspectPreset, res: ResolutionPreset) => void;

  initRenderQueue: () => void;
  startRendering: () => Promise<void>;
  cancelRendering: () => void;
  loadDemoProject: () => Promise<void>;
  resetProject: () => void;
}

// Initial theme from system / localStorage
function getInitialTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('mv_maker_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  }
  return 'dark';
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: getInitialTheme(),
  currentStep: 1,
  tracks: [],
  images: [],
  activeTrackId: null,
  style: initialStyleConfig,
  output: initialOutputConfig,
  renderQueue: [],
  isRendering: false,
  codecSupport: null,
  isLoadingDemo: false,
  isVideoToAudioOpen: false,
  isImportLinkOpen: false,

  setTheme: (theme) => {
    localStorage.setItem('mv_maker_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  setCurrentStep: (step) => set({ currentStep: step }),

  setVideoToAudioOpen: (open) => set({ isVideoToAudioOpen: open }),
  setImportLinkOpen: (open) => set({ isImportLinkOpen: open }),

  checkCodecSupport: async () => {
    const support = await checkBrowserWebCodecsSupport();
    set({ codecSupport: support });
  },

  addTracks: (newTracks) =>
    set((state) => {
      const updated = [...state.tracks, ...newTracks];
      return {
        tracks: updated,
        activeTrackId: state.activeTrackId || updated[0]?.id || null,
      };
    }),

  updateTrack: (id, updates) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  removeTrack: (id) =>
    set((state) => {
      const updated = state.tracks.filter((t) => t.id !== id);
      const active =
        state.activeTrackId === id ? updated[0]?.id || null : state.activeTrackId;
      return { tracks: updated, activeTrackId: active };
    }),

  reorderTracks: (tracks) => set({ tracks }),

  setActiveTrackId: (id) => set({ activeTrackId: id }),

  addImages: (newImages) =>
    set((state) => ({
      images: [...state.images, ...newImages],
    })),

  removeImage: (id) =>
    set((state) => ({
      images: state.images.filter((i) => i.id !== id),
    })),

  reorderImages: (images) => set({ images }),

  updateStyle: (updates) =>
    set((state) => ({
      style: { ...state.style, ...updates },
    })),

  updateVisualizer: (updates) =>
    set((state) => ({
      style: {
        ...state.style,
        visualizer: { ...state.style.visualizer, ...updates },
      },
    })),

  updateTextOverlay: (updates) =>
    set((state) => ({
      style: {
        ...state.style,
        textOverlay: { ...state.style.textOverlay, ...updates },
      },
    })),

  updateEffects: (updates) =>
    set((state) => ({
      style: {
        ...state.style,
        effects: { ...state.style.effects, ...updates },
      },
    })),

  updateOutput: (updates) =>
    set((state) => ({
      output: { ...state.output, ...updates },
    })),

  setOutputPreset: (aspect, res) =>
    set((state) => {
      const dims = RESOLUTION_MAP[aspect]?.[res] || { width: 1920, height: 1080 };
      return {
        output: {
          ...state.output,
          aspectPreset: aspect,
          resolutionPreset: res,
          width: dims.width,
          height: dims.height,
        },
      };
    }),

  initRenderQueue: () => {
    const { tracks, output } = get();
    if (tracks.length === 0) {
      set({ renderQueue: [] });
      return;
    }

    if (output.mode === 'combined') {
      const firstArtist = tracks[0].artist || 'Various Artists';
      const combinedTitle = `${firstArtist} - Complete Album`;
      const fileName = `${sanitizeFilename(combinedTitle)}.mp4`;

      set({
        renderQueue: [
          {
            id: 'job-combined',
            title: combinedTitle,
            status: 'idle',
            progress: 0,
            currentFrame: 0,
            totalFrames: 0,
            fpsEstimate: 0,
            etaSeconds: 0,
            fileName,
          },
        ],
      });
    } else {
      // Per song
      const jobs: RenderJob[] = tracks.map((track, i) => {
        const titleStr = `${track.artist} - ${track.title}`;
        return {
          id: `job-${track.id || i}`,
          title: titleStr,
          status: 'idle',
          progress: 0,
          currentFrame: 0,
          totalFrames: 0,
          fpsEstimate: 0,
          etaSeconds: 0,
          fileName: `${sanitizeFilename(titleStr)}.mp4`,
        };
      });
      set({ renderQueue: jobs });
    }
  },

  startRendering: async () => {
    const state = get();
    if (state.isRendering || state.tracks.length === 0) return;

    // Make sure renderQueue is populated
    if (state.renderQueue.length === 0) {
      state.initRenderQueue();
    }

    set({ isRendering: true });
    const { tracks, images, style, output } = get();

    const queue = [...get().renderQueue];

    for (let i = 0; i < queue.length; i++) {
      const currentJob = queue[i];
      if (currentJob.status === 'completed') continue;

      // Update status to rendering
      queue[i] = {
        ...currentJob,
        status: 'rendering',
        progress: 0,
        startTime: performance.now(),
      };
      set({ renderQueue: [...queue] });

      try {
        const correspondingTrack =
          output.mode === 'combined' ? tracks[0] : tracks[i] || tracks[0];

        const blob = await exportManager.renderJob(
          queue[i],
          {
            track: correspondingTrack,
            images,
            style,
            output,
            combinedTracks: output.mode === 'combined' ? tracks : undefined,
          },
          (progress) => {
            const updatedQueue = [...get().renderQueue];
            if (updatedQueue[i] && updatedQueue[i].status === 'rendering') {
              updatedQueue[i] = {
                ...updatedQueue[i],
                progress: progress.progressPercent,
                currentFrame: progress.currentFrame,
                totalFrames: progress.totalFrames,
                fpsEstimate: progress.fpsEstimate,
                etaSeconds: progress.etaSeconds,
              };
              set({ renderQueue: updatedQueue });
            }
          }
        );

        const url = URL.createObjectURL(blob);
        const doneQueue = [...get().renderQueue];
        doneQueue[i] = {
          ...doneQueue[i],
          status: 'completed',
          progress: 100,
          outputBlob: blob,
          outputUrl: url,
        };
        set({ renderQueue: doneQueue });
      } catch (err: unknown) {
        const error = err as Error;
        const failedQueue = [...get().renderQueue];
        failedQueue[i] = {
          ...failedQueue[i],
          status: error.message === 'Render cancelled by user' ? 'cancelled' : 'failed',
          error: error.message || 'Render failed',
        };
        set({ renderQueue: failedQueue, isRendering: false });
        return;
      }
    }

    set({ isRendering: false });
  },

  cancelRendering: () => {
    exportManager.cancelCurrentJob();
    set((state) => ({
      isRendering: false,
      renderQueue: state.renderQueue.map((job) =>
        job.status === 'rendering' ? { ...job, status: 'cancelled' } : job
      ),
    }));
  },

  loadDemoProject: async () => {
    set({ isLoadingDemo: true });
    try {
      const demoTrack = await generateDemoAudioTrack();
      const demoImages = await generateDemoImages();
      set({
        tracks: [demoTrack],
        images: demoImages,
        activeTrackId: demoTrack.id,
        currentStep: 3, // jump right to Style & Live Preview!
        isLoadingDemo: false,
      });
    } catch (e) {
      console.error('Failed to load demo project:', e);
      set({ isLoadingDemo: false });
    }
  },

  resetProject: () => {
    // Revoke old object URLs
    const { tracks, images, renderQueue } = get();
    tracks.forEach((t) => URL.revokeObjectURL(t.url));
    images.forEach((img) => URL.revokeObjectURL(img.url));
    renderQueue.forEach((job) => {
      if (job.outputUrl) URL.revokeObjectURL(job.outputUrl);
    });

    set({
      currentStep: 1,
      tracks: [],
      images: [],
      activeTrackId: null,
      renderQueue: [],
      isRendering: false,
    });
  },
}));
