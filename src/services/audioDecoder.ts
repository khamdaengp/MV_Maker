import { AudioTrack } from '../types';

/**
 * Parses ID3v2 metadata from an ArrayBuffer.
 */
export function parseId3Metadata(buffer: ArrayBuffer): {
  title?: string;
  artist?: string;
  album?: string;
  coverArtUrl?: string;
} {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 10) return {};

  // Check ID3 marker
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return {};
  }

  const version = bytes[3];
  // Calculate synchsafe size
  const tagSize =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);

  let offset = 10;
  const end = Math.min(bytes.length, 10 + tagSize);

  let title: string | undefined;
  let artist: string | undefined;
  let album: string | undefined;
  let coverArtUrl: string | undefined;

  const textDecoderUtf8 = new TextDecoder('utf-8');
  const textDecoderLatin1 = new TextDecoder('iso-8859-1');
  const textDecoderUtf16 = new TextDecoder('utf-16');

  while (offset + 10 < end) {
    // Read 4-character frame ID
    const frameId = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );

    if (frameId.charCodeAt(0) === 0) break; // Padding

    let frameSize = 0;
    if (version === 4) {
      // ID3v2.4 synchsafe
      frameSize =
        ((bytes[offset + 4] & 0x7f) << 21) |
        ((bytes[offset + 5] & 0x7f) << 14) |
        ((bytes[offset + 6] & 0x7f) << 7) |
        (bytes[offset + 7] & 0x7f);
    } else {
      // ID3v2.3 32-bit int
      frameSize =
        (bytes[offset + 4] << 24) |
        (bytes[offset + 5] << 16) |
        (bytes[offset + 6] << 8) |
        bytes[offset + 7];
    }

    if (frameSize <= 0 || offset + 10 + frameSize > end) {
      break;
    }

    const frameData = bytes.subarray(offset + 10, offset + 10 + frameSize);

    const decodeText = (data: Uint8Array): string => {
      if (data.length < 1) return '';
      const encoding = data[0];
      const slice = data.subarray(1);
      let res = '';
      try {
        if (encoding === 0) {
          res = textDecoderLatin1.decode(slice);
        } else if (encoding === 1 || encoding === 2) {
          res = textDecoderUtf16.decode(slice);
        } else {
          res = textDecoderUtf8.decode(slice);
        }
      } catch {
        res = textDecoderLatin1.decode(slice);
      }
      return res.replace(/\0.*$/g, '').trim();
    };

    if (frameId === 'TIT2') {
      title = decodeText(frameData);
    } else if (frameId === 'TPE1') {
      artist = decodeText(frameData);
    } else if (frameId === 'TALB') {
      album = decodeText(frameData);
    } else if (frameId === 'APIC' && !coverArtUrl) {
      // Attached picture
      try {
        let p = 1; // skip encoding
        let mime = '';
        while (p < frameData.length && frameData[p] !== 0) {
          mime += String.fromCharCode(frameData[p]);
          p++;
        }
        p++; // null terminator
        p++; // pic type
        // skip description
        while (p < frameData.length && frameData[p] !== 0) {
          p++;
        }
        p++; // null terminator
        if (p < frameData.length) {
          const imgBytes = frameData.subarray(p);
          const blob = new Blob([imgBytes], { type: mime || 'image/jpeg' });
          coverArtUrl = URL.createObjectURL(blob);
        }
      } catch {
        // Skip invalid APIC
      }
    }

    offset += 10 + frameSize;
  }

  return { title, artist, album, coverArtUrl };
}

/**
 * Parses artist and title from filename (e.g. "Daft Punk - One More Time.mp3")
 */
export function parseFromFilename(filename: string): { title: string; artist: string } {
  const base = filename.replace(/\.[^/.]+$/, '');
  const parts = base.split(' - ');
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim(),
    };
  }
  return {
    artist: 'Unknown Artist',
    title: base.trim(),
  };
}

/**
 * Decodes an audio File into an AudioTrack with AudioBuffer and metadata.
 */
export async function decodeAudioFile(file: File): Promise<AudioTrack> {
  const arrayBuffer = await file.arrayBuffer();
  const id3 = parseId3Metadata(arrayBuffer);
  const fallback = parseFromFilename(file.name);

  // Decode audio data using an AudioContext
  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    audioCtx.close();
  }

  // Cache raw channels
  const rawChannels: Float32Array[] = [];
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    rawChannels.push(new Float32Array(audioBuffer.getChannelData(i)));
  }

  const blobUrl = URL.createObjectURL(file);

  return {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    file,
    name: file.name,
    title: id3.title || fallback.title,
    artist: id3.artist || fallback.artist,
    album: id3.album,
    duration: audioBuffer.duration,
    audioBuffer,
    rawChannelData: rawChannels,
    sampleRate: audioBuffer.sampleRate,
    coverArtUrl: id3.coverArtUrl,
    url: blobUrl,
  };
}
