import type { CharacterClip, EditorProject, SubtitleClip } from './types';
import { inferDialogueEmotion } from './inferDialogueEmotion';
import { voiceDisplayName } from './voiceDisplayName';

function rangesOverlap(
  a: { start: number; duration: number },
  b: { start: number; duration: number }
): boolean {
  const aEnd = a.start + a.duration;
  const bEnd = b.start + b.duration;
  return a.start < bEnd && b.start < aEnd;
}

function speakersMatch(speaker: string, character: string): boolean {
  return voiceDisplayName(speaker) === voiceDisplayName(character);
}

/**
 * Same inputs FFmpeg uses conceptually: clip.emotion, else infer from dialogue text.
 * When `emotion` is absent on the clip (older timelines / manual edits), derive it from
 * the overlapping subtitle line for that speaker — matches backend aiDraftService behavior.
 */
export function resolveCharacterClipEmotion(project: EditorProject, clip: CharacterClip): string {
  const raw = clip.emotion?.trim();
  if (raw) return raw;

  for (const track of project.tracks) {
    if (track.type !== 'subtitle') continue;
    for (const c of track.clips) {
      if (c.kind !== 'subtitle') continue;
      const sub = c as SubtitleClip;
      if (!rangesOverlap(sub, clip)) continue;
      if (!speakersMatch(sub.speaker, clip.character)) continue;
      return inferDialogueEmotion(sub.text);
    }
  }

  return 'neutral';
}
