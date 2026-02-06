import type { OverlayClip } from '../schema/project';

const LEGACY_DEFAULT_X = 0.5;
const LEGACY_DEFAULT_Y = 0.65;
const LEGACY_DEFAULT_SCALE = 0.5;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Convert normalized overlay transform (x/y in 0..1, scale) to absolute pixels.
 * Preserves legacy defaults:
 *   x=0.5, y=0.65, scale=0.5 -> centered X and the legacy top-Y placement.
 */
export function computeOverlayPlacement(
  clip: Pick<OverlayClip, 'x' | 'y' | 'scale'>,
  frameWidth: number,
  frameHeight: number,
  baseWidth: number,
  baseHeight: number,
  legacyTopY: number
): { width: number; height: number; x: number; y: number } {
  const rawScale = Number(clip.scale);
  const safeScale = Number.isFinite(rawScale) ? Math.max(0.05, rawScale) : LEGACY_DEFAULT_SCALE;
  const scaleFactor = safeScale / LEGACY_DEFAULT_SCALE;

  const width = Math.max(1, Math.round(baseWidth * scaleFactor));
  const height = Math.max(1, Math.round(baseHeight * scaleFactor));

  const maxX = Math.max(0, frameWidth - width);
  const maxY = Math.max(0, frameHeight - height);

  const rawX = Number(clip.x);
  const xNorm = clamp(Number.isFinite(rawX) ? rawX : LEGACY_DEFAULT_X, 0, 1);
  const x = Math.round(xNorm * maxX);

  const rawY = Number(clip.y);
  const yNorm = clamp(Number.isFinite(rawY) ? rawY : LEGACY_DEFAULT_Y, 0, 1);
  const safeLegacyTopY = clamp(legacyTopY, 0, maxY);

  let y: number;
  if (yNorm <= LEGACY_DEFAULT_Y) {
    const ratio = LEGACY_DEFAULT_Y <= 0 ? 1 : yNorm / LEGACY_DEFAULT_Y;
    y = Math.round(ratio * safeLegacyTopY);
  } else {
    const remaining = 1 - LEGACY_DEFAULT_Y;
    const ratio = remaining <= 0 ? 1 : (yNorm - LEGACY_DEFAULT_Y) / remaining;
    y = Math.round(safeLegacyTopY + ratio * (maxY - safeLegacyTopY));
  }

  return { width, height, x, y: clamp(y, 0, maxY) };
}
