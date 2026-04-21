import type { CharacterClip } from '../schema/project';

export type TimeRange = { start: number; end: number };

function mergeTimeRanges(ranges: TimeRange[]): TimeRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
  for (const r of sorted) {
    if (!out.length || r.start > out[out.length - 1].end) {
      out.push({ start: r.start, end: r.end });
    } else {
      out[out.length - 1].end = Math.max(out[out.length - 1].end, r.end);
    }
  }
  return out;
}

/** Returns sub-intervals of [start, end] that are not covered by `blocks` (merged internally). */
function subtractTimeRangesFromInterval(start: number, end: number, blocks: TimeRange[]): TimeRange[] {
  if (end <= start) return [];
  if (blocks.length === 0) return [{ start, end }];
  const merged = mergeTimeRanges(blocks);
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
  const minDur = 0.04;
  return out.filter((r) => r.end - r.start >= minDur);
}

/**
 * Split character clips so nothing draws during full-frame replace (B-roll) windows.
 * Replace clips use `displayMode: 'replace'` and approved plan status — same windows as subtitle exclusion.
 */
export function expandCharacterClipsExcludingReplaceRanges(
  clips: CharacterClip[],
  replaceTimeRanges: TimeRange[]
): CharacterClip[] {
  if (!replaceTimeRanges.length || !clips.length) return clips;
  const blocks = mergeTimeRanges(replaceTimeRanges);
  const result: CharacterClip[] = [];
  for (const clip of clips) {
    const cs = clip.start;
    const ce = clip.start + clip.duration;
    const parts = subtractTimeRangesFromInterval(cs, ce, blocks);
    if (parts.length === 0) continue;
    if (
      parts.length === 1 &&
      Math.abs(parts[0].start - cs) < 1e-4 &&
      Math.abs(parts[0].end - ce) < 1e-4
    ) {
      result.push(clip);
      continue;
    }
    parts.forEach((p, i) => {
      result.push({
        ...clip,
        id: parts.length === 1 ? clip.id : `${clip.id}_norpl${i}`,
        start: p.start,
        duration: p.end - p.start,
      });
    });
  }
  return result;
}

type Bucket = 'stewie' | 'peter' | 'other';

function characterBucket(character: string): Bucket {
  if (character === 'Stewie') return 'stewie';
  if (character === 'Peter' || character === 'Narrator') return 'peter';
  return 'other';
}

export type CharacterOverlayGeometry = {
  stewie: { x: number; y: number; w: number; h: number };
  peter: { x: number; y: number; w: number; h: number };
  other: { x: number; y: number; w: number; h: number };
};

/**
 * One scaled overlay per character clip so different emotions / assets can show per dialogue.
 */
export function appendCharacterClipsToFilterComplex(params: {
  charInputs: { clip: CharacterClip; inputIndex: number }[];
  lastLabel: string;
  geom: CharacterOverlayGeometry;
  labelPrefix: string;
}): { extraFilter: string; lastLabel: string } {
  const { charInputs, geom, labelPrefix } = params;
  let cur = params.lastLabel;
  if (charInputs.length === 0) return { extraFilter: '', lastLabel: cur };

  let extra = '';
  charInputs.forEach(({ clip, inputIndex }, i) => {
    const b = characterBucket(clip.character);
    const g = geom[b];
    const t0 = clip.start.toFixed(3);
    const t1 = (clip.start + clip.duration).toFixed(3);
    const scaled = `${labelPrefix}_chsc_${i}`;
    const out = `${labelPrefix}_chout_${i}`;
    extra += `;[${inputIndex}:v]scale=${g.w}:${g.h}:force_original_aspect_ratio=decrease[${scaled}]`;
    extra += `;[${cur}][${scaled}]overlay=${g.x}:${g.y}:enable='between(t,${t0},${t1})'[${out}]`;
    cur = out;
  });
  return { extraFilter: extra, lastLabel: cur };
}
