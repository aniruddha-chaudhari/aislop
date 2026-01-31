import fs from 'fs';
import path from 'path';

const CANDIDATES = [
  path.join(process.cwd(), 'src', 'character_images'),
  path.join(process.cwd(), 'character_images'),
  path.resolve(__dirname, '..', '..', 'character_images'),
];

const NAMES: Record<string, string> = {
  Stewie: 'Stewie_Griffin.png',
  Peter: 'peter.png',
};

let _dir: string | null = null;

function resolveDir(): string {
  if (_dir != null) return _dir;
  for (const dir of CANDIDATES) {
    const stewie = path.join(dir, NAMES.Stewie);
    const peter = path.join(dir, NAMES.Peter);
    if (fs.existsSync(stewie) && fs.existsSync(peter)) {
      _dir = dir;
      return _dir;
    }
  }
  _dir = CANDIDATES[0];
  return _dir;
}

/**
 * Resolve character name to image path. Returns null if not found.
 */
export function getCharacterImagePath(character: string): string | null {
  const file = NAMES[character as keyof typeof NAMES];
  if (!file) return null;
  const p = path.join(resolveDir(), file);
  return fs.existsSync(p) ? p : null;
}

/**
 * All supported character names that have images.
 */
export const CHARACTER_NAMES = Object.keys(NAMES);
