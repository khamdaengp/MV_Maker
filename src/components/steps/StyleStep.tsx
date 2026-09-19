import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { renderVisualizerFrame, DrawableImage } from '../../services/renderer';
import { detectAudioBeats } from '../../services/beatDetector';
import { VisualizerStyle } from '../../types';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sliders,
  Type,
  ImageIcon,
  Sparkles,
  ArrowRight,
  Move,
  RotateCcw,
} from 'lucide-react';

export const StyleStep: React.FC = () => {
  const {
    tracks,
    images,
    activeTrackId,
    setActiveTrackId,
    updateTrack,
    style,
    updateStyle,
    updateVisualizer,
    updateTextOverlay,
    updateEffects,
    setCurrentStep,
  } = useAppStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<'visualizer' | 'effects' | 'slideshow' | 'text'>('visualizer');
  const [isDraggingVisualizer, setIsDraggingVisualizer] = useState(false);

  const updatePositionFromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(5, Math.min(95, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const y = Math.max(5, Math.min(95, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
    updateVisualizer({ posX: x, posY: y, position: 'custom' });
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setIsDraggingVisualizer(true);
    updatePositionFromPointer(e);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingVisualizer) return;
    updatePositionFromPointer(e);
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingVisualizer) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setIsDraggingVisualizer(false);
    }
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const cachedImagesRef = useRef<DrawableImage[]>([]);

  const currentTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];
  const trackDuration = currentTrack?.duration || 10;

  // Precompute beats for current track if beat-synced mode
  const beatTimestamps = React.useMemo(() => {
    if (!currentTrack?.rawChannelData?.[0] || !currentTrack.sampleRate) return [];
    return detectAudioBeats(
      currentTrack.rawChannelData[0],
      currentTrack.sampleRate,
      style.beatMinInterval
    );
  }, [currentTrack, style.beatMinInterval]);

  // Load HTMLImageElements for preview canvas
  useEffect(() => {
    let active = true;
    const loaded: DrawableImage[] = [];

    const loadImages = async () => {
      for (const imgItem of images) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = imgItem.url;
        });
        if (active) loaded.push(img);
      }
      if (active) cachedImagesRef.current = loaded;
    };

    loadImages();
    return () => {
      active = false;
    };
  }, [images]);

  // Setup Web Audio AnalyserNode
  const setupAudioGraph = useCallback(() => {
    if (!audioRef.current) return;

    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioCtx();
    }

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    if (!analyserRef.current) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = style.visualizer.smoothing;
      analyserRef.current = analyser;

      if (!sourceNodeRef.current) {
        sourceNodeRef.current = ctx.createMediaElementSource(audioRef.current);
        sourceNodeRef.current.connect(analyser);
        analyser.connect(ctx.destination);
      }
    }
  }, [style.visualizer.smoothing]);

  // Update analyser smoothing when config changes
  useEffect(() => {
    if (analyserRef.current) {
      analyserRef.current.smoothingTimeConstant = style.visualizer.smoothing;
    }
  }, [style.visualizer.smoothing]);

  // Main Render Loop for Preview Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const freqArray = new Uint8Array(512);
    const timeArray = new Uint8Array(512);

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;

      // Extract real-time frequency and waveform if playing
      if (analyserRef.current && isPlaying) {
        analyserRef.current.getByteFrequencyData(freqArray);
        analyserRef.current.getByteTimeDomainData(timeArray);
      } else {
        // Idle ambient gentle wave
        const now = performance.now() / 1000;
        for (let i = 0; i < 512; i++) {
          const val = Math.sin(now * 2 + i * 0.05) * 15 + 20;
          freqArray[i] = Math.max(0, Math.min(255, val));
          timeArray[i] = Math.round(128 + Math.sin(now * 3 + i * 0.08) * 15);
        }
      }

      // Determine active images & crossfade for preview
      const loadedImgs = cachedImagesRef.current;
      let curImg: DrawableImage | null = null;
      let nxtImg: DrawableImage | null = null;
      let crossfadeAlpha = 0;

      const curT = audioRef.current ? audioRef.current.currentTime : currentTime;

      if (loadedImgs.length > 0) {
        if (style.slideshowMode === 'single' || loadedImgs.length === 1) {
          curImg = loadedImgs[0];
        } else if (style.slideshowMode === 'even') {
          const segDuration = trackDuration / loadedImgs.length;
          const rawIdx = Math.floor(curT / segDuration);
          const cIdx = rawIdx % loadedImgs.length;
          const nIdx = (cIdx + 1) % loadedImgs.length;
          curImg = loadedImgs[cIdx];
          nxtImg = loadedImgs[nIdx];

          const timeInSeg = curT - rawIdx * segDuration;
          const transStart = Math.max(0, segDuration - style.crossfadeDuration);
          if (timeInSeg > transStart && style.crossfadeDuration > 0) {
            crossfadeAlpha = (timeInSeg - transStart) / style.crossfadeDuration;
          }
        } else if (style.slideshowMode === 'beat_synced') {
          let bIdx = 0;
          for (let b = 0; b < beatTimestamps.length; b++) {
            if (curT >= beatTimestamps[b]) {
              bIdx = b + 1;
            } else {
              break;
            }
          }
          const cIdx = bIdx % loadedImgs.length;
          const nIdx = (cIdx + 1) % loadedImgs.length;
          curImg = loadedImgs[cIdx];
          nxtImg = loadedImgs[nIdx];

          const nextBeat = beatTimestamps[bIdx] ?? trackDuration;
          if (curT > nextBeat - 0.3) {
            crossfadeAlpha = (curT - (nextBeat - 0.3)) / 0.3;
          }
        }
      }

      // Draw exact frame using unified renderer
      renderVisualizerFrame(ctx, {
        width: w,
        height: h,
        currentImage: curImg,
        nextImage: nxtImg,
        crossfadeAlpha,
        frequencyData: freqArray,
        timeDomainData: timeArray,
        style,
        currentTime: curT,
        text: currentTrack
          ? {
              title: currentTrack.title,
              artist: currentTrack.artist,
              currentTime: curT,
              trackDuration,
            }
          : undefined,
      });

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [isPlaying, style, currentTrack, trackDuration, beatTimestamps, currentTime]);

  // Audio Play / Pause
  const togglePlay = () => {
    if (!audioRef.current) return;
    setupAudioGraph();

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => console.error('Audio play error:', e));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    if (audioRef.current) {
      audioRef.current.currentTime = target;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    setIsMuted(v === 0);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume || 0.8;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-8 animate-fadeIn">
      {/* Hidden HTML5 Audio Element for live preview playback */}
      <audio
        ref={audioRef}
        src={currentTrack?.url}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Interactive Live Preview Stage (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-brand-500" />
              <span>Live Preview</span>
            </h2>

            <div className="flex items-center space-x-2">
              {/* Quick 1-click Toggle for Text on Video */}
              <button
                type="button"
                onClick={() => updateTextOverlay({ enabled: !style.textOverlay.enabled })}
                className={`text-xs px-2.5 py-1.5 rounded-xl border font-semibold flex items-center space-x-1.5 transition-all ${
                  style.textOverlay.enabled
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-white dark:bg-slate-900'
                }`}
                title={style.textOverlay.enabled ? 'Click to hide song name & artist text' : 'Click to show song name & artist text'}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Text on Video: {style.textOverlay.enabled ? 'ON' : 'OFF'}</span>
              </button>

              {/* Track Selector for multi-track projects */}
              {tracks.length > 1 && (
                <select
                  value={activeTrackId || currentTrack?.id}
                  onChange={(e) => {
                    if (audioRef.current) {
                      audioRef.current.pause();
                      setIsPlaying(false);
                      audioRef.current.currentTime = 0;
                    }
                    setActiveTrackId(e.target.value);
                  }}
                  className="text-xs px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium"
                >
                  {tracks.map((t, idx) => (
                    <option key={t.id} value={t.id}>
                      Track {idx + 1}: {t.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Canvas Wrapper */}
          <div className="relative rounded-3xl overflow-hidden bg-black shadow-2xl border border-slate-800/80 aspect-video flex items-center justify-center select-none group/canvas">
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              className="w-full h-full object-contain cursor-move touch-none"
            />

            {/* Live Position HUD while dragging */}
            {isDraggingVisualizer && (
              <div className="absolute top-3 right-3 bg-black/85 backdrop-blur-md text-white text-[11px] font-mono px-3 py-1.5 rounded-xl border border-white/20 flex items-center space-x-2 pointer-events-none shadow-xl animate-pulse">
                <span className="w-2 h-2 rounded-full bg-brand-400"></span>
                <span>Visualizer: X {style.visualizer.posX ?? 50}% • Y {style.visualizer.posY ?? 88}%</span>
              </div>
            )}

            {/* Drag Hint on Hover */}
            <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-xs text-white/80 text-[10px] font-medium px-2.5 py-1 rounded-lg border border-white/10 pointer-events-none opacity-0 group-hover/canvas:opacity-100 transition-opacity flex items-center space-x-1.5 shadow-md">
              <Move className="w-3 h-3 text-brand-400" />
              <span>Click & drag anywhere to move visualizer</span>
            </div>
          </div>

          {/* Player Scrubber & Controls Bar */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            {/* Scrubber Range */}
            <div className="flex items-center space-x-3 text-xs font-mono text-slate-500 dark:text-slate-400">
              <span className="w-10 text-right">{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={trackDuration || 10}
                step={0.05}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-2 rounded-lg bg-slate-200 dark:bg-slate-800"
              />
              <span className="w-10">{formatTime(trackDuration)}</span>
            </div>

            {/* Buttons Row */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center space-x-3">
                <button
                  onClick={togglePlay}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500 hover:bg-brand-600 text-white shadow-md shadow-brand-500/25 transition-all"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>
                <div className="text-xs">
                  <p className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[200px]">
                    {currentTrack?.title || 'No Track'}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                    {currentTrack?.artist || 'Unknown'}
                  </p>
                </div>
              </div>

              {/* Volume Slider */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleMute}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-white"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 sm:w-24 h-1.5 rounded-lg bg-slate-200 dark:bg-slate-800"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Style Customizer Tabs & Controls (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Customizer Subtabs */}
          <div className="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('visualizer')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1 ${
                activeTab === 'visualizer'
                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Visualizer</span>
            </button>

            <button
              onClick={() => setActiveTab('effects')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1 ${
                activeTab === 'effects'
                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Effects</span>
            </button>

            <button
              onClick={() => setActiveTab('slideshow')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1 ${
                activeTab === 'slideshow'
                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Slideshow</span>
            </button>

            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1 ${
                activeTab === 'text'
                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Text</span>
            </button>
          </div>

          {/* Tab 1: Visualizer Settings */}
          {activeTab === 'visualizer' && (
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
              {/* Style Selector (8 Modern Styles) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Visualizer Style
                  </label>
                  <span className="text-[11px] font-semibold text-brand-500 bg-brand-50 dark:bg-brand-950/60 px-2 py-0.5 rounded-md">
                    8 Styles Available
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'bars', label: 'Classic Bars', desc: 'Equalizer bars' },
                    { id: 'waveform', label: 'Waveform', desc: 'Audio wave' },
                    { id: 'circular', label: 'Circular', desc: 'Radial burst' },
                    { id: 'neon_rings', label: 'Neon Rings', desc: 'Pulsing rings' },
                    { id: 'spectrum_area', label: 'Mountain', desc: 'Smooth area wave' },
                    { id: 'dual_spectrum', label: 'Dual Mirror', desc: 'Mirrored bands' },
                    { id: 'particles', label: 'Constellation', desc: 'Audio nodes' },
                    { id: 'digital_rain', label: 'Digital Rain', desc: 'Matrix LED' },
                  ].map((v) => (
                    <button
                      key={v.id}
                      onClick={() => updateVisualizer({ style: v.id as VisualizerStyle })}
                      className={`p-2.5 rounded-2xl text-left transition-all border flex flex-col justify-between ${
                        style.visualizer.style === v.id
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 shadow-xs ring-1 ring-brand-500/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-xs font-bold leading-tight">{v.label}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">{v.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Mode & Pickers */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Colors
                  </label>
                  <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px]">
                    <button
                      onClick={() => updateVisualizer({ colorMode: 'solid' })}
                      className={`px-2 py-0.5 rounded-md font-medium ${
                        style.visualizer.colorMode === 'solid'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Solid
                    </button>
                    <button
                      onClick={() => updateVisualizer({ colorMode: 'gradient' })}
                      className={`px-2 py-0.5 rounded-md font-medium ${
                        style.visualizer.colorMode === 'gradient'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Gradient
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={style.visualizer.primaryColor}
                      onChange={(e) => updateVisualizer({ primaryColor: e.target.value })}
                      className="w-9 h-9 rounded-xl border-0 cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                      {style.visualizer.primaryColor}
                    </span>
                  </div>

                  {style.visualizer.colorMode === 'gradient' && (
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={style.visualizer.secondaryColor}
                        onChange={(e) => updateVisualizer({ secondaryColor: e.target.value })}
                        className="w-9 h-9 rounded-xl border-0 cursor-pointer bg-transparent"
                      />
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                        {style.visualizer.secondaryColor}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Position & Placement Controls */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Move className="w-3.5 h-3.5 text-brand-500" />
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Position & Alignment
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-mono text-brand-600 dark:text-brand-400 font-bold bg-brand-50 dark:bg-brand-950/60 px-2 py-0.5 rounded-md">
                      X: {style.visualizer.posX ?? 50}% • Y: {style.visualizer.posY ?? (style.visualizer.position === 'top' ? 18 : style.visualizer.position === 'center' ? 50 : 88)}%
                    </span>
                    <button
                      type="button"
                      title="Reset Position"
                      onClick={() => updateVisualizer({ position: 'bottom', posX: 50, posY: 88 })}
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'top', label: 'Top', x: 50, y: 18 },
                    { id: 'center', label: 'Center', x: 50, y: 50 },
                    { id: 'bottom', label: 'Bottom', x: 50, y: 88 },
                    { id: 'custom', label: 'Custom', x: style.visualizer.posX ?? 50, y: style.visualizer.posY ?? 88 },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => updateVisualizer({ position: preset.id as any, posX: preset.x, posY: preset.y })}
                      className={`py-1.5 rounded-xl text-xs font-semibold capitalize transition-all border ${
                        style.visualizer.position === preset.id
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 shadow-xs ring-1 ring-brand-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Vertical Position (Y) Slider */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400">Vertical Position (Y)</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {style.visualizer.posY ?? (style.visualizer.position === 'top' ? 18 : style.visualizer.position === 'center' ? 50 : 88)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={95}
                    step={1}
                    value={style.visualizer.posY ?? (style.visualizer.position === 'top' ? 18 : style.visualizer.position === 'center' ? 50 : 88)}
                    onChange={(e) => updateVisualizer({ posY: parseInt(e.target.value), position: 'custom' })}
                    className="w-full"
                  />
                </div>

                {/* Horizontal Position (X) Slider */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400">Horizontal Position (X)</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {style.visualizer.posX ?? 50}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={95}
                    step={1}
                    value={style.visualizer.posX ?? 50}
                    onChange={(e) => updateVisualizer({ posX: parseInt(e.target.value), position: 'custom' })}
                    className="w-full"
                  />
                </div>

                <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                  💡 Tip: You can also click and drag directly on the video preview canvas to position the visualizer anywhere.
                </p>
              </div>

              {/* Sliders */}
              <div className="space-y-4 pt-2">
                {['bars', 'circular', 'spectrum_area', 'dual_spectrum', 'particles', 'digital_rain'].includes(style.visualizer.style) && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">
                        {style.visualizer.style === 'particles' ? 'Particle Nodes' : style.visualizer.style === 'digital_rain' ? 'Columns' : 'Number of Bars / Bins'}
                      </span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {style.visualizer.barCount}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={16}
                      max={96}
                      step={4}
                      value={style.visualizer.barCount}
                      onChange={(e) => updateVisualizer({ barCount: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                )}

                {['circular', 'neon_rings', 'particles'].includes(style.visualizer.style) && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">Radius / Span</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {style.visualizer.radius}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      step={5}
                      value={style.visualizer.radius}
                      onChange={(e) => updateVisualizer({ radius: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                )}

                {style.visualizer.style !== 'bars' && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">Stroke Thickness</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {style.visualizer.thickness}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={8}
                      step={0.5}
                      value={style.visualizer.thickness}
                      onChange={(e) => updateVisualizer({ thickness: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                )}

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400">Audio Sensitivity</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {style.visualizer.sensitivity}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.5}
                    step={0.1}
                    value={style.visualizer.sensitivity}
                    onChange={(e) => updateVisualizer({ sensitivity: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400">Motion Smoothing</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {Math.round(style.visualizer.smoothing * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.95}
                    step={0.05}
                    value={style.visualizer.smoothing}
                    onChange={(e) => updateVisualizer({ smoothing: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400">Opacity</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {Math.round(style.visualizer.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={style.visualizer.opacity}
                    onChange={(e) => updateVisualizer({ opacity: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                </div>

                {['bars', 'spectrum_area', 'dual_spectrum', 'digital_rain'].includes(style.visualizer.style) && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Symmetric Mirror Mode
                    </span>
                    <input
                      type="checkbox"
                      checked={style.visualizer.mirror}
                      onChange={(e) => updateVisualizer({ mirror: e.target.checked })}
                      className="w-4 h-4 text-brand-500 rounded cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Visual Effects (NEW) */}
          {activeTab === 'effects' && (
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-xl bg-brand-500/10 text-brand-500">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      Visual FX & Shaders
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Beat dynamics, glowing neon bloom, and cinematic textures
                    </p>
                  </div>
                </div>
              </div>

              {/* 1. Bass Pulse & Beat Zoom */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Bass Pulse & Camera Zoom
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Pumps the entire video dynamically on kick and sub-bass hits
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={style.effects?.bassShake}
                    onClick={() => updateEffects({ bassShake: !style.effects?.bassShake })}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      style.effects?.bassShake ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        style.effects?.bassShake ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {style.effects?.bassShake && (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">Shake Intensity</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {style.effects?.bassShakeIntensity ?? 0.6}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={1.5}
                      step={0.1}
                      value={style.effects?.bassShakeIntensity ?? 0.6}
                      onChange={(e) => updateEffects({ bassShakeIntensity: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              {/* 2. Neon Bloom & Glow */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Neon Bloom & Outer Glow
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Radiant light bloom on visualizer shapes, curves and waves
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={style.effects?.glowBloom}
                    onClick={() => updateEffects({ glowBloom: !style.effects?.glowBloom })}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      style.effects?.glowBloom ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        style.effects?.glowBloom ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {style.effects?.glowBloom && (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">Bloom Radius</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {style.effects?.glowIntensity ?? 16}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={6}
                      max={32}
                      step={2}
                      value={style.effects?.glowIntensity ?? 16}
                      onChange={(e) => updateEffects({ glowIntensity: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              {/* 3. Floating Ambient Particles */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Floating Bokeh Dust & Sparks
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Ambient motes that float gently and brighten with sound energy
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={style.effects?.particlesOverlay}
                    onClick={() => updateEffects({ particlesOverlay: !style.effects?.particlesOverlay })}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      style.effects?.particlesOverlay ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        style.effects?.particlesOverlay ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {style.effects?.particlesOverlay && (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">Float Speed</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {style.effects?.particleSpeed ?? 1.0}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.5}
                      step={0.1}
                      value={style.effects?.particleSpeed ?? 1.0}
                      onChange={(e) => updateEffects({ particleSpeed: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              {/* 4. Chromatic Aberration RGB Glitch */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Chromatic Aberration (RGB Glitch)
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Red/cyan optical color fringing on impactful beat drops
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={style.effects?.chromaticAberration}
                  onClick={() => updateEffects({ chromaticAberration: !style.effects?.chromaticAberration })}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    style.effects?.chromaticAberration ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      style.effects?.chromaticAberration ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 5. Analog Film Grain */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      35mm Film Grain
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Simulates organic vintage analog cinema film grain
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={style.effects?.filmGrain}
                    onClick={() => updateEffects({ filmGrain: !style.effects?.filmGrain })}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      style.effects?.filmGrain ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        style.effects?.filmGrain ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {style.effects?.filmGrain && (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">Grain Amount</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {Math.round((style.effects?.filmGrainOpacity ?? 0.15) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={0.35}
                      step={0.02}
                      value={style.effects?.filmGrainOpacity ?? 0.15}
                      onChange={(e) => updateEffects({ filmGrainOpacity: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              {/* 6. Vignette Falloff */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 space-y-2">
                <div className="flex justify-between text-xs mb-1">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Vignette Edge Falloff
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Darkens outer screen corners to center focus
                    </p>
                  </div>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {Math.round((style.effects?.vignetteIntensity ?? 0.45) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={style.effects?.vignetteIntensity ?? 0.45}
                  onChange={(e) => updateEffects({ vignetteIntensity: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          )}

          {/* Tab 2: Slideshow & Image Fit */}
          {activeTab === 'slideshow' && (
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
              {/* Slideshow Mode */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                  Slideshow Mode
                </label>
                <div className="space-y-2">
                  {[
                    {
                      id: 'even',
                      title: 'Even Slideshow',
                      desc: 'Cycles images evenly across tracks with smooth crossfades',
                    },
                    {
                      id: 'beat_synced',
                      title: 'Beat-Synced Slideshow',
                      desc: 'Cuts to the next image on detected rhythm/onsets',
                    },
                    {
                      id: 'single',
                      title: 'Single Image',
                      desc: 'Displays the first image continuously for the whole video',
                    },
                  ].map((mode) => (
                    <label
                      key={mode.id}
                      onClick={() => updateStyle({ slideshowMode: mode.id as any })}
                      className={`flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                        style.slideshowMode === mode.id
                          ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/40 text-brand-900 dark:text-brand-100'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="slideshowMode"
                        checked={style.slideshowMode === mode.id}
                        onChange={() => {}}
                        className="mt-1 text-brand-500"
                      />
                      <div>
                        <p className="text-xs font-bold">{mode.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{mode.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Transition Timing Settings */}
              {style.slideshowMode === 'even' && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400">Crossfade Duration</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {style.crossfadeDuration}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={4.0}
                    step={0.1}
                    value={style.crossfadeDuration}
                    onChange={(e) => updateStyle({ crossfadeDuration: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                </div>
              )}

              {style.slideshowMode === 'beat_synced' && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400">Minimum Beat Interval</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {style.beatMinInterval}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={5.0}
                    step={0.2}
                    value={style.beatMinInterval}
                    onChange={(e) => updateStyle({ beatMinInterval: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Prevents jarring flicker by ensuring images hold for at least this interval.
                  </p>
                </div>
              )}

              {/* Image Fit */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                  Image Fit
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'contain_blur', label: 'Blurred BG' },
                    { id: 'cover', label: 'Fill / Cover' },
                    { id: 'contain', label: 'Letterbox' },
                  ].map((fit) => (
                    <button
                      key={fit.id}
                      onClick={() => updateStyle({ imageFit: fit.id as any })}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all border ${
                        style.imageFit === fit.id
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {fit.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Typography & Text Overlay */}
          {activeTab === 'text' && (
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
              {/* Prominent On/Off Toggle Card */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Show Title & Artist Text on Video
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Display song name and artist typography over the video
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={style.textOverlay.enabled}
                  onClick={() => updateTextOverlay({ enabled: !style.textOverlay.enabled })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    style.textOverlay.enabled ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      style.textOverlay.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {!style.textOverlay.enabled ? (
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30 text-emerald-800 dark:text-emerald-300 text-xs">
                  <p className="font-bold flex items-center space-x-1.5">
                    <span>✓ Song name and artist are hidden from video</span>
                  </p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                    Your background image and visualizer will render cleanly with no text covering them.
                  </p>
                </div>
              ) : (
                <>
                  {/* Song Title & Artist Inputs if enabled */}
                  {currentTrack && (
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 space-y-2.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                        Displayed Track Text
                      </label>
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 mb-1 block">Title:</span>
                        <input
                          type="text"
                          value={currentTrack.title}
                          onChange={(e) => updateTrack(currentTrack.id, { title: e.target.value })}
                          placeholder="Song Title"
                          className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 mb-1 block">Artist:</span>
                        <input
                          type="text"
                          value={currentTrack.artist}
                          onChange={(e) => updateTrack(currentTrack.id, { artist: e.target.value })}
                          placeholder="Artist Name"
                          className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                        />
                      </div>
                    </div>
                  )}
                  {/* Font Family */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Font Family
                    </label>
                    <select
                      value={style.textOverlay.fontFamily}
                      onChange={(e) => updateTextOverlay({ fontFamily: e.target.value })}
                      className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                    >
                      <option value="Inter, sans-serif">Modern Clean (Inter)</option>
                      <option value="'Montserrat', sans-serif">Bold Geometric (Montserrat)</option>
                      <option value="'Oswald', sans-serif">Impact Condense (Oswald)</option>
                      <option value="'Playfair Display', serif">Cinematic Serif (Playfair)</option>
                      <option value="'Space Mono', monospace">Cyber Mono (Space Mono)</option>
                    </select>
                  </div>

                  {/* Timing Mode */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Display Timing
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'fade_in_out', label: 'Fade In/Out' },
                        { id: 'first_n_seconds', label: 'First 5s' },
                        { id: 'always', label: 'Always Show' },
                      ].map((tm) => (
                        <button
                          key={tm.id}
                          onClick={() => updateTextOverlay({ timingMode: tm.id as any })}
                          className={`py-1.5 px-1 rounded-xl text-xs font-semibold transition-all border ${
                            style.textOverlay.timingMode === tm.id
                              ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {tm.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Position */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Position
                    </label>
                    <select
                      value={style.textOverlay.position}
                      onChange={(e) => updateTextOverlay({ position: e.target.value as any })}
                      className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                    >
                      <option value="bottom-left">Bottom Left</option>
                      <option value="bottom-center">Bottom Center</option>
                      <option value="bottom-right">Bottom Right</option>
                      <option value="top-left">Top Left</option>
                      <option value="top-center">Top Center</option>
                      <option value="top-right">Top Right</option>
                      <option value="center">Screen Center</option>
                    </select>
                  </div>

                  {/* Font Color & Shadow */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={style.textOverlay.textColor}
                        onChange={(e) => updateTextOverlay({ textColor: e.target.value })}
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent"
                      />
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                        Color
                      </span>
                    </div>

                    <label className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={style.textOverlay.dropShadow}
                        onChange={(e) => updateTextOverlay({ dropShadow: e.target.checked })}
                        className="w-4 h-4 text-brand-500 rounded"
                      />
                      <span>Drop Shadow</span>
                    </label>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Bottom Proceed Action */}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.pause();
                  setIsPlaying(false);
                }
                setCurrentStep(4);
              }}
              className="w-full flex items-center justify-center space-x-2 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm shadow-md shadow-brand-500/20 transition-all"
            >
              <span>Proceed to Output Settings</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
