import fs from 'fs';
import path from 'path';

const CANDIDATES = [
  path.join(process.cwd(), 'src', 'character_images'),
  path.join(process.cwd(), 'character_images'),
  path.resolve(__dirname, '..', '..', 'character_images'),
];

// Characters that are audio-only and should never resolve to a portrait image.
// For these, we return null so the rest of the pipeline can skip character overlays entirely.
const NO_IMAGE_CHARACTERS = new Set<string>(['Narrator']);

const NAMES: Record<string, string> = {
  Stewie: 'Stewie_Griffin.png',
  Peter: 'peter.png',
  Narrator: 'narrator.png',
};
const PLACEHOLDER_FILENAME = 'placeholder.png';

let _dir: string | null = null;

function resolveDir(): string {
  if (_dir != null) return _dir;
  for (const dir of CANDIDATES) {
    const hasAtLeastOneCharacterImage = Object.values(NAMES).some((filename) =>
      fs.existsSync(path.join(dir, filename))
    );
    if (hasAtLeastOneCharacterImage) {
      _dir = dir;
      return _dir;
    }
  }
  _dir = CANDIDATES[0];
  return _dir;
}

function resolveFallbackPath(dir: string): string | null {
  const placeholderPath = path.join(dir, PLACEHOLDER_FILENAME);
  if (fs.existsSync(placeholderPath)) return placeholderPath;

  for (const filename of Object.values(NAMES)) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Resolve character name to image path. Returns null if not found.
 */
export function getCharacterImagePath(character: string): string | null {
  // For narrator / voiceover-style characters we deliberately do NOT show any character image.
  if (NO_IMAGE_CHARACTERS.has(character)) {
    return null;
  }

  const dir = resolveDir();
  const file = NAMES[character as keyof typeof NAMES];
  if (file) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) return p;
  }
  return resolveFallbackPath(dir);
}

/**
 * All supported character names that have images.
 */
export const CHARACTER_NAMES = Object.keys(NAMES);
