import { AudioTrack, ImageItem } from '../types';

/**
 * Creates a synthetic WAV blob from an AudioBuffer.
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  /* RIFF identifier */
  writeString(0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + dataLength, true);
  /* RIFF type */
  writeString(8, 'WAVE');
  /* format chunk identifier */
  writeString(12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(36, 'data');
  /* data chunk length */
  view.setUint32(40, dataLength, true);

  // Write interleaved PCM samples
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Synthesizes a punchy synthwave demo track using OfflineAudioContext.
 */
export async function generateDemoAudioTrack(): Promise<AudioTrack> {
  const duration = 12; // 12 seconds
  const sampleRate = 44100;
  const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  const chords = [
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
    [130.81, 164.81, 196.0],  // C
    [196.0, 246.94, 293.66],  // G
  ];

  const barDuration = 3.0; // 4 bars = 12s

  // Pad Synth
  chords.forEach((chord, barIndex) => {
    const startTime = barIndex * barDuration;
    chord.forEach((freq) => {
      const osc = offlineCtx.createOscillator();
      const gain = offlineCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);

      // Lowpass filter for warm synth sound
      const filter = offlineCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, startTime);
      filter.frequency.exponentialRampToValueAtTime(3200, startTime + 0.8);
      filter.frequency.exponentialRampToValueAtTime(900, startTime + barDuration);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.08, startTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + barDuration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(offlineCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + barDuration);
    });
  });

  // Four-on-the-floor Kick Drum (every 0.5s = 120 BPM)
  const kickInterval = 0.5;
  const totalKicks = Math.floor(duration / kickInterval);
  for (let i = 0; i < totalKicks; i++) {
    const kickTime = i * kickInterval;
    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, kickTime);
    osc.frequency.exponentialRampToValueAtTime(35, kickTime + 0.12);

    gain.gain.setValueAtTime(0.7, kickTime);
    gain.gain.exponentialRampToValueAtTime(0.001, kickTime + 0.3);

    osc.connect(gain);
    gain.connect(offlineCtx.destination);

    osc.start(kickTime);
    osc.stop(kickTime + 0.3);

    // Add Hi-hat on off-beats
    if (i % 2 === 1) {
      const hatTime = kickTime - 0.25;
      if (hatTime > 0) {
        const hatOsc = offlineCtx.createOscillator();
        const hatGain = offlineCtx.createGain();
        const hatFilter = offlineCtx.createBiquadFilter();

        hatOsc.type = 'square';
        hatOsc.frequency.setValueAtTime(10000, hatTime);

        hatFilter.type = 'highpass';
        hatFilter.frequency.setValueAtTime(7000, hatTime);

        hatGain.gain.setValueAtTime(0.05, hatTime);
        hatGain.gain.exponentialRampToValueAtTime(0.001, hatTime + 0.06);

        hatOsc.connect(hatFilter);
        hatFilter.connect(hatGain);
        hatGain.connect(offlineCtx.destination);

        hatOsc.start(hatTime);
        hatOsc.stop(hatTime + 0.08);
      }
    }
  }

  // Render synthesized audio
  const audioBuffer = await offlineCtx.startRendering();
  const wavBlob = audioBufferToWav(audioBuffer);
  const blobUrl = URL.createObjectURL(wavBlob);

  const rawChannels: Float32Array[] = [];
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    rawChannels.push(new Float32Array(audioBuffer.getChannelData(i)));
  }

  return {
    id: `demo-track-${Date.now()}`,
    name: 'Cyberwave - Neon Dreams.wav',
    title: 'Neon Dreams',
    artist: 'Cyberwave',
    album: 'Retro Future Vol. 1',
    duration: audioBuffer.duration,
    audioBuffer,
    rawChannelData: rawChannels,
    sampleRate: audioBuffer.sampleRate,
    url: blobUrl,
  };
}

/**
 * Generates an artistic canvas-rendered image and returns it as ImageItem.
 */
function createDemoImage(
  name: string,
  generator: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): Promise<ImageItem> {
  return new Promise((resolve) => {
    const width = 1280;
    const height = 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    generator(ctx, width, height);

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        resolve({
          id: `demo-img-${Math.random().toString(36).substring(2, 9)}`,
          name,
          url,
          width,
          height,
        });
      }
    }, 'image/jpeg', 0.95);
  });
}

/**
 * Generates 3 stylized demo background images.
 */
export async function generateDemoImages(): Promise<ImageItem[]> {
  const img1 = await createDemoImage('Cyber Grid Sunset.jpg', (ctx, w, h) => {
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    sky.addColorStop(0, '#0f051d');
    sky.addColorStop(0.5, '#3b1443');
    sky.addColorStop(1, '#ff3b69');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Glowing Retro Sun
    const sunGrad = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.7);
    sunGrad.addColorStop(0, '#ffea00');
    sunGrad.addColorStop(0.5, '#ff4b72');
    sunGrad.addColorStop(1, '#9b1e77');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.45, h * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Sun horizontal slice cutouts
    ctx.fillStyle = '#0f051d';
    for (let y = h * 0.42; y < h * 0.7; y += 14) {
      const barH = (y - h * 0.42) * 0.15 + 2;
      ctx.fillRect(w * 0.2, y, w * 0.6, barH);
    }

    // Grid Floor
    const floor = ctx.createLinearGradient(0, h * 0.65, 0, h);
    floor.addColorStop(0, '#060112');
    floor.addColorStop(1, '#1b002c');
    ctx.fillStyle = floor;
    ctx.fillRect(0, h * 0.65, w, h * 0.35);

    // Perspective Grid Lines
    ctx.strokeStyle = '#00f7ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f7ff';
    ctx.shadowBlur = 8;
    const vpX = w / 2;
    const vpY = h * 0.65;
    for (let x = -w * 0.5; x <= w * 1.5; x += 100) {
      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    // Horizontal grid bars
    for (let y = vpY; y <= h; y += (y - vpY) * 0.3 + 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  });

  const img2 = await createDemoImage('Deep Space Nebula.jpg', (ctx, w, h) => {
    // Deep dark background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, w, h);

    // Nebula clouds
    const drawCloud = (cx: number, cy: number, r: number, color: string) => {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    };

    drawCloud(w * 0.35, h * 0.4, w * 0.4, 'rgba(120, 20, 220, 0.45)');
    drawCloud(w * 0.65, h * 0.5, w * 0.45, 'rgba(0, 180, 255, 0.4)');
    drawCloud(w * 0.5, h * 0.3, w * 0.3, 'rgba(255, 60, 140, 0.35)');

    // Stars
    for (let i = 0; i < 200; i++) {
      const sx = Math.random() * w;
      const sy = Math.random() * h;
      const sr = Math.random() * 2 + 0.5;
      ctx.fillStyle = Math.random() > 0.3 ? '#ffffff' : '#99d9ea';
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const img3 = await createDemoImage('Prism Geometry.jpg', (ctx, w, h) => {
    // Dark moody radial backdrop
    const bg = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7);
    bg.addColorStop(0, '#1c1635');
    bg.addColorStop(1, '#080511');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Geometric triangles with gradient
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 6; i++) {
      ctx.rotate((Math.PI / 3) * i);
      const grad = ctx.createLinearGradient(0, 0, 200, 300);
      grad.addColorStop(0, `hsl(${i * 60}, 90%, 65%)`);
      grad.addColorStop(1, `hsl(${i * 60 + 30}, 80%, 30%)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(120, 280);
      ctx.lineTo(-120, 280);
      ctx.closePath();
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.stroke();
    }
    ctx.restore();
  });

  return [img1, img2, img3];
}
