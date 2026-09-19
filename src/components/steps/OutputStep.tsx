import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { AspectPreset, ResolutionPreset } from '../../types';
import {
  Film,
  Layers,
  Monitor,
  Smartphone,
  Square,
  Sliders,
  ArrowRight,
  Info,
} from 'lucide-react';

export const OutputStep: React.FC = () => {
  const {
    output,
    updateOutput,
    setOutputPreset,
    tracks,
    setCurrentStep,
    initRenderQueue,
  } = useAppStore();

  const handleAspectChange = (aspect: AspectPreset) => {
    setOutputPreset(aspect, output.resolutionPreset);
  };

  const handleResolutionChange = (res: ResolutionPreset) => {
    setOutputPreset(output.aspectPreset, res);
  };

  const handleCustomDimension = (w: number, h: number) => {
    // Force even numbers
    const evenW = Math.max(320, w - (w % 2));
    const evenH = Math.max(240, h - (h % 2));
    updateOutput({
      aspectPreset: 'custom',
      resolutionPreset: 'custom',
      width: evenW,
      height: evenH,
    });
  };

  // Estimate duration and file size
  const totalDuration =
    output.mode === 'combined'
      ? tracks.reduce((sum, t) => sum + t.duration, 0)
      : tracks[0]?.duration || 180;

  const estSizeBytes =
    totalDuration *
    ((output.videoBitrateMbps * 1_000_000 + output.audioBitrateKbps * 1000) / 8);
  const estSizeMB = (estSizeBytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-8 animate-fadeIn">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
          <Sliders className="w-5 h-5 text-brand-500" />
          <span>Output & Format Settings</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure video resolution, framerate, bitrates, and multi-track packaging.
        </p>
      </div>

      {/* 1. Output Mode: Per-Song vs Combined */}
      <section className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Export Mode
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Per-Song Card */}
          <div
            onClick={() => updateOutput({ mode: 'per_song' })}
            className={`p-5 rounded-3xl border-2 cursor-pointer transition-all ${
              output.mode === 'per_song'
                ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/40 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3 mb-2">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  output.mode === 'per_song'
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}
              >
                <Film className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  One MV per Song
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Each audio track becomes its own independent .mp4 video
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              Produces {tracks.length} video{tracks.length > 1 ? 's' : ''}. Includes option to
              download all finished MP4s as a ZIP file.
            </p>
          </div>

          {/* Combined Card */}
          <div
            onClick={() => updateOutput({ mode: 'combined' })}
            className={`p-5 rounded-3xl border-2 cursor-pointer transition-all ${
              output.mode === 'combined'
                ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/40 shadow-sm'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3 mb-2">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  output.mode === 'combined'
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}
              >
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  One Combined Full MV
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  All tracks merged in sequence into a single master .mp4 video
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              Ideal for full albums, mixtapes, continuous DJ sets, or compilation videos.
            </p>
          </div>
        </div>

        {/* Combined Transition Settings */}
        {output.mode === 'combined' && tracks.length > 1 && (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-2">
                Track Transition Style
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'none', label: 'None / Seamless' },
                    { id: 'gap', label: 'Silence Gap' },
                    { id: 'crossfade', label: 'Audio Crossfade' },
                  ] as const
                ).map((trans) => (
                  <button
                    key={trans.id}
                    onClick={() => updateOutput({ combinedTransition: trans.id })}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all border ${
                      output.combinedTransition === trans.id
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {trans.label}
                  </button>
                ))}
              </div>
            </div>

            {output.combinedTransition !== 'none' && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600 dark:text-slate-400">
                    {output.combinedTransition === 'gap' ? 'Gap Duration' : 'Crossfade Duration'}
                  </span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {output.combinedTransitionDuration}s
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={8.0}
                  step={0.5}
                  value={output.combinedTransitionDuration}
                  onChange={(e) =>
                    updateOutput({ combinedTransitionDuration: parseFloat(e.target.value) })
                  }
                  className="w-full"
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* 2. Aspect Ratio & Resolution Presets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Aspect Ratio */}
        <section className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Aspect Ratio Preset
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: '16:9', label: '16:9 Landscape', icon: Monitor, sub: 'YouTube / PC' },
              { id: '9:16', label: '9:16 Vertical', icon: Smartphone, sub: 'Reels / TikTok' },
              { id: '1:1', label: '1:1 Square', icon: Square, sub: 'Instagram' },
            ].map((aspect) => {
              const Icon = aspect.icon;
              return (
                <button
                  key={aspect.id}
                  onClick={() => handleAspectChange(aspect.id as AspectPreset)}
                  className={`p-3 rounded-2xl flex flex-col items-center justify-center space-y-1.5 border transition-all ${
                    output.aspectPreset === aspect.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-bold">{aspect.id}</span>
                  <span className="text-[10px] text-slate-400">{aspect.sub}</span>
                </button>
              );
            })}
          </div>

          {/* Resolution Presets */}
          <div className="pt-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-2">
              Resolution
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['720p', '1080p', '4k'] as const).map((res) => (
                <button
                  key={res}
                  onClick={() => handleResolutionChange(res)}
                  className={`py-2 rounded-xl text-xs font-bold uppercase transition-all border ${
                    output.resolutionPreset === res
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>

          {/* Dimensions Display / Custom */}
          <div className="pt-2 flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Output Dimensions:</span>
            <div className="flex items-center space-x-1.5 font-mono font-bold text-slate-800 dark:text-slate-200">
              <input
                type="number"
                value={output.width}
                step={2}
                onChange={(e) => handleCustomDimension(parseInt(e.target.value) || 1280, output.height)}
                className="w-16 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center"
              />
              <span>×</span>
              <input
                type="number"
                value={output.height}
                step={2}
                onChange={(e) => handleCustomDimension(output.width, parseInt(e.target.value) || 720)}
                className="w-16 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center"
              />
              <span className="text-[10px] text-slate-400">px (even)</span>
            </div>
          </div>
        </section>

        {/* Quality & Bitrate Settings */}
        <section className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Framerate & Quality
          </label>

          {/* Framerate Presets */}
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-2">
              Framerate (FPS)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { fps: 24, label: '24 FPS (Cinematic)' },
                { fps: 30, label: '30 FPS (Standard)' },
                { fps: 60, label: '60 FPS (Smooth)' },
              ].map((item) => (
                <button
                  key={item.fps}
                  onClick={() => updateOutput({ fps: item.fps })}
                  className={`py-2 px-1 rounded-xl text-xs font-semibold transition-all border ${
                    output.fps === item.fps
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Video Bitrate */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600 dark:text-slate-400">Video Bitrate</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {output.videoBitrateMbps} Mbps
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={30}
              step={1}
              value={output.videoBitrateMbps}
              onChange={(e) => updateOutput({ videoBitrateMbps: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* Audio Codec Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-2">
              Audio Format / Codec
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateOutput({ audioCodecPreference: 'aac' })}
                className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all border ${
                  (output.audioCodecPreference || 'aac') === 'aac'
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                }`}
              >
                AAC (Universal Standard)
              </button>
              <button
                type="button"
                onClick={() => updateOutput({ audioCodecPreference: 'opus' })}
                className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all border ${
                  output.audioCodecPreference === 'opus'
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                }`}
              >
                Opus (High Efficiency)
              </button>
            </div>
          </div>

          {/* Audio Bitrate */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600 dark:text-slate-400">Audio Bitrate</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {output.audioBitrateKbps} kbps (High Fidelity)
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[96, 128, 160, 192].map((rate) => (
                <button
                  key={rate}
                  onClick={() => updateOutput({ audioBitrateKbps: rate })}
                  className={`py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                    output.audioBitrateKbps === rate
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {rate}k
                </button>
              ))}
            </div>
          </div>

          {/* Estimate summary */}
          <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Info className="w-4 h-4 text-brand-500 flex-shrink-0" />
            <span>
              Estimated file size:{' '}
              <strong className="text-slate-800 dark:text-slate-200">~{estSizeMB} MB</strong> per{' '}
              {Math.round(totalDuration)}s video.
            </span>
          </div>
        </section>
      </div>

      {/* Bottom Proceed Action */}
      <div className="flex justify-end pt-4">
        <button
          onClick={() => {
            initRenderQueue();
            setCurrentStep(5);
          }}
          className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm shadow-md shadow-brand-500/20 transition-all"
        >
          <span>Ready to Render</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
