import type { Cue, EncodeRequest, EncodeResult, EncoderInfo, Settings, SourceFolder } from '../electron/types';

export interface VideoRendererBridge {
  selectFolders(): Promise<SourceFolder[]>;
  selectParentFolder(): Promise<SourceFolder[]>;
  scanFolders(paths: string[]): Promise<SourceFolder[]>;
  reloadFolders(folders: string[]): Promise<SourceFolder[]>;
  selectDirectory(): Promise<string | null>;
  listLogos(directory: string): Promise<string[]>;
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  readSubtitles(path: string): Promise<Cue[]>;
  getDuration(path: string): Promise<number>;
  detectEncoders(): Promise<EncoderInfo[]>;
  createJob(): Promise<string>;
  writeJobFile(dir: string, name: string, data: Uint8Array): Promise<void>;
  discardJob(dir: string): Promise<void>;
  encode(request: EncodeRequest): Promise<EncodeResult>;
  cancel(id?: string): Promise<void>;
  showInFolder(path: string): Promise<void>;
  pathForFile(file: File): string;
  onProgress(listener: (data: { id: string; progress: number; speed?: number }) => void): () => void;
}

export const bridge: VideoRendererBridge | undefined = (window as any).videoRenderer;
export const api = () => bridge!;
