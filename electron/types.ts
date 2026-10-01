export const FRAME_W = 1920;
export const FRAME_H = 1080;

export type LayerOrder = 'logo-above' | 'subtitle-above';
export type BackgroundMode = 'none' | 'content' | 'full-width';
export type Alignment = 'left' | 'center' | 'right';
export type EncoderMode = 'gpu' | 'cpu';
export type OutputLocation = 'inside' | 'beside' | 'custom';

/** Background crop: x/y are crop focus fractions (0..1), scale >= 1 is extra zoom on top of "cover". */
export interface Transform { x: number; y: number; scale: number }

/** Logo: x/y are the logo CENTER as fractions of the frame, width is a fraction of the frame width. */
export interface LogoSettings { enabled: boolean; directory: string; path: string; x: number; y: number; width: number; opacity: number }

/** Subtitle region: x = region center, y = region BOTTOM (fractions of the frame), width = region width fraction. */
export interface SubtitleStyle {
  fontFamily: string; fontSize: number; bold: boolean; italic: boolean; color: string; opacity: number;
  strokeColor: string; strokeWidth: number; shadow: number; lineHeight: number; alignment: Alignment;
  x: number; y: number; width: number;
  backgroundMode: BackgroundMode; backgroundColor: string; backgroundOpacity: number; paddingX: number; paddingY: number; radius: number;
}

export type Quality = 'high' | 'balanced' | 'small';
/** Output height; width follows 16:9. The editor always works in 1920×1080 and FFmpeg scales the layers. */
export const RESOLUTIONS = [480, 720, 1080, 1440] as const;
export const FPS_OPTIONS = [15, 24, 25, 30, 60] as const;
export const outputSize = (height: number) => ({ width: Math.round(height * 16 / 9 / 2) * 2, height });

export interface RenderOptions {
  encoder: EncoderMode; gpuEncoder: string; concurrency: number; outputLocation: OutputLocation; outputDirectory: string; skipDone: boolean;
  resolution: number; fps: number; quality: Quality;
}

export interface Settings {
  logo: LogoSettings; layerOrder: LayerOrder; subtitle: SubtitleStyle; render: RenderOptions;
  /** Background crop per source folder path, so re-opening a folder restores its framing. */
  sourceTransforms: Record<string, Transform>;
}

export interface SourceFolder { id: string; path: string; name: string; images: string[]; subtitles: string[]; audios: string[]; imagePath?: string; subtitlePath?: string; audioPath?: string; transform: Transform; errors: string[] }

export interface Cue { start: number; end: number; text: string }

export interface EncoderInfo { id: string; label: string }

export interface EncodeRequest {
  id: string; jobDir: string; audioPath: string; start: number; duration: number;
  /** ffconcat entries of subtitle frames; empty = no subtitle stream. */
  segments: Array<{ file: string; ms: number }>; bandTop: number;
  /** Logo overlaid above subtitles (only when layer order is logo-above; otherwise it is baked into bg.png). */
  logo: { file: string; x: number; y: number } | null;
  encoder: string; preview: boolean; sourcePath: string; sourceName: string;
  resolution: number; fps: number; quality: Quality;
  outputLocation: OutputLocation; outputDirectory: string;
}
export interface EncodeResult { output: string; encoder: string; fallback: boolean; seconds: number }

export const defaultSettings: Settings = {
  logo: { enabled: true, directory: '', path: '', x: 0.92, y: 0.09, width: 0.12, opacity: 1 },
  layerOrder: 'logo-above',
  subtitle: {
    fontFamily: 'Arial', fontSize: 54, bold: true, italic: false, color: '#FFFFFF', opacity: 1,
    strokeColor: '#000000', strokeWidth: 3, shadow: 0, lineHeight: 1.25, alignment: 'center',
    x: 0.5, y: 0.92, width: 0.8,
    backgroundMode: 'content', backgroundColor: '#000000', backgroundOpacity: 0.45, paddingX: 28, paddingY: 10, radius: 8
  },
  render: { encoder: 'gpu', gpuEncoder: '', concurrency: 1, outputLocation: 'inside', outputDirectory: '', skipDone: true, resolution: 1080, fps: 30, quality: 'balanced' },
  sourceTransforms: {}
};
