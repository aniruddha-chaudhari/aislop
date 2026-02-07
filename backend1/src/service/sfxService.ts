import fs from 'fs';
import path from 'path';
import type { OverlayClip, SubtitleClip, Track } from '../schema/project';
import { generateSFXPlanWithResearch, parseOpenCodeJSON } from '../agents/gemini3agent';

type SfxAsset = {
  filename: string;
  description: string;
  durationSeconds?: number | null;
  filePath: string;
};

type SfxTrackClip = {
  id: string;
  kind: 'sfx';
  start: number;
  duration?: number;
  path: string;
  volume?: number;
};

type AiSfxSuggestion = {
  timestamp?: number | string;
  start?: number | string;
  time?: number | string;
  sfxType?: string;
  type?: string;
  description?: string;
  volume?: number | string;
  duration?: number | string;
};

function parseDurationSeconds(text?: string): number | null {
  if (!text) return null;
  const match = text.match(/([\d.]+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function normalizeText(text: string): string {
  return text.toLowerCase();
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const idx = Math.floor(Math.random() * items.length);
  return items[idx] ?? null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/-?[\d.]+/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function overlapScore(query: string, candidate: string): number {
  const q = new Set(tokenize(query));
  const c = tokenize(candidate);
  let score = 0;
  for (const token of c) {
    if (q.has(token)) score += 1;
  }
  return score;
}

async function loadSfxAssets(): Promise<SfxAsset[]> {
  try {
    const { PrismaClient } = await import('../generated/prisma');
    const prisma = new PrismaClient();
    const sfxModel = (prisma as any).sfxAsset;
    if (sfxModel?.findMany) {
      const rows = await sfxModel.findMany();
      await prisma.$disconnect();
      if (rows.length > 0) {
        return rows.map((r: any) => ({
          filename: r.filename,
          description: r.description,
          durationSeconds: r.durationSeconds ?? null,
          filePath: r.filePath,
        }));
      }
    } else {
      await prisma.$disconnect();
    }
  } catch (_) {
    // fall back to JSON file
  }

  const jsonPath = path.join(process.cwd(), 'storage', 'audio_assets', 'sfx', 'sfx.json');
  if (!fs.existsSync(jsonPath)) return [];
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const entries = JSON.parse(raw) as Array<{ fileName: string; description: string; duration?: string }>;
    return entries.map((e) => ({
      filename: e.fileName,
      description: e.description,
      durationSeconds: parseDurationSeconds(e.duration),
      filePath: path.join('audio_assets', 'sfx', e.fileName).replace(/\\/g, '/'),
    }));
  } catch {
    return [];
  }
}

function categorizeAssets(assets: SfxAsset[]) {
  const whoosh = assets.filter((a) => {
    const t = normalizeText(`${a.filename} ${a.description}`);
    return t.includes('whoosh') || t.includes('woosh') || t.includes('swish') || t.includes('sweep');
  });
  const pop = assets.filter((a) => {
    const t = normalizeText(`${a.filename} ${a.description}`);
    return t.includes('pop') || t.includes('ding') || t.includes('click') || t.includes('chime') || t.includes('bell');
  });
  const neutral = assets;
  return { whoosh, pop, neutral };
}

function getBucketFromHint(
  hint: string,
  buckets: ReturnType<typeof categorizeAssets>
): SfxAsset[] {
  const h = normalizeText(hint);
  const isWhoosh = h.includes('whoosh') || h.includes('woosh') || h.includes('swish') || h.includes('sweep');
  const isPop = h.includes('pop') || h.includes('ding') || h.includes('click') || h.includes('chime') || h.includes('bell') || h.includes('blip');
  if (isWhoosh && buckets.whoosh.length > 0) return buckets.whoosh;
  if (isPop && buckets.pop.length > 0) return buckets.pop;
  return buckets.neutral;
}

function pickBestAssetForSuggestion(
  suggestion: AiSfxSuggestion,
  buckets: ReturnType<typeof categorizeAssets>
): SfxAsset | null {
  const hint = `${suggestion.sfxType ?? ''} ${suggestion.type ?? ''} ${suggestion.description ?? ''}`.trim();
  const candidatePool = getBucketFromHint(hint, buckets);
  if (candidatePool.length === 0) return null;

  let best: SfxAsset | null = null;
  let bestScore = -1;
  for (const asset of candidatePool) {
    const score = overlapScore(hint, `${asset.filename} ${asset.description}`);
    if (score > bestScore) {
      best = asset;
      bestScore = score;
    }
  }

  if (best && bestScore > 0) return best;
  return pickRandom(candidatePool);
}

function extractAiSuggestions(parsed: unknown): AiSfxSuggestion[] {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed as AiSfxSuggestion[];
  if (typeof parsed !== 'object') return [];

  const obj = parsed as Record<string, unknown>;
  const directKeys = ['suggestions', 'sfx', 'effects', 'items', 'soundEffects', 'plan'];

  for (const key of directKeys) {
    const value = obj[key];
    if (Array.isArray(value)) return value as AiSfxSuggestion[];
  }

  return [];
}

function ensureMinGap(
  start: number,
  lastTime: number,
  minGapSec: number
): boolean {
  return start - lastTime >= minGapSec;
}

async function generateAiSfxClips(params: {
  topic: string;
  overlayClips: OverlayClip[];
  subtitleClips?: SubtitleClip[];
  duration: number;
  buckets: ReturnType<typeof categorizeAssets>;
}): Promise<SfxTrackClip[]> {
  const sortedOverlays = [...params.overlayClips].sort((a, b) => a.start - b.start);
  const overlayTimings = sortedOverlays.slice(0, 16).map((clip) => ({
    start: clip.start,
    description: clip.label || clip.assetId || 'overlay transition',
  }));

  if (overlayTimings.length === 0 && params.subtitleClips && params.subtitleClips.length > 0) {
    const sortedSubs = [...params.subtitleClips].sort((a, b) => a.start - b.start);
    for (const sub of sortedSubs.slice(0, 8)) {
      overlayTimings.push({
        start: sub.start,
        description: `subtitle: ${sub.text.slice(0, 40)}`,
      });
    }
  }

  if (overlayTimings.length === 0 || params.buckets.neutral.length === 0) return [];

  try {
    const aiOutput = await generateSFXPlanWithResearch(params.topic, overlayTimings);
    const parsed = parseOpenCodeJSON<unknown>(aiOutput);
    const suggestions = extractAiSuggestions(parsed);

    if (suggestions.length === 0) {
      console.log('[SFX Plan] AI returned no parseable suggestions; using fallback');
      return [];
    }

    const clips: SfxTrackClip[] = [];
    let lastTime = -999;
    const maxClips = 6;
    const minGapSec = 3.5;

    const sorted = [...suggestions].sort((a, b) => {
      const ta = toNumber(a.timestamp) ?? toNumber(a.start) ?? toNumber(a.time) ?? 0;
      const tb = toNumber(b.timestamp) ?? toNumber(b.start) ?? toNumber(b.time) ?? 0;
      return ta - tb;
    });

    for (const suggestion of sorted) {
      if (clips.length >= maxClips) break;

      const rawStart = toNumber(suggestion.timestamp) ?? toNumber(suggestion.start) ?? toNumber(suggestion.time) ?? 0;
      const start = clamp(rawStart, 0, Math.max(0, params.duration - 0.01));
      if (!ensureMinGap(start, lastTime, minGapSec)) continue;

      const asset = pickBestAssetForSuggestion(suggestion, params.buckets);
      if (!asset) continue;

      const volume = clamp(toNumber(suggestion.volume) ?? 0.78, 0.2, 1.0);
      const duration = clamp(toNumber(suggestion.duration) ?? asset.durationSeconds ?? 1, 0.15, 4);

      clips.push({
        id: `sfx_${clips.length + 1}`,
        kind: 'sfx',
        start,
        duration,
        path: asset.filePath,
        volume,
      });
      lastTime = start;
    }

    console.log('[SFX Plan] AI generated clips', { requested: suggestions.length, accepted: clips.length });
    return clips;
  } catch (error) {
    console.warn('[SFX Plan] AI generation failed, using fallback', {
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function generateSfxTrack(params: {
  topic?: string;
  overlayClips: OverlayClip[];
  subtitleClips?: SubtitleClip[];
  duration: number;
}): Promise<Track> {
  const assets = await loadSfxAssets();
  const buckets = categorizeAssets(assets);

  let clips = await generateAiSfxClips({
    topic: params.topic || 'Educational short video',
    overlayClips: params.overlayClips,
    subtitleClips: params.subtitleClips,
    duration: params.duration,
    buckets,
  });

  return {
    id: 't_sfx',
    type: 'sfx',
    name: 'SFX',
    clips,
  };
}
