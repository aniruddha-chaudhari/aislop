import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { OverlayClip, SubtitleClip, Track } from '../schema/project';
import {
  generateHyperframesAnimationPlanWithResearch,
  generateHyperframesClipHtmlWithSkill,
  inspectHyperframesOpenCodeEnvironment,
  type HyperframesOpenCodeEnvironmentCheck,
} from '../agents/hyperframesAgent';
import { parseOpenCodeJSON, ANIMATION_GLOBAL_MOMENT_CEILING } from '../agents/opencodeagent';

const HYPERFRAMES_ROOT_DIR = path.join(process.cwd(), 'storage', 'hyperframes-animation');
const RENDERED_HYPERFRAMES_ROOT_DIR = path.join(process.cwd(), 'storage', 'rendered-hyperframes-animations');
const PLAN_FILENAME = 'hyperframes-animation-plan.json';
const REVIEW_FILENAME = 'hyperframes-animation-plan-review.json';
const OPENCODE_OUTPUT_FILENAME = 'hyperframes-animation-opencode.raw.txt';
const HYPERFRAMES_FPS = 30;
const HYPERFRAMES_WIDTH = 1080;
const HYPERFRAMES_HEIGHT = 1920;
const HYPERFRAMES_RENDER_FORMAT = 'webm';
const MAX_MOMENTS = ANIMATION_GLOBAL_MOMENT_CEILING;
const DEFAULT_OVERLAY_X = 0.5;
const DEFAULT_OVERLAY_Y = 0.65;
const DEFAULT_OVERLAY_SCALE = 1;
const RM_RETRY_ATTEMPTS = 6;
const RM_RETRY_DELAY_MS = 160;

export type AnimationMoment = {
  animationMomentId?: string;
  start: number;
  duration: number;
  type: string;
  content: string;
  subtitle?: string;
  narratorText?: string;
  displayText?: string;
  visualStyle?: string;
  motion?: string;
  layout?: string;
  emphasis?: string;
  animationPrompt?: string;
  promptText?: string;
  promptEdited?: boolean;
  colorPalette?: Record<string, unknown>;
  composition?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AnimationPlan = {
  moments: AnimationMoment[];
  videoDurationSeconds?: number;
};

export type HyperframesAnimationPlanReviewPayload = {
  projectId: string;
  topic: string;
  generatedAt: string;
  approvalState?: 'draft' | 'approved';
  approvedAt?: string;
  animationPlan: AnimationPlan;
  dialogueContext: string;
  researchSummary: string | null;
  prompts: {
    planOutput: string;
  };
  diagnostics: {
    usedAgent: string | null;
    fallbackWithoutAgent: boolean;
    usedExaResearch: boolean;
    usedExaDirection: boolean;
    usedHyperframesSkill: boolean;
    usedHyperframesCliSkill: boolean;
    usedGsapSkill: boolean;
    aiDiagnostics: unknown;
    parsedMomentCount: number;
  };
};

export type HyperframesAnimationPlanDraftResult = {
  animationPlan: AnimationPlan;
  review: HyperframesAnimationPlanReviewPayload;
  overlayTracks: Track[];
  hyperframesProjectDir: string;
  renderedProjectDir: string;
};

type AnimationColorPalette = {
  bg: string;
  primary: string;
  accent: string;
  text: string;
};

type HyperframesAnimationBudget = {
  targetMomentCount: number;
  hardMomentCap: number;
  maxAnimatedSeconds: number;
  minGapSeconds: number;
};

const FALLBACK_ANIMATION_PALETTES: AnimationColorPalette[] = [
  { bg: '#140F0C', primary: '#8E3F2A', accent: '#F0B45A', text: '#F6EEE6' },
  { bg: '#121114', primary: '#6F2E27', accent: '#E7A63C', text: '#F4EEE7' },
  { bg: '#171613', primary: '#3D3831', accent: '#E1A24A', text: '#F3EEE2' },
  { bg: '#F3EEE6', primary: '#A94E21', accent: '#2A241E', text: '#1B140F' },
  { bg: '#120E12', primary: '#5B2A4A', accent: '#D9A75E', text: '#F5EEF2' },
  { bg: '#101714', primary: '#2D6A4F', accent: '#F0B45A', text: '#EAF4EC' },
  { bg: '#19120E', primary: '#8B5E3C', accent: '#E8C9A0', text: '#F7EFE3' },
  { bg: '#2A0F16', primary: '#A23A43', accent: '#E7C58A', text: '#F8EEF0' },
];

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function isTransientWindowsRemoveError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'EPERM';
}

function sleepSync(ms: number): void {
  if (ms <= 0) return;
  const sab = new SharedArrayBuffer(4);
  const i32 = new Int32Array(sab);
  Atomics.wait(i32, 0, 0, ms);
}

function removeDirWithRetrySync(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= RM_RETRY_ATTEMPTS; attempt++) {
    try {
      fs.rmSync(dirPath, {
        recursive: true,
        force: true,
        maxRetries: RM_RETRY_ATTEMPTS,
        retryDelay: RM_RETRY_DELAY_MS,
      });
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientWindowsRemoveError(error) || attempt === RM_RETRY_ATTEMPTS) break;
      sleepSync(RM_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to remove directory: ${dirPath}`);
}

function resetDir(dirPath: string): void {
  removeDirWithRetrySync(dirPath);
  fs.mkdirSync(dirPath, { recursive: true });
}

function summarizeForLog(text: string, max = 220): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length <= max ? compact : `${compact.slice(0, max)}...`;
}

function cleanText(text: unknown): string {
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
}

function cleanPromptText(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildHyperframesAnimationBudget(videoDurationSeconds: number): HyperframesAnimationBudget {
  const duration = Math.max(1, videoDurationSeconds || 60);
  // Slightly higher cap so users can remove weaker clips during review.
  const hardMomentCap = Math.min(MAX_MOMENTS, Math.max(3, Math.ceil(duration / 3)));
  const targetMomentCount =
    duration <= 12
      ? Math.min(3, hardMomentCap)
      : duration <= 20
        ? Math.min(5, hardMomentCap)
        : duration <= 40
          ? Math.min(7, hardMomentCap)
          : Math.min(Math.max(6, Math.round(duration / 8)), hardMomentCap);
  return {
    targetMomentCount,
    hardMomentCap,
    maxAnimatedSeconds: Number((duration * (duration <= 20 ? 0.5 : 0.45)).toFixed(2)),
    minGapSeconds: duration <= 20 ? 0.7 : 1.0,
  };
}

function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const short = /^#([0-9a-fA-F]{3})$/;
  const long = /^#([0-9a-fA-F]{6})$/;
  if (short.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return long.test(trimmed) ? trimmed.toUpperCase() : null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function pickPaletteByIndex(index: number): AnimationColorPalette {
  return FALLBACK_ANIMATION_PALETTES[index % FALLBACK_ANIMATION_PALETTES.length];
}

function sanitizeColorPalette(rawPalette: unknown, index: number, previousBg: string | null): AnimationColorPalette {
  const rawObj = rawPalette && typeof rawPalette === 'object' ? (rawPalette as Record<string, unknown>) : {};
  const candidate: AnimationColorPalette = {
    bg: normalizeHex(rawObj.bg) || '',
    primary: normalizeHex(rawObj.primary) || '',
    accent: normalizeHex(rawObj.accent) || '',
    text: normalizeHex(rawObj.text) || '',
  };
  let chosen =
    candidate.bg && candidate.primary && candidate.accent && candidate.text && contrastRatio(candidate.bg, candidate.text) >= 4.5
      ? candidate
      : pickPaletteByIndex(index);
  if (previousBg && chosen.bg === previousBg) chosen = pickPaletteByIndex(index + 1);
  return chosen;
}

export function isHyperframesAnimationOverlayTrack(track: Pick<Track, 'type' | 'id'>): boolean {
  return track.type === 'overlay' && (track.id === 't_anim' || /^t_anim_\d+$/.test(track.id));
}

export function getHyperframesAnimationProjectFolderName(projectId: string): string {
  const safe = (projectId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!safe) return 'proj_unknown';
  return safe.startsWith('proj_') ? safe : `proj_${safe}`;
}

function getHyperframesAnimationProjectDirs(projectId: string): {
  projectFolder: string;
  hyperframesProjectDir: string;
  renderedProjectDir: string;
} {
  const projectFolder = getHyperframesAnimationProjectFolderName(projectId);
  return {
    projectFolder,
    hyperframesProjectDir: path.join(HYPERFRAMES_ROOT_DIR, projectFolder),
    renderedProjectDir: path.join(RENDERED_HYPERFRAMES_ROOT_DIR, projectFolder),
  };
}

function getHyperframesAnimationPlanReviewPath(projectId: string): string {
  const { hyperframesProjectDir } = getHyperframesAnimationProjectDirs(projectId);
  return path.join(hyperframesProjectDir, REVIEW_FILENAME);
}

export function loadHyperframesAnimationPlanReview(projectId: string): HyperframesAnimationPlanReviewPayload | null {
  const reviewPath = getHyperframesAnimationPlanReviewPath(projectId);
  if (!fs.existsSync(reviewPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(reviewPath, 'utf8')) as HyperframesAnimationPlanReviewPayload;
    if (!parsed?.animationPlan || !Array.isArray(parsed.animationPlan.moments)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveHyperframesAnimationPlanReview(projectId: string, review: HyperframesAnimationPlanReviewPayload): void {
  const reviewPath = getHyperframesAnimationPlanReviewPath(projectId);
  ensureDir(path.dirname(reviewPath));
  fs.writeFileSync(reviewPath, JSON.stringify(review, null, 2), 'utf8');
}

export function cleanupHyperframesAnimationCacheForProject(projectId: string): {
  hyperframesProjectDir: string;
  renderedProjectDir: string;
} {
  const { hyperframesProjectDir, renderedProjectDir } = getHyperframesAnimationProjectDirs(projectId);
  removeDirWithRetrySync(hyperframesProjectDir);
  removeDirWithRetrySync(renderedProjectDir);
  return { hyperframesProjectDir, renderedProjectDir };
}

function sanitizeMomentFileToken(value: string): string {
  const token = value.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return token.length > 0 ? token : 'moment';
}

export function getHyperframesAnimationMomentId(moment: AnimationMoment, index: number): string {
  const raw = typeof moment.animationMomentId === 'string' ? moment.animationMomentId.trim() : '';
  return raw || `anim_moment_${index + 1}`;
}

export function filterHyperframesAnimationPlanReviewByAllowedMomentIds(
  review: HyperframesAnimationPlanReviewPayload,
  allowedIds: Set<string>
): HyperframesAnimationPlanReviewPayload {
  const filtered = review.animationPlan.moments.filter((moment, index) =>
    allowedIds.has(getHyperframesAnimationMomentId(moment, index))
  );
  if (filtered.length === 0) {
    throw new Error('No animation clips remain in the timeline to approve. Restore clips or regenerate the animation plan.');
  }
  return {
    ...review,
    animationPlan: {
      ...review.animationPlan,
      moments: filtered,
    },
  };
}

function buildDialogueContext(subtitleClips: SubtitleClip[]): string {
  return [...subtitleClips]
    .sort((a, b) => a.start - b.start)
    .map((clip) => {
      const words = (clip.words ?? [])
        .map((word) => {
          const text = cleanText(word.word);
          if (!text) return '';
          return `${text}@${(clip.start + word.start).toFixed(2)}-${(clip.start + word.end).toFixed(2)}s`;
        })
        .filter(Boolean)
        .join(' ');
      const wordContext = words ? `\n  Words: ${words}` : '';
      return `[${clip.start.toFixed(2)}s-${(clip.start + clip.duration).toFixed(2)}s] ${clip.speaker || 'Speaker'}: ${cleanText(clip.text)}${wordContext}`;
    })
    .join('\n');
}

function clipSubtitleTextToOverlap(clip: SubtitleClip, overlapStart: number, overlapEnd: number): string {
  const fullText = cleanText(clip.text);
  if (!fullText) return '';
  if (!clip.words || clip.words.length === 0) return fullText;

  const lastWord = clip.words[clip.words.length - 1];
  const wordsLookRelative = lastWord.end <= clip.duration + 0.5;
  const overlapped = clip.words.filter((word) => {
    const wordStart = wordsLookRelative ? clip.start + word.start : word.start;
    const wordEnd = wordsLookRelative ? clip.start + word.end : word.end;
    return overlapStart < wordEnd && wordStart < overlapEnd;
  });
  return overlapped.length > 0 ? cleanText(overlapped.map((word) => word.word).join(' ')) : fullText;
}

function buildMomentSubtitleWindow(
  subtitleClips: SubtitleClip[],
  momentStart: number,
  momentDuration: number
): { subtitleText: string; contextSummary: string } {
  const momentEnd = momentStart + momentDuration;
  const overlapping = subtitleClips
    .filter((clip) => momentStart < clip.start + clip.duration && clip.start < momentEnd)
    .sort((a, b) => a.start - b.start);
  const segments = overlapping
    .map((clip) => clipSubtitleTextToOverlap(clip, Math.max(momentStart, clip.start), Math.min(momentEnd, clip.start + clip.duration)))
    .filter(Boolean);
  return {
    subtitleText: cleanText(segments.join(' ')),
    contextSummary: overlapping
      .map((clip) => `[${clip.start.toFixed(2)}s] ${clip.speaker || 'Speaker'}: ${cleanText(clip.text)}`)
      .join('\n'),
  };
}

function buildMomentPrompt(moment: AnimationMoment): string {
  const provided = cleanPromptText(moment.promptText) || cleanPromptText(moment.animationPrompt);
  if (provided) return provided;
  return [
    `Create a HyperFrames ${cleanText(moment.type) || 'kinetic'} animation.`,
    cleanText(moment.displayText) ? `Display text: ${cleanText(moment.displayText)}.` : '',
    cleanText(moment.content),
    cleanText(moment.subtitle) ? `Spoken context: ${cleanText(moment.subtitle)}.` : '',
    cleanText(moment.emphasis) ? `Emphasis: ${cleanText(moment.emphasis)}.` : '',
  ].filter(Boolean).join(' ');
}

function clipRangesOverlap(aStart: number, aDuration: number, bStart: number, bDuration: number): boolean {
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
}

function assignMomentsToOverlayTracks(clips: OverlayClip[]): Track[] {
  if (clips.length === 0) return [{ id: 't_anim', type: 'overlay', name: 'Animation', clips: [] }];
  const grouped: OverlayClip[][] = [];
  for (const clip of [...clips].sort((a, b) => a.start - b.start)) {
    const group = grouped.find((items) => !items.some((existing) => clipRangesOverlap(existing.start, existing.duration, clip.start, clip.duration)));
    if (group) group.push(clip);
    else grouped.push([clip]);
  }
  return grouped.map((clipsForTrack, i) => ({
    id: i === 0 ? 't_anim' : `t_anim_${i + 1}`,
    type: 'overlay',
    name: i === 0 ? 'Animation' : `Animation ${i + 1}`,
    clips: clipsForTrack,
  }));
}

function buildOverlayClipFromMoment(
  moment: AnimationMoment,
  index: number,
  options: {
    status: 'draft' | 'approved';
    outputPath?: string;
    dialogueContext?: string;
    researchSummary?: string | null;
  }
): OverlayClip {
  const animationMomentId = getHyperframesAnimationMomentId(moment, index);
  const normalizedOutputPath = cleanText(options.outputPath);
  return {
    id: options.status === 'draft' ? `anim_draft_${animationMomentId}` : `anim_${animationMomentId}`,
    kind: 'overlay',
    start: moment.start,
    duration: moment.duration,
    assetId: options.status === 'draft' ? `anim_draft_${animationMomentId}` : `anim_${animationMomentId}`,
    label: cleanText(moment.displayText) || cleanText(moment.content).slice(0, 30) || `Animation ${index + 1}`,
    x: DEFAULT_OVERLAY_X,
    y: DEFAULT_OVERLAY_Y,
    scale: DEFAULT_OVERLAY_SCALE,
    displayMode: 'overlay',
    path: normalizedOutputPath || undefined,
    planStatus: options.status,
    promptText: buildMomentPrompt(moment),
    promptEdited: Boolean(moment.promptEdited),
    animationMomentId,
    animationType: cleanText(moment.type) || 'hyperframes',
    animationContent: cleanText(moment.content),
    animationSubtitle: cleanText(moment.subtitle || ''),
    animationContextSummary: cleanText(moment.emphasis || moment.subtitle || moment.content).slice(0, 320),
    fullDialogueContext: options.dialogueContext,
    researchContext: typeof options.researchSummary === 'string' ? options.researchSummary : undefined,
    generationHistory: options.status === 'approved' && normalizedOutputPath ? [normalizedOutputPath] : undefined,
  };
}

function buildBootstrapReviewFromTimeline(params: {
  projectId: string;
  topic: string;
  timelineTracks?: Track[];
  videoDurationSeconds?: number;
}): HyperframesAnimationPlanReviewPayload | null {
  const overlayClips = (params.timelineTracks || [])
    .filter((track) => isHyperframesAnimationOverlayTrack(track))
    .flatMap((track) => track.clips)
    .filter((clip): clip is OverlayClip => clip.kind === 'overlay' && Boolean((clip as OverlayClip).animationMomentId))
    .sort((a, b) => a.start - b.start);

  if (overlayClips.length === 0) return null;

  const dialogueContext =
    cleanText(overlayClips.find((clip) => cleanText(clip.fullDialogueContext))?.fullDialogueContext) ||
    overlayClips
      .map((clip) => cleanText(clip.animationSubtitle || clip.animationContextSummary || clip.animationContent))
      .filter(Boolean)
      .map((text, index) => `[moment ${index + 1}] ${text}`)
      .join('\n');
  const researchSummary =
    cleanText(overlayClips.find((clip) => cleanText(clip.researchContext))?.researchContext) || null;

  let previousBg: string | null = null;
  const moments = overlayClips.map((clip, index): AnimationMoment => {
    const palette = sanitizeColorPalette(undefined, index, previousBg);
    previousBg = palette.bg;
    const content = cleanText(clip.animationContent) || cleanText(clip.label) || `Animation moment ${index + 1}`;
    const subtitle = cleanText(clip.animationSubtitle || clip.animationContextSummary || content);
    const moment: AnimationMoment = {
      animationMomentId: cleanText(clip.animationMomentId) || `anim_moment_${index + 1}`,
      start: clip.start,
      duration: clip.duration,
      type: cleanText(clip.animationType) || 'kinetic-type',
      content,
      subtitle,
      narratorText: subtitle,
      displayText: content.split(' ').slice(0, 4).join(' '),
      emphasis: cleanText(clip.animationContextSummary || content),
      animationPrompt: cleanPromptText(clip.promptText) || `Create a HyperFrames animation for: ${content}`,
      promptText: cleanPromptText(clip.promptText) || `Create a HyperFrames animation for: ${content}`,
      promptEdited: Boolean(clip.promptEdited),
      colorPalette: palette,
      composition: {
        layout: '9:16 replace-mode overlay',
        aestheticSystem: 'HyperFrames timeline bootstrap',
        motionCharacter: 'punchy',
        elements: [`display-headline:${content.split(' ').slice(0, 4).join(' ')} - 96px`],
        aestheticNotes: 'Bootstrapped from an existing timeline animation clip after switching UI rendering to HyperFrames.',
      },
    };
    return moment;
  });

  const review: HyperframesAnimationPlanReviewPayload = {
    projectId: params.projectId,
    topic: params.topic,
    generatedAt: new Date().toISOString(),
    approvalState: 'draft',
    animationPlan: {
      videoDurationSeconds: params.videoDurationSeconds,
      moments,
    },
    dialogueContext,
    researchSummary,
    prompts: {
      planOutput: JSON.stringify({ bootstrappedFromTimeline: true, moments }, null, 2),
    },
    diagnostics: {
      usedAgent: null,
      fallbackWithoutAgent: false,
      usedExaResearch: false,
      usedExaDirection: false,
      usedHyperframesSkill: false,
      usedHyperframesCliSkill: false,
      usedGsapSkill: false,
      aiDiagnostics: { bootstrappedFromTimeline: true },
      parsedMomentCount: moments.length,
    },
  };

  console.warn('[HyperFrames Service] bootstrapped review from existing timeline clips', {
    projectId: params.projectId,
    momentCount: moments.length,
    dialogueChars: dialogueContext.length,
    hasResearchSummary: Boolean(researchSummary),
  });
  saveHyperframesAnimationPlanReview(params.projectId, review);
  return review;
}

function normalizePlan(raw: unknown, subtitleClips: SubtitleClip[], videoDurationSeconds: number): AnimationPlan {
  const rawObj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawMoments = Array.isArray(rawObj.moments) ? rawObj.moments : Array.isArray(raw) ? raw : [];
  const duration = Math.max(1, videoDurationSeconds || toNumber(rawObj.videoDurationSeconds) || 60);
  const moments: AnimationMoment[] = [];

  for (const [index, item] of rawMoments.entries()) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const start = clamp(toNumber(obj.start) ?? 0, 0, Math.max(0, duration - 0.1));
    const itemDuration = clamp(toNumber(obj.duration) ?? 3, 1.2, Math.min(7, duration - start));
    if (itemDuration <= 0) continue;
    moments.push({
      animationMomentId: cleanText(obj.animationMomentId) || `anim_moment_${index + 1}`,
      start: Number(start.toFixed(3)),
      duration: Number(itemDuration.toFixed(3)),
      type: cleanText(obj.type) || 'kinetic-type',
      narratorText: cleanText(obj.narratorText),
      displayText: cleanText(obj.displayText).split(' ').slice(0, 4).join(' '),
      content: cleanText(obj.content) || cleanText(obj.displayText) || 'Animated callout',
      subtitle: cleanText(obj.subtitle) || cleanText(obj.narratorText),
      emphasis: cleanText(obj.emphasis),
      animationPrompt: cleanPromptText(obj.animationPrompt),
      colorPalette: obj.colorPalette && typeof obj.colorPalette === 'object' ? (obj.colorPalette as Record<string, unknown>) : undefined,
      composition: obj.composition && typeof obj.composition === 'object' ? (obj.composition as Record<string, unknown>) : undefined,
    });
  }

  if (moments.length === 0) {
    throw new Error('HyperFrames animation plan has no usable moments.');
  }

  const budget = buildHyperframesAnimationBudget(duration);
  const sorted = moments.sort((a, b) => a.start - b.start).slice(0, budget.hardMomentCap);
  const spacedMoments: AnimationMoment[] = [];
  let animatedSeconds = 0;
  let nextAllowedStart = 0;
  for (const moment of sorted) {
    if (spacedMoments.length >= budget.targetMomentCount) break;
    if (moment.start < nextAllowedStart) continue;

    const remainingBudget = budget.maxAnimatedSeconds - animatedSeconds;
    if (remainingBudget < 1.2) break;
    const durationForBudget = Math.min(moment.duration, remainingBudget);
    if (durationForBudget < 1.2) continue;

    const spacedMoment = {
      ...moment,
      duration: Number(durationForBudget.toFixed(3)),
    };
    spacedMoments.push(spacedMoment);
    animatedSeconds += spacedMoment.duration;
    nextAllowedStart = spacedMoment.start + spacedMoment.duration + budget.minGapSeconds;
  }

  const selected = spacedMoments.length > 0 ? spacedMoments : sorted.slice(0, 1);
  if (spacedMoments.length < sorted.length) {
    console.warn('[HyperFrames Service] normalized dense animation plan into sparse moment plan', {
      originalMomentCount: sorted.length,
      selectedMomentCount: selected.length,
      targetMomentCount: budget.targetMomentCount,
      maxAnimatedSeconds: budget.maxAnimatedSeconds,
      minGapSeconds: budget.minGapSeconds,
      selectedCoverageSeconds: Number(selected.reduce((sum, moment) => sum + moment.duration, 0).toFixed(2)),
    });
  }

  let previousBg: string | null = null;
  const finalMoments = selected.map((moment, index) => {
    const windowedSubtitle = buildMomentSubtitleWindow(subtitleClips, moment.start, moment.duration);
    const palette = sanitizeColorPalette(moment.colorPalette, index, previousBg);
    previousBg = palette.bg;
    const subtitle = windowedSubtitle.subtitleText || moment.subtitle || moment.content;
    return {
      ...moment,
      subtitle,
      subtitleWindowContext: windowedSubtitle.contextSummary,
      colorPalette: palette,
      promptText: buildMomentPrompt({ ...moment, subtitle }),
      promptEdited: false,
    };
  });

  return {
    videoDurationSeconds: duration,
    moments: finalMoments,
  };
}

function countRawMoments(raw: unknown): number {
  if (Array.isArray(raw)) return raw.length;
  if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).moments)) {
    return ((raw as Record<string, unknown>).moments as unknown[]).length;
  }
  return 0;
}

function getNpxBin(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function hyperframesCliArgs(args: string[]): string[] {
  return ['--yes', 'hyperframes', ...args];
}

function runCommand(bin: string, args: string[], cwd: string, label: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    console.log('[HyperFrames Service] command start', {
      label,
      bin,
      cwd,
      args: args.join(' '),
    });
    const proc = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 8000) stdout = stdout.slice(-8000);
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on('error', (error) => reject(error));
    proc.on('close', (code) => {
      const elapsedMs = Date.now() - startedAt;
      if (code === 0) {
        console.log('[HyperFrames Service] command complete', {
          label,
          elapsedMs,
          stdoutChars: stdout.length,
          stderrChars: stderr.length,
        });
        resolve({ stdout, stderr });
      } else {
        console.error('[HyperFrames Service] command failed', {
          label,
          code,
          elapsedMs,
          stderrTail: stderr.slice(-1200),
          stdoutTail: stdout.slice(-600),
        });
        reject(new Error(`${label} failed with code ${code}. stderr=${stderr.slice(-1600)} stdout=${stdout.slice(-800)}`));
      }
    });
  });
}

async function runOptionalHyperframesValidate(projectDir: string): Promise<void> {
  try {
    await runCommand(getNpxBin(), hyperframesCliArgs(['validate', projectDir]), projectDir, 'hyperframes-validate');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unknown command|invalid command|not found|could not determine executable/i.test(message)) return;
    throw error;
  }
}

function writeDesignFile(projectDir: string, moment: AnimationMoment): void {
  const palette = moment.colorPalette as AnimationColorPalette | undefined;
  const lines = [
    '## Style Prompt',
    cleanText(moment.composition?.aestheticNotes) || 'High-contrast short-form HyperFrames motion graphic with readable vertical-video typography.',
    '',
    '## Colors',
    `- Background: ${palette?.bg || '#140F0C'}`,
    `- Primary: ${palette?.primary || '#8E3F2A'}`,
    `- Accent: ${palette?.accent || '#F0B45A'}`,
    `- Text: ${palette?.text || '#F6EEE6'}`,
    '',
    '## Typography',
    '- Use expressive display type for the main phrase and a contrasting mono or serif voice for small supporting data.',
    '',
    '## What NOT to Do',
    '- Do not use Remotion, React, TSX, or frame hooks.',
    '- Do not render full subtitles.',
    '- Do not use generic default colors.',
  ];
  fs.writeFileSync(path.join(projectDir, 'DESIGN.md'), lines.join('\n'), 'utf8');
}

function cleanGeneratedHtml(raw: string): string {
  const fenced = raw.match(/```html\s*([\s\S]*?)\s*```/i);
  return (fenced?.[1] || raw).replace(/\r\n/g, '\n').trim();
}

function extractCompositionIds(html: string): string[] {
  const ids = new Set<string>();
  const pattern = /data-composition-id=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const id = (match[1] || '').trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateHyperframesHtml(html: string, expectedDuration: number): void {
  const normalized = html.toLowerCase();
  const banned = [
    /\bremotion\b/,
    /\busecurrentframe\b/,
    /\busevideoconfig\b/,
    /\binterpolate\b/,
    // Keep this targeted to the Remotion API call; plain language like "spring" is valid in content/comments.
    /\bspring\s*\(/,
    /<\s*composition\b/,
    /\bgeneratedclip\b/,
    /from\s+["']react["']/,
    /from\s+["']remotion["']/,
  ];
  const found = banned.find((pattern) => pattern.test(normalized));
  if (found) throw new Error(`Generated HyperFrames HTML contains banned renderer/API text: ${found}`);
  const compositionIds = extractCompositionIds(html);
  if (compositionIds.length === 0) throw new Error('Generated HyperFrames HTML must define data-composition-id on the root composition.');
  const primaryCompositionId = compositionIds[0];
  if (!/data-width=["']1080["']/i.test(html)) throw new Error('Generated HyperFrames HTML must define data-width="1080".');
  if (!/data-height=["']1920["']/i.test(html)) throw new Error('Generated HyperFrames HTML must define data-height="1920".');
  if (!/window\.__timelines/i.test(html)) throw new Error('Generated HyperFrames HTML must register window.__timelines.');
  if (!/gsap\.timeline\s*\(\s*\{\s*paused\s*:\s*true/i.test(html)) {
    throw new Error('Generated HyperFrames HTML must create gsap.timeline({ paused: true }).');
  }
  const timelineRegistrationPattern = new RegExp(
    `window\\.__timelines\\s*(?:\\[\\s*["'](?:main|${escapeForRegExp(primaryCompositionId)})["']\\s*\\]|\\.main\\b)`,
    'i'
  );
  if (!timelineRegistrationPattern.test(html)) {
    throw new Error(`Generated HyperFrames HTML must register window.__timelines["${primaryCompositionId}"] (or alias "main").`);
  }
  const durationMatch = html.match(/data-duration=["']([^"']+)["']/i);
  const actualDuration = durationMatch ? Number(durationMatch[1]) : NaN;
  if (!Number.isFinite(actualDuration) || Math.abs(actualDuration - expectedDuration) > 0.05) {
    throw new Error(`Generated HyperFrames HTML duration ${durationMatch?.[1] || 'missing'} must match ${expectedDuration}.`);
  }

  // Hard pacing validation. Reject the generated HTML when it would render
  // as either a chaotic flash-storm (sub-frame tweens crammed into the first
  // 0.35s) or as dead air (no idle/hold window declared).
  validateHyperframesPacing(html, expectedDuration);
}

interface TimelineCallInfo {
  /** Position offset on the timeline (seconds). null if relative or unknown. */
  positionSeconds: number | null;
  /** duration: N value passed to the tween, in seconds. null if missing. */
  durationSeconds: number | null;
  /** Method name (to, from, fromTo, set). */
  method: string;
  /** Raw matched call signature (truncated) for error reporting. */
  signature: string;
}

function parseTimelineCalls(html: string): TimelineCallInfo[] {
  const calls: TimelineCallInfo[] = [];
  // Match tl.<method>( ...balanced... ) or gsap.<method>( ...balanced... ).
  // We can't truly balance with regex, so we match the call name and a window
  // of the next ~600 characters and then look for `duration:` and a trailing
  // numeric position offset.
  const callPattern = /\b(?:tl|gsap)\s*\.\s*(to|from|fromTo|set|add)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = callPattern.exec(html))) {
    const method = match[1];
    const startIdx = match.index;
    const headWindow = html.slice(startIdx, startIdx + 800);
    const durationMatch = headWindow.match(/duration\s*:\s*(-?\d+(?:\.\d+)?)/);
    const durationSeconds = durationMatch ? Number(durationMatch[1]) : null;

    // Position offset is the LAST positional argument of the call. Heuristic:
    // look for `,\s*<number>\s*\)` near the end of the call's first balanced
    // parenthesis group. We approximate "end of call" by walking forward until
    // the parenthesis depth returns to zero, capped at 1500 chars.
    let depth = 1;
    let cursor = startIdx + match[0].length;
    const end = Math.min(html.length, cursor + 1500);
    while (cursor < end && depth > 0) {
      const ch = html[cursor];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      cursor += 1;
    }
    const callBody = html.slice(startIdx + match[0].length, Math.max(startIdx + match[0].length, cursor - 1));
    let positionSeconds: number | null = null;
    const trailingPositionMatch = callBody.match(/,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (trailingPositionMatch) positionSeconds = Number(trailingPositionMatch[1]);

    calls.push({
      positionSeconds,
      durationSeconds,
      method,
      signature: `${match[0]}${callBody.slice(0, 80).replace(/\s+/g, ' ').trim()})`,
    });
  }
  return calls;
}

function validateHyperframesPacing(html: string, expectedDuration: number): void {
  const calls = parseTimelineCalls(html);
  const hasInfiniteLoop = /repeat\s*:\s*-1/i.test(html);
  const hasIdleWindowHint =
    /idle window|idle[_-\s]?window|rest gap|no new (?:events|tweens)|hold state|phase map/i.test(html);

  if (hasInfiniteLoop) {
    throw new Error(
      'Generated HyperFrames HTML uses repeat:-1 (forbidden). Use a finite repeat count tied to the clip duration.'
    );
  }

  // Reject sub-frame tween durations. At 30fps anything below ~0.18s renders
  // as a single-frame flash and reads as "garbage" on playback.
  const FRAME_FLASH_THRESHOLD = 0.18;
  const subFrameTweens = calls.filter(
    (call) =>
      call.method !== 'set' &&
      call.method !== 'add' &&
      call.durationSeconds !== null &&
      call.durationSeconds > 0 &&
      call.durationSeconds < FRAME_FLASH_THRESHOLD
  );
  if (subFrameTweens.length > 0) {
    const examples = subFrameTweens
      .slice(0, 3)
      .map((call) => `${call.method}(duration: ${call.durationSeconds}s)`)
      .join(', ');
    throw new Error(
      `Generated HyperFrames HTML has ${subFrameTweens.length} sub-frame tween(s) under ${FRAME_FLASH_THRESHOLD}s — these render as one-frame flashes. Examples: ${examples}.`
    );
  }

  // Reject crammed-entry pattern. Count distinct keyed entry events
  // (tl.to/from/fromTo with explicit position) that fire in the first 12% of
  // the clip. If a majority of all events live there, the entry is chaotic.
  const earlyWindowEnd = Math.max(0.4, expectedDuration * 0.12);
  const positioned = calls.filter(
    (call) =>
      (call.method === 'to' || call.method === 'from' || call.method === 'fromTo') &&
      call.positionSeconds !== null
  );
  const earlyEvents = positioned.filter((call) => (call.positionSeconds ?? 0) <= earlyWindowEnd);
  if (
    expectedDuration >= 2.5 &&
    earlyEvents.length >= 6 &&
    earlyEvents.length / Math.max(1, positioned.length) >= 0.7
  ) {
    throw new Error(
      `Generated HyperFrames HTML crams ${earlyEvents.length}/${positioned.length} keyed events into the first ${earlyWindowEnd.toFixed(2)}s of a ${expectedDuration}s clip. Spread the entry across the pre-punch window.`
    );
  }

  // Require an explicit hold/idle window comment so pacing is auditable.
  if (!hasIdleWindowHint) {
    throw new Error(
      'Generated HyperFrames HTML must declare an idle/hold window in code (comment containing "idle window", "hold state", or "phase map").'
    );
  }

  // Soft warning: timeline op density.
  const timelineOpCount = calls.length;
  const recommendedMaxOps = expectedDuration <= 3.5 ? 9 : expectedDuration <= 5.9 ? 13 : 17;
  if (timelineOpCount > recommendedMaxOps) {
    console.warn('[HyperFrames Service] pacing guidance warning', {
      expectedDuration,
      timelineOpCount,
      recommendedMaxOps,
      guidance: 'Prefer event-driven beats with readable rest gaps; avoid wall-to-wall micro-tweens.',
    });
  }
}

async function renderMomentWithHyperframes(
  outputPath: string,
  moment: AnimationMoment,
  index: number,
  topic: string,
  hyperframesProjectDir: string,
  environment: HyperframesOpenCodeEnvironmentCheck,
  review: HyperframesAnimationPlanReviewPayload
): Promise<void> {
  const startedAt = Date.now();
  const momentToken = sanitizeMomentFileToken(getHyperframesAnimationMomentId(moment, index));
  const momentProjectDir = path.join(hyperframesProjectDir, `moment_${index}_${momentToken}`);
  console.log('[HyperFrames Service] render moment start', {
    index,
    momentId: getHyperframesAnimationMomentId(moment, index),
    start: moment.start,
    duration: moment.duration,
    momentProjectDir,
    outputPath,
  });
  resetDir(momentProjectDir);
  writeDesignFile(momentProjectDir, moment);

  console.log('[HyperFrames Service] generating clip HTML', {
    index,
    momentId: getHyperframesAnimationMomentId(moment, index),
  });
  const result = await generateHyperframesClipHtmlWithSkill(
    {
      topic,
      dialogueContext: review.dialogueContext,
      researchSummary: review.researchSummary,
      moment: {
        index,
        totalMoments: review.animationPlan.moments.length,
        ...moment,
      },
    },
    { environment }
  );
  console.log('[HyperFrames Service] clip HTML generation complete', {
    index,
    outputChars: result.output.length,
    htmlChars: result.html?.length ?? 0,
    usedHyperframesSkill: result.usedHyperframesSkill,
    usedHyperframesCliSkill: result.usedHyperframesCliSkill,
    usedGsapSkill: result.usedGsapSkill,
  });
  fs.writeFileSync(path.join(momentProjectDir, `clip-html-output-${index}.raw.txt`), result.output, 'utf8');

  const html = cleanGeneratedHtml(result.html || '');
  if (!html) throw new Error(`Generated HyperFrames HTML for moment ${index} was empty.`);
  console.log('[HyperFrames Service] validating generated HTML', {
    index,
    htmlChars: html.length,
    expectedDuration: moment.duration,
  });
  validateHyperframesHtml(html, moment.duration);
  fs.writeFileSync(path.join(momentProjectDir, 'index.html'), html, 'utf8');
  console.log('[HyperFrames Service] generated HTML written', {
    index,
    indexPath: path.join(momentProjectDir, 'index.html'),
  });

  await runCommand(getNpxBin(), hyperframesCliArgs(['lint', momentProjectDir, '--json']), momentProjectDir, `hyperframes-lint-${index}`);
  await runOptionalHyperframesValidate(momentProjectDir);
  await runCommand(
    getNpxBin(),
    hyperframesCliArgs([
      'render',
      momentProjectDir,
      '--output',
      outputPath,
      '--fps',
      String(HYPERFRAMES_FPS),
      '--quality',
      'standard',
      '--format',
      HYPERFRAMES_RENDER_FORMAT,
    ]),
    momentProjectDir,
    `hyperframes-render-${index}`
  );
  console.log('[HyperFrames Service] render moment complete', {
    index,
    outputPath,
    elapsedMs: Date.now() - startedAt,
    outputExists: fs.existsSync(outputPath),
  });
}

async function prepareHyperframesAnimationPlanReview(params: {
  projectId: string;
  topic: string;
  subtitleClips: SubtitleClip[];
  videoDurationSeconds: number;
}): Promise<HyperframesAnimationPlanDraftResult> {
  const startedAt = Date.now();
  console.log('[HyperFrames Service] prepare draft start', {
    projectId: params.projectId,
    topic: params.topic,
    subtitleClipCount: params.subtitleClips.length,
    videoDurationSeconds: params.videoDurationSeconds,
  });
  ensureDir(HYPERFRAMES_ROOT_DIR);
  ensureDir(RENDERED_HYPERFRAMES_ROOT_DIR);
  const { hyperframesProjectDir, renderedProjectDir } = getHyperframesAnimationProjectDirs(params.projectId);
  resetDir(hyperframesProjectDir);
  resetDir(renderedProjectDir);

  const dialogueContext = buildDialogueContext(params.subtitleClips);
  console.log('[HyperFrames Service] inspecting OpenCode/skills environment', {
    projectId: params.projectId,
  });
  const environment = await inspectHyperframesOpenCodeEnvironment(process.cwd());
  console.log('[HyperFrames Service] environment check result', {
    projectId: params.projectId,
    opencodeAvailable: environment.opencodeAvailable,
    exaConnected: environment.exaConnected,
    hyperframesSkillInstalled: environment.hyperframesSkillInstalled,
    hyperframesCliSkillInstalled: environment.hyperframesCliSkillInstalled,
    gsapSkillInstalled: environment.gsapSkillInstalled,
  });
  const aiResult = await generateHyperframesAnimationPlanWithResearch(params.topic, dialogueContext, {
    videoDurationSeconds: params.videoDurationSeconds,
    maxMoments: MAX_MOMENTS,
    environment,
  });
  fs.writeFileSync(path.join(hyperframesProjectDir, OPENCODE_OUTPUT_FILENAME), aiResult.output, 'utf8');

  const parsedPlan = parseOpenCodeJSON(aiResult.output);
  const parsedMomentCount = countRawMoments(parsedPlan);
  const animationPlan = normalizePlan(parsedPlan, params.subtitleClips, params.videoDurationSeconds);
  console.log('[HyperFrames Service] plan normalized', {
    projectId: params.projectId,
    parsedMomentCount,
    normalizedMomentCount: animationPlan.moments.length,
    outputChars: aiResult.output.length,
    usedExaResearch: aiResult.usedExaResearch,
    usedExaDirection: aiResult.usedExaDirection,
    usedHyperframesSkill: aiResult.usedHyperframesSkill,
    usedHyperframesCliSkill: aiResult.usedHyperframesCliSkill,
    usedGsapSkill: aiResult.usedGsapSkill,
  });

  const review: HyperframesAnimationPlanReviewPayload = {
    projectId: params.projectId,
    topic: params.topic,
    generatedAt: new Date().toISOString(),
    approvalState: 'draft',
    animationPlan,
    dialogueContext,
    researchSummary: aiResult.researchSummary,
    prompts: {
      planOutput: aiResult.output,
    },
    diagnostics: {
      usedAgent: aiResult.usedAgent,
      fallbackWithoutAgent: aiResult.fallbackWithoutAgent,
      usedExaResearch: aiResult.usedExaResearch,
      usedExaDirection: aiResult.usedExaDirection,
      usedHyperframesSkill: aiResult.usedHyperframesSkill,
      usedHyperframesCliSkill: aiResult.usedHyperframesCliSkill,
      usedGsapSkill: aiResult.usedGsapSkill,
      aiDiagnostics: aiResult.diagnostics,
      parsedMomentCount,
    },
  };
  saveHyperframesAnimationPlanReview(params.projectId, review);

  const overlayTracks = assignMomentsToOverlayTracks(
    animationPlan.moments.map((moment, index) =>
      buildOverlayClipFromMoment(moment, index, {
        status: 'draft',
        dialogueContext,
        researchSummary: review.researchSummary,
      })
    )
  );
  console.log('[HyperFrames Service] prepare draft complete', {
    projectId: params.projectId,
    overlayTrackCount: overlayTracks.length,
    hyperframesProjectDir,
    renderedProjectDir,
    elapsedMs: Date.now() - startedAt,
  });

  return { animationPlan, review, overlayTracks, hyperframesProjectDir, renderedProjectDir };
}

async function renderHyperframesAnimationPlanFromReview(params: {
  projectId: string;
  topic: string;
  review: HyperframesAnimationPlanReviewPayload;
  promptOverrides?: Record<string, string>;
  hyperframesProjectDir: string;
  renderedProjectDir: string;
  persistApproval?: boolean;
  resetRenderedDir?: boolean;
}): Promise<{
  animationPlan: AnimationPlan;
  overlayTracks: Track[];
  hyperframesProjectDir: string;
  renderedProjectDir: string;
}> {
  const startedAt = Date.now();
  console.log('[HyperFrames Service] render review start', {
    projectId: params.projectId,
    topic: params.topic,
    reviewMomentCount: params.review.animationPlan.moments.length,
    promptOverrideCount: Object.keys(params.promptOverrides || {}).length,
    hyperframesProjectDir: params.hyperframesProjectDir,
    renderedProjectDir: params.renderedProjectDir,
  });
  ensureDir(params.hyperframesProjectDir);
  if (params.resetRenderedDir ?? true) resetDir(params.renderedProjectDir);
  else ensureDir(params.renderedProjectDir);

  let previousBg: string | null = null;
  const moments = params.review.animationPlan.moments.map((moment, index) => {
    const animationMomentId = getHyperframesAnimationMomentId(moment, index);
    const overrideText = params.promptOverrides?.[animationMomentId];
    const originalPrompt = buildMomentPrompt(moment);
    const sourcePrompt = cleanText(overrideText) || originalPrompt;
    const palette = sanitizeColorPalette(moment.colorPalette, index, previousBg);
    previousBg = palette.bg;
    return {
      ...moment,
      animationMomentId,
      colorPalette: palette,
      promptText: sourcePrompt,
      animationPrompt: sourcePrompt,
      promptEdited: sourcePrompt !== originalPrompt,
    };
  });

  if (moments.length === 0) throw new Error('HyperFrames animation plan has no usable moments.');
  const environment = await inspectHyperframesOpenCodeEnvironment(process.cwd());
  console.log('[HyperFrames Service] render environment check result', {
    projectId: params.projectId,
    opencodeAvailable: environment.opencodeAvailable,
    exaConnected: environment.exaConnected,
    hyperframesSkillInstalled: environment.hyperframesSkillInstalled,
    hyperframesCliSkillInstalled: environment.hyperframesCliSkillInstalled,
    gsapSkillInstalled: environment.gsapSkillInstalled,
  });
  const renderedMoments: Array<{ sourceIndex: number; moment: AnimationMoment; outputPath: string }> = [];
  const renderFailures: Array<{ index: number; message: string }> = [];

  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i];
    const momentToken = sanitizeMomentFileToken(getHyperframesAnimationMomentId(moment, i));
    const outputSuffix = params.resetRenderedDir === false ? `_${Date.now()}` : '';
    const outputPath = path.join(params.renderedProjectDir, `moment_${i}_${momentToken}${outputSuffix}.${HYPERFRAMES_RENDER_FORMAT}`);
    try {
      await renderMomentWithHyperframes(outputPath, moment, i, params.topic, params.hyperframesProjectDir, environment, {
        ...params.review,
        animationPlan: { ...params.review.animationPlan, moments },
      });
      if (!fs.existsSync(outputPath)) throw new Error(`Rendered file not found: ${outputPath}`);
      renderedMoments.push({ sourceIndex: i, moment, outputPath });
    } catch (error) {
      renderFailures.push({ index: i, message: error instanceof Error ? error.message : String(error) });
      console.error('[HyperFrames Animation] render moment failed', {
        projectId: params.projectId,
        index: i,
        message: renderFailures[renderFailures.length - 1].message,
      });
    }
  }

  if (renderedMoments.length === 0) {
    throw new Error(`No HyperFrames animation moments were rendered successfully. ${renderFailures.map((f) => `[${f.index}] ${summarizeForLog(f.message, 180)}`).join(' | ')}`);
  }
  console.log('[HyperFrames Service] render review moments complete', {
    projectId: params.projectId,
    renderedCount: renderedMoments.length,
    failureCount: renderFailures.length,
    elapsedMs: Date.now() - startedAt,
  });

  const overlayTracks = assignMomentsToOverlayTracks(
    renderedMoments.map(({ sourceIndex, moment, outputPath }) =>
      buildOverlayClipFromMoment(moment, sourceIndex, {
        status: 'approved',
        outputPath,
        dialogueContext: params.review.dialogueContext,
        researchSummary: params.review.researchSummary,
      })
    )
  );
  const finalPlan: AnimationPlan = {
    videoDurationSeconds: params.review.animationPlan.videoDurationSeconds,
    moments: renderedMoments.map((item) => item.moment),
  };

  if (params.persistApproval ?? true) {
    const approvedReview: HyperframesAnimationPlanReviewPayload = {
      ...params.review,
      approvalState: 'approved',
      approvedAt: new Date().toISOString(),
      animationPlan: finalPlan,
    };
    saveHyperframesAnimationPlanReview(params.projectId, approvedReview);
    fs.writeFileSync(
      path.join(params.hyperframesProjectDir, PLAN_FILENAME),
      JSON.stringify({
        projectId: params.projectId,
        topic: params.topic,
        generatedAt: new Date().toISOString(),
        animationPlan: finalPlan,
        renderedFiles: renderedMoments.map((item) => item.outputPath),
        renderFailures,
        review: approvedReview,
      }, null, 2),
      'utf8'
    );
  }

  return {
    animationPlan: finalPlan,
    overlayTracks,
    hyperframesProjectDir: params.hyperframesProjectDir,
    renderedProjectDir: params.renderedProjectDir,
  };
}

export async function generateHyperframesAnimationPlanDraft(params: {
  projectId: string;
  topic: string;
  subtitleClips: SubtitleClip[];
  videoDurationSeconds: number;
}): Promise<HyperframesAnimationPlanDraftResult> {
  return prepareHyperframesAnimationPlanReview(params);
}

export async function approveHyperframesAnimationPlanRender(params: {
  projectId: string;
  topic: string;
  promptOverrides?: Record<string, string>;
  allowedMomentIds?: Set<string>;
  timelineTracks?: Track[];
  videoDurationSeconds?: number;
}): Promise<{
  animationPlan: AnimationPlan;
  overlayTracks: Track[];
  hyperframesProjectDir: string;
  renderedProjectDir: string;
}> {
  let review = loadHyperframesAnimationPlanReview(params.projectId);
  if (!review) {
    review = buildBootstrapReviewFromTimeline({
      projectId: params.projectId,
      topic: params.topic,
      timelineTracks: params.timelineTracks,
      videoDurationSeconds: params.videoDurationSeconds,
    });
  }
  if (!review) throw new Error('No pending HyperFrames animation plan review found. Create the animation plan first.');
  if (params.allowedMomentIds) {
    if (params.allowedMomentIds.size === 0) {
      throw new Error('No animation clips in the timeline to approve. Restore clips or regenerate the animation plan.');
    }
    review = filterHyperframesAnimationPlanReviewByAllowedMomentIds(review, params.allowedMomentIds);
  }
  const { hyperframesProjectDir, renderedProjectDir } = getHyperframesAnimationProjectDirs(params.projectId);
  return renderHyperframesAnimationPlanFromReview({
    projectId: params.projectId,
    topic: params.topic,
    review,
    promptOverrides: params.promptOverrides,
    hyperframesProjectDir,
    renderedProjectDir,
  });
}

export async function renderSingleHyperframesAnimationMoment(params: {
  projectId: string;
  topic: string;
  momentId: string;
  promptOverrides?: Record<string, string>;
  timelineTracks?: Track[];
  videoDurationSeconds?: number;
}): Promise<{
  overlayClip: OverlayClip;
  animationMoment: AnimationMoment;
  hyperframesProjectDir: string;
  renderedProjectDir: string;
}> {
  let review = loadHyperframesAnimationPlanReview(params.projectId);
  const requestedMomentId = params.momentId.trim();
  const reviewHasRequestedMoment = Boolean(review?.animationPlan.moments.some((moment, index) =>
    getHyperframesAnimationMomentId(moment, index) === requestedMomentId
  ));

  if (!review || !reviewHasRequestedMoment) {
    review = buildBootstrapReviewFromTimeline({
      projectId: params.projectId,
      topic: params.topic,
      timelineTracks: params.timelineTracks,
      videoDurationSeconds: params.videoDurationSeconds,
    });
  }
  if (!review) throw new Error('No pending HyperFrames animation plan review found. Create the animation plan first.');
  const filteredReview = filterHyperframesAnimationPlanReviewByAllowedMomentIds(review, new Set([requestedMomentId]));
  const { hyperframesProjectDir, renderedProjectDir } = getHyperframesAnimationProjectDirs(params.projectId);
  const rendered = await renderHyperframesAnimationPlanFromReview({
    projectId: params.projectId,
    topic: params.topic,
    review: filteredReview,
    promptOverrides: params.promptOverrides,
    hyperframesProjectDir,
    renderedProjectDir,
    persistApproval: false,
    resetRenderedDir: false,
  });
  const firstTrack = rendered.overlayTracks.find((track) => track.clips.length > 0);
  const firstClip = firstTrack?.clips[0];
  const renderedMoment = rendered.animationPlan.moments[0];
  if (!firstClip || firstClip.kind !== 'overlay' || !renderedMoment) {
    throw new Error('Failed to render the selected HyperFrames animation clip.');
  }
  return {
    overlayClip: firstClip as OverlayClip,
    animationMoment: renderedMoment,
    hyperframesProjectDir: rendered.hyperframesProjectDir,
    renderedProjectDir: rendered.renderedProjectDir,
  };
}
