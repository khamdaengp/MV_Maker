import { StyleConfig, ImageFit, VisualizerConfig, TextOverlayConfig, VisualEffectsConfig } from '../types';

export type DrawableImage = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

export interface FrameRenderParams {
  width: number;
  height: number;
  currentImage?: DrawableImage | null;
  nextImage?: DrawableImage | null;
  crossfadeAlpha?: number; // 0 to 1
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
  style: StyleConfig;
  currentTime?: number;
  text?: {
    title: string;
    artist: string;
    currentTime: number; // time into current song in seconds
    trackDuration: number;
  };
}

/**
 * Draws an image with specific fit mode.
 */
function drawFittedImage(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: DrawableImage,
  targetW: number,
  targetH: number,
  fit: ImageFit
) {
  const imgW = img.width;
  const imgH = img.height;
  if (!imgW || !imgH) return;

  if (fit === 'contain_blur') {
    // 1. Draw blurred, zoomed background
    ctx.save();
    const scaleCover = Math.max(targetW / imgW, targetH / imgH) * 1.08;
    const cw = imgW * scaleCover;
    const ch = imgH * scaleCover;
    const cx = (targetW - cw) / 2;
    const cy = (targetH - ch) / 2;

    ctx.filter = 'blur(28px) brightness(0.65)';
    ctx.drawImage(img, cx, cy, cw, ch);
    ctx.restore();

    // 2. Draw contained sharp foreground
    const scaleContain = Math.min(targetW / imgW, targetH / imgH);
    const fw = imgW * scaleContain;
    const fh = imgH * scaleContain;
    const fx = (targetW - fw) / 2;
    const fy = (targetH - fh) / 2;
    ctx.drawImage(img, fx, fy, fw, fh);
  } else if (fit === 'contain') {
    // Letterbox / Pillarbox
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, targetW, targetH);

    const scale = Math.min(targetW / imgW, targetH / imgH);
    const fw = imgW * scale;
    const fh = imgH * scale;
    const fx = (targetW - fw) / 2;
    const fy = (targetH - fh) / 2;
    ctx.drawImage(img, fx, fy, fw, fh);
  } else {
    // Cover
    const scale = Math.max(targetW / imgW, targetH / imgH);
    const fw = imgW * scale;
    const fh = imgH * scale;
    const fx = (targetW - fw) / 2;
    const fy = (targetH - fh) / 2;
    ctx.drawImage(img, fx, fy, fw, fh);
  }
}

/**
 * Renders visualizer overlay across 8 diverse styles.
 */
function drawVisualizer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  freq: Uint8Array,
  time: Uint8Array,
  cfg: VisualizerConfig,
  effects?: VisualEffectsConfig,
  curTime: number = 0
) {
  ctx.save();
  ctx.globalAlpha = cfg.opacity;

  // Center X and base Y calculations with support for custom position percentages
  const posXPercent = cfg.posX !== undefined ? cfg.posX : 50;
  const centerX = w * (posXPercent / 100);

  const getPosYPercent = (): number => {
    if (cfg.posY !== undefined) return cfg.posY;
    if (cfg.position === 'top') {
      if (cfg.style === 'waveform') return 25;
      if (cfg.style === 'circular' || cfg.style === 'neon_rings' || cfg.style === 'particles') return 35;
      if (cfg.style === 'spectrum_area') return 25;
      if (cfg.style === 'dual_spectrum') return 30;
      return 15;
    }
    if (cfg.position === 'center') {
      if (cfg.style === 'spectrum_area') return 55;
      if (cfg.style === 'dual_spectrum') return 50;
      return 50;
    }
    // bottom
    if (cfg.style === 'waveform') return 75;
    if (cfg.style === 'circular') return 50;
    if (cfg.style === 'neon_rings') return 65;
    if (cfg.style === 'particles') return 70;
    if (cfg.style === 'dual_spectrum') return 85;
    return 88;
  };

  const posYPercent = getPosYPercent();
  const baseY = h * (posYPercent / 100);

  // Apply glow bloom if enabled
  if (effects?.glowBloom) {
    ctx.shadowColor = cfg.primaryColor;
    ctx.shadowBlur = effects.glowIntensity ?? 16;
  }

  // Create gradient if requested
  const createColorStyle = (
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): string | CanvasGradient => {
    if (cfg.colorMode === 'gradient') {
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, cfg.primaryColor);
      grad.addColorStop(1, cfg.secondaryColor);
      return grad;
    }
    return cfg.primaryColor;
  };

  if (cfg.style === 'bars') {
    const numBars = Math.max(8, Math.min(128, cfg.barCount));
    const spacing = Math.max(1, cfg.barSpacing);
    const totalBarWidth = (w * 0.85) / numBars;
    const barWidth = Math.max(2, totalBarWidth - spacing);
    const totalWidth = numBars * (barWidth + spacing);
    const startX = centerX - totalWidth / 2;
    const maxHeight = h * 0.4 * cfg.sensitivity;

    // Subsample frequency bins with perceptual spacing
    const values: number[] = [];
    for (let i = 0; i < numBars; i++) {
      const p = Math.pow(i / (numBars - 1), 1.8);
      const binIdx = Math.min(freq.length - 1, Math.floor(p * (freq.length * 0.75)));
      const raw = freq[binIdx] / 255;
      values.push(raw);
    }

    const colorStyle = createColorStyle(0, baseY, 0, baseY - maxHeight);
    ctx.fillStyle = colorStyle;

    const countToDraw = cfg.mirror ? Math.floor(numBars / 2) : numBars;

    for (let i = 0; i < numBars; i++) {
      let val = values[i];
      if (cfg.mirror) {
        const half = numBars / 2;
        const distFromCenter = Math.abs(i - half);
        const sourceIdx = Math.floor((1 - distFromCenter / half) * (countToDraw - 1));
        val = values[Math.max(0, Math.min(countToDraw - 1, sourceIdx))];
      }

      const barHeight = Math.max(3, val * maxHeight);
      const x = startX + i * (barWidth + spacing);

      let y = baseY - barHeight;
      if (cfg.position === 'center' || (cfg.position === 'custom' && posYPercent >= 38 && posYPercent <= 62)) {
        y = baseY - barHeight / 2;
      } else if (cfg.position === 'top' || (cfg.position === 'custom' && posYPercent < 30)) {
        y = baseY;
      }

      ctx.beginPath();
      const r = Math.min(barWidth / 2, 4);
      if (ctx.roundRect) {
        ctx.roundRect(x, y, barWidth, barHeight, [r, r, r, r]);
      } else {
        ctx.rect(x, y, barWidth, barHeight);
      }
      ctx.fill();
    }
  } else if (cfg.style === 'waveform') {
    const waveHeight = h * 0.25 * cfg.sensitivity;
    const colorStyle = createColorStyle(0, baseY - waveHeight, w, baseY + waveHeight);

    ctx.strokeStyle = colorStyle;
    ctx.lineWidth = Math.max(1.5, cfg.thickness);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const waveWidth = w * 0.9;
    const startX = centerX - waveWidth / 2;
    const sliceWidth = waveWidth / (time.length - 1);
    let x = startX;

    for (let i = 0; i < time.length; i++) {
      const v = (time[i] - 128) / 128; // -1 to 1
      const y = baseY + v * waveHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.stroke();
  } else if (cfg.style === 'circular') {
    const cx = centerX;
    const cy = baseY;
    const minDim = Math.min(w, h);
    const baseRadius = minDim * 0.22 * (cfg.radius / 50);
    const maxBarLen = minDim * 0.18 * cfg.sensitivity;

    const numPoints = Math.max(32, Math.min(128, cfg.barCount));
    const colorStyle = createColorStyle(cx - baseRadius, cy, cx + baseRadius, cy);

    ctx.strokeStyle = colorStyle;
    ctx.fillStyle = colorStyle;
    ctx.lineWidth = Math.max(2, cfg.thickness);
    ctx.lineCap = 'round';

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2 - Math.PI / 2;
      const half = numPoints / 2;
      const binNorm = 1 - Math.abs(i - half) / half;
      const binIdx = Math.min(freq.length - 1, Math.floor(binNorm * (freq.length * 0.6)));

      const magnitude = (freq[binIdx] / 255) * maxBarLen;
      const r0 = baseRadius;
      const r1 = baseRadius + Math.max(2, magnitude);

      const x0 = cx + Math.cos(angle) * r0;
      const y0 = cy + Math.sin(angle) * r0;
      const x1 = cx + Math.cos(angle) * r1;
      const y1 = cy + Math.sin(angle) * r1;

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // Outer subtle ring
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius - 2, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (cfg.style === 'neon_rings') {
    const cx = centerX;
    const cy = baseY;
    const minDim = Math.min(w, h);
    const baseR = minDim * 0.11 * (cfg.radius / 50);
    const numRings = 5;
    const ringStep = minDim * 0.065;

    for (let r = 0; r < numRings; r++) {
      const binStart = Math.floor((r / numRings) * (freq.length * 0.5));
      const binEnd = Math.floor(((r + 1) / numRings) * (freq.length * 0.5));
      let bandEnergy = 0;
      const count = Math.max(1, binEnd - binStart);
      for (let b = binStart; b < binEnd; b++) {
        bandEnergy += freq[b];
      }
      const energyNorm = (bandEnergy / count) / 255;

      const radius = baseR + r * ringStep + energyNorm * 35 * cfg.sensitivity;
      const ringColor = r % 2 === 0 ? cfg.primaryColor : (cfg.secondaryColor || cfg.primaryColor);

      ctx.strokeStyle = ringColor;
      ctx.lineWidth = Math.max(1.5, (cfg.thickness || 3) * (0.8 + energyNorm * 0.8));

      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(5, radius), 0, Math.PI * 2);
      ctx.stroke();

      // Rotating orbital tick dashes around ring
      const numTicks = 8 + r * 4;
      const rotSpeed = (r % 2 === 0 ? 1 : -1) * (0.35 + r * 0.12);
      const tickRot = curTime * rotSpeed;
      ctx.lineWidth = Math.max(2, (cfg.thickness || 3) * 1.4);
      for (let t = 0; t < numTicks; t++) {
        const a = (t / numTicks) * Math.PI * 2 + tickRot;
        const tLen = 4 + energyNorm * 12;
        const x0 = cx + Math.cos(a) * (radius - tLen / 2);
        const y0 = cy + Math.sin(a) * (radius - tLen / 2);
        const x1 = cx + Math.cos(a) * (radius + tLen / 2);
        const y1 = cy + Math.sin(a) * (radius + tLen / 2);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
  } else if (cfg.style === 'spectrum_area') {
    const maxHeight = h * 0.45 * cfg.sensitivity;
    const numPoints = Math.max(24, Math.min(128, cfg.barCount));
    const areaWidth = w * 0.95;
    const startX = centerX - areaWidth / 2;
    const points: { x: number; y: number }[] = [];

    for (let i = 0; i < numPoints; i++) {
      const x = startX + (i / (numPoints - 1)) * areaWidth;
      let binIdx: number;
      if (cfg.mirror) {
        const half = numPoints / 2;
        const distNorm = 1 - Math.abs(i - half) / half;
        binIdx = Math.min(freq.length - 1, Math.floor(Math.pow(distNorm, 1.6) * (freq.length * 0.7)));
      } else {
        const p = Math.pow(i / (numPoints - 1), 1.6);
        binIdx = Math.min(freq.length - 1, Math.floor(p * (freq.length * 0.7)));
      }
      const val = freq[binIdx] / 255;
      const y = baseY - Math.max(4, val * maxHeight);
      points.push({ x, y });
    }

    // Translucent gradient area fill
    const areaGrad = ctx.createLinearGradient(0, baseY - maxHeight, 0, baseY);
    areaGrad.addColorStop(0, cfg.primaryColor);
    areaGrad.addColorStop(1, cfg.secondaryColor || 'rgba(0,0,0,0)');

    ctx.save();
    ctx.fillStyle = areaGrad;
    ctx.globalAlpha = cfg.opacity * 0.45;
    ctx.beginPath();
    ctx.moveTo(startX, baseY);
    ctx.lineTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.lineTo(startX + areaWidth, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Glowing top spline stroke
    ctx.strokeStyle = cfg.primaryColor;
    ctx.lineWidth = Math.max(2, cfg.thickness);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();
  } else if (cfg.style === 'dual_spectrum') {
    const numBars = Math.max(16, Math.min(96, cfg.barCount));
    const spacing = Math.max(2, cfg.barSpacing);
    const totalBarWidth = (w * 0.85) / numBars;
    const barWidth = Math.max(2, totalBarWidth - spacing);
    const totalWidth = numBars * (barWidth + spacing);
    const startX = centerX - totalWidth / 2;
    const maxHeight = h * 0.28 * cfg.sensitivity;

    const colorStyle = createColorStyle(0, baseY - maxHeight, 0, baseY + maxHeight * 0.6);
    ctx.fillStyle = colorStyle;

    for (let i = 0; i < numBars; i++) {
      let binIdx: number;
      if (cfg.mirror) {
        const half = numBars / 2;
        const distNorm = 1 - Math.abs(i - half) / half;
        binIdx = Math.min(freq.length - 1, Math.floor(Math.pow(distNorm, 1.7) * (freq.length * 0.75)));
      } else {
        const p = Math.pow(i / (numBars - 1), 1.7);
        binIdx = Math.min(freq.length - 1, Math.floor(p * (freq.length * 0.75)));
      }
      const val = freq[binIdx] / 255;
      const upHeight = Math.max(2, val * maxHeight);
      const downHeight = Math.max(2, val * maxHeight * 0.55);
      const x = startX + i * (barWidth + spacing);

      // Upper bar
      ctx.fillRect(x, baseY - upHeight, barWidth, upHeight);
      // Lower reflection bar
      ctx.fillRect(x, baseY + 2, barWidth, downHeight);

      // Floating peak cap
      if (val > 0.05) {
        ctx.save();
        ctx.fillStyle = cfg.secondaryColor || '#ffffff';
        const capY = baseY - upHeight - 4;
        ctx.fillRect(x, capY, barWidth, Math.max(2, cfg.thickness || 2));
        ctx.restore();
      }
    }
  } else if (cfg.style === 'particles') {
    const cx = centerX;
    const cy = baseY;
    const numNodes = Math.max(20, Math.min(60, cfg.barCount));
    const maxReach = Math.min(w, h) * 0.42 * (cfg.radius / 50);

    const nodes: { x: number; y: number; energy: number }[] = [];
    for (let i = 0; i < numNodes; i++) {
      const binIdx = Math.min(freq.length - 1, Math.floor((i / numNodes) * (freq.length * 0.65)));
      const energy = freq[binIdx] / 255;
      const angle = (i / numNodes) * Math.PI * 2 + curTime * 0.25;
      const r = (maxReach * 0.35) + energy * maxReach * 0.65 * cfg.sensitivity;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      nodes.push({ x, y, energy });
    }

    // Constellation lines
    ctx.lineWidth = Math.max(1, (cfg.thickness || 2) * 0.6);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.hypot(dx, dy);
        const maxConnectDist = maxReach * 0.45;
        if (dist < maxConnectDist) {
          const lineAlpha = (1 - dist / maxConnectDist) * Math.max(nodes[i].energy, nodes[j].energy) * cfg.opacity;
          ctx.strokeStyle = cfg.secondaryColor || cfg.primaryColor;
          ctx.globalAlpha = Math.min(1, Math.max(0, lineAlpha));
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    // Node dots
    ctx.fillStyle = cfg.primaryColor;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const dotRadius = Math.max(2, 3 + node.energy * 7 * cfg.sensitivity);
      ctx.globalAlpha = Math.min(1, Math.max(0.3, node.energy * cfg.opacity));
      ctx.beginPath();
      ctx.arc(node.x, node.y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (cfg.style === 'digital_rain') {
    const numCols = Math.max(16, Math.min(64, Math.floor(cfg.barCount * 0.6)));
    const spacing = Math.max(3, cfg.barSpacing);
    const totalColWidth = (w * 0.88) / numCols;
    const colWidth = Math.max(3, totalColWidth - spacing);
    const totalWidth = numCols * (colWidth + spacing);
    const startX = centerX - totalWidth / 2;
    const maxHeight = h * 0.42 * cfg.sensitivity;
    const segmentHeight = Math.max(3, (cfg.thickness || 3) * 1.6);
    const segmentGap = 2.5;

    for (let i = 0; i < numCols; i++) {
      let binIdx: number;
      if (cfg.mirror) {
        const half = numCols / 2;
        const distNorm = 1 - Math.abs(i - half) / half;
        binIdx = Math.min(freq.length - 1, Math.floor(Math.pow(distNorm, 1.6) * (freq.length * 0.75)));
      } else {
        const p = Math.pow(i / (numCols - 1), 1.6);
        binIdx = Math.min(freq.length - 1, Math.floor(p * (freq.length * 0.75)));
      }
      const val = freq[binIdx] / 255;
      const colHeight = Math.max(segmentHeight, val * maxHeight);
      const numSegments = Math.floor(colHeight / (segmentHeight + segmentGap));
      const x = startX + i * (colWidth + spacing);

      for (let s = 0; s < numSegments; s++) {
        const segY = (cfg.position === 'top' || (cfg.position === 'custom' && posYPercent < 30))
          ? baseY + s * (segmentHeight + segmentGap)
          : baseY - (s + 1) * (segmentHeight + segmentGap);

        const isTop = s === numSegments - 1;
        if (isTop) {
          ctx.fillStyle = cfg.secondaryColor || '#ffffff';
        } else {
          ctx.fillStyle = cfg.primaryColor;
        }
        ctx.fillRect(x, segY, colWidth, segmentHeight);
      }
    }
  }

  ctx.restore();
}

/**
 * Renders title and artist typography overlay.
 */
function drawTextOverlay(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
  artist: string,
  currentTime: number,
  trackDuration: number,
  cfg: TextOverlayConfig
) {
  if (!cfg.enabled || (!title && !artist)) return;

  // Filter out raw UUID hashes (e.g. b629a1b2-6836-4d28-8c85-f42f7e803b79) and "Unknown Artist"
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((title || '').trim());
  const displayTitle = isUUID ? '' : (title || '').trim();
  const displayArtist = (!artist || artist.trim() === 'Unknown Artist' || artist.trim() === 'Unknown') ? '' : artist.trim();
  if (!displayTitle && !displayArtist) return;

  // Calculate visibility alpha
  let alpha = 1.0;
  if (cfg.timingMode === 'first_n_seconds') {
    if (currentTime > cfg.displayDuration) {
      return; // fully hidden
    }
    const fadeStart = Math.max(0, cfg.displayDuration - cfg.fadeDuration);
    if (currentTime > fadeStart) {
      alpha = 1 - (currentTime - fadeStart) / cfg.fadeDuration;
    }
  } else if (cfg.timingMode === 'fade_in_out') {
    // Fade in
    if (currentTime < cfg.fadeDuration) {
      alpha = Math.max(0, currentTime / cfg.fadeDuration);
    }
    // Fade out at end
    const endFadeStart = Math.max(0, trackDuration - cfg.fadeDuration);
    if (currentTime > endFadeStart) {
      alpha = Math.max(0, 1 - (currentTime - endFadeStart) / cfg.fadeDuration);
    }
  }

  alpha = Math.max(0, Math.min(1, alpha));
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Scale font sizes relative to 1080p canvas
  const scale = h / 1080;
  const titleSize = Math.max(14, Math.round(cfg.titleSize * scale));
  const artistSize = Math.max(12, Math.round(cfg.artistSize * scale));
  const fontFamily = cfg.fontFamily || 'Inter, sans-serif';

  ctx.fillStyle = cfg.textColor || '#ffffff';

  if (cfg.dropShadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = Math.round(10 * scale);
    ctx.shadowOffsetX = Math.round(2 * scale);
    ctx.shadowOffsetY = Math.round(3 * scale);
  }

  const marginX = w * 0.06;
  const marginY = h * 0.08;

  let posX = marginX;
  let posY = h - marginY;
  let align: CanvasTextAlign = 'left';

  switch (cfg.position) {
    case 'bottom-left':
      posX = marginX;
      posY = h - marginY;
      align = 'left';
      break;
    case 'bottom-center':
      posX = w / 2;
      posY = h - marginY;
      align = 'center';
      break;
    case 'bottom-right':
      posX = w - marginX;
      posY = h - marginY;
      align = 'right';
      break;
    case 'top-left':
      posX = marginX;
      posY = marginY + titleSize + artistSize;
      align = 'left';
      break;
    case 'top-center':
      posX = w / 2;
      posY = marginY + titleSize + artistSize;
      align = 'center';
      break;
    case 'top-right':
      posX = w - marginX;
      posY = marginY + titleSize + artistSize;
      align = 'right';
      break;
    case 'center':
      posX = w / 2;
      posY = h / 2;
      align = 'center';
      break;
  }

  ctx.textAlign = align;

  // Title
  if (displayTitle) {
    ctx.font = `700 ${titleSize}px ${fontFamily}`;
    ctx.fillText(displayTitle, posX, displayArtist ? posY - artistSize * 0.9 : posY);
  }

  // Artist
  if (displayArtist) {
    ctx.font = `500 ${artistSize}px ${fontFamily}`;
    ctx.fillStyle = cfg.textColor || '#ffffff';
    ctx.fillText(displayArtist, posX, posY);
  }

  ctx.restore();
}

/**
 * Unified frame renderer used by BOTH the live preview and the offline render engine.
 */
export function renderVisualizerFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  params: FrameRenderParams
): void {
  const { width: w, height: h, currentImage, nextImage, crossfadeAlpha, style, text } = params;
  const curTime = params.currentTime ?? text?.currentTime ?? 0;
  const effects = style.effects || {
    bassShake: false,
    bassShakeIntensity: 0.6,
    glowBloom: true,
    glowIntensity: 15,
    particlesOverlay: false,
    particleSpeed: 1.0,
    filmGrain: false,
    filmGrainOpacity: 0.15,
    vignetteIntensity: 0.45,
    chromaticAberration: false,
  };

  // Compute normalized bass energy for reactive effects
  let bassEnergy = 0;
  const bassBins = Math.min(8, params.frequencyData.length);
  for (let i = 0; i < bassBins; i++) {
    bassEnergy += params.frequencyData[i];
  }
  bassEnergy = bassBins > 0 ? bassEnergy / (bassBins * 255) : 0;

  // 1. Bass Shake / Camera Beat Zoom Transform
  const applyShake = effects.bassShake && bassEnergy > 0.25;
  if (applyShake) {
    ctx.save();
    const intensity = effects.bassShakeIntensity ?? 0.6;
    const shakeScale = 1 + Math.pow(bassEnergy, 2.2) * 0.05 * intensity;
    const shakeX = Math.sin(curTime * 45) * bassEnergy * 5 * intensity;
    const shakeY = Math.cos(curTime * 35) * bassEnergy * 4 * intensity;
    ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
    ctx.scale(shakeScale, shakeScale);
    ctx.translate(-w / 2, -h / 2);
  }

  // 2. Clear background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, w, h);

  // 3. Draw background images with transition
  if (currentImage) {
    drawFittedImage(ctx, currentImage, w, h, style.imageFit);

    // Crossfade into next image if in transition
    if (nextImage && crossfadeAlpha && crossfadeAlpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, crossfadeAlpha));
      drawFittedImage(ctx, nextImage, w, h, style.imageFit);
      ctx.restore();
    }
  } else {
    // Ambient fallback gradient
    const ambient = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h));
    ambient.addColorStop(0, '#1e1b4b');
    ambient.addColorStop(1, '#05050d');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, w, h);
  }

  // 4. Ambient Floating Bokeh Particles Overlay
  if (effects.particlesOverlay) {
    ctx.save();
    const particleCount = 45;
    const speed = effects.particleSpeed ?? 1.0;
    for (let i = 0; i < particleCount; i++) {
      const seed = i * 137.5;
      const speedMult = 0.6 + ((i % 5) * 0.25);
      const py = (h - ((curTime * 40 * speed * speedMult + seed * 9) % (h + 30))) + 15;
      const px = (((Math.sin(curTime * 0.6 * speedMult + seed) * 0.25 + 0.5 + ((i * 67) % 100) / 100) % 1)) * w;
      const pSize = 1.5 + (i % 3) * 1.5;
      const pAlpha = (0.25 + (Math.sin(curTime * 1.8 + seed) * 0.5 + 0.5) * 0.45) * (0.5 + bassEnergy * 0.5);

      ctx.fillStyle = i % 2 === 0 ? style.visualizer.primaryColor : (style.visualizer.secondaryColor || '#ffffff');
      ctx.globalAlpha = Math.min(1, Math.max(0, pAlpha));
      ctx.beginPath();
      ctx.arc(px, py, pSize, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 5. Dark Vignette (customizable intensity)
  const vigOpacity = effects.vignetteIntensity !== undefined ? effects.vignetteIntensity : 0.45;
  if (vigOpacity > 0.01) {
    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, `rgba(0, 0, 0, ${vigOpacity.toFixed(2)})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  // 6. Draw Audio Visualizer (with glow bloom & time param)
  drawVisualizer(ctx, w, h, params.frequencyData, params.timeDomainData, style.visualizer, effects, curTime);

  // 7. Draw Typography Overlay
  if (text) {
    drawTextOverlay(
      ctx,
      w,
      h,
      text.title,
      text.artist,
      text.currentTime,
      text.trackDuration,
      style.textOverlay
    );
  }

  // 8. Chromatic Aberration RGB Glitch on strong bass
  if (effects.chromaticAberration && bassEnergy > 0.45) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(0.22, (bassEnergy - 0.45) * 0.5);
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // 9. Film Grain
  if (effects.filmGrain) {
    const grainOpacity = Math.min(0.4, Math.max(0.02, effects.filmGrainOpacity ?? 0.15));
    ctx.save();
    ctx.globalAlpha = grainOpacity;
    const cols = Math.floor(w / 32);
    const rows = Math.floor(h / 32);
    const timeSeed = Math.floor(curTime * 24);
    ctx.fillStyle = '#ffffff';
    for (let gx = 0; gx < cols; gx++) {
      for (let gy = 0; gy < rows; gy++) {
        const n = Math.sin(gx * 12.9898 + gy * 78.233 + timeSeed * 37.719) * 43758.5453;
        const frac = n - Math.floor(n);
        if (frac > 0.65) {
          ctx.fillRect(gx * 32 + (frac * 24), gy * 32 + ((1 - frac) * 24), 2, 2);
        }
      }
    }
    ctx.restore();
  }

  // Revert Bass Shake transform if active
  if (applyShake) {
    ctx.restore();
  }
}
