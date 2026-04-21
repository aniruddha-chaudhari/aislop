import fs from 'fs';
import path from 'path';

/** Prefer bundled assets under storage (where you drop PNG/WebP portraits). */
const CANDIDATES = [
  path.join(process.cwd(), 'storage', 'character_images'),
  path.join(process.cwd(), 'src', 'character_images'),
  path.join(process.cwd(), 'character_images'),
  path.resolve(__dirname, '..', '..', 'character_images'),
];

const NAMES: Record<string, string> = {
  /** Legacy duo asset lives under prescaled/ in storage. */
  Stewie: path.join('prescaled', 'Stewie_500x600.png'),
  Peter: 'peter.png',
  /** Single-speaker mode: same portrait set as Peter (one face on screen). */
  Narrator: 'peter.png',
};
const PLACEHOLDER_FILENAME = 'placeholder.png';

/** Emotion filenames under storage/character_images (shared by Peter + Narrator). */
const PETER_EMOTION_VARIANTS: Record<string, string> = {
  neutral: 'peter.png',
  talking: 'peter.png',
  happy: 'peter_happy.png',
  sad: 'peter_sad.png',
  angry: 'peter_angry.png',
  excited: 'peter_excited.png',
  thinking: 'peter_thinking.webp',
  confused: 'peter_surprised.png',
  surprised: 'peter_surprised.png',
};

/** Allowed `emotion` strings for timeline clips / AI labeling (matches portrait filenames). */
export const SUPPORTED_CHARACTER_EMOTIONS: ReadonlyArray<string> = Object.freeze(Object.keys(PETER_EMOTION_VARIANTS));

/**
 * Optional per-character emotion variants.
 * Narrator reuses Peter assets so single-voice reels get one expressive character.
 */
const EMOTION_VARIANTS: Record<string, Record<string, string>> = {
  Peter: PETER_EMOTION_VARIANTS,
  Narrator: PETER_EMOTION_VARIANTS,
};

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
  const dir = resolveDir();
  const file = NAMES[character as keyof typeof NAMES];
  if (file) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) return p;
  }
  return resolveFallbackPath(dir);
}

/**
 * Resolve character + emotion to an image path.
 *
 * This is a higher-level helper that first tries to find a specific
 * emotion variant for the character (for example "Peter" + "happy"
 * → "peter_happy.png"). If that file does not exist it falls back to
 * the base character image and finally to the generic placeholder.
 *
 * The existing getCharacterImagePath API remains unchanged and can be
 * used when you only care about the character, not the emotion.
 */
export function getCharacterClipImagePath(clip: { character: string; emotion?: string | null }): string | null {
  return getCharacterEmotionImagePath(clip.character, clip.emotion);
}

export function getCharacterEmotionImagePath(character: string, emotion?: string | null): string | null {
  const dir = resolveDir();

  if (emotion) {
    const variantsForCharacter = EMOTION_VARIANTS[character];
    const emotionFilename =
      variantsForCharacter?.[emotion] ??
      // Accept loose labels like "excited" by mapping them to a talking variant.
      (emotion === 'excited' || emotion === 'angry' ? variantsForCharacter?.['talking'] : undefined);

    if (emotionFilename) {
      const emotionPath = path.join(dir, emotionFilename);
      if (fs.existsSync(emotionPath)) {
        return emotionPath;
      }
    }
  }

  return getCharacterImagePath(character);
}

/**
 * All supported character names that have images.
 */
export const CHARACTER_NAMES = Object.keys(NAMES);
