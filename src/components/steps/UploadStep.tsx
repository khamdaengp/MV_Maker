import React, { useState, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { decodeAudioFile } from '../../services/audioDecoder';
import { ImageItem } from '../../types';
import {
  Music,
  Image as ImageIcon,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  FileAudio,
  FileVideo,
  Link2,
  Layers,
  ArrowRight,
} from 'lucide-react';

export const UploadStep: React.FC = () => {
  const {
    tracks,
    images,
    addTracks,
    addImages,
    setCurrentStep,
    loadDemoProject,
    isLoadingDemo,
    setVideoToAudioOpen,
    setImportLinkOpen,
  } = useAppStore();

  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [isDecodingAudio, setIsDecodingAudio] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Handle audio files
  const processAudioFiles = async (files: FileList | File[]) => {
    setIsDecodingAudio(true);
    setErrorMessage(null);
    const validFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/i)) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      setErrorMessage('Please select valid audio files (.mp3, .wav, .flac, .m4a, .ogg).');
      setIsDecodingAudio(false);
      return;
    }

    try {
      const decodedTracks = await Promise.all(
        validFiles.map((file) => decodeAudioFile(file))
      );
      addTracks(decodedTracks);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMessage(
        error.message || 'Failed to decode one or more audio files. Please check file format.'
      );
    } finally {
      setIsDecodingAudio(false);
    }
  };

  // Handle image files
  const processImageFiles = async (files: FileList | File[]) => {
    setErrorMessage(null);
    const validImages: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/') || file.name.match(/\.(jpe?g|png|webp)$/i)) {
        validImages.push(file);
      }
    }

    if (validImages.length === 0) {
      setErrorMessage('Please select valid image files (.jpg, .png, .webp).');
      return;
    }

    const items: ImageItem[] = [];
    for (const file of validImages) {
      const url = URL.createObjectURL(file);
      // Determine dimensions
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          items.push({
            id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            file,
            name: file.name,
            url,
            width: img.naturalWidth || 1920,
            height: img.naturalHeight || 1080,
          });
          resolve();
        };
        img.onerror = () => {
          // fallback
          items.push({
            id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            file,
            name: file.name,
            url,
            width: 1920,
            height: 1080,
          });
          resolve();
        };
        img.src = url;
      });
    }

    addImages(items);
  };

  // Warnings
  const totalAudioDuration = tracks.reduce((acc, t) => acc + t.duration, 0);
  const isLargeProject = totalAudioDuration > 900; // > 15 minutes

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-8 animate-fadeIn">
      {/* Introduction Hero banner if empty */}
      {tracks.length === 0 && images.length === 0 && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 p-8 text-white shadow-xl">
          <div className="relative z-10 max-w-2xl space-y-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-md">
              ⚡ Private & Hardware Accelerated
            </span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              Create Stunning Music Videos in Seconds
            </h1>
            <p className="text-sm sm:text-base text-white/90">
              Combine your songs with artwork and audio visualizers. Rendered 100% locally on your
              device with WebCodecs — zero server uploads, no watermarks, unlimited quality.
            </p>
            <div className="pt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={loadDemoProject}
                disabled={isLoadingDemo}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-white text-brand-700 hover:bg-white/95 font-bold text-sm shadow-md transition-all active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-brand-600" />
                <span>{isLoadingDemo ? 'Synthesizing Demo...' : 'Load Instant Demo Project'}</span>
              </button>
              <span className="text-xs text-white/75">or drag and drop your files below</span>
            </div>
          </div>
          {/* Subtle decorative background circles */}
          <div className="absolute -right-12 -bottom-12 w-64 h-64 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm flex items-start space-x-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Upload Error</p>
            <p>{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Large project warning */}
      {isLargeProject && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <span>
            <strong>Large Project Warning:</strong> Total audio length is over{' '}
            {Math.round(totalAudioDuration / 60)} minutes. In-browser rendering may take a few
            minutes and consume notable memory.
          </span>
        </div>
      )}

      {/* Dual Upload Dropzones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Audio Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingAudio(true);
          }}
          onDragLeave={() => setIsDraggingAudio(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingAudio(false);
            if (e.dataTransfer.files) {
              processAudioFiles(e.dataTransfer.files);
            }
          }}
          onClick={() => audioInputRef.current?.click()}
          className={`group relative flex flex-col items-center justify-center p-8 rounded-3xl border-2 border-dashed cursor-pointer transition-all duration-200 text-center ${
            isDraggingAudio
              ? 'border-brand-500 bg-brand-500/10 scale-[0.99]'
              : 'border-slate-300 dark:border-slate-700 hover:border-brand-400 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md'
          }`}
        >
          <input
            type="file"
            ref={audioInputRef}
            onChange={(e) => e.target.files && processAudioFiles(e.target.files)}
            multiple
            accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
            className="hidden"
          />

          <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            {isDecodingAudio ? (
              <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Music className="w-8 h-8" />
            )}
          </div>

          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
            {isDecodingAudio ? 'Decoding Audio Data...' : 'Drop Music Files Here'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mb-4">
            Supports MP3, WAV, FLAC, OGG, M4A. ID3 tags (title, artist, album art) will be extracted
            automatically.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 group-hover:bg-brand-500 group-hover:text-white transition-colors"
            >
              Browse Audio Files
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setImportLinkOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/60 dark:hover:bg-brand-900/80 border border-brand-200 dark:border-brand-800/80 transition-all shadow-xs"
            >
              <Link2 className="w-3.5 h-3.5 text-brand-500" />
              <span>Import from Link (Suno / YouTube)</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setVideoToAudioOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/80 border border-purple-200 dark:border-purple-800/60 transition-all shadow-xs"
            >
              <FileVideo className="w-3.5 h-3.5 text-purple-500" />
              <span>Convert Video to Music</span>
            </button>
          </div>

          {tracks.length > 0 && (
            <div className="mt-4 flex items-center space-x-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {tracks.length} track{tracks.length > 1 ? 's' : ''} loaded
              </span>
            </div>
          )}
        </div>

        {/* Image Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingImages(true);
          }}
          onDragLeave={() => setIsDraggingImages(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingImages(false);
            if (e.dataTransfer.files) {
              processImageFiles(e.dataTransfer.files);
            }
          }}
          onClick={() => imageInputRef.current?.click()}
          className={`group relative flex flex-col items-center justify-center p-8 rounded-3xl border-2 border-dashed cursor-pointer transition-all duration-200 text-center ${
            isDraggingImages
              ? 'border-indigo-500 bg-indigo-500/10 scale-[0.99]'
              : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md'
          }`}
        >
          <input
            type="file"
            ref={imageInputRef}
            onChange={(e) => e.target.files && processImageFiles(e.target.files)}
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />

          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <ImageIcon className="w-8 h-8" />
          </div>

          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
            Drop Background Images Here
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mb-4">
            Supports JPG, PNG, WEBP. Use one image or multiple for an animated crossfading or
            beat-synced slideshow.
          </p>

          <button
            type="button"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 group-hover:bg-indigo-500 group-hover:text-white transition-colors"
          >
            Browse Images
          </button>

          {images.length > 0 && (
            <div className="mt-4 flex items-center space-x-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {images.length} image{images.length > 1 ? 's' : ''} loaded
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Uploaded Summary Bar */}
      {(tracks.length > 0 || images.length > 0) && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                <FileAudio className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Audio Tracks</p>
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {tracks.length} track{tracks.length > 1 ? 's' : ''} (
                  {Math.floor(totalAudioDuration / 60)}m {Math.round(totalAudioDuration % 60)}s)
                </p>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Images</p>
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {images.length > 0 ? `${images.length} image${images.length > 1 ? 's' : ''}` : 'Ambient Background'}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setCurrentStep(2)}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm shadow-md shadow-brand-500/20 transition-all"
          >
            <span>Proceed to Arrange</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
