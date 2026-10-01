import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultSettings, FPS_OPTIONS, outputSize, RESOLUTIONS } from '../electron/types';
import type { EncoderInfo, LogoSettings, OutputLocation, Quality, Settings, SourceFolder, SubtitleStyle, Transform } from '../electron/types';
import { api, bridge } from './bridge';
import { clamp, prepareJob, textAt } from './composer';
import { Inspector } from './Inspector';
import { invalidateCues, loadCues, loadDuration, useAsync, useImage } from './media';
import { Stage, type Layer } from './Stage';
import { fileName, formatTime, Segmented, Toggle } from './ui';

type Status = 'idle' | 'queued' | 'preparing' | 'rendering' | 'done' | 'error' | 'cancelled';
type Item = SourceFolder & { checked: boolean; status: Status; progress?: number; speed?: number; phase?: string; output?: string; error?: string; note?: string };
const SAMPLE_TEXT = 'Đây là nội dung phụ đề mẫu';
const BUSY: Status[] = ['queued', 'preparing', 'rendering'];
const outputOptions = (s: Settings) => ({ resolution: s.render.resolution, fps: s.render.fps, quality: s.render.quality });
const isReady = (s: SourceFolder) => !!(s.imagePath && s.subtitlePath && s.audioPath);
const message = (error: unknown) => String(error instanceof Error ? error.message : error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings); const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(); const [layer, setLayer] = useState<Layer>('subtitle');
  const [logos, setLogos] = useState<string[]>([]); const [encoders, setEncoders] = useState<EncoderInfo[]>();
  const [time, setTime] = useState(0); const [previewSeconds, setPreviewSeconds] = useState(10);
  const [preview, setPreview] = useState<{ url: string; signature: string; encoder: string }>(); const [showVideo, setShowVideo] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(''); const [dropping, setDropping] = useState(false);

  const itemsRef = useRef(items); itemsRef.current = items;
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const encodersRef = useRef(encoders); encodersRef.current = encoders;
  const queue = useRef<string[]>([]); const workers = useRef(0); const cancelled = useRef(new Set<string>());

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const bg = useImage(selected?.imagePath);
  const logoImage = useImage(settings.logo.enabled ? settings.logo.path || undefined : undefined);
  const cues = useAsync(() => selected?.subtitlePath ? loadCues(selected.subtitlePath) : Promise.resolve([]), [selected?.subtitlePath]);
  const duration = useAsync(() => selected?.audioPath ? loadDuration(selected.audioPath) : Promise.resolve(0), [selected?.audioPath]);
  const activeText = cues ? textAt(cues, time) : '';
  const stageText = activeText || cues?.[0]?.text || SAMPLE_TEXT;

  // ---------- settings persistence ----------
  useEffect(() => {
    if (!bridge) return;
    bridge.loadSettings().then((stored) => { setSettings(stored); setLoaded(true); if (stored.logo.directory) api().listLogos(stored.logo.directory).then(setLogos); });
    bridge.detectEncoders().then(setEncoders);
    return bridge.onProgress(({ id, progress, speed }) => setItems((list) => list.map((item) => item.id === id && item.status === 'rendering' ? { ...item, progress, speed } : item)));
  }, []);
  useEffect(() => { if (!bridge || !loaded) return; const timer = setTimeout(() => api().saveSettings(settings), 400); return () => clearTimeout(timer); }, [settings, loaded]);
  useEffect(() => { setTime(0); }, [selected?.id]);

  const patchItem = useCallback((id: string, patch: Partial<Item>) => setItems((list) => list.map((item) => item.id === id ? { ...item, ...patch } : item)), []);
  const setLogo = (patch: Partial<LogoSettings>) => setSettings((s) => ({ ...s, logo: { ...s.logo, ...patch } }));
  const setSubtitle = (patch: Partial<SubtitleStyle>) => setSettings((s) => ({ ...s, subtitle: { ...s.subtitle, ...patch } }));
  const setRender = (patch: Partial<Settings['render']>) => setSettings((s) => ({ ...s, render: { ...s.render, ...patch } }));
  const setTransform = (t: Transform) => { if (!selected) return; patchItem(selected.id, { transform: t }); setSettings((s) => ({ ...s, sourceTransforms: { ...s.sourceTransforms, [selected.path]: t } })); };
  const applyTransformAll = () => { if (!selected) return; const t = selected.transform; setItems((list) => list.map((item) => ({ ...item, transform: t }))); setSettings((s) => ({ ...s, sourceTransforms: { ...s.sourceTransforms, ...Object.fromEntries(itemsRef.current.map((item) => [item.path, t])) } })); };

  // ---------- sources ----------
  const toItem = (folder: SourceFolder, old?: Item): Item => ({ ...folder, transform: settingsRef.current.sourceTransforms[folder.path] ?? folder.transform, checked: old?.checked ?? true, status: old?.status && !BUSY.includes(old.status) ? old.status : 'idle', output: old?.output, note: old?.note,
    imagePath: old?.imagePath && folder.images.includes(old.imagePath) ? old.imagePath : folder.imagePath, subtitlePath: old?.subtitlePath && folder.subtitles.includes(old.subtitlePath) ? old.subtitlePath : folder.subtitlePath, audioPath: old?.audioPath && folder.audios.includes(old.audioPath) ? old.audioPath : folder.audioPath });
  const addFolders = (found: SourceFolder[]) => {
    if (!found.length) return;
    setItems((list) => [...list, ...found.filter((f) => !list.some((item) => item.id === f.id)).map((f) => toItem(f))]);
    setSelectedId((id) => id ?? found[0].id);
  };
  const reload = async () => {
    invalidateCues(); const busy = new Set(itemsRef.current.filter((i) => BUSY.includes(i.status)).map((i) => i.id));
    const scanned = await api().reloadFolders(itemsRef.current.map((item) => item.path));
    setItems((list) => scanned.map((folder) => { const old = list.find((item) => item.id === folder.id); return busy.has(folder.id) && old ? old : toItem(folder, old); }));
  };
  const removeItem = (id: string) => { if (BUSY.includes(itemsRef.current.find((i) => i.id === id)?.status ?? 'idle')) return; setItems((list) => list.filter((item) => item.id !== id)); if (selectedId === id) setSelectedId(undefined); };
  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault(); setDropping(false);
    const paths = [...event.dataTransfer.files].map((file) => api().pathForFile(file)).filter(Boolean);
    if (paths.length) addFolders(await api().scanFolders(paths));
  };
  const pickLogoDir = async () => { const dir = await api().selectDirectory(); if (!dir) return; const list = await api().listLogos(dir); setLogos(list); setLogo({ directory: dir, path: list.includes(settingsRef.current.logo.path) ? settingsRef.current.logo.path : list[0] ?? '', enabled: true }); setLayer('logo'); };

  // ---------- encoder ----------
  const resolveEncoder = (s: Settings) => { const list = encodersRef.current ?? []; if (s.render.encoder === 'cpu' || !list.length) return 'libx264'; return (list.find((e) => e.id === s.render.gpuEncoder) ?? list[0]).id; };
  const encoderLabel = (id: string) => id === 'libx264' ? 'CPU' : `GPU ${encoders?.find((e) => e.id === id)?.label ?? id}`;

  // ---------- batch queue ----------
  async function runJob(id: string) {
    const source = itemsRef.current.find((item) => item.id === id); if (!source || !isReady(source)) return;
    const s = settingsRef.current; patchItem(id, { status: 'preparing', progress: 0, phase: 'Đọc dữ liệu…', error: undefined, note: undefined });
    try {
      const [cueList, total] = await Promise.all([loadCues(source.subtitlePath!), loadDuration(source.audioPath!)]);
      const job = await prepareJob(source, s, cueList, 0, total, (done, count) => patchItem(id, { phase: `Dựng phụ đề ${done}/${count}` }), () => cancelled.current.has(id));
      if (cancelled.current.has(id)) { await api().discardJob(job.jobDir); throw new Error('Đã hủy'); }
      patchItem(id, { status: 'rendering', phase: undefined });
      const result = await api().encode({ ...job, id, audioPath: source.audioPath!, start: 0, duration: total, encoder: resolveEncoder(s), preview: false, sourcePath: source.path, sourceName: source.name, outputLocation: s.render.outputLocation, outputDirectory: s.render.outputDirectory, ...outputOptions(s) });
      patchItem(id, { status: 'done', progress: 100, output: result.output, note: `${result.fallback ? 'GPU lỗi → CPU' : encoderLabel(result.encoder)} · ${formatTime(result.seconds)}` });
    } catch (error) {
      const wasCancelled = cancelled.current.has(id);
      patchItem(id, { status: wasCancelled ? 'cancelled' : 'error', error: wasCancelled ? undefined : message(error), phase: undefined });
    } finally { cancelled.current.delete(id); }
  }
  function pump() {
    while (workers.current < settingsRef.current.render.concurrency && queue.current.length) {
      const id = queue.current.shift()!; workers.current++;
      runJob(id).finally(() => { workers.current--; pump(); });
    }
  }
  function enqueue(ids: string[]) {
    const fresh = ids.filter((id) => !queue.current.includes(id) && !BUSY.includes(itemsRef.current.find((i) => i.id === id)?.status ?? 'idle'));
    if (!fresh.length) return;
    queue.current.push(...fresh); setItems((list) => list.map((item) => fresh.includes(item.id) ? { ...item, status: 'queued', progress: 0, error: undefined } : item));
    setTimeout(pump, 0);
  }
  const startAll = () => enqueue(items.filter((item) => item.checked && isReady(item) && !(settings.render.skipDone && item.status === 'done')).map((item) => item.id));
  const stopItem = (id: string) => {
    if (queue.current.includes(id)) { queue.current = queue.current.filter((q) => q !== id); patchItem(id, { status: 'idle' }); return; }
    cancelled.current.add(id); api().cancel(id);
  };
  const stopAll = () => {
    const queued = new Set(queue.current); queue.current = [];
    setItems((list) => list.map((item) => queued.has(item.id) ? { ...item, status: 'idle' } : item));
    for (const item of itemsRef.current) if (item.status === 'preparing' || item.status === 'rendering') cancelled.current.add(item.id);
    api().cancel();
  };

  // ---------- FFmpeg preview ----------
  const signature = selected ? JSON.stringify([selected.imagePath, selected.subtitlePath, selected.audioPath, selected.transform, settings.logo, settings.layerOrder, settings.subtitle, outputOptions(settings)]) : '';
  const makePreview = async () => {
    if (!selected || !isReady(selected)) return; const s = settings; const source = selected; const sig = signature;
    setPreviewBusy('Đang dựng lớp…');
    try {
      const [cueList, total] = await Promise.all([loadCues(source.subtitlePath!), loadDuration(source.audioPath!)]);
      const start = clamp(time, 0, Math.max(0, total - 1)); const length = Math.min(previewSeconds, total - start);
      const job = await prepareJob(source, s, cueList, start, length);
      setPreviewBusy('Đang encode…');
      const encoder = resolveEncoder(s);
      const result = await api().encode({ ...job, id: `preview-${Date.now()}`, audioPath: source.audioPath!, start, duration: length, encoder, preview: true, sourcePath: source.path, sourceName: source.name, outputLocation: 'inside', outputDirectory: '', ...outputOptions(s) });
      const bytes = await api().readFile(result.output);
      setPreview((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'video/mp4' })), signature: sig, encoder: `${result.fallback ? 'GPU lỗi → CPU' : encoderLabel(result.encoder)} · ${result.seconds.toFixed(1)}s` }; });
      setShowVideo(true);
    } catch (error) { alert(`Không tạo được preview:\n${message(error)}`); }
    finally { setPreviewBusy(''); }
  };
  const previewStale = !!preview && preview.signature !== signature;

  const stats = useMemo(() => ({ ready: items.filter((i) => i.checked && isReady(i)).length, done: items.filter((i) => i.status === 'done').length, running: items.some((i) => BUSY.includes(i.status)) }), [items]);
  const cueIndex = cues?.findIndex((c) => c.end > time) ?? -1;
  const jumpCue = (dir: -1 | 1) => { if (!cues?.length) return; const current = cues.findIndex((c) => c.start <= time && c.end > time); const target = current >= 0 ? current + dir : dir > 0 ? cueIndex : cueIndex - 1; const cue = cues[clamp(target, 0, cues.length - 1)]; setTime(cue.start + 0.01); setShowVideo(false); };

  if (!bridge) return <main><section className="launch-error"><h1>Ứng dụng chưa được mở qua Electron</h1><p>Hãy đóng cửa sổ này và nhấp đúp <b>Mo-Ung-Dung.bat</b> trong thư mục dự án. Không mở địa chỉ Vite/localhost trên trình duyệt.</p></section></main>;

  const gpuAvailable = !!encoders?.length;
  return <main>
    <header>
      <div><h1>Background Video Renderer</h1><p>{outputSize(settings.render.resolution).width}×{settings.render.resolution} · {settings.render.fps}fps · H.264 + AAC</p></div>
      <div className="header-status">{stats.running ? <span className="pill live">Đang render · {stats.done}/{items.length} xong</span> : items.length > 0 && <span className="pill">{stats.done}/{items.length} đã render</span>}</div>
    </header>
    <section className="workspace">
      <aside className={`queue ${dropping ? 'dropping' : ''}`} onDragOver={(e) => { e.preventDefault(); setDropping(true); }} onDragLeave={() => setDropping(false)} onDrop={onDrop}>
        <div className="queue-actions">
          <button onClick={async () => addFolders(await api().selectFolders())}>+ Thư mục</button>
          <button className="secondary" title="Chọn một thư mục cha, mỗi thư mục con là một video" onClick={async () => addFolders(await api().selectParentFolder())}>+ Thư mục cha</button>
          <button className="secondary icon" title="Quét lại tệp trong các thư mục" onClick={reload}>↻</button>
        </div>

        <div className="batch-card">
          <label>Bộ mã hóa</label>
          <Segmented value={gpuAvailable ? settings.render.encoder : 'cpu'} onChange={(encoder) => setRender({ encoder })} options={[{ value: 'gpu', label: 'GPU', disabled: !gpuAvailable, title: gpuAvailable ? 'Nhanh hơn nhiều, dùng card đồ họa' : 'Không tìm thấy GPU hỗ trợ H.264' }, { value: 'cpu', label: 'CPU' }]} />
          {encoders === undefined ? <p className="hint">Đang kiểm tra GPU…</p> : !gpuAvailable ? <p className="hint">Không tìm thấy GPU hỗ trợ — dùng CPU (libx264).</p> : settings.render.encoder === 'gpu' && (encoders.length > 1
            ? <select value={resolveEncoder(settings)} onChange={(e) => setRender({ gpuEncoder: e.target.value })}>{encoders.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>
            : <p className="hint">{encoders[0].label}</p>)}
          <div className="two">
            <label>Chạy song song<select value={settings.render.concurrency} onChange={(e) => { setRender({ concurrency: Number(e.target.value) }); setTimeout(pump, 0); }}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} video</option>)}</select></label>
            <label>Nơi lưu<select value={settings.render.outputLocation} onChange={async (e) => { const value = e.target.value as OutputLocation; if (value === 'custom') { const dir = await api().selectDirectory(); if (dir) setRender({ outputLocation: value, outputDirectory: dir }); } else setRender({ outputLocation: value }); }}>
              <option value="inside">Trong thư mục nguồn</option><option value="beside">Cạnh thư mục nguồn</option><option value="custom">Thư mục khác…</option></select></label>
          </div>
          {settings.render.outputLocation === 'custom' && <p className="hint ellipsis" title={settings.render.outputDirectory}>→ {settings.render.outputDirectory}</p>}
          <Toggle label="Bỏ qua video đã render" checked={settings.render.skipDone} onChange={(skipDone) => setRender({ skipDone })} />
        </div>

        <div className="batch-card">
          <label>Xuất video</label>
          <div className="three">
            <label>Độ phân giải<select value={settings.render.resolution} onChange={(e) => setRender({ resolution: Number(e.target.value) })}>{RESOLUTIONS.map((r) => <option key={r} value={r}>{r}p</option>)}</select></label>
            <label>FPS<select value={settings.render.fps} onChange={(e) => setRender({ fps: Number(e.target.value) })}>{FPS_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
            <label>Chất lượng<select value={settings.render.quality} onChange={(e) => setRender({ quality: e.target.value as Quality })}><option value="high">Cao</option><option value="balanced">Cân bằng</option><option value="small">Nhỏ gọn</option></select></label>
          </div>
          <p className="hint">{outputSize(settings.render.resolution).width}×{settings.render.resolution}, {settings.render.fps} khung/giây. Video ảnh tĩnh: 720p hoặc 24 fps render nhanh hơn và file nhỏ hơn.</p>
        </div>
        <div className="list-head">
          <label className="check-all"><input type="checkbox" checked={items.length > 0 && items.every((i) => i.checked)} onChange={(e) => setItems((list) => list.map((i) => ({ ...i, checked: e.target.checked })))} /> Nguồn <b>{items.length}</b></label>
          {items.length > 0 && <button className="link" disabled={stats.running} onClick={() => { setItems([]); setSelectedId(undefined); }}>Xóa hết</button>}
        </div>
        <div className="list">
          {items.length === 0 && <div className="empty">Kéo thả thư mục vào đây, hoặc bấm <b>+ Thư mục</b>.<br />Mỗi thư mục cần 1 ảnh, 1 file .srt và 1 file âm thanh.</div>}
          {items.map((item) => {
            const ready = isReady(item); const busy = BUSY.includes(item.status);
            const status = item.errors.length ? item.errors.join(' · ') : item.status === 'queued' ? 'Đang chờ…' : item.status === 'preparing' ? item.phase ?? 'Chuẩn bị…' : item.status === 'rendering' ? `Đang render ${Math.floor(item.progress ?? 0)}%${item.speed ? ` · ${item.speed.toFixed(1)}×` : ''}` : item.status === 'done' ? `✓ Xong · ${item.note ?? ''}` : item.status === 'error' ? `Lỗi: ${item.error}` : item.status === 'cancelled' ? 'Đã hủy' : 'Sẵn sàng';
            return <div key={item.id} className={`item ${selected?.id === item.id ? 'selected' : ''} ${item.status} ${item.errors.length ? 'invalid' : ''}`} onClick={() => { setSelectedId(item.id); setShowVideo(false); }}>
              <input type="checkbox" checked={item.checked} disabled={!ready} onClick={(e) => e.stopPropagation()} onChange={(e) => patchItem(item.id, { checked: e.target.checked })} />
              <div className="item-main"><strong title={item.path}>{item.name}</strong><small title={item.error}>{status}</small></div>
              <div className="item-actions" onClick={(e) => e.stopPropagation()}>
                {busy ? <button className="icon danger" title="Dừng" onClick={() => stopItem(item.id)}>■</button> : <button className="icon" title="Render thư mục này" disabled={!ready} onClick={() => enqueue([item.id])}>▶</button>}
                {item.output && <button className="icon secondary" title="Mở vị trí video" onClick={() => api().showInFolder(item.output!)}>📂</button>}
                {!busy && <button className="icon ghost" title="Bỏ khỏi danh sách" onClick={() => removeItem(item.id)}>×</button>}
              </div>
              {(item.status === 'rendering' || item.status === 'done') && <i className="bar" style={{ width: `${item.progress ?? 0}%` }} />}
            </div>;
          })}
        </div>
        <div className="queue-footer">
          <button className="render" disabled={!stats.ready} onClick={startAll}>▶ Bắt đầu tất cả ({stats.ready})</button>
          <button className="danger" disabled={!stats.running} onClick={stopAll}>■ Dừng</button>
        </div>
      </aside>

      <section className="editor">
        <div className="editor-bar">
          <Segmented value={showVideo && preview ? 'video' : 'edit'} onChange={(v) => setShowVideo(v === 'video')} options={[{ value: 'edit', label: 'Chỉnh sửa' }, { value: 'video', label: 'Video preview', disabled: !preview }]} />
          <span className="hint">{showVideo && preview ? (previewStale ? '⚠ Preview đã cũ so với cài đặt hiện tại — hãy tạo lại.' : `Video FFmpeg thật · ${preview.encoder}`) : 'Bấm để chọn phần tử · Kéo để di chuyển · Kéo góc/cạnh để đổi cỡ · Cuộn chuột để phóng to · Mũi tên: dịch 1px'}</span>
        </div>
        <Stage source={selected} settings={settings} bg={bg} logo={logoImage} text={stageText} selected={layer} onSelect={setLayer}
          onTransform={setTransform} onLogo={setLogo} onSubtitle={setSubtitle} videoUrl={preview?.url} showVideo={showVideo} />
        <div className="timeline">
          <button className="icon secondary" title="Câu trước" disabled={!cues?.length} onClick={() => jumpCue(-1)}>‹</button>
          <input type="range" min={0} max={Math.max(1, duration ?? 0)} step={0.1} value={time} disabled={!duration} onChange={(e) => { setTime(Number(e.target.value)); setShowVideo(false); }} />
          <button className="icon secondary" title="Câu sau" disabled={!cues?.length} onClick={() => jumpCue(1)}>›</button>
          <span className="time">{formatTime(time)} / {formatTime(duration ?? 0)}</span>
        </div>
        <div className="preview-row">
          <p className="cue">{activeText ? <>“{activeText.replace(/\n/g, ' / ')}”</> : <span className="muted">{cues?.length ? 'Không có phụ đề tại mốc này — đang hiển thị câu mẫu để căn chỉnh' : selected ? 'Chưa có phụ đề' : ''}</span>}</p>
          <select value={previewSeconds} onChange={(e) => setPreviewSeconds(Number(e.target.value))}>{[5, 10, 20].map((n) => <option key={n} value={n}>{n} giây</option>)}</select>
          <button disabled={!selected || !isReady(selected) || !!previewBusy} onClick={makePreview} title="Encode đoạn ngắn bằng đúng pipeline render để kiểm tra">{previewBusy || `▶ Preview FFmpeg từ ${formatTime(time)}`}</button>
        </div>
        {selected && <p className="source-meta">{selected.name}: {fileName(selected.imagePath)} · {fileName(selected.subtitlePath)} · {fileName(selected.audioPath)}</p>}
      </section>

      <Inspector layer={layer} onLayer={setLayer} source={selected} settings={settings} logos={logos} logoImage={logoImage}
        onSource={(patch) => { if (selected) { patchItem(selected.id, patch); if (patch.subtitlePath) invalidateCues(); } }} onTransform={setTransform} onApplyTransformAll={applyTransformAll}
        onLogo={setLogo} onSubtitle={setSubtitle} onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))} onPickLogoDir={pickLogoDir} sampleText={stageText} />
    </section>
  </main>;
}
