import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { ExportManager } from '../../services/exportManager';
import { RenderJob } from '../../types';
import {
  Film,
  Play,
  Download,
  Archive,
  XCircle,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Eye,
  X,
} from 'lucide-react';

export const RenderStep: React.FC = () => {
  const {
    renderQueue,
    isRendering,
    startRendering,
    cancelRendering,
    output,
    codecSupport,
  } = useAppStore();

  const [previewJob, setPreviewJob] = useState<RenderJob | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  const completedJobs = renderQueue.filter((j) => j.status === 'completed');
  const hasFinishedAll = renderQueue.length > 0 && completedJobs.length === renderQueue.length;
  const isAnyRendering = renderQueue.some((j) => j.status === 'rendering');

  // Trigger individual MP4 download
  const downloadMp4 = (job: RenderJob) => {
    if (!job.outputBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(job.outputBlob);
    a.download = job.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };

  // Trigger ZIP download for all completed videos
  const downloadAllZip = async () => {
    setIsZipping(true);
    setZipError(null);
    try {
      const zipBlob = await ExportManager.createZipArchive(renderQueue);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = `MV_Maker_Videos_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (err: unknown) {
      const error = err as Error;
      setZipError(error.message || 'Failed to generate ZIP archive.');
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-8 animate-fadeIn">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
            <Film className="w-5 h-5 text-brand-500" />
            <span>Render Queue & Export</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            High-speed offline frame-by-frame rendering with WebCodecs hardware encoding.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          {isRendering ? (
            <button
              onClick={cancelRendering}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs shadow-md shadow-red-500/20 transition-all"
            >
              <XCircle className="w-4 h-4" />
              <span>Cancel Render</span>
            </button>
          ) : (
            <button
              onClick={startRendering}
              disabled={renderQueue.length === 0}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-brand-500/25 transition-all active:scale-95 disabled:opacity-30"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {hasFinishedAll ? 'Re-Render All' : isAnyRendering ? 'Resume Render' : 'Start Video Render'}
              </span>
            </button>
          )}

          {/* Download all as ZIP (in per-song mode or multiple files) */}
          {completedJobs.length > 1 && (
            <button
              onClick={downloadAllZip}
              disabled={isZipping}
              className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all"
            >
              <Archive className="w-4 h-4" />
              <span>{isZipping ? 'Packing ZIP...' : 'Download All as ZIP'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ZIP Error Alert */}
      {zipError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span>{zipError}</span>
        </div>
      )}

      {/* Codec Specs Card */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-4">
          <div>
            <span className="text-slate-400">Target Resolution: </span>
            <strong className="text-slate-800 dark:text-slate-200">
              {output.width} × {output.height} ({output.fps} fps)
            </strong>
          </div>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
          <div>
            <span className="text-slate-400">Video Codec: </span>
            <strong className="text-slate-800 dark:text-slate-200">
              H.264 (AVC) @ {output.videoBitrateMbps} Mbps
            </strong>
          </div>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />
          <div className="hidden sm:block">
            <span className="text-slate-400">Audio Codec: </span>
            <strong className="text-slate-800 dark:text-slate-200">
              {codecSupport?.supportedAudioCodec?.toUpperCase() || 'AAC'} @{' '}
              {output.audioBitrateKbps} kbps
            </strong>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 text-brand-600 dark:text-brand-400 font-semibold text-[11px]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Offline Frame-Exact WebCodecs</span>
        </div>
      </div>

      {/* Render Queue Job Cards */}
      <div className="space-y-4">
        {renderQueue.length === 0 ? (
          <div className="p-12 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-3">
            <Film className="w-12 h-12 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">
              Render Queue is Empty
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Click &quot;Start Video Render&quot; above to initialize and render your music video jobs.
            </p>
          </div>
        ) : (
          renderQueue.map((job, idx) => {
            const isCurrentJob = job.status === 'rendering';
            const isComplete = job.status === 'completed';
            const isFailed = job.status === 'failed';
            const isCancelled = job.status === 'cancelled';

            return (
              <div
                key={job.id}
                className={`p-5 rounded-3xl border transition-all ${
                  isCurrentJob
                    ? 'border-brand-500 bg-brand-50/20 dark:bg-brand-950/20 shadow-md ring-1 ring-brand-500/30'
                    : isComplete
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  {/* Job Title & Badge */}
                  <div className="flex items-center space-x-3">
                    <span className="w-6 text-center text-xs font-mono font-bold text-slate-400">
                      #{idx + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {job.title}
                      </h4>
                      <p className="text-xs text-slate-400 font-mono">{job.fileName}</p>
                    </div>
                  </div>

                  {/* Status Badges & Actions */}
                  <div className="flex items-center space-x-3">
                    {job.status === 'idle' && (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        Ready • 0%
                      </span>
                    )}

                    {isCurrentJob && (
                      <div className="flex items-center space-x-2 px-3 py-1 rounded-full text-xs bg-brand-500/10 text-brand-600 dark:text-brand-400 font-bold border border-brand-500/30 animate-pulse">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-500" />
                        <span>Rendering • {job.progress}%</span>
                      </div>
                    )}

                    {isComplete && (
                      <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>100% Complete</span>
                        </span>

                        {/* Preview video inside player modal */}
                        <button
                          onClick={() => setPreviewJob(job)}
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors shadow-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </button>

                        {/* Download button */}
                        <button
                          onClick={() => downloadMp4(job)}
                          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-md shadow-brand-500/20 transition-all active:scale-95"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download .mp4</span>
                        </button>
                      </div>
                    )}

                    {isFailed && (
                      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 font-bold border border-red-200 dark:border-red-900">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Failed</span>
                      </span>
                    )}

                    {isCancelled && (
                      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancelled</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Header & Percentage */}
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-500 dark:text-slate-400">
                    {isCurrentJob
                      ? 'Encoding Video & Audio Frames...'
                      : isComplete
                      ? 'Rendering Finished'
                      : isFailed
                      ? 'Render Interrupted'
                      : 'Pending Start'}
                  </span>
                  <span
                    className={`font-mono text-sm font-extrabold ${
                      isComplete
                        ? 'text-emerald-500'
                        : isCurrentJob
                        ? 'text-brand-500'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {job.progress}%
                  </span>
                </div>

                {/* Enhanced Progress Bar */}
                <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800/80 p-0.5 overflow-hidden border border-slate-200/60 dark:border-slate-700/50 mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      isComplete
                        ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                        : isFailed
                        ? 'bg-red-500'
                        : isCancelled
                        ? 'bg-slate-400'
                        : isCurrentJob
                        ? 'bg-gradient-to-r from-brand-500 via-indigo-500 to-purple-500 shadow-sm shadow-brand-500/40'
                        : 'bg-transparent'
                    }`}
                    style={{ width: `${Math.max(job.status === 'idle' ? 0 : 2, job.progress)}%` }}
                  />
                </div>

                {/* Telemetry Stats: Frames / FPS / ETA */}
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-0.5">
                  {isCurrentJob ? (
                    <>
                      <span>
                        Frame {job.currentFrame} / {job.totalFrames} ({job.progress}%)
                      </span>
                      <div className="flex items-center space-x-4">
                        <span>{job.fpsEstimate} FPS</span>
                        <span className="flex items-center space-x-1 text-brand-600 dark:text-brand-400 font-semibold">
                          <Clock className="w-3 h-3" />
                          <span>ETA ~{job.etaSeconds}s remaining</span>
                        </span>
                      </div>
                    </>
                  ) : isComplete ? (
                    <>
                      <span>{job.totalFrames} frames encoded successfully</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        Ready for playback and download
                      </span>
                    </>
                  ) : (
                    <>
                      <span>Output format: H.264 + AAC MP4</span>
                      <span>Click &quot;Start Video Render&quot; to begin</span>
                    </>
                  )}
                </div>

                {/* Error details if failed */}
                {job.error && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400 font-medium">
                    Error: {job.error}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Video Preview Modal */}
      {previewJob && previewJob.outputUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-4xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Film className="w-4 h-4 text-brand-500" />
                <h3 className="text-sm font-bold text-white truncate max-w-md">
                  {previewJob.title}
                </h3>
              </div>
              <button
                onClick={() => setPreviewJob(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player */}
            <div className="aspect-video bg-black flex items-center justify-center">
              <video
                src={previewJob.outputUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono">{previewJob.fileName}</span>
              <button
                onClick={() => downloadMp4(previewJob)}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-md transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download Video</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
