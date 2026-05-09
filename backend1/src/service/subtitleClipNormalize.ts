import type { SubtitleClip } from '../schema/project';

const MIN_WORD_SEC = 0.02;
const MIN_GAP_SEC = 0.001;
/** Small delay so karaoke highlight does not flash before the waveform; keep tiny to avoid visible lag. */
const DEFAULT_KARAOKE_SYNC_DELAY_SEC = 0.02;

/** Minimum clip length (seconds); exported for subtitle draft generation */
export const MIN_SUBTITLE_CLIP_DURATION = 0.05;

/**
 * WhisperX can return overlapping word ranges; karaoke ASS assumes time order.
 * Sort by start and enforce strictly increasing non-overlapping segments inside the clip.
 */
export function normalizeWordsInClip(
  words: Array<{ word: string; start: number; end: number }>,
  clipDuration: number
): Array<{ word: string; start: number; end: number }> {
  if (!words.length || !Number.isFinite(clipDuration) || clipDuration < MIN_SUBTITLE_CLIP_DURATION) {
    return words;
  }
  const sorted = [...words].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Array<{ word: string; start: number; end: number }> = [];
  let prevEnd = 0;
  for (const w of sorted) {
    let s = Math.max(0, w.start, prevEnd + MIN_GAP_SEC);
    let e = Math.max(s + MIN_WORD_SEC, w.end);
    e = Math.min(e, clipDuration);
    s = Math.min(s, Math.max(0, e - MIN_WORD_SEC));
    if (e <= s + MIN_WORD_SEC / 2) continue;
    out.push({ word: w.word, start: s, end: e });
    prevEnd = e;
  }
  return out;
}

/**
 * Adjacent sentence clips from Whisper can overlap on the timeline; ASS then shows
 * two karaoke lines at once (e.g. next phrase on top while the previous is still on bottom).
 * Push each clip to start no earlier than the previous clip's end; preserve each clip's
 * absolute end time and remap word timestamps into the new window.
 */
export function fixSubtitleClipsTimelineNonOverlap(clips: SubtitleClip[]): SubtitleClip[] {
  if (clips.length === 0) return clips;
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  let prevEnd = 0;
  const result: SubtitleClip[] = [];
  for (const clip of sorted) {
    const clipEnd = clip.start + clip.duration;
    const newStart = Math.max(clip.start, prevEnd);
    const newDuration = Math.max(MIN_SUBTITLE_CLIP_DURATION, clipEnd - newStart);
    const shift = newStart - clip.start;
    let words = clip.words;
    if (words && words.length > 0) {
      words = words.map((w) => ({
        word: w.word,
        start: w.start - shift,
        end: w.end - shift,
      }));
      words = words.filter((w) => w.end > MIN_WORD_SEC && w.start < newDuration + 1e-6);
      words = normalizeWordsInClip(words, newDuration);
    }
    result.push({
      ...clip,
      start: newStart,
      duration: newDuration,
      ...(words && words.length > 0 ? { words } : {}),
    });
    prevEnd = newStart + newDuration;
  }
  return result;
}

/**
 * Clamp subtitle clips (and their word timings) to a total timeline duration.
 * This prevents ASS events beyond the rendered audio/video length, which can
 * manifest as "skipped" subtitles depending on the player/filter.
 */
export function clampSubtitleClipsToTimelineDuration(
  clips: SubtitleClip[],
  timelineDuration: number
): SubtitleClip[] {
  if (!clips.length) return clips;
  if (!Number.isFinite(timelineDuration) || timelineDuration <= 0) return clips;

  const out: SubtitleClip[] = [];
  for (const clip of clips) {
    if (!Number.isFinite(clip.start) || !Number.isFinite(clip.duration)) continue;
    if (clip.start >= timelineDuration) continue;

    const maxDur = Math.max(0, timelineDuration - clip.start);
    const newDuration = Math.min(clip.duration, maxDur);
    if (newDuration < MIN_SUBTITLE_CLIP_DURATION) continue;

    let words = clip.words;
    if (words && words.length > 0) {
      words = words.filter((w) => w.end > 0 && w.start < newDuration + 1e-6);
      words = words.map((w) => ({
        word: w.word,
        start: Math.max(0, Math.min(w.start, newDuration)),
        end: Math.max(0, Math.min(w.end, newDuration)),
      }));
      words = normalizeWordsInClip(words, newDuration);
      if (!words.length) words = undefined;
    }

    out.push({
      ...clip,
      duration: newDuration,
      ...(words ? { words } : {}),
    });
  }

  return out;
}

/** Keep one karaoke Dialogue line inside its subtitle clip so it cannot bleed into the next clip. */
export function clampAssEventToClip(
  start: number,
  end: number,
  clipStart: number,
  clipDuration: number,
  syncDelaySec: number = DEFAULT_KARAOKE_SYNC_DELAY_SEC
): { start: number; end: number } {
  const c1 = clipStart + clipDuration;
  const delayedStart = start + syncDelaySec;
  const delayedEnd = end + syncDelaySec;
  let s = Math.min(Math.max(delayedStart, clipStart), c1 - 0.04);
  let e = Math.min(Math.max(delayedEnd, s + 0.04), c1);
  if (e <= s) e = Math.min(c1, s + 0.04);
  return { start: s, end: e };
}

/** Normalize mixed token shapes into subtitle-safe text. */
export function getSubtitleWordText(token: unknown): string {
  if (typeof token === 'string') return token.trim();
  if (!token || typeof token !== 'object') return '';
  const rec = token as Record<string, unknown>;
  if (typeof rec.word === 'string') return rec.word.trim();
  if (typeof rec.text === 'string') return rec.text.trim();
  if (typeof rec.value === 'string') return rec.value.trim();
  return '';
}

type TimeRange = { start: number; end: number };

function mergeTimeRanges(ranges: TimeRange[]): TimeRange[] {
  if (!ranges.length) return [];
  const sorted = [...ranges]
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
  for (const r of sorted) {
    if (!out.length || r.start > out[out.length - 1].end) out.push({ ...r });
    else out[out.length - 1].end = Math.max(out[out.length - 1].end, r.end);
  }
  return out;
}

function subtractRangesFromInterval(start: number, end: number, blocks: TimeRange[]): TimeRange[] {
  if (end <= start) return [];
  const merged = mergeTimeRanges(blocks);
  if (!merged.length) return [{ start, end }];
  const out: TimeRange[] = [];
  let x = start;
  for (const b of merged) {
    if (b.end <= start) continue;
    if (b.start >= end) break;
    const bs = Math.max(b.start, start);
    const be = Math.min(b.end, end);
    if (x < bs) out.push({ start: x, end: bs });
    x = Math.max(x, be);
    if (x >= end) break;
  }
  if (x < end) out.push({ start: x, end });
  return out;
}

/**
 * Remove subtitle visibility inside excluded time ranges (e.g. replace overlays or animation overlays).
 * This does NOT shift later subtitles: it splits clips around the excluded windows.
 */
export function excludeSubtitleClipsInRanges(clips: SubtitleClip[], excludedRanges: TimeRange[]): SubtitleClip[] {
  if (!clips.length || !excludedRanges.length) return clips;
  const blocks = mergeTimeRanges(excludedRanges);
  if (!blocks.length) return clips;

  const out: SubtitleClip[] = [];
  for (const clip of clips) {
    const cs = clip.start;
    const ce = clip.start + clip.duration;
    const parts = subtractRangesFromInterval(cs, ce, blocks).filter((p) => p.end - p.start >= MIN_SUBTITLE_CLIP_DURATION);
    if (!parts.length) continue;

    // Precompute word timestamps in absolute time for splitting.
    const absWords =
      clip.words && clip.words.length
        ? clip.words.map((w) => ({
            word: w.word,
            absStart: clip.start + w.start,
            absEnd: clip.start + w.end,
          }))
        : null;

    parts.forEach((p, i) => {
      const duration = p.end - p.start;
      let words: SubtitleClip['words'] = undefined;
      let text = clip.text;
      if (absWords) {
        const clippedAbs = absWords
          .filter((w) => w.absEnd > p.start && w.absStart < p.end)
          .map((w) => ({
            word: w.word,
            start: Math.max(0, w.absStart - p.start),
            end: Math.min(duration, Math.max(0.01, w.absEnd - p.start)),
          }))
          .filter((w) => w.end > 0.01 && w.start < duration + 1e-6);
        const normalized = normalizeWordsInClip(clippedAbs, duration);
        if (normalized.length) words = normalized;
        // Critical: avoid repeating muted words after replace/animation.
        // Rebuild the visible text from the words that actually survive in this part.
        text = normalized.map((w) => w.word).join(' ').trim() || clip.text;
      } else if (parts.length > 1) {
        // No word timings → we cannot safely trim text for post-mute segments.
        // To avoid repeating the already-spoken text after a replace/animation, only keep the first segment.
        const isFirstPart = Math.abs(p.start - cs) < 1e-4;
        if (!isFirstPart) return;
      }

      out.push({
        ...clip,
        id: parts.length === 1 ? clip.id : `${clip.id}_nosub${i}`,
        start: p.start,
        duration,
        text,
        ...(words ? { words } : {}),
      });
    });
  }

  return out;
}
