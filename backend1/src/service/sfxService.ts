import fs from 'fs';
import path from 'path';
import type { OverlayClip, SubtitleClip, Track } from '../schema/project';

type SfxAsset = {
  filename: string;
  description: string;
  durationSeconds?: number | null;
  filePath: string;
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

function ensureMinGap(
  start: number,
  lastTime: number,
  minGapSec: number
): boolean {
  return start - lastTime >= minGapSec;
}

export async function generateSfxTrack(params: {
  overlayClips: OverlayClip[];
  subtitleClips?: SubtitleClip[];
  duration: number;
}): Promise<Track> {
  const assets = await loadSfxAssets();
  const { whoosh, pop, neutral } = categorizeAssets(assets);

  const clips: Array<{
    id: string;
    kind: 'sfx';
    start: number;
    duration?: number;
    path: string;
    volume?: number;
  }> = [];

  const sortedOverlays = [...params.overlayClips].sort((a, b) => a.start - b.start);
  const minGap = 4;
  const maxClips = 6;
  let lastTime = -999;
  let toggle = 0;

  for (const clip of sortedOverlays) {
    if (clips.length >= maxClips) break;
    if (!ensureMinGap(clip.start, lastTime, minGap)) continue;

    const bucket = toggle % 2 === 0 ? pop : whoosh;
    const asset = pickRandom(bucket) ?? pickRandom(neutral);
    if (!asset) break;

    clips.push({
      id: `sfx_${clips.length + 1}`,
      kind: 'sfx',
      start: clip.start,
      duration: asset.durationSeconds ?? 1,
      path: asset.filePath,
      volume: 0.8,
    });
    lastTime = clip.start;
    toggle += 1;
  }

  // If no overlays, add a few light SFX based on subtitle cadence
  if (clips.length === 0 && params.subtitleClips && params.subtitleClips.length > 0) {
    const sortedSubs = [...params.subtitleClips].sort((a, b) => a.start - b.start);
    const maxSubs = 3;
    lastTime = -999;
    for (const sub of sortedSubs) {
      if (clips.length >= maxSubs) break;
      if (!ensureMinGap(sub.start, lastTime, 6)) continue;
      const asset = pickRandom(pop) ?? pickRandom(neutral);
      if (!asset) break;
      clips.push({
        id: `sfx_${clips.length + 1}`,
        kind: 'sfx',
        start: sub.start,
        duration: asset.durationSeconds ?? 1,
        path: asset.filePath,
        volume: 0.75,
      });
      lastTime = sub.start;
    }
  }

  return {
    id: 't_sfx',
    type: 'sfx',
    name: 'SFX',
    clips,
  };
}
