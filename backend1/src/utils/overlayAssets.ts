import fs from 'fs';
import path from 'path';

/** Extensions allowed for timeline overlay uploads (images + short video clips). */
export const OVERLAY_ASSET_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
] as const;

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-m4v': '.m4v',
};

const ALLOWED_EXT_SET = new Set<string>(OVERLAY_ASSET_EXTENSIONS);

/**
 * Choose a stable on-disk extension from multipart metadata.
 */
export function extensionForOverlayUpload(mimetype: string | undefined, originalname: string | undefined): string | null {
  const fromName = originalname ? path.extname(originalname).toLowerCase() : '';
  if (fromName && ALLOWED_EXT_SET.has(fromName)) {
    return fromName === '.jpeg' ? '.jpg' : fromName;
  }
  const mt = (mimetype || '').split(';')[0].trim().toLowerCase();
  if (mt && MIME_TO_EXT[mt]) {
    return MIME_TO_EXT[mt];
  }
  return null;
}

export function removeExistingOverlayFiles(sessionDir: string, assetId: string): void {
  if (!fs.existsSync(sessionDir)) return;
  for (const ext of OVERLAY_ASSET_EXTENSIONS) {
    const p = path.join(sessionDir, `${assetId}${ext}`);
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        fs.unlinkSync(p);
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Resolve overlay media path: prefer explicit clip path if it exists, else first matching file in session dir.
 */
export function resolveSessionOverlayPath(
  imageUploadDir: string,
  audioSessionId: string,
  clipPath: string | undefined,
  assetId: string
): string {
  if (clipPath) {
    if (fs.existsSync(clipPath)) return clipPath;
    if (!path.isAbsolute(clipPath)) {
      const rel = path.join(process.cwd(), clipPath);
      if (fs.existsSync(rel)) return rel;
    }
  }
  const sessionDir = path.join(imageUploadDir, audioSessionId);
  for (const ext of OVERLAY_ASSET_EXTENSIONS) {
    const p = path.join(sessionDir, `${assetId}${ext}`);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return clipPath ?? path.join(sessionDir, `${assetId}.png`);
}

export function mimeForOverlayFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mime: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
  };
  return mime[ext] ?? 'application/octet-stream';
}
