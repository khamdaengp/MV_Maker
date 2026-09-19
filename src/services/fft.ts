/**
 * Offline FFT and Time-Domain analysis matching Web Audio AnalyserNode behavior.
 */

// Precomputed Hann window cache
const windowCache = new Map<number, Float32Array>();

function getHannWindow(size: number): Float32Array {
  let win = windowCache.get(size);
  if (!win) {
    win = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    windowCache.set(size, win);
  }
  return win;
}

/**
 * Radix-2 Cooley-Tukey in-place Decimation-in-Time FFT.
 * Size must be a power of 2.
 */
export function cooleyTukeyFft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if ((n & (n - 1)) !== 0) {
    throw new Error("FFT size must be a power of 2");
  }

  // Bit reversal
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tempR = real[i];
      real[i] = real[j];
      real[j] = tempR;

      const tempI = imag[i];
      imag[i] = imag[j];
      imag[j] = tempI;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Cooley-Tukey butterflies
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angle);
    const wStepI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wR = 1.0;
      let wI = 0.0;

      for (let k = 0; k < halfLen; k++) {
        const uR = real[i + k];
        const uI = imag[i + k];

        const pos = i + k + halfLen;
        const vR = real[pos] * wR - imag[pos] * wI;
        const vI = real[pos] * wI + imag[pos] * wR;

        real[i + k] = uR + vR;
        imag[i + k] = uI + vI;

        real[pos] = uR - vR;
        imag[pos] = uI - vI;

        const nextWR = wR * wStepR - wI * wStepI;
        const nextWI = wR * wStepI + wI * wStepR;
        wR = nextWR;
        wI = nextWI;
      }
    }
  }
}

/**
 * Computes frequency spectrum (0-255) and time-domain waveform (0-255)
 * for an audio channel at a specific frame timestamp.
 */
export class OfflineAudioAnalyzer {
  private fftSize: number;
  private real: Float32Array;
  private imag: Float32Array;
  private prevFrequencies: Uint8Array;
  private smoothingTimeConstant: number;

  constructor(fftSize = 1024, smoothing = 0.8) {
    this.fftSize = fftSize;
    this.real = new Float32Array(fftSize);
    this.imag = new Float32Array(fftSize);
    this.prevFrequencies = new Uint8Array(fftSize / 2);
    this.smoothingTimeConstant = smoothing;
  }

  setSmoothing(val: number) {
    this.smoothingTimeConstant = Math.max(0, Math.min(0.99, val));
  }

  /**
   * Extracts frequency and waveform data matching AnalyserNode byte arrays.
   * @param channel Float32Array of PCM audio
   * @param sampleIndex Center or start sample index for the current frame
   */
  getFrameData(
    channel: Float32Array,
    sampleIndex: number
  ): { frequencyData: Uint8Array; timeDomainData: Uint8Array } {
    const halfSize = this.fftSize / 2;
    const window = getHannWindow(this.fftSize);

    const freqOut = new Uint8Array(halfSize);
    const timeOut = new Uint8Array(halfSize);

    const start = Math.max(0, Math.min(channel.length - this.fftSize, sampleIndex - halfSize));

    // Fill real with windowed samples, imag with 0
    for (let i = 0; i < this.fftSize; i++) {
      const idx = start + i;
      const sample = idx < channel.length ? channel[idx] : 0;
      this.real[i] = sample * window[i];
      this.imag[i] = 0;

      // Extract time domain (first halfSize samples)
      if (i < halfSize) {
        // Map [-1, 1] to [0, 255] (128 is center)
        const s = Math.max(-1, Math.min(1, sample));
        timeOut[i] = Math.round((s + 1) * 127.5);
      }
    }

    // Run FFT
    cooleyTukeyFft(this.real, this.imag);

    // Compute decibel magnitudes matching Web Audio AnalyserNode (minDecibels = -100, maxDecibels = -30)
    const minDb = -100;
    const maxDb = -30;
    const dbRange = maxDb - minDb;

    for (let i = 0; i < halfSize; i++) {
      const r = this.real[i];
      const im = this.imag[i];
      // Magnitude
      const mag = Math.sqrt(r * r + im * im) / this.fftSize;
      const db = mag > 1e-6 ? 20 * Math.log10(mag) : -120;

      let norm = (db - minDb) / dbRange;
      norm = Math.max(0, Math.min(1, norm));

      let byteVal = Math.round(norm * 255);

      // Apply smoothing
      if (this.smoothingTimeConstant > 0) {
        byteVal = Math.round(
          this.smoothingTimeConstant * this.prevFrequencies[i] +
            (1 - this.smoothingTimeConstant) * byteVal
        );
      }

      freqOut[i] = byteVal;
      this.prevFrequencies[i] = byteVal;
    }

    return { frequencyData: freqOut, timeDomainData: timeOut };
  }
}
