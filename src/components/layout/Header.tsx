import React, { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  Sun,
  Moon,
  Video,
  FileVideo,
  Link2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export const Header: React.FC = () => {
  const {
    theme,
    toggleTheme,
    codecSupport,
    checkCodecSupport,
    tracks,
    images,
    resetProject,
    loadDemoProject,
    isLoadingDemo,
    setVideoToAudioOpen,
    setImportLinkOpen,
  } = useAppStore();

  useEffect(() => {
    checkCodecSupport();
    // Initialize html dark class
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [checkCodecSupport, theme]);

  const hasFiles = tracks.length > 0 || images.length > 0;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/25">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-slate-900 via-brand-600 to-indigo-600 dark:from-white dark:via-brand-400 dark:to-indigo-400 bg-clip-text text-transparent">
                MV Maker
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400 border border-brand-200 dark:border-brand-800">
                100% In-Browser
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              Turn music & images into high-definition MP4 videos
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Import Music from Link Button */}
          <button
            onClick={() => setImportLinkOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:hover:bg-brand-900/80 dark:text-brand-300 border border-brand-200 dark:border-brand-800 transition-all shadow-xs"
            title="Import music & artwork directly from Suno or YouTube links"
          >
            <Link2 className="w-3.5 h-3.5 text-brand-500" />
            <span className="hidden sm:inline">Import from Link</span>
            <span className="sm:hidden">Import Link</span>
          </button>

          {/* Convert Video to Music Tool Button */}
          <button
            onClick={() => setVideoToAudioOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:hover:bg-purple-900/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-all shadow-xs"
            title="Extract audio from MP4, WebM, or MOV video files"
          >
            <FileVideo className="w-3.5 h-3.5 text-purple-500" />
            <span className="hidden sm:inline">Convert Video to Music</span>
            <span className="sm:hidden">Video → Audio</span>
          </button>

          {/* Load demo project if empty */}
          {!hasFiles && (
            <button
              onClick={loadDemoProject}
              disabled={isLoadingDemo}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-all shadow-sm"
              title="Instantly test visualizers and rendering with built-in synthwave music and artwork"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
              <span>{isLoadingDemo ? 'Synthesizing Demo...' : 'Load Demo Project'}</span>
            </button>
          )}

          {/* Reset Project */}
          {hasFiles && (
            <button
              onClick={() => {
                if (window.confirm('Reset project and start fresh? All imported files will be cleared.')) {
                  resetProject();
                }
              }}
              className="flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-950/40 transition-colors"
              title="Reset project"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* WebCodecs Warning Banner if unsupported */}
      {codecSupport && !codecSupport.hasWebCodecs && (
        <div className="bg-amber-500/10 border-t border-amber-500/20 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
          <div className="max-w-7xl mx-auto flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span>
              <strong>Browser Compatibility Notice:</strong> WebCodecs is required for high-speed
              client-side video rendering. We recommend using{' '}
              <a
                href="https://www.google.com/chrome/"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold"
              >
                Google Chrome
              </a>{' '}
              or{' '}
              <a
                href="https://www.microsoft.com/edge"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold"
              >
                Microsoft Edge
              </a>
              .
            </span>
          </div>
        </div>
      )}
    </header>
  );
};
