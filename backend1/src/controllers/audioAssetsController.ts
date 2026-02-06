import fs from 'fs';
import path from 'path';
import type { HttpContext, HandlerResult } from '../utils/http';
import { jsonResponse } from '../utils/http';

const AUDIO_ASSETS_DIR = path.join(process.cwd(), 'storage', 'audio_assets');
const MUSIC_DIR = path.join(AUDIO_ASSETS_DIR, 'music');
const SFX_DIR = path.join(AUDIO_ASSETS_DIR, 'sfx');

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
