import React from 'react';
import { useAppStore, AppStep } from '../../store/useAppStore';
import { Upload, ListMusic, Palette, Sliders, Film, ArrowRight, ArrowLeft } from 'lucide-react';

interface StepInfo {
  step: AppStep;
  label: string;
  icon: React.ElementType;
  description: string;
}

const STEPS: StepInfo[] = [
  { step: 1, label: 'Upload', icon: Upload, description: 'Audio & Images' },
  { step: 2, label: 'Arrange', icon: ListMusic, description: 'Order & Metadata' },
  { step: 3, label: 'Style', icon: Palette, description: 'Visualizer & Preview' },
  { step: 4, label: 'Output', icon: Sliders, description: 'Format & Quality' },
  { step: 5, label: 'Render', icon: Film, description: 'Export & Download' },
];

export const StepNavigation: React.FC = () => {
  const { currentStep, setCurrentStep, tracks, images, initRenderQueue, isRendering } =
    useAppStore();

  const canProceed = (step: AppStep): boolean => {
    if (step === 1) return true;
    if (step >= 2 && tracks.length === 0) return false;
    return true;
  };

  const handleStepClick = (targetStep: AppStep) => {
    if (isRendering) return;
    if (canProceed(targetStep)) {
      if (targetStep === 5) {
        initRenderQueue();
      }
      setCurrentStep(targetStep);
    }
  };

  const handleNext = () => {
    if (currentStep < 5 && canProceed((currentStep + 1) as AppStep)) {
      const next = (currentStep + 1) as AppStep;
      if (next === 5) {
        initRenderQueue();
      }
      setCurrentStep(next);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1 && !isRendering) {
      setCurrentStep((currentStep - 1) as AppStep);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Stepper Tabs */}
      <nav aria-label="Progress" className="mb-6">
        <ol className="flex items-center justify-between sm:justify-center sm:space-x-4 bg-white dark:bg-slate-900 p-2 sm:p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isActive = currentStep === s.step;
            const isCompleted = currentStep > s.step;
            const isAccessible = canProceed(s.step);

            return (
              <li key={s.step} className="flex-1 sm:flex-initial">
                <button
                  type="button"
                  onClick={() => handleStepClick(s.step)}
                  disabled={!isAccessible || isRendering}
                  className={`w-full flex items-center justify-center sm:justify-start space-x-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25 font-semibold'
                      : isCompleted
                      ? 'text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40'
                      : isAccessible
                      ? 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : isCompleted
                        ? 'bg-brand-100 dark:bg-brand-900/60 text-brand-600 dark:text-brand-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="hidden md:flex flex-col text-left">
                    <span className="leading-tight">{s.label}</span>
                    <span className="text-[10px] opacity-75 font-normal">{s.description}</span>
                  </div>
                  <span className="md:hidden font-medium">{s.label}</span>
                  {s.step === 1 && tracks.length > 0 && (
                    <span className="hidden lg:inline-block px-1.5 py-0.2 rounded-full text-[10px] bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300 font-bold">
                      {tracks.length}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Quick Nav Footer / Bar */}
      <div className="flex items-center justify-between text-xs sm:text-sm text-slate-500 dark:text-slate-400 pb-2">
        <button
          onClick={handlePrev}
          disabled={currentStep === 1 || isRendering}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center space-x-3 text-xs">
          <span>
            Step {currentStep} of 5:{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {STEPS[currentStep - 1].label}
            </strong>
          </span>
          {tracks.length > 0 && (
            <span className="text-slate-400">
              ({tracks.length} track{tracks.length > 1 ? 's' : ''}, {images.length} image
              {images.length > 1 ? 's' : ''})
            </span>
          )}
        </div>

        <button
          onClick={handleNext}
          disabled={currentStep === 5 || !canProceed((currentStep + 1) as AppStep) || isRendering}
          className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium shadow-sm shadow-brand-500/20 disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <span>{currentStep === 4 ? 'Proceed to Render' : 'Next Step'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
