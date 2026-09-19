/**
 * Offline Beat & Onset Detector using spectral energy flux.
 */

export function detectAudioBeats(
  channel: Float32Array,
  sampleRate: number,
  minIntervalSeconds: number = 2.0
): number[] {
  const hopSize = 1024;
  const numHops = Math.floor(channel.length / hopSize);
  if (numHops < 2) return [];

  // Compute energy in short windows
  const energies = new Float32Array(numHops);
  for (let i = 0; i < numHops; i++) {
    let sum = 0;
    const offset = i * hopSize;
    for (let j = 0; j < hopSize; j++) {
      const s = channel[offset + j];
      sum += s * s;
    }
    energies[i] = Math.sqrt(sum / hopSize);
  }

  // Compute positive energy flux (derivative)
  const flux = new Float32Array(numHops);
  for (let i = 1; i < numHops; i++) {
    const diff = energies[i] - energies[i - 1];
    flux[i] = diff > 0 ? diff : 0;
  }

  // Moving average for local dynamic threshold
  const windowRadius = 15; // ~0.35s
  const detectedBeatTimes: number[] = [];
  let lastBeatTime = -minIntervalSeconds;

  for (let i = windowRadius; i < numHops - windowRadius; i++) {
    let localSum = 0;
    for (let j = i - windowRadius; j <= i + windowRadius; j++) {
      localSum += flux[j];
    }
    const localAvg = localSum / (windowRadius * 2 + 1);
    const threshold = localAvg * 1.5 + 0.01;

    // Is it a local peak above threshold?
    if (
      flux[i] > threshold &&
      flux[i] > flux[i - 1] &&
      flux[i] > flux[i + 1]
    ) {
      const time = (i * hopSize) / sampleRate;
      if (time - lastBeatTime >= minIntervalSeconds) {
        detectedBeatTimes.push(time);
        lastBeatTime = time;
      }
    }
  }

  return detectedBeatTimes;
}
