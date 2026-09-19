import { AudioTrack, ImageItem, LinkImportResult } from '../types';
import { decryptSunoAudioBuffer } from './sunoDecryptor';

/**
 * Resolves a media link (Suno, YouTube, or direct audio) and retrieves its metadata.
 */
export async function resolveLink(rawUrl: string): Promise<LinkImportResult> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Please enter a valid link');
  }

  // 1. Try local Vite dev-server API endpoint
  try {
    const res = await fetch(`/api/link-info?url=${encodeURIComponent(trimmed)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return {
          source: data.source,
          id: data.id,
          title: data.title || 'Untitled Track',
          artist: data.artist || 'Unknown Artist',
          audioUrl: data.audioUrl || null,
          imageUrl: data.imageUrl || null,
          duration: data.duration,
          originalUrl: trimmed,
        };
      }
    }
  } catch {
    // If running in an environment without the local Vite proxy, fallback below
  }

  // 2. Client-side Fallbacks:

  // Fallback A: Suno Link
  if (trimmed.includes('suno.com') || trimmed.includes('suno.ai')) {
    // Check for song ID in URL
    const idMatch = trimmed.match(/song\/([0-9a-fA-F-]{32,36})/) ||
      trimmed.match(/s\/([a-zA-Z0-9_-]+)/);
    const id = idMatch ? idMatch[1] : undefined;

    const audioUrl = id ? `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id}.m4a` : null;
    const imageUrl = id ? `https://cdn2.suno.ai/image_large_${id}.jpeg` : null;

    return {
      source: 'suno',
      id,
      title: 'Suno Music Track',
      artist: 'Suno AI',
      audioUrl,
      imageUrl,
      originalUrl: trimmed,
    };
  }

  // Fallback B: YouTube Link
  if (trimmed.includes('youtu.be') || trimmed.includes('youtube.com')) {
    let videoId: string | null = null;
    if (trimmed.includes('youtu.be/')) {
      videoId = trimmed.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0] || null;
    } else if (trimmed.includes('v=')) {
      try {
        videoId = new URL(trimmed).searchParams.get('v');
      } catch {
        const m = trimmed.match(/v=([a-zA-Z0-9_-]+)/);
        videoId = m ? m[1] : null;
      }
    }

    let title = 'YouTube Track';
    let artist = 'YouTube Creator';
    let imageUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;

    if (videoId) {
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        if (oembedRes.ok) {
          const oeData = await oembedRes.json();
          if (oeData.title) title = oeData.title;
          if (oeData.author_name) artist = oeData.author_name;
          if (oeData.thumbnail_url) imageUrl = oeData.thumbnail_url;
        }
      } catch {
        // use defaults
      }
    }

    return {
      source: 'youtube',
      id: videoId || undefined,
      title,
      artist,
      audioUrl: null,
      imageUrl,
      originalUrl: trimmed,
    };
  }

  // Fallback C: Direct Audio Link
  const clean = trimmed.split('?')[0];
  const filename = clean.substring(clean.lastIndexOf('/') + 1) || 'Audio Track';
  const title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ''));

  return {
    source: 'direct',
    title,
    artist: 'Web Audio',
    audioUrl: trimmed,
    imageUrl: null,
    originalUrl: trimmed,
  };
}

/**
 * Downloads audio data from a resolved link, decodes to an AudioBuffer,
 * and creates an AudioTrack and optional cover ImageItem.
 */
export async function fetchAudioTrackFromLink(
  info: LinkImportResult,
  onProgress?: (percent: number) => void
): Promise<{ track: AudioTrack; imageItem?: ImageItem }> {
  if (!info.audioUrl) {
    throw new Error('No direct audio stream URL available for this track.');
  }

  onProgress?.(10);

  // 1. Fetch audio bytes through proxy or direct
  const proxyUrl = `/api/proxy-stream?url=${encodeURIComponent(info.audioUrl)}`;
  let response: Response;

  try {
    response = await fetch(proxyUrl);
    if (!response.ok) {
      // Fallback to direct fetch
      response = await fetch(info.audioUrl);
    }
  } catch {
    response = await fetch(info.audioUrl);
  }

  if (!response.ok) {
    throw new Error(`Failed to download audio stream (${response.status} ${response.statusText})`);
  }

  onProgress?.(40);

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  let arrayBuffer: ArrayBuffer;
  if (response.body && total > 0) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (total > 0) {
          const percent = 40 + Math.round((received / total) * 35);
          onProgress?.(Math.min(percent, 75));
        }
      }
    }

    const combined = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    arrayBuffer = combined.buffer;
  } else {
    arrayBuffer = await response.arrayBuffer();
  }

  onProgress?.(70);

  // 2. If track is from Suno, decrypt the progressive DRM stream (AES-CTR)
  let playableBuffer = arrayBuffer;
  const songId = info.id || info.originalUrl.match(/([0-9a-fA-F-]{32,36})/)?.[1];
  if (info.source === 'suno' && songId) {
    onProgress?.(75);
    try {
      playableBuffer = await decryptSunoAudioBuffer(songId, arrayBuffer);
    } catch (decErr: unknown) {
      const e = decErr as Error;
      console.warn('Suno DRM decryption error:', e);
      throw new Error(`Suno decryption failed: ${e.message || 'Could not decrypt stream'}`);
    }
  }

  onProgress?.(85);

  // 3. Decode audio buffer using AudioContext
  const audioCtx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(playableBuffer.slice(0));
  } catch (decErr: unknown) {
    const e = decErr as Error;
    throw new Error(`Unable to decode audio data: ${e.message || 'Unsupported codec or corrupted stream'}`);
  } finally {
    audioCtx.close();
  }

  onProgress?.(92);

  // 4. Cache raw channels
  const rawChannels: Float32Array[] = [];
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    rawChannels.push(new Float32Array(audioBuffer.getChannelData(i)));
  }

  // Create a blob file from the clean playable buffer
  const mimeType = info.audioUrl.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4';
  const audioBlob = new Blob([playableBuffer], { type: mimeType });
  const audioBlobUrl = URL.createObjectURL(audioBlob);
  const audioFile = new File([audioBlob], `${info.artist} - ${info.title}.${info.audioUrl.endsWith('.mp3') ? 'mp3' : 'm4a'}`, {
    type: mimeType,
  });

  // 4. If image exists, fetch & load ImageItem
  let imageItem: ImageItem | undefined;
  let coverArtBlobUrl: string | undefined;

  if (info.imageUrl) {
    try {
      const imgProxyUrl = `/api/proxy-stream?url=${encodeURIComponent(info.imageUrl)}`;
      let imgRes = await fetch(imgProxyUrl);
      if (!imgRes.ok) {
        imgRes = await fetch(info.imageUrl);
      }
      if (imgRes.ok) {
        const imgBlob = await imgRes.blob();
        coverArtBlobUrl = URL.createObjectURL(imgBlob);

        // Calculate dimensions
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            imageItem = {
              id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              file: new File([imgBlob], `${info.title}_artwork.jpg`, { type: imgBlob.type || 'image/jpeg' }),
              name: `${info.title} Artwork`,
              url: coverArtBlobUrl!,
              width: img.naturalWidth || 1920,
              height: img.naturalHeight || 1080,
            };
            resolve();
          };
          img.onerror = () => {
            imageItem = {
              id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              file: new File([imgBlob], `${info.title}_artwork.jpg`, { type: 'image/jpeg' }),
              name: `${info.title} Artwork`,
              url: coverArtBlobUrl!,
              width: 1920,
              height: 1080,
            };
            resolve();
          };
          img.src = coverArtBlobUrl!;
        });
      }
    } catch (imgErr) {
      console.warn('Failed to load artwork image:', imgErr);
    }
  }

  onProgress?.(100);

  const track: AudioTrack = {
    id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    file: audioFile,
    name: audioFile.name,
    title: info.title,
    artist: info.artist,
    duration: audioBuffer.duration,
    audioBuffer,
    rawChannelData: rawChannels,
    sampleRate: audioBuffer.sampleRate,
    coverArtUrl: coverArtBlobUrl || info.imageUrl || undefined,
    url: audioBlobUrl,
  };

  return { track, imageItem };
}
