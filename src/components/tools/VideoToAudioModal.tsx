import React, { useState, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  extractAudioFromVideo,
  ExtractedAudioResult,
} from '../../services/videoAudioExtractor';
import {
  SupportedAudioFormat,
  convertAudioBufferToFormat,
} from '../../utils/audioFormatConverter';
import {
  FileVideo,
  Download,
  PlusCircle,
  X,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

interface VideoToAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VideoToAudioModal: React.FC<VideoToAudioModalProps> = ({ isOpen, onClose }) => {
  const { addTracks, setCurrentStep } = useAppStore();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<SupportedAudioFormat>('mp3');
  const [selectedBitrate, setSelectedBitrate] = useState<number>(192);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [extractedResult, setExtractedResult] = useState<ExtractedAudioResult | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioElemRef = useRef<HTMLAudioElement | null>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (file: File) => {
    setError(null);
    setSelectedFile(file);
    const vUrl = URL.createObjectURL(file);
    setVideoUrl(vUrl);
    setExtractedResult(null);
    setIsProcessing(true);
    setProgressPercent(5);
    setProgressMessage('Starting video extraction...');

    try {
      const result = await extractAudioFromVideo(
        file,
        selectedFormat,
        selectedBitrate,
        (percent, msg) => {
          setProgressPercent(percent);
          setProgressMessage(msg);
        }
      );
      setExtractedResult(result);
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to extract audio from video.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-encode existing audioBuffer when format is changed after extraction
  const handleFormatChange = async (newFormat: SupportedAudioFormat) => {
    setSelectedFormat(newFormat);
    if (!extractedResult) return;

    setIsProcessing(true);
    setProgressPercent(20);
    setProgressMessage(`Re-encoding to ${newFormat.toUpperCase()}...`);

    try {
      const { blob, extension } = await convertAudioBufferToFormat(
        extractedResult.audioBuffer,
        newFormat,
        selectedBitrate,
        (pct) => setProgressPercent(20 + Math.round(pct * 0.75))
      );

      const url = URL.createObjectURL(blob);
      const fileName = `${extractedResult.baseName}.${extension}`;

      const updatedResult: ExtractedAudioResult = {
        ...extractedResult,
        format: newFormat,
        fileName,
        blob,
        url,
        createAudioTrack: () => {
          const audioFile = new File([blob], fileName, { type: blob.type });
          return {
            id: `extracted-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            file: audioFile,
            name: fileName,
            title: extractedResult.suggestedTitle,
            artist: extractedResult.suggestedArtist,
            duration: extractedResult.audioBuffer.duration,
            audioBuffer: extractedResult.audioBuffer,
            sampleRate: extractedResult.audioBuffer.sampleRate,
            url,
          };
        },
      };

      setExtractedResult(updatedResult);
    } catch (err: unknown) {
      const e = err as Error;
      setError(`Failed to convert to ${newFormat.toUpperCase()}: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!extractedResult) return;
    const a = document.createElement('a');
    a.href = extractedResult.url;
    a.download = extractedResult.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleAddToProject = () => {
    if (!extractedResult) return;
    const newTrack = extractedResult.createAudioTrack();
    addTracks([newTrack]);
    onClose();
    setCurrentStep(2); // Jump to Arrange step
  };

  const toggleAudioPlay = () => {
    if (!audioElemRef.current) return;
    if (isPlayingAudio) {
      audioElemRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioElemRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center shadow-md">
              <FileVideo className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Convert Video to Music
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Extract and convert audio to MP3, WAV, or M4A directly in your browser
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (videoUrl) URL.revokeObjectURL(videoUrl);
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Format Selector Bar */}
          <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-purple-900 dark:text-purple-300">
                Select Audio Output Format
              </label>
              {selectedFormat !== 'wav' && (
                <div className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>Bitrate:</span>
                  <select
                    value={selectedBitrate}
                    onChange={(e) => {
                      const br = parseInt(e.target.value);
                      setSelectedBitrate(br);
                    }}
                    className="text-xs px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-800 font-mono font-semibold"
                  >
                    <option value={128}>128 kbps (Compact)</option>
                    <option value={192}>192 kbps (High Quality)</option>
                    <option value={320}>320 kbps (Maximum)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Format Pills */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                {
                  id: 'mp3',
                  name: 'MP3 Audio',
                  ext: '.mp3',
                  desc: 'Universal compatibility & lightweight',
                },
                {
                  id: 'wav',
                  name: 'WAV Lossless',
                  ext: '.wav',
                  desc: '16-bit uncompressed studio PCM',
                },
                {
                  id: 'm4a',
                  name: 'M4A / AAC',
                  ext: '.m4a',
                  desc: 'Apple standard, high fidelity',
                },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleFormatChange(fmt.id as SupportedAudioFormat)}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    selectedFormat === fmt.id
                      ? 'border-purple-600 bg-white dark:bg-slate-800 shadow-sm ring-1 ring-purple-500'
                      : 'border-slate-200 dark:border-slate-800 hover:border-purple-300 bg-white/60 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {fmt.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 font-bold">
                      {fmt.ext}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">{fmt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Video Dropzone (if none selected yet) */}
          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) {
                  handleFileSelect(e.dataTransfer.files[0]);
                }
              }}
              className="p-10 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-purple-500 bg-slate-50 dark:bg-slate-800/40 text-center cursor-pointer transition-all group"
            >
              <input
                type="file"
                ref={fileInputRef}
                accept="video/*,.mp4,.webm,.mov,.mkv,.avi"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
              <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <FileVideo className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
                Select or Drop a Video File
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
                Supports MP4, WebM, MOV, MKV, AVI. Will be converted directly to{' '}
                <strong className="text-purple-600 dark:text-purple-400">
                  {selectedFormat.toUpperCase()}
                </strong>
                .
              </p>
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-all"
              >
                Browse Video
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Video Preview & File Info */}
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                {videoUrl && (
                  <div className="w-full sm:w-44 h-28 rounded-xl overflow-hidden bg-black flex-shrink-0">
                    <video src={videoUrl} controls className="w-full h-full object-contain" />
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1 text-center sm:text-left">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {selectedFile.name}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Size: {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • Target:{' '}
                    <strong className="text-purple-600 dark:text-purple-400 uppercase">
                      {selectedFormat}
                    </strong>
                  </p>
                  <button
                    onClick={() => {
                      if (videoUrl) URL.revokeObjectURL(videoUrl);
                      setSelectedFile(null);
                      setExtractedResult(null);
                    }}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-medium pt-1"
                  >
                    Choose different video
                  </button>
                </div>
              </div>

              {/* Progress Bar during extraction */}
              {isProcessing && (
                <div className="space-y-2 p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50">
                  <div className="flex justify-between text-xs font-semibold text-purple-700 dark:text-purple-300">
                    <span className="flex items-center space-x-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-500" />
                      <span>{progressMessage}</span>
                    </span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-purple-100 dark:bg-purple-900/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-purple-600 transition-all duration-200"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Extraction Error */}
              {error && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Extracted Audio Player & Ready Actions */}
              {extractedResult && (
                <div className="p-5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Converted to {extractedResult.format.toUpperCase()} Successfully</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
                      {formatDuration(extractedResult.duration)}
                    </span>
                  </div>

                  {/* Audio Player Bar */}
                  <audio
                    ref={audioElemRef}
                    src={extractedResult.url}
                    onEnded={() => setIsPlayingAudio(false)}
                  />
                  <div className="flex items-center space-x-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <button
                      onClick={toggleAudioPlay}
                      className="w-9 h-9 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-transform active:scale-95 shadow-xs"
                    >
                      {isPlayingAudio ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {extractedResult.fileName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {extractedResult.numberOfChannels === 2 ? 'Stereo' : 'Mono'} •{' '}
                        {extractedResult.sampleRate} Hz • {extractedResult.format.toUpperCase()}{' '}
                        {extractedResult.format !== 'wav' ? `@ ${selectedBitrate} kbps` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={handleDownload}
                      className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs transition-all shadow-xs"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download .{extractedResult.format.toUpperCase()}</span>
                    </button>

                    <button
                      onClick={handleAddToProject}
                      className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-brand-500/25 transition-all active:scale-95"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Use in MV Maker Project</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center space-x-1">
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            <span>Pure In-Browser MP3, WAV & M4A Encoders</span>
          </span>
          <button
            onClick={() => {
              if (videoUrl) URL.revokeObjectURL(videoUrl);
              onClose();
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
