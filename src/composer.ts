/**
 * Single source of truth for frame geometry and drawing. The editor preview and the PNG layers
 * handed to FFmpeg both go through these functions, so what the user sees is what gets rendered.
 */
import { FRAME_H as H, FRAME_W as W } from '../electron/types';
import type { Cue, LogoSettings, Settings, SourceFolder, SubtitleStyle, Transform } from '../electron/types';
import { api } from './bridge';
import { detectLang, fontStack } from './fonts';
import { loadImage, withImage, type LoadedImage } from './media';

export { W, H };
export type Rect = { x: number; y: number; w: number; h: number };
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Size = { width: number; height: number };

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// ---------- background ----------
/** "Cover" the frame, apply extra zoom, then place the crop window at the x/y focus fraction. */
export function backgroundRect(image: Size, t: Transform): Rect {
  const scale = Math.max(W / image.width, H / image.height) * Math.max(1, t.scale);
  const w = image.width * scale; const h = image.height * scale;
  return { x: -(w - W) * clamp(t.x, 0, 1), y: -(h - H) * clamp(t.y, 0, 1), w, h };
}
export function drawBackground(ctx: Ctx, image: LoadedImage, t: Transform) {
  const r = backgroundRect(image, t);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image.image, r.x, r.y, r.w, r.h);
}

// ---------- logo ----------
/** Integer rect so the FFmpeg overlay position matches the preview to the pixel. */
export function logoRect(image: Size, logo: LogoSettings): Rect {
  const w = Math.max(2, Math.round(logo.width * W)); const h = Math.max(2, Math.round(w * image.height / image.width));
  return { x: Math.round(logo.x * W - w / 2), y: Math.round(logo.y * H - h / 2), w, h };
}
export function drawLogo(ctx: Ctx, image: LoadedImage, logo: LogoSettings, atOrigin = false) {
  const r = logoRect(image, logo);
  ctx.save(); ctx.globalAlpha = clamp(logo.opacity, 0, 1); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.image, atOrigin ? 0 : r.x, atOrigin ? 0 : r.y, r.w, r.h); ctx.restore();
}

// ---------- subtitle ----------
export const fontString = (s: SubtitleStyle, text = '') => `${s.italic ? 'italic ' : ''}${s.bold ? 700 : 400} ${s.fontSize}px ${fontStack(s.fontFamily, text)}`;

/**
 * Bundled fonts are split by unicode-range, and canvas never redraws when a subset arrives later, so the
 * subsets covering the actual text must be loaded before drawing (document.fonts.load defaults to " ").
 */
export async function ensureFonts(s: SubtitleStyle, texts: string[]) {
  const byStack = new Map<string, string>();
  for (const text of texts) { const key = fontString(s, text); byStack.set(key, (byStack.get(key) ?? '') + text); }
  await Promise.all([...byStack].map(([font, text]) => document.fonts.load(font, text || ' ').catch(() => undefined)));
}

const measureCanvas = new OffscreenCanvas(8, 8); const measureCtx = measureCanvas.getContext('2d')!;
let textLayer: OffscreenCanvas | null = null;

// Japanese line-breaking rules (kinsoku): these may not start a line / may not end one.
const NO_LINE_START = /^[、。，．,.!?！？:;：；)\]｝〕〉》」』】〙〗〟’”ゝゞーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖ・…‥々〻]/;
const NO_LINE_END = /[(\[｛〔〈《「『【〘〖〝‘“]$/;
const segmenters = new Map<string, Intl.Segmenter>();
const segmenter = (lang: string) => { let s = segmenters.get(lang); if (!s) { s = new Intl.Segmenter(lang, { granularity: 'word' }); segmenters.set(lang, s); } return s; };

/**
 * Greedy wrap over word segments. Intl.Segmenter finds natural break points in Japanese (which has no
 * spaces) and keeps Korean words (eojeol) whole; Vietnamese/Latin break at spaces as before.
 */
function wrapLine(ctx: Ctx, line: string, maxWidth: number): string[] {
  const fits = (value: string) => ctx.measureText(value.trimEnd()).width <= maxWidth;
  const out: string[] = []; let current = '';
  const push = () => {
    let line = current.trimEnd(); let carry = '';
    const opener = line.match(NO_LINE_END); if (opener && line.length > 1) { carry = opener[0]; line = line.slice(0, -carry.length); }
    if (line) out.push(line); current = carry;
  };
  const splitLong = (segment: string) => { for (const ch of segment) { if (current.trim() && !fits(current + ch) && !NO_LINE_START.test(ch)) push(); current += ch; } };
  for (const { segment } of segmenter(detectLang(line)).segment(line)) {
    if (!current.trim()) { current = current.trimStart(); if (/^\s+$/.test(segment)) continue; }
    if (fits(current + segment)) { current += segment; continue; }
    if (/^\s+$/.test(segment)) { push(); continue; }
    // Punctuation that may not start a line stays on the current one even if it overhangs slightly.
    if (NO_LINE_START.test(segment)) { current += segment; continue; }
    if (current.trim()) push();
    if (fits(current + segment)) current += segment; else splitLong(segment);
  }
  if (current.trim()) push();
  return out.length ? out : [''];
}

export interface SubtitleLayout { lines: Array<{ text: string; x: number; y: number; w: number }>; box: Rect; region: Rect; top: number; bottom: number }

export function layoutSubtitle(text: string, s: SubtitleStyle): SubtitleLayout {
  const ctx = measureCtx; ctx.font = fontString(s, text);
  const hasBox = s.backgroundMode !== 'none'; const padX = hasBox ? s.paddingX : 0; const padY = hasBox ? s.paddingY : 0;
  const regionW = clamp(s.width, 0.05, 1) * W; const cx = s.x * W; const regionL = cx - regionW / 2;
  const maxText = Math.max(s.fontSize, regionW - padX * 2);
  const raw = text.split('\n').flatMap((line) => wrapLine(ctx, line.trim(), maxText));
  const lineH = s.fontSize * s.lineHeight; const blockH = raw.length * lineH;
  const bottom = s.y * H; const boxH = blockH + padY * 2; const boxTop = bottom - boxH; const textTop = boxTop + padY;
  const lines = raw.map((line, i) => {
    const w = ctx.measureText(line).width;
    const x = s.alignment === 'left' ? regionL + padX : s.alignment === 'right' ? regionL + regionW - padX - w : cx - w / 2;
    return { text: line, x, y: textTop + (i + 0.5) * lineH, w };
  });
  const minX = Math.min(...lines.map((l) => l.x)); const maxX = Math.max(...lines.map((l) => l.x + l.w));
  const box = s.backgroundMode === 'full-width' ? { x: 0, y: boxTop, w: W, h: boxH } : { x: minX - padX, y: boxTop, w: maxX - minX + padX * 2, h: boxH };
  // Glyphs (Vietnamese stacked diacritics, descenders), stroke and shadow can extend past the line box.
  const spill = s.fontSize * 0.35 + s.strokeWidth + s.shadow * 1.6 + 2;
  return { lines, box, region: { x: regionL, y: boxTop, w: regionW, h: boxH }, top: Math.min(boxTop, textTop - spill), bottom: Math.max(bottom, textTop + blockH + spill) };
}

export function drawSubtitle(ctx: Ctx, text: string, s: SubtitleStyle) {
  if (!text.trim()) return;
  const layout = layoutSubtitle(text, s);
  if (s.backgroundMode !== 'none' && s.backgroundOpacity > 0) {
    const b = layout.box;
    ctx.save(); ctx.globalAlpha = clamp(s.backgroundOpacity, 0, 1); ctx.fillStyle = s.backgroundColor;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, s.backgroundMode === 'full-width' ? 0 : Math.min(s.radius, b.h / 2)); ctx.fill(); ctx.restore();
  }
  // Stroke + fill go to a separate layer first so text opacity fades the glyph as a whole
  // instead of letting the inner half of the stroke show through a translucent fill.
  textLayer ??= new OffscreenCanvas(W, H);
  const t = textLayer.getContext('2d')!;
  t.clearRect(0, 0, W, H); t.font = fontString(s, text); t.textBaseline = 'middle'; t.textAlign = 'left'; t.lineJoin = 'round'; t.miterLimit = 2;
  for (const line of layout.lines) {
    if (s.strokeWidth > 0) { t.lineWidth = s.strokeWidth * 2; t.strokeStyle = s.strokeColor; t.strokeText(line.text, line.x, line.y); }
    t.fillStyle = s.color; t.fillText(line.text, line.x, line.y);
  }
  ctx.save(); ctx.globalAlpha = clamp(s.opacity, 0, 1);
  if (s.shadow > 0) { ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = s.shadow; ctx.shadowOffsetY = s.shadow * 0.4; }
  ctx.drawImage(textLayer, 0, 0); ctx.restore();
}

// ---------- timeline ----------
export function textAt(cues: Cue[], time: number) { return cues.filter((c) => c.start <= time && c.end > time).map((c) => c.text).join('\n'); }

/** Splits [start, start+duration) into spans with constant on-screen text (overlapping cues are stacked). */
export function buildSegments(cues: Cue[], start: number, duration: number) {
  const end = start + duration; const points = new Set<number>([0, duration]);
  for (const c of cues) if (c.end > start && c.start < end) { points.add(clamp(c.start - start, 0, duration)); points.add(clamp(c.end - start, 0, duration)); }
  const sorted = [...points].sort((a, b) => a - b); const segments: Array<{ text: string; ms: number }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    // Integer milliseconds keep the cumulative concat timeline free of float drift.
    const ms = Math.round(sorted[i + 1] * 1000) - Math.round(sorted[i] * 1000); if (ms <= 0) continue;
    const text = textAt(cues, start + (sorted[i] + sorted[i + 1]) / 2); const last = segments[segments.length - 1];
    if (last && last.text === text) last.ms += ms; else segments.push({ text, ms });
  }
  return segments;
}

// ---------- job preparation ----------
async function pngBytes(canvas: OffscreenCanvas) { return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()); }

export interface PreparedJob { jobDir: string; segments: Array<{ file: string; ms: number }>; bandTop: number; logo: { file: string; x: number; y: number } | null }

export async function prepareJob(source: SourceFolder, settings: Settings, cues: Cue[], start: number, duration: number, onStep?: (done: number, total: number) => void, isCancelled?: () => boolean): Promise<PreparedJob> {
  const bridge = api(); const s = settings.subtitle;
  const logo = settings.logo.enabled && settings.logo.path ? await loadImage(settings.logo.path) : undefined;
  const jobDir = await bridge.createJob();
  try {
    const bg = new OffscreenCanvas(W, H); const bgCtx = bg.getContext('2d')!;
    await withImage(source.imagePath!, async (background) => drawBackground(bgCtx, background, source.transform));
    if (logo && settings.layerOrder === 'subtitle-above') drawLogo(bgCtx, logo, settings.logo);
    await bridge.writeJobFile(jobDir, 'bg.png', await pngBytes(bg));

    let logoLayer: PreparedJob['logo'] = null;
    if (logo && settings.layerOrder === 'logo-above') {
      const r = logoRect(logo, settings.logo); const canvas = new OffscreenCanvas(r.w, r.h);
      drawLogo(canvas.getContext('2d')!, logo, settings.logo, true);
      await bridge.writeJobFile(jobDir, 'logo.png', await pngBytes(canvas)); logoLayer = { file: 'logo.png', x: r.x, y: r.y };
    }

    const spans = buildSegments(cues, start, duration);
    const texts = [...new Set(spans.map((span) => span.text).filter((text) => text.trim()))];
    if (!texts.length) return { jobDir, segments: [], bandTop: 0, logo: logoLayer };
    await ensureFonts(s, texts);
    // Every subtitle frame shares one horizontal band so FFmpeg overlays a fixed-size stream.
    let top = H; let bottom = 0;
    for (const text of texts) { const l = layoutSubtitle(text, s); top = Math.min(top, l.top); bottom = Math.max(bottom, l.bottom); }
    const bandTop = Math.max(0, Math.floor(top / 2) * 2); const bandH = Math.max(2, Math.ceil((Math.min(H, bottom) - bandTop) / 2) * 2);
    const band = new OffscreenCanvas(W, bandH); const ctx = band.getContext('2d')!;
    await bridge.writeJobFile(jobDir, 'empty.png', await pngBytes(band));
    const files = new Map<string, string>();
    for (let i = 0; i < texts.length; i++) {
      if (isCancelled?.()) throw new Error('Đã hủy');
      ctx.clearRect(0, 0, W, bandH); ctx.save(); ctx.translate(0, -bandTop); drawSubtitle(ctx, texts[i], s); ctx.restore();
      const name = `s${i}.png`; await bridge.writeJobFile(jobDir, name, await pngBytes(band)); files.set(texts[i], name);
      onStep?.(i + 1, texts.length);
    }
    return { jobDir, segments: spans.map((span) => ({ file: files.get(span.text) ?? 'empty.png', ms: span.ms })), bandTop, logo: logoLayer };
  } catch (error) { await bridge.discardJob(jobDir).catch(() => undefined); throw error; }
}
