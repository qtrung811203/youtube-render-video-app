import { contextBridge, ipcRenderer, webUtils } from 'electron';

const on = (channel: string) => (listener: (data: unknown) => void) => {
  const handler = (_e: unknown, data: unknown) => listener(data);
  ipcRenderer.on(channel, handler);
  return () => { ipcRenderer.removeListener(channel, handler); };
};

contextBridge.exposeInMainWorld('videoRenderer', {
  selectFolders: () => ipcRenderer.invoke('folders:select'),
  selectParentFolder: () => ipcRenderer.invoke('folders:select-parent'),
  scanFolders: (paths: string[]) => ipcRenderer.invoke('folders:scan', paths),
  reloadFolders: (folders: string[]) => ipcRenderer.invoke('folders:reload', folders),
  selectDirectory: () => ipcRenderer.invoke('dir:select'),
  listLogos: (directory: string) => ipcRenderer.invoke('logos:list', directory),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  readSubtitles: (path: string) => ipcRenderer.invoke('subtitles:read', path),
  getDuration: (path: string) => ipcRenderer.invoke('media:duration', path),
  detectEncoders: () => ipcRenderer.invoke('encoders:detect'),
  createJob: () => ipcRenderer.invoke('job:create'),
  writeJobFile: (dir: string, name: string, data: Uint8Array) => ipcRenderer.invoke('job:write', dir, name, data),
  discardJob: (dir: string) => ipcRenderer.invoke('job:discard', dir),
  encode: (request: unknown) => ipcRenderer.invoke('render:encode', request),
  cancel: (id?: string) => ipcRenderer.invoke('render:cancel', id),
  showInFolder: (path: string) => ipcRenderer.invoke('shell:show', path),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  onProgress: on('render-progress')
});
