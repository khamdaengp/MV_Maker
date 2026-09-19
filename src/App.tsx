import React from 'react';
import { useAppStore } from './store/useAppStore';
import { Header } from './components/layout/Header';
import { StepNavigation } from './components/layout/StepNavigation';
import { UploadStep } from './components/steps/UploadStep';
import { ArrangeStep } from './components/steps/ArrangeStep';
import { StyleStep } from './components/steps/StyleStep';
import { OutputStep } from './components/steps/OutputStep';
import { RenderStep } from './components/steps/RenderStep';
import { VideoToAudioModal } from './components/tools/VideoToAudioModal';
import { ImportLinkModal } from './components/tools/ImportLinkModal';
import { ShieldCheck, Cpu } from 'lucide-react';

export const App: React.FC = () => {
  const {
    currentStep,
    isVideoToAudioOpen,
    setVideoToAudioOpen,
    isImportLinkOpen,
    setImportLinkOpen,
  } = useAppStore();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 selection:bg-brand-500 selection:text-white transition-colors duration-200">
      <Header />
      <StepNavigation />

      <main className="flex-1 pb-16">
        {currentStep === 1 && <UploadStep />}
        {currentStep === 2 && <ArrangeStep />}
        {currentStep === 3 && <StyleStep />}
        {currentStep === 4 && <OutputStep />}
        {currentStep === 5 && <RenderStep />}
      </main>

      {/* Convert Video to Music Modal */}
      <VideoToAudioModal
        isOpen={isVideoToAudioOpen}
        onClose={() => setVideoToAudioOpen(false)}
      />

      {/* Import Music from Link Modal (Suno / YouTube) */}
      <ImportLinkModal
        isOpen={isImportLinkOpen}
        onClose={() => setImportLinkOpen(false)}
      />

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm py-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-700 dark:text-slate-300">MV Maker</span>
            <span>•</span>
            <span>Client-Side Music Video Production Studio</span>
          </div>

          <div className="flex items-center space-x-6 text-[11px]">
            <span className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>100% Private (No data leaves your computer)</span>
            </span>
            <span className="flex items-center space-x-1 text-brand-600 dark:text-brand-400 font-medium hidden md:flex">
              <Cpu className="w-3.5 h-3.5" />
              <span>Hardware Accelerated WebCodecs</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
