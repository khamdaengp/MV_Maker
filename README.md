# MV Maker 🎵🎬

> Turn music files and images into high-definition `.mp4` music videos entirely in your browser. 100% client-side, zero backend, private, and hardware accelerated with WebCodecs.

![MV Maker UI Preview](https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&auto=format&fit=crop&q=80)

---

## Features

- **100% In-Browser & Private**: No audio or images are ever uploaded to any server. All decoding, FFT calculations, canvas drawing, and video muxing occur locally on your machine.
- **Hardware-Accelerated WebCodecs**: Uses native `VideoEncoder` (H.264) and `AudioEncoder` (AAC or Opus fallback) via `mp4-muxer` for offline video rendering faster than real time.
- **Convert Video to Music (Format-Selectable Audio Extractor)**:
  - Extract and convert audio from any video (`.mp4`, `.webm`, `.mov`, `.mkv`, `.avi`) into your choice of audio format:
    - **MP3 (`.mp3`)**: Lightweight & universally playable across all media players and devices (128k, 192k, 320k).
    - **WAV (`.wav`)**: 16-bit uncompressed studio-grade PCM lossless audio.
    - **M4A / AAC (`.m4a`)**: High-fidelity modern standard with AAC encoding.
  - Option to **Download** directly or click **"Use in MV Maker Project"** to immediately sequence the extracted track into a new music video.
- **Selectable Video Audio Codec**: Choose between **AAC** (universal standard) and **Opus** (high efficiency) for exported `.mp4` videos.
- **Dual Export Modes**:
  - **One MV per Song**: Creates an independent `.mp4` for each track, with options for single downloads and a unified **"Download All as ZIP"** (`fflate`).
  - **One Combined Full MV**: Concatenates all tracks in sequence with customizable transitions (**Seamless Direct**, **Silence Gap**, or **Audio Crossfade**).
- **Audio Visualizers**:
  - Styles: **Frequency Bars** (symmetric mirror, logarithmic distribution), **Waveform Oscilloscope Line**, and **Circular Radial Bars / Ring**.
  - Controls: Color picker, solid or linear gradient, position (top/center/bottom), bar count, spacing, thickness, opacity, sensitivity multiplier, and motion smoothing.
  - **Identical Preview & Export**: The live interactive preview canvas and the offline export worker share the exact same pure canvas rendering code.
- **Slideshow & Transitions**:
  - **Even Slideshow**: Evenly timed image cycling with smooth ease-crossfades.
  - **Beat-Synced Slideshow**: Offline spectral-flux onset detector triggers image cuts on rhythm peaks with a configurable minimum interval to avoid strobe effect.
  - **Single Image**: Continuous display for static album art.
  - **Image Fit Modes**: `Fill / Cover`, `Letterbox / Contain`, and `Blurred Background Contain`.
- **Title & Artist Typography Overlay**:
  - Extracted from ID3v2 tags (`TIT2`, `TPE1`, `TALB`, `APIC`), falling back to file names. Editable per track.
  - Controls: Font family (Inter, Montserrat, Oswald, Playfair, Space Mono), size, text color, drop shadow, position, and display timing (**Fade In/Out**, **First N Seconds**, or **Always Show**).
- **Output Presets**:
  - Aspect Ratios: **16:9** (Landscape/YouTube), **9:16** (Vertical/TikTok/Reels), **1:1** (Square/Instagram), and Custom even dimensions.
  - Resolutions: **720p**, **1080p**, **4K**.
  - Framerates: 24 fps, 30 fps, 60 fps.
  - Quality: Adjustable Video Bitrate (2–30 Mbps) and Audio Bitrate (128–320 kbps).
- **1-Click Demo Project**: Built-in synthwave audio synthesizer and canvas artwork generator to immediately test-drive all visualizers and rendering in 3 seconds.
- **Light & Dark Theme**: Automatically follows system preference with persistent toggle saved to `localStorage`.

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ (tested on Node v20/v24).

### Running Locally

**On Windows (1-Click Launcher):**
Simply double-click [`run.bat`](file:///c:/Users/DELL/Documents/MV%20Maker/run.bat) in the project folder. It will automatically check for Node.js, install dependencies if needed, and launch the dev server.

**Via Command Line:**
```bash
# 1. Clone or navigate to the directory
cd "MV Maker"

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

Visit `http://localhost:3000` in a supported browser.

### Production Build

```bash
npm run build
npm run preview
```

---

## Browser Support

MV Maker relies on modern web standards including **WebCodecs** (`VideoEncoder`, `AudioEncoder`, `VideoFrame`, `AudioData`), **OffscreenCanvas**, and **Web Audio API**:

| Browser | Status | Notes |
| :--- | :---: | :--- |
| **Google Chrome** | ✅ Supported | Native H.264 & AAC WebCodecs hardware encoding. Recommended. |
| **Microsoft Edge** | ✅ Supported | Full native WebCodecs hardware encoding. Recommended. |
| **Brave / Opera / Vivaldi** | ✅ Supported | Chromium-based; fully supported. |
| **Mozilla Firefox** | ⚠️ Partial | WebCodecs is under active development behind flags (`dom.media.webcodecs.enabled`). |
| **Apple Safari** | ⚠️ Limited | Safari has partial WebCodecs support; AAC in MP4 may vary by OS version. |

*If an unsupported browser is detected, MV Maker displays a clear banner advising the user to open Google Chrome or Microsoft Edge.*

---

## Architecture & Code Structure

```
src/
├── types/
│   └── index.ts                 # Type definitions (Tracks, Images, Styles, Output, Queue)
├── store/
│   └── useAppStore.ts           # Zustand store for app state, wizard steps, and theme
├── services/
│   ├── fft.ts                   # Cooley-Tukey Radix-2 FFT and windowed audio analyzer
│   ├── beatDetector.ts          # Spectral-flux energy derivative beat & onset detection
│   ├── audioDecoder.ts          # AudioContext decodeAudioData + ID3v2 tag parser
│   ├── demoGenerator.ts         # Procedural synthwave audio & artwork generator
│   ├── renderer.ts              # Unified canvas drawing engine (preview + offline render)
│   ├── renderCore.ts            # VideoEncoder + AudioEncoder + mp4-muxer offline pipeline
│   ├── renderWorker.ts          # Dedicated Web Worker for background rendering
│   ├── exportManager.ts         # Queue orchestrator, worker fallback, and ZIP packaging
│   └── webcodecsChecker.ts      # WebCodecs & H.264/AAC browser capability probe
├── components/
│   ├── layout/
│   │   ├── Header.tsx           # Logo, theme toggle, demo project trigger, alert banner
│   │   └── StepNavigation.tsx   # Interactive 5-step wizard navigation
│   └── steps/
│       ├── UploadStep.tsx       # Drag & drop upload for audio and images
│       ├── ArrangeStep.tsx      # Track reordering, inline ID3 editor, image gallery
│       ├── StyleStep.tsx        # Visualizer customizer, slideshow modes, live preview
│       ├── OutputStep.tsx       # Aspect presets, resolution, FPS, bitrate, combined modes
│       └── RenderStep.tsx       # Render queue, progress bars, ETA, video player, downloads
└── App.tsx                      # Root layout component
```

---

## Known Limits & Memory Guidelines

- **Large Render Jobs**: Rendering long videos (e.g. >30 minutes in 4K 60fps) entirely in client-side RAM can strain system memory. For long compilation albums, **1080p 30fps** at 8–12 Mbps is recommended.
- **Hardware Encoders**: Video encoding speed is bound to your local GPU/CPU hardware encoder. On typical laptops and desktops, 1080p renders at 2x to 5x faster than real-time playback.
- **Even Dimension Rule**: H.264 (AVC) requires video width and height to be even numbers divisible by 2. MV Maker automatically clamps custom dimensions to valid even numbers.

---

## License

MIT License. Free to use for personal and commercial projects.
