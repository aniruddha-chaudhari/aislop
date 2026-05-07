import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  MusicClip,
  OverlayClip,
  Project,
  SfxClip,
  Track,
} from '../schema/project';
import { resolveSessionOverlayPath } from '../utils/overlayAssets';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * Bump this (or set PREVIEW_RENDERER_VERSION) when preview rendering behavior changes
 * and old cached preview artifacts should be invalidated.
 */
const PREVIEW_RENDERER_VERSION = process.env.PREVIEW_RENDERER_VERSION || 'renderer-v11-subs-after-composite-single-fps';
const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'images');

function toStableJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toStableJsonValue(item));
  }
  if (typeof value === 'object') {
    const out: { [key: string]: JsonValue } = {};
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      const v = obj[key];
      if (typeof v === 'undefined') continue;
      out[key] = toStableJsonValue(v);
    }
    return out;
  }
  return String(value);
}

/**
 * Cheap, content-sensitive fingerprint of a file: `size:mtimeMs`.
 * Editing/replacing a file (e.g. uploading a new image into the same overlay slot)
 * changes mtime even if the path stays the same, which busts the preview cache.
 */
function fingerprintFile(filePath: string | null | undefined): string {
  if (!filePath) return 'missing';
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return 'not-a-file';
    return `${stat.size}:${Math.floor(stat.mtimeMs)}`;
  } catch {
    return 'error';
  }
}

function resolvePotentiallyRelative(p: string): string {
  if (!p) return p;
  if (path.isAbsolute(p) && fs.existsSync(p)) return p;
  if (fs.existsSync(p)) return p;
  return path.join(process.cwd(), p);
}

/**
 * Collect a stable map of asset fingerprints referenced by the project so
 * the preview hash reflects on-disk asset content, not just the timeline JSON.
 */
function collectAssetFingerprints(project: Project): Record<string, string> {
  const fingerprints: Record<string, string> = {};

  if (project.template?.path) {
    const resolved = resolvePotentiallyRelative(project.template.path);
    fingerprints[`template:${project.template.path}`] = fingerprintFile(resolved);
  }

  const tracks = (project.timeline?.tracks ?? []) as Track[];
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.kind === 'overlay') {
        const overlay = clip as OverlayClip;
        const resolved = resolveSessionOverlayPath(
          IMAGE_UPLOAD_DIR,
          project.audioSessionId,
          overlay.path,
          overlay.assetId,
          project.id,
        );
        fingerprints[`overlay:${overlay.assetId}`] = fingerprintFile(resolved);
      } else if (clip.kind === 'music') {
        const music = clip as MusicClip;
        if (music.path) {
          const resolved = resolvePotentiallyRelative(music.path);
          fingerprints[`music:${music.path}`] = fingerprintFile(resolved);
        }
      } else if (clip.kind === 'sfx') {
        const sfx = clip as SfxClip;
        if (sfx.path) {
          const resolved = resolvePotentiallyRelative(sfx.path);
          fingerprints[`sfx:${sfx.path}`] = fingerprintFile(resolved);
        }
      }
    }
  }

  return fingerprints;
}

export function computeTimelineHash(project: Project): string {
  const fingerprint = {
    rendererVersion: PREVIEW_RENDERER_VERSION,
    projectId: project.id,
    format: project.format,
    audioSessionId: project.audioSessionId,
    template: {
      type: project.template?.type ?? null,
      path: project.template?.path ?? null,
      videoStart: project.template?.videoStart ?? 0,
    },
    timeline: project.timeline ?? { duration: 0, tracks: [] },
    assetFingerprints: collectAssetFingerprints(project),
  };

  const stable = JSON.stringify(toStableJsonValue(fingerprint));
  return createHash('sha1').update(stable).digest('hex');
}

export function getPreviewVersion(project: Project): { timelineHash: string; shortVersion: string } {
  const timelineHash = computeTimelineHash(project);
  return {
    timelineHash,
    shortVersion: timelineHash.slice(0, 16),
  };
}
