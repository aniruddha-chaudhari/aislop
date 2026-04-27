import { createHash } from 'crypto';
import type { Project } from '../schema/project';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * Bump this (or set PREVIEW_RENDERER_VERSION) when preview rendering behavior changes
 * and old cached preview artifacts should be invalidated.
 */
const PREVIEW_RENDERER_VERSION = process.env.PREVIEW_RENDERER_VERSION || 'renderer-v5-normalized-all-overlay-timestamps';

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
