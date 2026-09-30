import { useEffect, useMemo, useState } from 'react';
import { detectLang, FONT_CATALOG, FONT_GROUPS, fontAvailable, type FontGroup } from './fonts';

type Tab = FontGroup | 'system';

/** Font list grouped by language; every row is drawn in its own font with a sample in that language. */
export function FontPicker({ value, bold, sampleText, onChange }: { value: string; bold: boolean; sampleText: string; onChange: (family: string) => void }) {
  const lang = detectLang(sampleText);
  const current = FONT_CATALOG.find((f) => f.family === value);
  const [tab, setTab] = useState<Tab>(current?.group ?? lang);
  const [systemFonts, setSystemFonts] = useState<string[]>(); const [query, setQuery] = useState('');
  const installed = useMemo(() => new Set(FONT_CATALOG.filter((f) => fontAvailable(f.family)).map((f) => f.family)), []);
  const available = useMemo(() => fontAvailable(value), [value]);
  useEffect(() => { if (current) setTab(current.group); }, [current?.group]);

  const loadSystemFonts = async () => {
    setTab('system'); if (systemFonts) return;
    try { const list: Array<{ family: string }> = await (window as any).queryLocalFonts(); setSystemFonts([...new Set(list.map((f) => f.family))].sort((a, b) => a.localeCompare(b))); }
    catch { setSystemFonts([]); }
  };
  const group = FONT_GROUPS.find((g) => g.id === tab);
  // Show the real subtitle line when it is in the language of the tab, otherwise a generic sample.
  const sample = group ? (lang === group.id && sampleText ? sampleText.split('\n')[0].slice(0, 28) : group.sample) : sampleText.split('\n')[0].slice(0, 28);
  const rows = tab === 'system'
    ? (systemFonts ?? []).filter((f) => f.toLowerCase().includes(query.toLowerCase())).slice(0, 200).map((family) => ({ family, style: '', bundled: false, boldOnly400: false }))
    : FONT_CATALOG.filter((f) => f.group === tab && installed.has(f.family));
  const mismatch = current && current.group !== 'vi' && lang !== 'vi' && current.group !== lang;

  return <div className="font-picker">
    <div className="font-current"><span style={{ fontFamily: `"${value}"`, fontWeight: bold ? 700 : 400 }}>{value}</span>{current?.bundled && <em>Kèm app</em>}</div>
    {!available && <p className="warn">Font “{value}” chưa cài trên máy này — chữ sẽ hiển thị và render bằng font dự phòng.</p>}
    {mismatch && <p className="warn">Phụ đề đang là tiếng {lang === 'ja' ? 'Nhật' : 'Hàn'} nhưng font là font tiếng {current!.group === 'ja' ? 'Nhật' : 'Hàn'} — chữ Hán sẽ hiển thị theo kiểu chữ của font này.</p>}
    <div className="font-tabs">
      {FONT_GROUPS.map((g) => <button key={g.id} className={tab === g.id ? 'on' : ''} onClick={() => setTab(g.id)} title={g.label}>{g.short}{g.id === lang && <i title="Ngôn ngữ của phụ đề hiện tại" />}</button>)}
      <button className={tab === 'system' ? 'on' : ''} onClick={loadSystemFonts}>Máy tính</button>
    </div>
    {tab === 'system' && <input className="font-search" placeholder="Tìm font đã cài…" value={query} onChange={(e) => setQuery(e.target.value)} />}
    <div className="font-list">
      {tab === 'system' && !systemFonts && <p className="muted">Đang đọc danh sách font…</p>}
      {tab === 'system' && systemFonts?.length === 0 && <p className="muted">Không đọc được danh sách font hệ thống.</p>}
      {rows.map((f) => <button key={f.family} className={`font-row ${f.family === value ? 'on' : ''}`} onClick={() => onChange(f.family)} title={f.family}>
        <span className="font-name">{f.family}{f.bundled ? <em>Kèm app</em> : f.style && <em className="sys">{f.style}</em>}{bold && f.boldOnly400 && <em className="sys" title="Font chỉ có 1 độ đậm; chữ đậm sẽ được làm đậm giả lập">1 nét</em>}</span>
        <span className="font-sample" style={{ fontFamily: `"${f.family}"`, fontWeight: bold ? 700 : 400 }}>{sample}</span>
        {f.style && f.bundled && <small>{f.style}</small>}
      </button>)}
    </div>
  </div>;
}
