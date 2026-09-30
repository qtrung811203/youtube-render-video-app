import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LogoSettings, Settings, SourceFolder, SubtitleStyle, Transform } from '../electron/types';
import { backgroundRect, clamp, drawSubtitle, ensureFonts, H, layoutSubtitle, logoRect, W, type Rect } from './composer';
import type { LoadedImage } from './media';

export type Layer = 'background' | 'logo' | 'subtitle';
type Guide = { axis: 'x' | 'y'; pos: number };
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'w' | 'e';

interface Props {
  source?: SourceFolder; settings: Settings; bg?: LoadedImage; logo?: LoadedImage; text: string;
  selected: Layer; onSelect: (layer: Layer) => void;
  onTransform: (t: Transform) => void; onLogo: (patch: Partial<LogoSettings>) => void; onSubtitle: (patch: Partial<SubtitleStyle>) => void;
  videoUrl?: string; showVideo: boolean;
}

/** Snaps an element's center to frame edges/center; threshold is in frame pixels. */
function snap(center: number, half: number, size: number, threshold: number, guides: Guide[], axis: 'x' | 'y') {
  const options = [{ at: 0, value: half }, { at: size / 2, value: size / 2 }, { at: size, value: size - half }];
  const hit = options.find((o) => Math.abs((o.at === 0 ? center - half : o.at === size ? center + half : center) - o.at) < threshold);
  if (!hit) return center; guides.push({ axis, pos: hit.at }); return hit.value;
}

export function Stage(props: Props) {
  const { source, settings, bg, logo, text, selected, onSelect, videoUrl, showVideo } = props;
  const frameRef = useRef<HTMLDivElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null);
  const [k, setK] = useState(0.4); const [guides, setGuides] = useState<Guide[]>([]); const [dragging, setDragging] = useState(false); const [, setFontsReady] = useState(0);
  const latest = useRef(props); latest.current = props;
  const kRef = useRef(k); kRef.current = k;

  useLayoutEffect(() => {
    const el = frameRef.current!; const observer = new ResizeObserver(() => setK(el.clientWidth / W)); observer.observe(el); setK(el.clientWidth / W);
    return () => observer.disconnect();
  }, []);

  const s = settings.subtitle;
  useEffect(() => {
    let alive = true; const canvas = canvasRef.current!; const ctx = canvas.getContext('2d')!;
    // Re-render after the load too, so the selection box is measured with the real font instead of a fallback.
    ensureFonts(s, [text]).then(() => { if (!alive) return; ctx.clearRect(0, 0, W, H); drawSubtitle(ctx, text, s); setFontsReady((n) => n + 1); });
    return () => { alive = false; };
  }, [text, s]);

  const logoOn = !!(logo && settings.logo.enabled && settings.logo.path);
  const bgRect = bg && source ? backgroundRect(bg, source.transform) : undefined;
  const logoBox = logoOn ? logoRect(logo!, settings.logo) : undefined;
  const layout = layoutSubtitle(text, s);
  const subBox: Rect = { x: layout.region.x, y: layout.box.y, w: layout.region.w, h: layout.box.h };
  const logoOnTop = settings.layerOrder === 'logo-above';

  function begin(event: React.PointerEvent, layer: Layer, handle: Handle) {
    if (event.button !== 0) return;
    event.stopPropagation(); event.preventDefault(); onSelect(layer); frameRef.current?.focus();
    const p = latest.current; const startX = event.clientX; const startY = event.clientY; const scale = kRef.current;
    const origT = p.source?.transform; const origLogo = { ...p.settings.logo }; const origSub = { ...p.settings.subtitle };
    const origLogoRect = p.logo ? logoRect(p.logo, origLogo) : undefined; const origBg = p.bg && origT ? backgroundRect(p.bg, origT) : undefined;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale; const dy = (ev.clientY - startY) / scale; const th = ev.altKey ? 0 : 8 / scale; const g: Guide[] = [];
      if (layer === 'background' && origT && origBg) {
        const ex = origBg.w - W; const ey = origBg.h - H;
        p.onTransform({ ...origT, x: ex > 0.5 ? clamp(origT.x - dx / ex, 0, 1) : origT.x, y: ey > 0.5 ? clamp(origT.y - dy / ey, 0, 1) : origT.y });
      } else if (layer === 'logo' && origLogoRect) {
        const r = origLogoRect; const aspect = r.w / r.h;
        if (handle === 'move') {
          const cx = snap(origLogo.x * W + dx, r.w / 2, W, th, g, 'x'); const cy = snap(origLogo.y * H + dy, r.h / 2, H, th, g, 'y');
          p.onLogo({ x: cx / W, y: cy / H });
        } else {
          const sx = handle.includes('e') ? 1 : -1; const sy = handle.includes('s') ? 1 : -1;
          const ax = sx > 0 ? r.x : r.x + r.w; const ay = sy > 0 ? r.y : r.y + r.h;
          const w = Math.max(24, r.w + (Math.abs(dx) > Math.abs(dy * aspect) ? sx * dx : sy * dy * aspect)); const h = w / aspect;
          p.onLogo({ width: w / W, x: (ax + sx * w / 2) / W, y: (ay + sy * h / 2) / H });
        }
      } else if (layer === 'subtitle') {
        const regionW = origSub.width * W;
        if (handle === 'move') {
          const cx = snap(origSub.x * W + dx, regionW / 2, W, th, g, 'x');
          p.onSubtitle({ x: clamp(cx / W, 0, 1), y: clamp((origSub.y * H + dy) / H, 0.08, 1) });
        } else {
          let left = origSub.x * W - regionW / 2; let right = left + regionW;
          if (handle === 'e') right = clamp(right + dx, left + 200, W); else left = clamp(left + dx, 0, right - 200);
          if (ev.shiftKey) { const c = origSub.x * W; const half = handle === 'e' ? right - c : c - left; left = c - half; right = c + half; }
          p.onSubtitle({ x: (left + right) / 2 / W, width: clamp((right - left) / W, 0.1, 1) });
        }
      }
      setGuides(g);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setGuides([]); setDragging(false); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  // Wheel resizes whatever is selected: zoom for the background, size for logo, font size for subtitles.
  useEffect(() => {
    const el = frameRef.current!;
    const onWheel = (event: WheelEvent) => {
      const p = latest.current; if (p.showVideo && p.videoUrl) return; event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0012);
      if (p.selected === 'background' && p.source) p.onTransform({ ...p.source.transform, scale: clamp(Math.round(p.source.transform.scale * factor * 1000) / 1000, 1, 4) });
      else if (p.selected === 'logo') p.onLogo({ width: clamp(p.settings.logo.width * factor, 0.02, 0.8) });
      else p.onSubtitle({ fontSize: clamp(Math.round(p.settings.subtitle.fontSize * factor), 12, 200) });
    };
    el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    const step = event.shiftKey ? 10 : 1; const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = map[event.key]; if (!d) return; event.preventDefault();
    if (selected === 'logo') props.onLogo({ x: settings.logo.x + d[0] / W, y: settings.logo.y + d[1] / H });
    else if (selected === 'subtitle') props.onSubtitle({ x: clamp(s.x + d[0] / W, 0, 1), y: clamp(s.y + d[1] / H, 0.08, 1) });
    else if (source) props.onTransform({ ...source.transform, x: clamp(source.transform.x + d[0] / 100, 0, 1), y: clamp(source.transform.y + d[1] / 100, 0, 1) });
  }

  const box = (r: Rect) => ({ left: r.x * k, top: r.y * k, width: r.w * k, height: r.h * k });
  const video = showVideo && videoUrl;

  return <div className={`stage-frame ${dragging ? 'dragging' : ''}`} ref={frameRef} tabIndex={0} onKeyDown={onKeyDown}>
    <div className="stage" style={{ width: W, height: H, transform: `scale(${k})` }}>
      {bgRect && bg ? <img className="layer" src={bg.url} draggable={false} style={{ left: bgRect.x, top: bgRect.y, width: bgRect.w, height: bgRect.h }} /> : <div className="stage-empty">{source ? 'Chưa có ảnh nền' : 'Chọn hoặc kéo thả thư mục nguồn vào cột bên trái'}</div>}
      {logoBox && <img className="layer" src={logo!.url} draggable={false} style={{ left: logoBox.x, top: logoBox.y, width: logoBox.w, height: logoBox.h, opacity: settings.logo.opacity, zIndex: logoOnTop ? 3 : 1 }} />}
      <canvas className="layer" ref={canvasRef} width={W} height={H} style={{ left: 0, top: 0, zIndex: 2 }} />
    </div>
    {!video && source && <div className={`overlay sel-${selected}`} onPointerDown={(e) => begin(e, 'background', 'move')}>
      {text && <div className={`box sub ${selected === 'subtitle' ? 'active' : ''}`} style={{ ...box(subBox), zIndex: logoOnTop ? 1 : 2 }} onPointerDown={(e) => begin(e, 'subtitle', 'move')}>
        <span className="tag">Phụ đề</span>
        {selected === 'subtitle' && (['w', 'e'] as const).map((h) => <i key={h} className={`handle ${h}`} onPointerDown={(e) => begin(e, 'subtitle', h)} />)}
      </div>}
      {logoBox && <div className={`box logo ${selected === 'logo' ? 'active' : ''}`} style={{ ...box(logoBox), zIndex: logoOnTop ? 2 : 1 }} onPointerDown={(e) => begin(e, 'logo', 'move')}>
        <span className="tag">Logo</span>
        {selected === 'logo' && (['nw', 'ne', 'sw', 'se'] as const).map((h) => <i key={h} className={`handle ${h}`} onPointerDown={(e) => begin(e, 'logo', h)} />)}
      </div>}
      {guides.map((g, i) => <div key={i} className={`guide ${g.axis}`} style={g.axis === 'x' ? { left: g.pos * k } : { top: g.pos * k }} />)}
    </div>}
    {video && <video className="stage-video" src={videoUrl} controls autoPlay />}
  </div>;
}
