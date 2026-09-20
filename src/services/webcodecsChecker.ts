/**
 * Browser WebCodecs capability and codec compatibility detection.
 */

export interface CodecSupportResult {
  hasWebCodecs: boolean;
  hasVideoEncoder: boolean;
  hasAudioEncoder: boolean;
  hasOffscreenCanvas: boolean;
  hasMediaRecorder: boolean;
  engine: 'webcodecs' | 'mediarecorder' | 'none';
  supportedVideoCodec?: string;
  supportedAudioCodec?: 'aac' | 'opus';
  audioCodecMime?: string;
  recorderMimeType?: string;
  errorMessage?: string;
  warningMessage?: string;
}

export async function checkBrowserWebCodecsSupport(): Promise<CodecSupportResult> {
  const hasVideoEncoder = typeof window !== 'undefined' && 'VideoEncoder' in window;
  const hasAudioEncoder = typeof window !== 'undefined' && 'AudioEncoder' in window;
  const hasOffscreenCanvas = typeof window !== 'undefined' && 'OffscreenCanvas' in window;
  const hasMediaRecorder = typeof window !== 'undefined' && 'MediaRecorder' in window;

  // Determine optimal MediaRecorder MIME type if available
  let recorderMimeType: string | undefined;
  if (hasMediaRecorder) {
    const candidateMimes = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (const m of candidateMimes) {
      if (MediaRecorder.isTypeSupported(m)) {
        recorderMimeType = m;
        break;
      }
    }
  }

  // Case 1: Browser does NOT support WebCodecs (e.g. Firefox, Safari, or HTTP LAN IP)
  if (!hasVideoEncoder || !hasAudioEncoder) {
    if (hasMediaRecorder) {
      const isLanOrHttp = typeof window !== 'undefined' &&
        window.location.protocol === 'http:' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1';

      const warningMessage = isLanOrHttp
        ? 'WebCodecs hardware acceleration is restricted by browsers on non-localhost HTTP. Running in MediaRecorder compatibility mode. (Use http://localhost:3000 in Chrome/Edge for hardware acceleration).'
        : 'WebCodecs hardware encoding is not supported in this browser. Running in MediaRecorder compatibility mode.';

      return {
        hasWebCodecs: false,
        hasVideoEncoder,
        hasAudioEncoder,
        hasOffscreenCanvas,
        hasMediaRecorder: true,
        engine: 'mediarecorder',
        supportedVideoCodec: 'h264',
        supportedAudioCodec: 'aac',
        audioCodecMime: 'mp4a.40.2',
        recorderMimeType: recorderMimeType || 'video/webm',
        warningMessage,
      };
    }

    return {
      hasWebCodecs: false,
      hasVideoEncoder,
      hasAudioEncoder,
      hasOffscreenCanvas,
      hasMediaRecorder: false,
      engine: 'none',
      errorMessage:
        'In-browser video rendering is not supported in this browser. Please use Google Chrome, Microsoft Edge, or a modern browser.',
    };
  }

  let supportedVideoCodec: string | undefined;
  // Test H.264 profiles: High, Main, Baseline with appropriate levels
  const videoCodecsToTest = [
    'avc1.640034', // H.264 High Profile Level 5.2 (4K @ 60fps)
    'avc1.640033', // H.264 High Profile Level 5.1 (4K @ 30fps)
    'avc1.64002a', // H.264 High Profile Level 4.2 (1080p @ 60fps)
    'avc1.640028', // H.264 High Profile Level 4.0 (1080p @ 30fps)
    'avc1.4d002a', // H.264 Main Profile Level 4.2
    'avc1.42001f', // H.264 Baseline Profile Level 3.1
  ];

  for (const codec of videoCodecsToTest) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width: 1280,
        height: 720,
        bitrate: 4_000_000,
        framerate: 30,
      });
      if (support.supported) {
        supportedVideoCodec = codec;
        break;
      }
    } catch {
      // Continue trying other profiles
    }
  }

  // Check AudioEncoder support (AAC first, then Opus)
  let supportedAudioCodec: 'aac' | 'opus' | undefined;
  let audioCodecMime: string | undefined;

  try {
    const aacSupport = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitrate: 192000,
    });
    if (aacSupport.supported) {
      supportedAudioCodec = 'aac';
      audioCodecMime = 'mp4a.40.2';
    }
  } catch {
    // AAC not supported
  }

  if (!supportedAudioCodec) {
    try {
      const opusSupport = await AudioEncoder.isConfigSupported({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 192000,
      });
      if (opusSupport.supported) {
        supportedAudioCodec = 'opus';
        audioCodecMime = 'opus';
      }
    } catch {
      // Opus check failed
    }
  }

  return {
    hasWebCodecs: Boolean(hasVideoEncoder && hasAudioEncoder),
    hasVideoEncoder,
    hasAudioEncoder,
    hasOffscreenCanvas,
    hasMediaRecorder,
    engine: 'webcodecs',
    supportedVideoCodec: supportedVideoCodec || 'avc1.42001f',
    supportedAudioCodec: supportedAudioCodec || 'aac',
    audioCodecMime: audioCodecMime || 'mp4a.40.2',
    recorderMimeType,
  };
}

/**
 * Returns a resolution-compatible H.264 (AVC) codec string.
 * High resolutions (4K, 1440p) require AVC Level 5.1/5.2 to prevent
 * "exceeds maximum coded area supported by AVC level" VideoEncoder errors.
 */
export async function getOptimalVideoCodecForResolution(
  width: number,
  height: number,
  fps: number = 30,
  bitrateMbps: number = 10
): Promise<string> {
  const totalPixels = width * height;
  let candidates: string[] = [];

  if (totalPixels > 3686400) {
    // 4K UHD (3840x2160 = 8,294,400 pixels) -> Requires AVC Level 5.1 (0x33) or 5.2 (0x34)
    candidates = [
      fps > 30 ? 'avc1.640034' : 'avc1.640033', // High Profile Level 5.2 / 5.1
      fps > 30 ? 'avc1.4d0034' : 'avc1.4d0033', // Main Profile Level 5.2 / 5.1
      fps > 30 ? 'avc1.420034' : 'avc1.420033', // Baseline Profile Level 5.2 / 5.1
      'avc1.640034',
      'avc1.640033',
      'avc1.4d0034',
      'avc1.4d0033',
    ];
  } else if (totalPixels > 2097152) {
    // 1440p / 2K -> Level 5.0 (0x32) or higher
    candidates = [
      'avc1.640032',
      'avc1.4d0032',
      'avc1.420032',
      'avc1.640033',
      'avc1.4d0033',
    ];
  } else if (totalPixels > 921600) {
    // 1080p -> Level 4.2 (0x2a) for 60fps or Level 4.0 (0x28) for 30fps
    candidates = [
      fps > 30 ? 'avc1.64002a' : 'avc1.640028',
      fps > 30 ? 'avc1.4d002a' : 'avc1.4d0028',
      'avc1.640028',
      'avc1.4d0028',
      'avc1.420028',
    ];
  } else {
    // 720p or lower -> Level 3.1 (0x1f)
    candidates = [
      'avc1.64001f',
      'avc1.4d001f',
      'avc1.42001f',
    ];
  }

  if (typeof VideoEncoder !== 'undefined' && 'isConfigSupported' in VideoEncoder) {
    for (const codec of candidates) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          bitrate: Math.round(bitrateMbps * 1_000_000),
          framerate: fps,
        });
        if (support.supported) {
          return codec;
        }
      } catch {
        // Continue trying
      }
    }
  }

  return candidates[0];
}
