import fs from 'fs';
import path from 'path';
import type { HttpContext, HandlerResult } from '../utils/http';
import { fileResponse, jsonResponse } from '../utils/http';

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
};

const AUDIO_ASSETS_DIR = path.join(process.cwd(), 'storage', 'audio_assets');
const MUSIC_DIR = path.join(AUDIO_ASSETS_DIR, 'music');
const SFX_DIR = path.join(AUDIO_ASSETS_DIR, 'sfx');
const REFERENCE_AUDIO_DIR = path.join(process.cwd(), 'storage', 'reference_audio');

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);

type AudioAsset = {
  filename: string;
  path: string; // relative path from storage/
  size: number;
  updatedAt: string;
};

function listAudioAssetsIn(dir: string, subdir: 'music' | 'sfx'): AudioAsset[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const assets: AudioAsset[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!AUDIO_EXTS.has(ext)) continue;
    const fullPath = path.join(dir, entry.name);
    const stat = fs.statSync(fullPath);
    assets.push({
      filename: entry.name,
      path: path.join('audio_assets', subdir, entry.name).replace(/\\/g, '/'),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    });
  }

  return assets;
}

/** Stream `storage/audio_assets/...` for editor Web Audio. Query: `path=audio_assets/music/foo.mp3`. */
export async function serveAudioAssetFile(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const rawPath = ctx.query?.path ?? ctx.query?.p;
    if (!rawPath || typeof rawPath !== 'string') {
      return jsonResponse(400, { error: 'Missing path query (path=audio_assets/music/...)' });
    }
    let normalized = rawPath.replace(/\\/g, '/').trim();
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // keep normalized as-is
    }
    normalized = normalized.replace(/^\/+/, '');
    if (!normalized.startsWith('audio_assets/')) {
      return jsonResponse(400, { error: 'Path must start with audio_assets/' });
    }
    if (normalized.includes('..')) {
      return jsonResponse(400, { error: 'Invalid path' });
    }
    const parts = normalized.split('/').filter(Boolean);
    const fullPath = path.resolve(process.cwd(), 'storage', ...parts);
    const resolvedRoot = path.resolve(process.cwd(), 'storage', 'audio_assets');
    const relToRoot = path.relative(resolvedRoot, fullPath);
    if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
      return jsonResponse(400, { error: 'Invalid path' });
    }
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return jsonResponse(404, { error: 'File not found' });
    }
    const ext = path.extname(fullPath).toLowerCase();
    if (!AUDIO_EXTS.has(ext)) {
      return jsonResponse(400, { error: 'Unsupported audio type' });
    }
    const buf = await fs.promises.readFile(fullPath);
    const ct = AUDIO_MIME[ext] ?? 'application/octet-stream';
    return fileResponse(200, buf, ct, {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to serve audio asset',
    });
  }
}

export async function listMusicAssets(_ctx: HttpContext): Promise<HandlerResult> {
  try {
    const assets = listAudioAssetsIn(MUSIC_DIR, 'music');
    console.log('[Audio Assets] list music', { count: assets.length });
    return jsonResponse(200, { success: true, assets, count: assets.length });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list music assets',
    });
  }
}

export async function listSfxAssets(_ctx: HttpContext): Promise<HandlerResult> {
  try {
    const assets = listAudioAssetsIn(SFX_DIR, 'sfx');
    console.log('[Audio Assets] list sfx', { count: assets.length });
    return jsonResponse(200, { success: true, assets, count: assets.length });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list SFX assets',
    });
  }
}

export async function listReferenceAudioAssets(_ctx: HttpContext): Promise<HandlerResult> {
  try {
    if (!fs.existsSync(REFERENCE_AUDIO_DIR)) {
      return jsonResponse(200, { success: true, assets: [], count: 0 });
    }
    const entries = fs.readdirSync(REFERENCE_AUDIO_DIR, { withFileTypes: true });
    const assets: AudioAsset[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!AUDIO_EXTS.has(ext)) continue;
      const fullPath = path.join(REFERENCE_AUDIO_DIR, entry.name);
      const stat = fs.statSync(fullPath);
      assets.push({
        filename: entry.name,
        path: path.join('reference_audio', entry.name).replace(/\\/g, '/'),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }
    assets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    console.log('[Audio Assets] list reference_audio', { count: assets.length });
    return jsonResponse(200, { success: true, assets, count: assets.length });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list reference audio assets',
    });
  }
}
