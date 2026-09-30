import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, normalize, relative, resolve, isAbsolute } from 'path';
import ffmpegPath from 'ffmpeg-static';
import ffprobe from '@ffprobe-installer/ffprobe';
import { Cue, defaultSettings, EncodeRequest, EncodeResult, EncoderInfo, Settings, SourceFolder } from './types';

const imageExt = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const audioExt = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg']);
const gpuEncoders: EncoderInfo[] = process.platform === 'darwin'
  ? [{ id: 'h264_videotoolbox', label: 'Apple VideoToolbox' }]
  : [{ id: 'h264_nvenc', label: 'NVIDIA NVENC' }, { id: 'h264_amf', label: 'AMD AMF' }, { id: 'h264_qsv', label: 'Intel Quick Sync' }];
let windowRef: BrowserWindow | null = null;
const active = new Map<string, { process?: ChildProcessWithoutNullStreams; cancelled: boolean }>();

function unpacked(path: string) { return app.isPackaged ? path.replace('app.asar', 'app.asar.unpacked') : path; }
function ffmpegBin() { return unpacked(ffmpegPath!); }
function ffprobeBin() { return unpacked(ffprobe.path); }
function tempRoot() { const dir = join(app.getPath('temp'), 'background-video-renderer'); mkdirSync(dir, { recursive: true }); return dir; }
function settingsFile() { return join(app.getPath('userData'), 'settings.json'); }
function startupLog(message: string) { try { appendFileSync(join(app.getPath('userData'), 'startup.log'), `[${new Date().toISOString()}] ${message}\n`); } catch { /* diagnostics must never prevent launch */ } }
function send(channel: string, payload: unknown) { windowRef?.webContents.send(channel, payload); }

// ---------- settings ----------
function migrateSettings(raw: any): Settings {
  const d = defaultSettings;
  const s: Settings = {
    logo: { ...d.logo, ...raw?.logo }, layerOrder: raw?.layerOrder ?? d.layerOrder,
    subtitle: { ...d.subtitle, ...raw?.subtitle }, render: { ...d.render, ...raw?.render },
    sourceTransforms: raw?.sourceTransforms ?? {}
  };
  // v1 layout: flat logoPath/logoTransform. The v1 editor showed x/y as the logo center (its render used the
  // top-left corner instead); keep what the user positioned on screen.
  if (raw && !raw.logo && (raw.logoPath || raw.logoTransform)) {
    s.logo = { ...s.logo, directory: raw.logoDirectory ?? '', path: raw.logoPath ?? '', x: raw.logoTransform?.x ?? d.logo.x, y: raw.logoTransform?.y ?? d.logo.y, width: raw.logoTransform?.scale ?? d.logo.width };
  }
  // v1 `vertical` was the text baseline area; v2 `y` is the bottom edge of the subtitle box.
  if (raw?.subtitle && typeof raw.subtitle.vertical === 'number' && raw.subtitle.y === undefined) s.subtitle.y = Math.min(1, raw.subtitle.vertical + (raw.subtitle.paddingY ?? 0) / 1080);
  delete (s.subtitle as any).vertical;
  return s;
}
function readSettings(): Settings { try { return migrateSettings(JSON.parse(readFileSync(settingsFile(), 'utf8'))); } catch { return migrateSettings(undefined); } }
function saveSettings(settings: Settings) { writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); }

// ---------- folders ----------
function scanFolder(folder: string): SourceFolder {
  const files = readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join(folder, entry.name));
  const images = files.filter((file) => imageExt.has(extname(file).toLowerCase()));
  const subtitles = files.filter((file) => extname(file).toLowerCase() === '.srt');
  const audios = files.filter((file) => audioExt.has(extname(file).toLowerCase()));
  const errors: string[] = [];
  if (!images.length) errors.push('Thiếu ảnh nền');
  if (!subtitles.length) errors.push('Thiếu file .srt');
  if (!audios.length) errors.push('Thiếu file âm thanh');
  return { id: normalize(folder), path: folder, name: basename(folder), images, subtitles, audios, imagePath: images[0], subtitlePath: subtitles[0], audioPath: audios[0], transform: { x: .5, y: .5, scale: 1 }, errors };
}
function isDir(path: string) { try { return statSync(path).isDirectory(); } catch { return false; } }
function scanPaths(paths: string[]) { return paths.filter(isDir).map(scanFolder); }
function subfolders(parent: string) { return readdirSync(parent, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(parent, e.name)); }

// ---------- subtitles ----------
function decodeText(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer[0] === 0xfe && buffer[1] === 0xff) { const swapped = Buffer.from(buffer.subarray(2)); swapped.swap16(); return swapped.toString('utf16le'); }
  return buffer.toString('utf8').replace(/^﻿/, '');
}
export function parseSrt(content: string): Cue[] {
  const time = /(\d+):(\d+):(\d+)[,.](\d+)/;
  const toSeconds = (m: RegExpMatchArray) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4]}`);
  const cues: Cue[] = [];
  for (const block of content.replace(/\r/g, '').trim().split(/\n\s*\n/)) {
    const lines = block.split('\n'); const index = lines.findIndex((line) => line.includes('-->')); if (index < 0) continue;
    const [a, b] = lines[index].split('-->'); const ma = a.match(time); const mb = b?.match(time); if (!ma || !mb) continue;
    const text = lines.slice(index + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').trim();
    const start = toSeconds(ma); const end = toSeconds(mb); if (text && end > start) cues.push({ start, end, text });
  }
  return cues.sort((x, y) => x.start - y.start);
}

// ---------- ffmpeg helpers ----------
function run(bin: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => { const child = spawn(bin, args); let stdout = ''; let stderr = ''; child.stdout.on('data', (d) => stdout += d); child.stderr.on('data', (d) => stderr += d); child.on('error', (e) => resolvePromise({ code: -1, stdout, stderr: String(e) })); child.on('close', (code) => resolvePromise({ code: code ?? -1, stdout, stderr })); });
}
async function getDuration(path: string) {
  const result = await run(ffprobeBin(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nokey=1:noprint_wrappers=1', path]);
  const value = Number(result.stdout.trim()); if (result.code !== 0 || !Number.isFinite(value)) throw new Error('Không đọc được thời lượng audio'); return value;
}
let encoderProbe: Promise<EncoderInfo[]> | null = null;
function detectEncoders() {
  encoderProbe ??= Promise.all(gpuEncoders.map(async (encoder) => {
    const result = await run(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=640x360:d=0.2', '-c:v', encoder.id, '-pix_fmt', 'yuv420p', '-f', 'null', '-']);
    return result.code === 0 ? encoder : null;
  })).then((list) => list.filter((item): item is EncoderInfo => !!item));
  return encoderProbe;
}
function encoderArgs(encoder: string) {
  switch (encoder) {
    case 'h264_nvenc': return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '21', '-b:v', '0'];
    case 'h264_amf': return ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '20', '-qp_p', '22'];
    case 'h264_qsv': return ['-c:v', 'h264_qsv', '-preset', 'faster', '-global_quality', '21'];
    // Constant-quality (-q:v) only exists on Apple Silicon, so use a bitrate that works on Intel Macs too.
    // allow_sw lets VMs without a media engine (e.g. CI runners) fall back to Apple's software encoder.
    case 'h264_videotoolbox': return ['-c:v', 'h264_videotoolbox', '-b:v', '8M', '-maxrate', '12M', '-bufsize', '16M', '-allow_sw', '1'];
    // A still background changes rarely, so x264 can use a fast preset without visible loss.
    default: return ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-crf', '20'];
  }
}
function uniqueOutput(folder: string, base: string) { let result = join(folder, `${base}_render.mp4`); let i = 2; while (existsSync(result)) result = join(folder, `${base}_render_${i++}.mp4`); return result; }
function outputFolder(request: EncodeRequest) {
  if (request.outputLocation === 'custom' && request.outputDirectory && isDir(request.outputDirectory)) return request.outputDirectory;
  return request.outputLocation === 'beside' ? dirname(request.sourcePath) : request.sourcePath;
}
function assertJobDir(dir: string) { const rel = relative(tempRoot(), resolve(dir)); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Thư mục tạm không hợp lệ'); }
function concatPath(file: string) { return file.replace(/\\/g, '/').replace(/'/g, "'\\''"); }

function spawnEncode(request: EncodeRequest, encoder: string, output: string): Promise<void> {
  const job = active.get(request.id)!;
  // The background is decoded and converted to YUV once, then repeated by the loop filter; re-decoding a
  // 1080p PNG per frame (-loop 1 input) made encoding ~3x slower.
  const args = ['-hide_banner', '-y', '-framerate', '30', '-i', join(request.jobDir, 'bg.png'), '-ss', String(request.start), '-i', request.audioPath];
  let input = 2; let video = '[bg]'; const filters: string[] = ['[0:v]format=yuv420p,loop=loop=-1:size=1:start=0,setpts=N/30/TB[bg]'];
  if (request.segments.length) {
    const list = ['ffconcat version 1.0', ...request.segments.flatMap((s) => [`file '${concatPath(join(request.jobDir, s.file))}'`, `duration ${(s.ms / 1000).toFixed(3)}`]), `file '${concatPath(join(request.jobDir, request.segments[request.segments.length - 1].file))}'`];
    writeFileSync(join(request.jobDir, 'subs.ffconcat'), list.join('\n'), 'utf8');
    args.push('-f', 'concat', '-safe', '0', '-i', join(request.jobDir, 'subs.ffconcat'));
    filters.push(`${video}[${input}:v]overlay=0:${request.bandTop}:eof_action=repeat:format=yuv420[sub]`); video = '[sub]'; input++;
  }
  if (request.logo) {
    // A single-frame input: overlay keeps repeating its last frame, so the PNG is decoded only once.
    args.push('-i', join(request.jobDir, request.logo.file));
    filters.push(`${video}[${input}:v]overlay=${request.logo.x}:${request.logo.y}:eof_action=repeat:format=yuv420[logo]`); video = '[logo]'; input++;
  }
  filters.push(`${video}format=yuv420p[v]`);
  args.push('-filter_complex', filters.join(';'), '-map', '[v]', '-map', '1:a:0', '-t', request.duration.toFixed(3), '-r', '30', ...encoderArgs(encoder), '-g', '150', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', output);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(ffmpegBin(), args); job.process = child; let stderr = ''; let lastSent = 0;
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString(); const time = text.match(/out_time_us=(\d+)/g); const speed = text.match(/speed=\s*([\d.]+)x/);
      if (!time) return; const seconds = Number(time[time.length - 1].split('=')[1]) / 1e6; const now = Date.now(); if (now - lastSent < 250) return; lastSent = now;
      send('render-progress', { id: request.id, progress: Math.max(0, Math.min(99.5, seconds / request.duration * 100)), speed: speed ? Number(speed[1]) : undefined });
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => { job.process = undefined; if (job.cancelled) reject(new Error('Đã hủy')); else if (code === 0) resolvePromise(); else reject(new Error(stderr.split('\n').filter((l) => l.trim()).slice(-6).join('\n') || 'FFmpeg render thất bại')); });
  });
}

async function encode(request: EncodeRequest): Promise<EncodeResult> {
  assertJobDir(request.jobDir); const started = Date.now(); active.set(request.id, { cancelled: false });
  const final = request.preview ? join(tempRoot(), `preview-${request.id}-${started}.mp4`) : uniqueOutput(outputFolder(request), request.sourceName);
  // Write to a partial file and rename at the end so a cancelled/failed render never leaves a broken MP4 with the final name.
  const partial = request.preview ? final : final.replace(/\.mp4$/, '.partial.mp4');
  try {
    let encoder = request.encoder; let fallback = false;
    try { await spawnEncode(request, encoder, partial); }
    catch (error) {
      if (active.get(request.id)?.cancelled || encoder === 'libx264') throw error;
      startupLog(`GPU encode failed (${encoder}), retrying on CPU: ${String(error)}`); encoder = 'libx264'; fallback = true;
      await spawnEncode(request, encoder, partial);
    }
    if (partial !== final) renameSync(partial, final);
    return { output: final, encoder, fallback, seconds: (Date.now() - started) / 1000 };
  } catch (error) { if (partial !== final) { try { unlinkSync(partial); } catch { /* nothing written */ } } throw error; }
  finally { active.delete(request.id); try { rmSync(request.jobDir, { recursive: true, force: true }); } catch { /* temp cleanup is best effort */ } }
}

function createWindow() {
  const preload = join(__dirname, 'preload.js'); const productionPage = join(__dirname, '../dist/index.html');
  startupLog(`Starting window. preload=${preload} exists=${existsSync(preload)} page=${productionPage} exists=${existsSync(productionPage)}`);
  windowRef = new BrowserWindow({ width: 1560, height: 960, minWidth: 1180, minHeight: 720, backgroundColor: '#10131a', webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: false } });
  windowRef.webContents.on('did-fail-load', (_event, code, description, validatedURL) => startupLog(`Load failed (${code}): ${description}; ${validatedURL}`));
  windowRef.webContents.on('did-finish-load', () => startupLog(`Page loaded: ${windowRef?.webContents.getURL()}`));
  (windowRef.webContents as any).on('preload-error', (_event: unknown, preloadPath: string, error: Error) => startupLog(`Preload error (${preloadPath}): ${error.message}`));
  windowRef.webContents.on('console-message', (_event, level, message) => { if (level >= 2) startupLog(`Renderer console: ${message}`); });
  // Dropping a folder onto the window must not navigate away from the app.
  windowRef.webContents.on('will-navigate', (event) => event.preventDefault());
  const url = process.env.VITE_DEV_SERVER_URL; if (url) windowRef.loadURL(url); else windowRef.loadFile(productionPage);
}

app.whenReady().then(() => {
  // Lets the font picker list installed fonts via queryLocalFonts().
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback((permission as string) === 'local-fonts'));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => (permission as string) === 'local-fonts');
  // macOS routes Cmd+C/V/Z/A through the application menu; without one, text inputs lose those shortcuts.
  if (process.platform === 'darwin') Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]));
  createWindow(); detectEncoders();
  // Previews from earlier sessions are no longer referenced.
  try { for (const name of readdirSync(tempRoot())) rmSync(join(tempRoot(), name), { recursive: true, force: true }); } catch { /* best effort */ }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { for (const job of active.values()) { job.cancelled = true; job.process?.kill(); } if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('folders:select', async () => { const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] }); return result.canceled ? [] : scanPaths(result.filePaths); });
ipcMain.handle('folders:select-parent', async () => { const result = await dialog.showOpenDialog({ title: 'Chọn thư mục cha chứa nhiều thư mục nguồn', properties: ['openDirectory'] }); return result.canceled ? [] : scanPaths(subfolders(result.filePaths[0])); });
ipcMain.handle('folders:scan', (_e, paths: string[]) => { const direct = paths.filter(isDir); const expanded = direct.flatMap((dir) => { const own = scanFolder(dir); return own.errors.length === 3 ? subfolders(dir) : [dir]; }); return scanPaths(expanded); });
ipcMain.handle('folders:reload', (_e, folders: string[]) => scanPaths(folders));
ipcMain.handle('dir:select', async () => { const result = await dialog.showOpenDialog({ properties: ['openDirectory'] }); return result.canceled ? null : result.filePaths[0]; });
ipcMain.handle('logos:list', (_e, directory: string) => { try { return readdirSync(directory).filter((name) => imageExt.has(extname(name).toLowerCase())).map((name) => join(directory, name)); } catch { return []; } });
ipcMain.handle('settings:load', () => readSettings());
ipcMain.handle('settings:save', (_e, settings: Settings) => saveSettings(settings));
ipcMain.handle('file:read', (_e, path: string) => readFileSync(path));
ipcMain.handle('subtitles:read', (_e, path: string) => parseSrt(decodeText(readFileSync(path))));
ipcMain.handle('media:duration', (_e, path: string) => getDuration(path));
ipcMain.handle('encoders:detect', () => detectEncoders());
ipcMain.handle('job:create', () => mkdtempSync(join(tempRoot(), 'job-')));
ipcMain.handle('job:write', (_e, dir: string, name: string, data: Uint8Array) => { assertJobDir(dir); writeFileSync(join(dir, basename(name)), data); });
ipcMain.handle('job:discard', (_e, dir: string) => { assertJobDir(dir); rmSync(dir, { recursive: true, force: true }); });
ipcMain.handle('render:encode', (_e, request: EncodeRequest) => encode(request));
ipcMain.handle('render:cancel', (_e, id?: string) => { for (const [key, job] of active) if (!id || key === id) { job.cancelled = true; job.process?.kill(); } });
ipcMain.handle('shell:show', (_e, path: string) => shell.showItemInFolder(path));
