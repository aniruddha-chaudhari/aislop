import type { OverlayClip } from './types';

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(?:$|[?#])/i;
const STILL_EXT = /\.(png|jpe?g|webp|gif|bmp|avif)(?:$|[?#])/i;

export type OverlayMediaKind = 'image' | 'video';

export function pathLooksLikeVideo(path: string | undefined): boolean {
  const p = path?.trim();
  if (!p) return false;
  return VIDEO_EXT.test(p);
}

export function pathLooksLikeStill(path: string | undefined): boolean {
  const p = path?.trim();
  if (!p) return false;
  return STILL_EXT.test(p);
}

/** Infer image vs video from clip metadata (path, label/filename, persisted mediaKind). */
export function isOverlayClipVideo(clip: Pick<OverlayClip, 'path' | 'label' | 'mediaKind'>): boolean {
  if (clip.mediaKind === 'video') return true;
  if (clip.mediaKind === 'image') return false;
  for (const hint of [clip.path, clip.label]) {
    if (!hint?.trim()) continue;
    if (pathLooksLikeVideo(hint)) return true;
    if (pathLooksLikeStill(hint)) return false;
  }
  return false;
}

export function mediaKindFromFilename(filename: string | undefined): OverlayMediaKind | undefined {
  if (!filename?.trim()) return undefined;
  if (pathLooksLikeVideo(filename)) return 'video';
  if (pathLooksLikeStill(filename)) return 'image';
  return undefined;
}

/** HEAD request fallback when path/label lack a file extension (e.g. assetId-only clips). */
export async function probeOverlayUrlIsVideo(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const ct = (res.headers.get('Content-Type') || '').toLowerCase();
    if (ct.startsWith('video/')) return true;
    if (ct.startsWith('image/')) return false;
  } catch {
    // ignore
  }
  return false;
}
