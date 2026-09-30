import type { ReactNode } from 'react';

export const isMac = navigator.platform.startsWith('Mac');
/** Name of the Alt key as printed on the user's keyboard. */
export const ALT_KEY = isMac ? 'Option' : 'Alt';
export const fileName = (path?: string) => path?.split(/[\\/]/).pop() ?? 'Chưa chọn';
export const round = (value: number, digits = 0) => { const f = 10 ** digits; return Math.round(value * f) / f; };
export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '--:--'; const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = Math.floor(s % 60);
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
}

export function Range({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="range">
    <span>{label}<span className="num"><input type="number" value={value} min={min} max={max} step={step} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} />{unit}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </label>;
}

export function Segmented<T extends string | number>({ value, options, onChange, disabled }: { value: T; options: Array<{ value: T; label: ReactNode; title?: string; disabled?: boolean }>; onChange: (value: T) => void; disabled?: boolean }) {
  return <div className="segmented">{options.map((o) => <button type="button" key={String(o.value)} title={o.title} disabled={disabled || o.disabled} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="color-field">{label}<span><input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} /><code>{value.toUpperCase()}</code></span></label>;
}

export function Toggle({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span className="switch" />{label}</label>;
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="section"><h3>{title}{aside}</h3>{children}</section>;
}
