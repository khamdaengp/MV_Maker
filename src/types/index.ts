export interface AudioTrack {
  id: string;
  file?: File;
  name: string;
  title: string;
  artist: string;
  album?: string;
  duration: number; // in seconds
  audioBuffer?: AudioBuffer;
  rawChannelData?: Float32Array[]; // cached channels
  sampleRate?: number;
  coverArtUrl?: string;
  url: string; // Blob or Data URL for preview
}

export interface ImageItem {
  id: string;
  file?: File;
  name: string;
  url: string;
  width: number;
  height: number;
}

export type SlideshowMode = 'single' | 'even' | 'beat_synced';
export type ImageFit = 'cover' | 'contain' | 'contain_blur';
export type VisualizerStyle =
  | 'bars'
  | 'waveform'
  | 'circular'
  | 'neon_rings'
  | 'particles'
  | 'spectrum_area'
  | 'dual_spectrum'
  | 'digital_rain';

export interface VisualizerConfig {
  style: VisualizerStyle;
  colorMode: 'solid' | 'gradient';
  primaryColor: string;
  secondaryColor: string;
  position: 'bottom' | 'center' | 'top' | 'custom';
  posX?: number; // 0 - 100 (% of canvas width), default 50
  posY?: number; // 0 - 100 (% of canvas height)
  barCount: number; // 16 - 128
  barSpacing: number; // px
  thickness: number; // for waveform stroke or bar width
  radius: number; // for circular
  opacity: number; // 0 - 1
  smoothing: number; // 0 - 0.95
  sensitivity: number; // 0.5 - 2.5
  mirror: boolean;
}

export interface VisualEffectsConfig {
  bassShake: boolean;
  bassShakeIntensity: number; // 0.1 to 1.5
  glowBloom: boolean;
  glowIntensity: number; // 5 to 30
  particlesOverlay: boolean;
  particleSpeed: number; // 0.5 to 2.5
  filmGrain: boolean;
  filmGrainOpacity: number; // 0.05 to 0.4
  vignetteIntensity: number; // 0 to 1.0
  chromaticAberration: boolean;
}

export type TextPosition =
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center';

export type TextTimingMode = 'always' | 'first_n_seconds' | 'fade_in_out';

export interface TextOverlayConfig {
  enabled: boolean;
  fontFamily: string;
  titleSize: number;
  artistSize: number;
  textColor: string;
  dropShadow: boolean;
  position: TextPosition;
  timingMode: TextTimingMode;
  displayDuration: number; // seconds
  fadeDuration: number; // seconds
}

export interface StyleConfig {
  slideshowMode: SlideshowMode;
  imageFit: ImageFit;
  crossfadeDuration: number; // seconds
  beatMinInterval: number; // seconds (default 2.0s)
  visualizer: VisualizerConfig;
  textOverlay: TextOverlayConfig;
  effects: VisualEffectsConfig;
}

export type AspectPreset = '16:9' | '9:16' | '1:1' | 'custom';
export type ResolutionPreset = '720p' | '1080p' | '4k' | 'custom';
export type CombinedTransition = 'none' | 'gap' | 'crossfade';

export interface OutputConfig {
  mode: 'per_song' | 'combined';
  aspectPreset: AspectPreset;
  resolutionPreset: ResolutionPreset;
  width: number;
  height: number;
  fps: number;
  videoBitrateMbps: number;
  audioBitrateKbps: number;
  audioCodecPreference: 'aac' | 'opus';
  combinedTransition: CombinedTransition;
  combinedTransitionDuration: number; // seconds
}

export interface RenderJob {
  id: string;
  title: string;
  status: 'idle' | 'rendering' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0 to 100
  currentFrame: number;
  totalFrames: number;
  fpsEstimate: number;
  etaSeconds: number;
  outputBlob?: Blob;
  outputUrl?: string;
  fileName: string;
  error?: string;
  startTime?: number;
}

export interface LinkImportResult {
  source: 'suno' | 'youtube' | 'direct';
  id?: string;
  title: string;
  artist: string;
  audioUrl?: string | null;
  imageUrl?: string | null;
  duration?: number;
  originalUrl: string;
}
