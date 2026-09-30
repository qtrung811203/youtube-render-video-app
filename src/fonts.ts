/**
 * Fonts bundled with the app (via @fontsource, split by unicode-range so only the glyph subsets a
 * subtitle actually uses are loaded) plus well-known Windows fonts. Bundled fonts render identically
 * on every machine, which matters because the editor and the video share the same canvas renderer.
 */
import '@fontsource/noto-sans-kr/400.css'; import '@fontsource/noto-sans-kr/700.css';
import '@fontsource/noto-serif-kr/400.css'; import '@fontsource/noto-serif-kr/700.css';
import '@fontsource/nanum-gothic/400.css'; import '@fontsource/nanum-gothic/700.css';
import '@fontsource/nanum-myeongjo/400.css'; import '@fontsource/nanum-myeongjo/700.css';
import '@fontsource/gowun-dodum/400.css'; import '@fontsource/jua/400.css'; import '@fontsource/do-hyeon/400.css'; import '@fontsource/black-han-sans/400.css';
import '@fontsource/noto-sans-jp/400.css'; import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/noto-serif-jp/400.css'; import '@fontsource/noto-serif-jp/700.css';
import '@fontsource/m-plus-rounded-1c/400.css'; import '@fontsource/m-plus-rounded-1c/700.css';
import '@fontsource/zen-maru-gothic/400.css'; import '@fontsource/zen-maru-gothic/700.css';
import '@fontsource/shippori-mincho/400.css'; import '@fontsource/shippori-mincho/700.css';
import '@fontsource/kosugi-maru/400.css'; import '@fontsource/sawarabi-mincho/400.css'; import '@fontsource/dela-gothic-one/400.css';
import '@fontsource/be-vietnam-pro/400.css'; import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/roboto/400.css'; import '@fontsource/roboto/700.css';
import '@fontsource/montserrat/400.css'; import '@fontsource/montserrat/700.css';

export type FontGroup = 'ko' | 'ja' | 'vi';
export interface FontEntry { family: string; group: FontGroup; bundled: boolean; style: string; boldOnly400?: boolean }

export const FONT_GROUPS: Array<{ id: FontGroup; label: string; short: string; sample: string }> = [
  { id: 'ko', label: 'Tiếng Hàn', short: '한 Hàn', sample: '안녕하세요, 반갑습니다' },
  { id: 'ja', label: 'Tiếng Nhật', short: 'あ Nhật', sample: 'こんにちは、日本語の字幕' },
  { id: 'vi', label: 'Tiếng Việt / Latin', short: 'Việt', sample: 'Xin chào, phụ đề tiếng Việt' }
];

export const FONT_CATALOG: FontEntry[] = [
  { family: 'Noto Sans KR', group: 'ko', bundled: true, style: 'Gothic · dễ đọc' },
  { family: 'Nanum Gothic', group: 'ko', bundled: true, style: 'Gothic · phổ biến' },
  { family: 'Gowun Dodum', group: 'ko', bundled: true, style: 'Gothic mềm', boldOnly400: true },
  { family: 'Noto Serif KR', group: 'ko', bundled: true, style: 'Myeongjo · có chân' },
  { family: 'Nanum Myeongjo', group: 'ko', bundled: true, style: 'Myeongjo · kể chuyện' },
  { family: 'Jua', group: 'ko', bundled: true, style: 'Tròn · dễ thương', boldOnly400: true },
  { family: 'Do Hyeon', group: 'ko', bundled: true, style: 'Tiêu đề', boldOnly400: true },
  { family: 'Black Han Sans', group: 'ko', bundled: true, style: 'Rất đậm · tiêu đề', boldOnly400: true },
  { family: 'Malgun Gothic', group: 'ko', bundled: false, style: 'Windows' },

  { family: 'Noto Sans JP', group: 'ja', bundled: true, style: 'ゴシック · dễ đọc' },
  { family: 'M PLUS Rounded 1c', group: 'ja', bundled: true, style: '丸ゴシック · tròn' },
  { family: 'Zen Maru Gothic', group: 'ja', bundled: true, style: '丸ゴシック · mềm' },
  { family: 'Kosugi Maru', group: 'ja', bundled: true, style: '丸ゴシック', boldOnly400: true },
  { family: 'Noto Serif JP', group: 'ja', bundled: true, style: '明朝 · có chân' },
  { family: 'Shippori Mincho', group: 'ja', bundled: true, style: '明朝 · kể chuyện (朗読)' },
  { family: 'Sawarabi Mincho', group: 'ja', bundled: true, style: '明朝', boldOnly400: true },
  { family: 'Dela Gothic One', group: 'ja', bundled: true, style: 'Rất đậm · tiêu đề', boldOnly400: true },
  { family: 'Yu Gothic', group: 'ja', bundled: false, style: 'Windows' },
  { family: 'Meiryo', group: 'ja', bundled: false, style: 'Windows' },
  { family: 'BIZ UDGothic', group: 'ja', bundled: false, style: 'Windows · UD' },
  { family: 'Yu Mincho', group: 'ja', bundled: false, style: 'Windows' },
  { family: 'BIZ UDMincho', group: 'ja', bundled: false, style: 'Windows · UD' },
  { family: 'UD Digi Kyokasho N', group: 'ja', bundled: false, style: 'Windows · 教科書体' },

  { family: 'Be Vietnam Pro', group: 'vi', bundled: true, style: 'Không chân · hiện đại' },
  { family: 'Roboto', group: 'vi', bundled: true, style: 'Không chân' },
  { family: 'Montserrat', group: 'vi', bundled: true, style: 'Không chân · tiêu đề' },
  { family: 'Arial', group: 'vi', bundled: false, style: 'Windows' },
  { family: 'Segoe UI', group: 'vi', bundled: false, style: 'Windows' },
  { family: 'Tahoma', group: 'vi', bundled: false, style: 'Windows' },
  { family: 'Times New Roman', group: 'vi', bundled: false, style: 'Windows · có chân' }
];

export const isBundled = (family: string) => FONT_CATALOG.some((f) => f.bundled && f.family.toLowerCase() === family.toLowerCase());

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/;
const HAN = /[㐀-鿿豈-﫿]/;

/** Language of a subtitle line; kanji-only text is treated as Japanese. */
export function detectLang(text: string): 'ko' | 'ja' | 'vi' {
  if (KANA.test(text)) return 'ja';
  if (HANGUL.test(text)) return 'ko';
  if (HAN.test(text)) return 'ja';
  return 'vi';
}

// Chinese characters are shared by Korean and Japanese but drawn differently; the fallback order follows the
// text's language so a Latin-only font never makes Japanese kanji appear in Korean glyph shapes (or vice versa).
const FALLBACK: Record<'ko' | 'ja' | 'vi', string[]> = {
  ko: ['Noto Sans KR', 'Malgun Gothic', 'Noto Sans JP'],
  ja: ['Noto Sans JP', 'Yu Gothic', 'Meiryo', 'Noto Sans KR'],
  vi: ['Be Vietnam Pro', 'Arial', 'Noto Sans KR', 'Noto Sans JP']
};
export function fontStack(family: string, text: string) {
  const list = [family, ...FALLBACK[detectLang(text)].filter((f) => f.toLowerCase() !== family.toLowerCase())];
  return `${list.map((f) => `"${f}"`).join(', ')}, sans-serif`;
}

/** Installed system font check: an unknown family falls back to the generic font on both probes. */
export function fontAvailable(family: string) {
  if (isBundled(family)) return true;
  const ctx = document.createElement('canvas').getContext('2d')!; const sample = 'abcdefghijklmnopqrstuvwxyz 0123456789 가나다 あいう 漢字';
  return ['monospace', 'serif'].some((generic) => { ctx.font = `40px ${generic}`; const base = ctx.measureText(sample).width; ctx.font = `40px "${family}", ${generic}`; return ctx.measureText(sample).width !== base; });
}
