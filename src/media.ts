import { useEffect, useState } from 'react';
import { api } from './bridge';
import type { Cue } from '../electron/types';

/**
 * Local files are read over IPC and exposed as blob: URLs. Unlike file:// URLs these are
 * same-origin, so canvases that draw them stay untainted and can be exported to PNG.
 */
export interface LoadedImage { url: string; image: HTMLImageElement; width: number; height: number }

async function decode(path: string): Promise<LoadedImage> {
  const bytes = await api().readFile(path);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const image = new Image(); image.src = url; await image.decode();
  return { url, image, width: image.naturalWidth, height: image.naturalHeight };
}
/** Uncached load for batch jobs, so rendering many folders doesn't evict what the editor shows. */
export async function withImage<T>(path: string, use: (image: LoadedImage) => Promise<T>) {
  const image = await decode(path);
  try { return await use(image); } finally { URL.revokeObjectURL(image.url); }
}

const imageCache = new Map<string, Promise<LoadedImage>>();
const MAX_CACHED_IMAGES = 40;

export function loadImage(path: string): Promise<LoadedImage> {
  let entry = imageCache.get(path);
  if (entry) { imageCache.delete(path); imageCache.set(path, entry); return entry; }
  entry = decode(path);
  entry.catch(() => imageCache.delete(path));
  imageCache.set(path, entry);
  while (imageCache.size > MAX_CACHED_IMAGES) {
    const [oldest, promise] = imageCache.entries().next().value!;
    imageCache.delete(oldest); promise.then((img) => URL.revokeObjectURL(img.url)).catch(() => undefined);
  }
  return entry;
}

export function useImage(path?: string) {
  const [image, setImage] = useState<LoadedImage>();
  useEffect(() => {
    let alive = true; setImage(undefined);
    if (path) loadImage(path).then((img) => { if (alive) setImage(img); }).catch(() => undefined);
    return () => { alive = false; };
  }, [path]);
  return image;
}

const cueCache = new Map<string, Promise<Cue[]>>();
export function loadCues(path: string) { let entry = cueCache.get(path); if (!entry) { entry = api().readSubtitles(path); entry.catch(() => cueCache.delete(path)); cueCache.set(path, entry); } return entry; }
export function invalidateCues() { cueCache.clear(); }

const durationCache = new Map<string, Promise<number>>();
export function loadDuration(path: string) { let entry = durationCache.get(path); if (!entry) { entry = api().getDuration(path); entry.catch(() => durationCache.delete(path)); durationCache.set(path, entry); } return entry; }

export function useAsync<T>(factory: (() => Promise<T>) | undefined, deps: unknown[]) {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let alive = true; setValue(undefined);
    factory?.().then((result) => { if (alive) setValue(result); }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
