import React, { useState, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  resolveLink,
  fetchAudioTrackFromLink,
} from '../../services/linkAudioFetcher';
import { decodeAudioFile } from '../../services/audioDecoder';
import { extractAudioFromVideo } from '../../services/videoAudioExtractor';
import { AudioTrack, ImageItem, LinkImportResult } from '../../types';
import {
  X,
  Link2,
  Music,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Youtube,
  Radio,
  FileAudio,
  UploadCloud,
  Check,
} from 'lucide-react';

interface ImportLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportLinkModal: React.FC<ImportLinkModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { addTracks, addImages, setCurrentStep } = useAppStore();

  const [inputUrl, setInputUrl] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Resolved metadata
  const [resolvedInfo, setResolvedInfo] = useState<LinkImportResult | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [customArtist, setCustomArtist] = useState('');
  const [includeArtwork, setIncludeArtwork] = useState(true);

  // Audio track & cover art ready for import
  const [readyTrack, setReadyTrack] = useState<AudioTrack | null>(null);
  const [readyImage, setReadyImage] = useState<ImageItem | null>(null);

  // Dropzone for YouTube files
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setInputUrl('');
    setIsResolving(false);
    setIsDownloading(false);
    setDownloadProgress(0);
    setStatusMessage('');
    setError(null);
    setResolvedInfo(null);
    setCustomTitle('');
    setCustomArtist('');
    setReadyTrack(null);
    setReadyImage(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // 1. Resolve Link (Suno, YouTube, or direct)
  const handleResolve = async (urlToResolve?: string) => {
    const url = (urlToResolve || inputUrl).trim();
    if (!url) {
      setError('Please paste a link first.');
      return;
    }

    setError(null);
    setIsResolving(true);
    setStatusMessage('Analyzing link and retrieving metadata...');
    setResolvedInfo(null);
    setReadyTrack(null);
    setReadyImage(null);

    try {
      const info = await resolveLink(url);
      setResolvedInfo(info);
      setCustomTitle(info.title);
      setCustomArtist(info.artist);

      // If Suno or direct audio has an audio stream, automatically fetch and decode it!
      if (info.audioUrl) {
        setIsDownloading(true);
        setStatusMessage('Downloading audio stream...');
        const { track, imageItem } = await fetchAudioTrackFromLink(
          info,
          (percent) => {
            setDownloadProgress(percent);
            if (percent < 50) {
              setStatusMessage(`Downloading audio data (${percent}%)...`);
            } else if (percent < 90) {
              setStatusMessage(`Decoding audio buffer (${percent}%)...`);
            } else {
              setStatusMessage('Extracting cover art & finalizing track...');
            }
          }
        );

        setReadyTrack(track);
        if (imageItem) {
          setReadyImage(imageItem);
        }
        setIsDownloading(false);
      } else if (info.source === 'youtube') {
        // YouTube metadata loaded! If image exists, prepare image item
        if (info.imageUrl) {
          try {
            const imgRes = await fetch(
              `/api/proxy-stream?url=${encodeURIComponent(info.imageUrl)}`
            );
            if (imgRes.ok) {
              const imgBlob = await imgRes.blob();
              const blobUrl = URL.createObjectURL(imgBlob);
              setReadyImage({
                id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                file: new File([imgBlob], `${info.title}_thumb.jpg`, {
                  type: 'image/jpeg',
                }),
                name: `${info.title} Thumbnail`,
                url: blobUrl,
                width: 1280,
                height: 720,
              });
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to process link. Please check URL.');
    } finally {
      setIsResolving(false);
      setIsDownloading(false);
    }
  };

  // 2. Handle dropping an audio or video file for YouTube or manual attachment
  const handleAttachFile = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setError(null);
    setIsDownloading(true);
    setStatusMessage(`Processing attached file: ${file.name}...`);

    try {
      let track: AudioTrack;

      if (file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
        setStatusMessage('Extracting high-quality audio from video file...');
        const extracted = await extractAudioFromVideo(file, 'mp3', 192);
        track = extracted.createAudioTrack();
      } else {
        setStatusMessage('Decoding audio file...');
        track = await decodeAudioFile(file);
      }

      // If we have resolved metadata (e.g. YouTube title, artist, thumbnail), apply them
      if (customTitle) track.title = customTitle;
      if (customArtist) track.artist = customArtist;
      if (readyImage?.url) track.coverArtUrl = readyImage.url;

      setReadyTrack(track);
      setStatusMessage('Audio successfully linked!');
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to process attached file.');
    } finally {
      setIsDownloading(false);
    }
  };

  // 3. Finalize and Add Track to Project
  const handleAddToProject = () => {
    if (!readyTrack) return;

    // Apply any customized title / artist
    const finalTrack: AudioTrack = {
      ...readyTrack,
      title: customTitle.trim() || readyTrack.title,
      artist: customArtist.trim() || readyTrack.artist,
    };

    addTracks([finalTrack]);

    if (includeArtwork && readyImage) {
      addImages([readyImage]);
    }

    handleClose();
    // Navigate to step 2 (Arrange)
    setCurrentStep(2);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>Import Music from Link</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                  Suno & YouTube
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Import songs and official artwork directly into your video timeline
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Supported Services Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium mr-1">Supported:</span>
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60 font-semibold">
              <Radio className="w-3.5 h-3.5" />
              <span>Suno (suno.com/s/...)</span>
            </span>
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60 font-semibold">
              <Youtube className="w-3.5 h-3.5" />
              <span>YouTube (youtu.be/...)</span>
            </span>
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-semibold">
              <FileAudio className="w-3.5 h-3.5" />
              <span>Direct Audio (.mp3, .m4a)</span>
            </span>
          </div>

          {/* URL Input Box */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Paste Music URL
            </label>
            <div className="relative flex items-center">
              <input
                type="url"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isResolving && !isDownloading) {
                    handleResolve();
                  }
                }}
                placeholder="e.g. https://suno.com/s/BINF6vZBGmhM77vM or https://youtu.be/PPRXvZVPXXY"
                className="w-full pl-4 pr-28 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all shadow-inner"
              />
              <div className="absolute right-2 flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => handleResolve()}
                  disabled={isResolving || isDownloading || !inputUrl.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-500/25 transition-all flex items-center space-x-1.5"
                >
                  {isResolving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Resolving...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Fetch</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Quick Example Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Quick Test Examples:</span>
            <button
              type="button"
              onClick={() => {
                setInputUrl('https://suno.com/s/BINF6vZBGmhM77vM');
                handleResolve('https://suno.com/s/BINF6vZBGmhM77vM');
              }}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-orange-100 dark:hover:bg-orange-950/60 text-slate-700 dark:text-slate-300 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
            >
              🎵 Suno Example
            </button>
            <button
              type="button"
              onClick={() => {
                setInputUrl('https://youtu.be/PPRXvZVPXXY');
                handleResolve('https://youtu.be/PPRXvZVPXXY');
              }}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-red-950/60 text-slate-700 dark:text-slate-300 hover:text-red-700 dark:hover:text-red-300 transition-colors"
            >
              📺 YouTube Example
            </button>
          </div>

          {/* Status Message & Progress Bar */}
          {(isResolving || isDownloading) && (
            <div className="p-4 rounded-2xl bg-brand-50/70 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 space-y-3 animate-fadeIn">
              <div className="flex items-center space-x-2 text-xs font-semibold text-brand-800 dark:text-brand-300">
                <Loader2 className="w-4 h-4 animate-spin text-brand-600 dark:text-brand-400" />
                <span>{statusMessage || 'Processing track...'}</span>
              </div>
              {downloadProgress > 0 && (
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-brand-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-start space-x-2 animate-fadeIn">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
              <div>
                <p className="font-bold">Error importing link</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Resolved Track Preview Card */}
          {resolvedInfo && (
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span
                    className={`inline-flex items-center space-x-1 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      resolvedInfo.source === 'suno'
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                        : resolvedInfo.source === 'youtube'
                        ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}
                  >
                    {resolvedInfo.source === 'suno' ? (
                      <>
                        <Radio className="w-3 h-3" />
                        <span>Suno AI Song</span>
                      </>
                    ) : resolvedInfo.source === 'youtube' ? (
                      <>
                        <Youtube className="w-3 h-3" />
                        <span>YouTube Music</span>
                      </>
                    ) : (
                      <>
                        <FileAudio className="w-3 h-3" />
                        <span>Direct Audio</span>
                      </>
                    )}
                  </span>
                </div>

                {readyTrack && (
                  <span className="flex items-center space-x-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Audio Ready ({Math.floor(readyTrack.duration / 60)}m {Math.round(readyTrack.duration % 60)}s)</span>
                  </span>
                )}
              </div>

              {/* Artwork & Details Row */}
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                {/* Artwork Thumbnail */}
                {(readyImage?.url || resolvedInfo.imageUrl) && (
                  <div className="w-28 h-28 rounded-2xl overflow-hidden bg-slate-200 dark:bg-slate-700 flex-shrink-0 border border-slate-300 dark:border-slate-600 shadow-sm relative group">
                    <img
                      src={readyImage?.url || resolvedInfo.imageUrl || ''}
                      alt={customTitle}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold">
                      <ImageIcon className="w-4 h-4 mr-1" /> Artwork
                    </div>
                  </div>
                )}

                {/* Edit Title and Artist */}
                <div className="flex-1 w-full space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Song Title
                    </label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="Title"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Artist / Creator
                    </label>
                    <input
                      type="text"
                      value={customArtist}
                      onChange={(e) => setCustomArtist(e.target.value)}
                      placeholder="Artist"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Audio Preview if loaded */}
              {readyTrack && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60">
                  <div className="flex items-center space-x-2 mb-2">
                    <Music className="w-4 h-4 text-brand-500" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Audio Stream Preview
                    </span>
                  </div>
                  <audio
                    src={readyTrack.url}
                    controls
                    className="w-full h-9 rounded-lg"
                  />
                </div>
              )}

              {/* YouTube Specific Assistant (when no audio stream attached yet) */}
              {resolvedInfo.source === 'youtube' && !readyTrack && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 space-y-3">
                  <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 text-indigo-900 dark:text-indigo-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center space-x-1.5">
                        <Youtube className="w-4 h-4 text-red-500" />
                        <span>YouTube Audio Assistant</span>
                      </span>
                      <a
                        href={`https://cobalt.tools`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 font-semibold text-[11px] shadow-xs hover:shadow transition-all"
                      >
                        <span>Open Cobalt Audio Saver</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-[11px] text-indigo-800/80 dark:text-indigo-300/80">
                      YouTube restricts direct server downloads. Click the link above to save the audio, then drop the downloaded file (.mp3, .m4a, or .mp4) below to instantly link it with this title & artwork!
                    </p>
                  </div>

                  {/* Dropzone for YouTube audio/video */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(false);
                      if (e.dataTransfer.files) {
                        handleAttachFile(e.dataTransfer.files);
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-6 rounded-2xl border-2 border-dashed cursor-pointer text-center transition-all ${
                      isDraggingFile
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-slate-300 dark:border-slate-700 hover:border-brand-400 bg-white/50 dark:bg-slate-900/50'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => e.target.files && handleAttachFile(e.target.files)}
                      accept="audio/*,video/*,.mp3,.m4a,.wav,.mp4,.webm"
                      className="hidden"
                    />
                    <UploadCloud className="w-8 h-8 text-brand-500 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Drop downloaded MP3 or MP4 Video here
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Audio will be automatically demuxed and paired with the YouTube title & artwork
                    </p>
                  </div>
                </div>
              )}

              {/* Artwork Checkbox */}
              {readyImage && (
                <label className="flex items-center space-x-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={includeArtwork}
                    onChange={(e) => setIncludeArtwork(e.target.checked)}
                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 dark:border-slate-600 dark:bg-slate-800"
                  />
                  <span>
                    Also add track artwork as a background image in this video project
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleAddToProject}
            disabled={!readyTrack}
            className="flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-md shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <Check className="w-4 h-4" />
            <span>Add Track to Project</span>
          </button>
        </div>
      </div>
    </div>
  );
};
