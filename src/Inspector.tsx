import { useEffect, useState } from 'react';
import type { LogoSettings, Settings, SourceFolder, SubtitleStyle, Transform } from '../electron/types';
import { api } from './bridge';
import { clamp, H, logoRect, W } from './composer';
import { FontPicker } from './FontPicker';
import { useImage, type LoadedImage } from './media';
import type { Layer } from './Stage';
import { ColorField, fileName, Range, round, Section, Segmented, Toggle } from './ui';

const SUBTITLE_PRESETS: Array<{ name: string; patch: Partial<SubtitleStyle> }> = [
  { name: 'Hộp mờ', patch: { color: '#FFFFFF', strokeWidth: 0, shadow: 0, backgroundMode: 'content', backgroundColor: '#000000', backgroundOpacity: 0.55, paddingX: 26, paddingY: 10, radius: 10 } },
  { name: 'Viền đậm', patch: { color: '#FFFFFF', strokeColor: '#000000', strokeWidth: 4, shadow: 6, backgroundMode: 'none' } },
  { name: 'Dải ngang', patch: { color: '#FFFFFF', strokeWidth: 0, shadow: 0, backgroundMode: 'full-width', backgroundColor: '#000000', backgroundOpacity: 0.4, paddingY: 14 } },
  { name: 'Vàng karaoke', patch: { color: '#FFE14D', strokeColor: '#1A1A1A', strokeWidth: 3, shadow: 4, backgroundMode: 'none' } }
];

interface Props {
  layer: Layer; onLayer: (layer: Layer) => void; source?: SourceFolder; settings: Settings; logos: string[]; logoImage?: LoadedImage;
  onSource: (patch: Partial<SourceFolder>) => void; onTransform: (t: Transform) => void; onApplyTransformAll: () => void;
  onLogo: (patch: Partial<LogoSettings>) => void; onSubtitle: (patch: Partial<SubtitleStyle>) => void; onSettings: (patch: Partial<Settings>) => void;
  onPickLogoDir: () => void; sampleText: string;
}

export function Inspector(props: Props) {
  const { layer, onLayer } = props;
  return <aside className="inspector">
    <Segmented value={layer} onChange={onLayer} options={[{ value: 'background', label: 'Ảnh nền' }, { value: 'logo', label: 'Logo' }, { value: 'subtitle', label: 'Phụ đề' }]} />
    <p className="scope">{layer === 'background' ? 'Áp dụng riêng cho thư mục đang chọn' : 'Áp dụng chung cho mọi video trong batch'}</p>
    <div className="inspector-body">
      {layer === 'background' && <BackgroundPanel {...props} />}
      {layer === 'logo' && <LogoPanel {...props} />}
      {layer === 'subtitle' && <SubtitlePanel {...props} />}
    </div>
  </aside>;
}

function FileSelect({ label, files, value, onChange }: { label: string; files: string[]; value?: string; onChange: (value: string) => void }) {
  return <label>{label}<select value={value ?? ''} disabled={files.length < 2} onChange={(e) => onChange(e.target.value)}>{!files.length && <option value="">Không có tệp</option>}{files.map((file) => <option value={file} key={file}>{fileName(file)}</option>)}</select></label>;
}

function BackgroundPanel({ source, onSource, onTransform, onApplyTransformAll }: Props) {
  if (!source) return <p className="muted">Chưa chọn thư mục nguồn.</p>;
  const t = source.transform;
  return <>
    <Section title="Tệp nguồn">
      <FileSelect label="Ảnh nền" files={source.images} value={source.imagePath} onChange={(imagePath) => onSource({ imagePath })} />
      <FileSelect label="Phụ đề (.srt)" files={source.subtitles} value={source.subtitlePath} onChange={(subtitlePath) => onSource({ subtitlePath })} />
      <FileSelect label="Âm thanh" files={source.audios} value={source.audioPath} onChange={(audioPath) => onSource({ audioPath })} />
    </Section>
    <Section title="Khung ảnh">
      <Range label="Zoom" value={round(t.scale * 100)} min={100} max={400} unit="%" onChange={(v) => onTransform({ ...t, scale: clamp(v / 100, 1, 4) })} />
      <Range label="Điểm crop ngang" value={round(t.x * 100)} min={0} max={100} unit="%" onChange={(v) => onTransform({ ...t, x: v / 100 })} />
      <Range label="Điểm crop dọc" value={round(t.y * 100)} min={0} max={100} unit="%" onChange={(v) => onTransform({ ...t, y: v / 100 })} />
      <div className="row"><button className="secondary" onClick={() => onTransform({ x: .5, y: .5, scale: 1 })}>Đặt lại</button><button className="secondary" onClick={onApplyTransformAll} title="Dùng cùng zoom và điểm crop cho mọi thư mục trong danh sách">Áp dụng cho tất cả</button></div>
      <p className="hint">Kéo ảnh trên khung preview để dịch, cuộn chuột để zoom.</p>
    </Section>
  </>;
}

function LogoThumb({ path, active, onClick }: { path: string; active: boolean; onClick: () => void }) {
  const image = useImage(path);
  return <button className={`thumb ${active ? 'on' : ''}`} onClick={onClick} title={fileName(path)}>{image ? <img src={image.url} /> : <span>…</span>}</button>;
}

function LogoPanel({ settings, logos, logoImage, onLogo, onSettings, onPickLogoDir }: Props) {
  const logo = settings.logo; const margin = 40;
  const place = (col: number, row: number) => {
    if (!logoImage) return; const r = logoRect(logoImage, logo);
    const cx = col === 0 ? margin + r.w / 2 : col === 1 ? W / 2 : W - margin - r.w / 2; const cy = row === 0 ? margin + r.h / 2 : row === 1 ? H / 2 : H - margin - r.h / 2;
    onLogo({ x: cx / W, y: cy / H });
  };
  return <>
    <Section title="Logo" aside={<Toggle label="Hiển thị" checked={logo.enabled} onChange={(enabled) => onLogo({ enabled })} />}>
      <div className="row"><button className="secondary grow" onClick={onPickLogoDir}>{logo.directory ? 'Đổi thư mục logo' : 'Chọn thư mục logo'}</button></div>
      {logo.directory && <p className="hint ellipsis" title={logo.directory}>{logo.directory}</p>}
      {logos.length > 0 && <div className="thumbs">{logos.map((path) => <LogoThumb key={path} path={path} active={path === logo.path} onClick={() => onLogo({ path, enabled: true })} />)}</div>}
      {logo.directory && !logos.length && <p className="muted">Thư mục không có ảnh logo.</p>}
    </Section>
    <Section title="Vị trí & kích thước">
      <div className="place-grid">{[0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => <button key={`${row}${col}`} disabled={!logoImage} onClick={() => place(col, row)} title="Đặt nhanh (cách lề 40px)"><i /></button>))}</div>
      <Range label="Chiều rộng" value={round(logo.width * 100, 1)} min={2} max={80} step={0.5} unit="%" onChange={(v) => onLogo({ width: v / 100 })} />
      <Range label="Độ hiện (opacity)" value={round(logo.opacity * 100)} min={0} max={100} unit="%" onChange={(v) => onLogo({ opacity: v / 100 })} />
      <label>Thứ tự lớp</label>
      <Segmented value={settings.layerOrder} onChange={(layerOrder) => onSettings({ layerOrder })} options={[{ value: 'logo-above', label: 'Logo trên phụ đề' }, { value: 'subtitle-above', label: 'Phụ đề trên logo' }]} />
      <p className="hint">Kéo logo trên khung để di chuyển, kéo góc để đổi cỡ. Giữ Alt để tắt hít cạnh.</p>
    </Section>
  </>;
}

function SubtitlePanel({ settings, onSubtitle, sampleText }: Props) {
  const s = settings.subtitle;
  return <>
    <Section title="Mẫu nhanh"><div className="presets">{SUBTITLE_PRESETS.map((p) => <button key={p.name} className="secondary" onClick={() => onSubtitle(p.patch)}>{p.name}</button>)}</div></Section>
    <Section title="Chữ">
      <FontPicker value={s.fontFamily} bold={s.bold} sampleText={sampleText} onChange={(fontFamily) => onSubtitle({ fontFamily })} />
      <div className="row"><Toggle label={<b>Đậm</b>} checked={s.bold} onChange={(bold) => onSubtitle({ bold })} /><Toggle label={<i>Nghiêng</i>} checked={s.italic} onChange={(italic) => onSubtitle({ italic })} /></div>
      <Range label="Cỡ chữ" value={s.fontSize} min={12} max={200} unit="px" onChange={(fontSize) => onSubtitle({ fontSize })} />
      <div className="two"><ColorField label="Màu chữ" value={s.color} onChange={(color) => onSubtitle({ color })} /><ColorField label="Màu viền" value={s.strokeColor} onChange={(strokeColor) => onSubtitle({ strokeColor })} /></div>
      <Range label="Độ dày viền" value={s.strokeWidth} min={0} max={16} step={0.5} unit="px" onChange={(strokeWidth) => onSubtitle({ strokeWidth })} />
      <Range label="Đổ bóng" value={s.shadow} min={0} max={30} unit="px" onChange={(shadow) => onSubtitle({ shadow })} />
      <Range label="Độ đậm chữ" value={round(s.opacity * 100)} min={0} max={100} unit="%" onChange={(v) => onSubtitle({ opacity: v / 100 })} />
      <Range label="Giãn dòng" value={s.lineHeight} min={0.9} max={2} step={0.05} onChange={(lineHeight) => onSubtitle({ lineHeight })} />
    </Section>
    <Section title="Vị trí & bố cục">
      <label>Căn chữ</label>
      <Segmented value={s.alignment} onChange={(alignment) => onSubtitle({ alignment })} options={[{ value: 'left', label: 'Trái' }, { value: 'center', label: 'Giữa' }, { value: 'right', label: 'Phải' }]} />
      <label>Đặt nhanh</label>
      <div className="presets"><button className="secondary" onClick={() => onSubtitle({ x: .5, y: .93 })}>Dưới</button><button className="secondary" onClick={() => onSubtitle({ x: .5, y: .58 })}>Giữa</button><button className="secondary" onClick={() => onSubtitle({ x: .5, y: .2 })}>Trên</button></div>
      <Range label="Độ rộng vùng chữ" value={round(s.width * 100)} min={10} max={100} unit="%" onChange={(v) => onSubtitle({ width: v / 100 })} />
      <Range label="Mép dưới" value={round(s.y * 100, 1)} min={8} max={100} step={0.5} unit="%" onChange={(v) => onSubtitle({ y: v / 100 })} />
      <p className="hint">Kéo khung phụ đề để di chuyển, kéo cạnh trái/phải để đổi độ rộng dòng (Shift: đối xứng). Cuộn chuột để đổi cỡ chữ.</p>
    </Section>
    <Section title="Nền chữ">
      <Segmented value={s.backgroundMode} onChange={(backgroundMode) => onSubtitle({ backgroundMode })} options={[{ value: 'none', label: 'Không nền' }, { value: 'content', label: 'Ôm chữ' }, { value: 'full-width', label: 'Toàn ngang' }]} />
      {s.backgroundMode !== 'none' && <>
        <ColorField label="Màu nền" value={s.backgroundColor} onChange={(backgroundColor) => onSubtitle({ backgroundColor })} />
        <Range label="Độ đậm nền" value={round(s.backgroundOpacity * 100)} min={0} max={100} unit="%" onChange={(v) => onSubtitle({ backgroundOpacity: v / 100 })} />
        <Range label="Đệm trên/dưới" value={s.paddingY} min={0} max={80} unit="px" onChange={(paddingY) => onSubtitle({ paddingY })} />
        {s.backgroundMode === 'content' && <><Range label="Đệm trái/phải" value={s.paddingX} min={0} max={160} unit="px" onChange={(paddingX) => onSubtitle({ paddingX })} /><Range label="Bo góc" value={s.radius} min={0} max={60} unit="px" onChange={(radius) => onSubtitle({ radius })} /></>}
      </>}
    </Section>
  </>;
}
