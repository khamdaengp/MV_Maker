import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { decodeAudioFile } from '../../services/audioDecoder';
import { ImageItem } from '../../types';
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Edit2,
  Check,
  Music,
  Plus,
  ArrowRight,
  ImageIcon,
} from 'lucide-react';

export const ArrangeStep: React.FC = () => {
  const {
    tracks,
    images,
    updateTrack,
    removeTrack,
    reorderTracks,
    addTracks,
    removeImage,
    reorderImages,
    addImages,
    setCurrentStep,
  } = useAppStore();

  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Reordering Tracks
  const moveTrack = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tracks.length) return;
    const updated = [...tracks];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    reorderTracks(updated);
  };

  // Reordering Images
  const moveImage = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    reorderImages(updated);
  };

  // Start editing metadata
  const handleStartEdit = (trackId: string, currentTitle: string, currentArtist: string) => {
    setEditingTrackId(trackId);
    setEditTitle(currentTitle);
    setEditArtist(currentArtist);
  };

  const handleSaveEdit = (trackId: string) => {
    updateTrack(trackId, {
      title: editTitle.trim() || 'Untitled Track',
      artist: editArtist.trim() || 'Unknown Artist',
    });
    setEditingTrackId(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-10 animate-fadeIn">
      {/* 1. Track List Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
              <Music className="w-5 h-5 text-brand-500" />
              <span>Track Sequencing & Metadata</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Reorder track playback and customize Title and Artist overlays.
            </p>
          </div>

          <label className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-brand-50 dark:hover:bg-brand-950/40 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer transition-colors">
            <Plus className="w-3.5 h-3.5 text-brand-500" />
            <span>Add Songs</span>
            <input
              type="file"
              multiple
              accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
              className="hidden"
              onChange={async (e) => {
                if (e.target.files && e.target.files.length > 0) {
                  const newTracks = await Promise.all(
                    Array.from(e.target.files).map((f) => decodeAudioFile(f))
                  );
                  addTracks(newTracks);
                }
              }}
            />
          </label>
        </div>

        {tracks.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center text-sm text-slate-400">
            No audio tracks added yet. Please go back to Step 1 to upload music.
          </div>
        ) : (
          <div className="space-y-2">
            {tracks.map((track, idx) => {
              const isEditing = editingTrackId === track.id;

              return (
                <div
                  key={track.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 shadow-sm hover:border-brand-500/40 transition-colors"
                >
                  {/* Left: Reorder handles & Track Info */}
                  <div className="flex items-center space-x-3.5 flex-1 min-w-0">
                    <span className="w-6 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
                      {idx + 1}
                    </span>

                    {/* Reorder Buttons */}
                    <div className="flex flex-col space-y-0.5">
                      <button
                        onClick={() => moveTrack(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20 text-slate-500"
                        title="Move track up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveTrack(idx, 'down')}
                        disabled={idx === tracks.length - 1}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-20 text-slate-500"
                        title="Move track down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Cover art thumbnail if available */}
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-700">
                      {track.coverArtUrl ? (
                        <img
                          src={track.coverArtUrl}
                          alt="Cover"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="w-4 h-4 text-slate-400" />
                      )}
                    </div>

                    {/* Title & Artist details / inline editor */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="Track Title"
                            className="px-2.5 py-1 text-xs rounded-lg border border-brand-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                          />
                          <input
                            type="text"
                            value={editArtist}
                            onChange={(e) => setEditArtist(e.target.value)}
                            placeholder="Artist Name"
                            className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveEdit(track.id)}
                            className="p-1 rounded-lg bg-brand-500 text-white hover:bg-brand-600"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                              {track.title}
                            </span>
                            <button
                              onClick={() => handleStartEdit(track.id, track.title, track.artist)}
                              className="p-1 text-slate-400 hover:text-brand-500 transition-colors"
                              title="Edit Title & Artist"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {track.artist} {track.album ? `• ${track.album}` : ''}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Duration & Actions */}
                  <div className="flex items-center space-x-4 flex-shrink-0">
                    <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
                      {formatDuration(track.duration)}
                    </span>

                    <button
                      onClick={() => removeTrack(track.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                      title="Remove track"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Image Gallery Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
              <ImageIcon className="w-5 h-5 text-indigo-500" />
              <span>Background Images ({images.length})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Arrange the slideshow display order. Images crossfade or cut to beats smoothly.
            </p>
          </div>

          <label className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer transition-colors">
            <Plus className="w-3.5 h-3.5 text-indigo-500" />
            <span>Add Images</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={async (e) => {
                if (e.target.files && e.target.files.length > 0) {
                  const items: ImageItem[] = [];
                  for (const f of Array.from(e.target.files)) {
                    const url = URL.createObjectURL(f);
                    items.push({
                      id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                      file: f,
                      name: f.name,
                      url,
                      width: 1920,
                      height: 1080,
                    });
                  }
                  addImages(items);
                }
              }}
            />
          </label>
        </div>

        {images.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center text-sm text-slate-400">
            No background images added. An ambient modern dark gradient will be rendered behind the
            visualizer.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {images.map((img, idx) => (
              <div
                key={img.id}
                className="group relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm aspect-video flex flex-col"
              >
                <img src={img.url} alt={img.name} className="w-full h-full object-cover" />

                {/* Index badge */}
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/60 text-white font-mono text-[10px] font-bold backdrop-blur-sm">
                  #{idx + 1}
                </div>

                {/* Hover overlay actions */}
                <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-1 p-2">
                  <button
                    onClick={() => moveImage(idx, 'left')}
                    disabled={idx === 0}
                    className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 text-white disabled:opacity-20"
                    title="Move earlier"
                  >
                    <ChevronUp className="w-4 h-4 -rotate-90" />
                  </button>
                  <button
                    onClick={() => removeImage(img.id)}
                    className="p-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white"
                    title="Delete image"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveImage(idx, 'right')}
                    disabled={idx === images.length - 1}
                    className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 text-white disabled:opacity-20"
                    title="Move later"
                  >
                    <ChevronDown className="w-4 h-4 -rotate-90" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bottom Proceed Action */}
      <div className="flex justify-end pt-4">
        <button
          onClick={() => setCurrentStep(3)}
          className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm shadow-md shadow-brand-500/20 transition-all"
        >
          <span>Proceed to Style & Preview</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
