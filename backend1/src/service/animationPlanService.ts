import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { OverlayClip, SubtitleClip, Track } from '../schema/project';
// Switched from OpenCode-based agent to Gemini CLI-based agent.
// import {
//   generateAnimationPlanWithResearch,
//   generateRemotionClipCodeWithSkill,
//   inspectOpenCodeEnvironment,
//   parseOpenCodeJSON,
// } from '../agents/gemini3agent';
import {
  generateAnimationPlanWithResearch,
  generateRemotionClipCodeWithSkill,
  inspectOpenCodeEnvironment,
  parseOpenCodeJSON,
} from '../agents/opencodeagent';

const REMOTION_ROOT_DIR = path.join(process.cwd(), 'storage', 'remotion-animation');
const RENDERED_ANIMATIONS_ROOT_DIR = path.join(process.cwd(), 'storage', 'rendered-animations');
const REMOTION_COMPOSITION_ID = 'GeneratedClip';
const REMOTION_FPS = 30;
const REMOTION_WIDTH = 1080;
const REMOTION_HEIGHT = 1920;
const MAX_COMPOSITIONS = 8;
const PLAN_FILENAME = 'animation-plan.json';
const REMOTION_VERSION = '4.0.419';
const REMOTION_GENERATED_CLIP_FILE = path.join(REMOTION_ROOT_DIR, 'src', 'GeneratedClip.tsx');
const REMOTION_ROOT_FILE = path.join(REMOTION_ROOT_DIR, 'src', 'Root.tsx');

const DEFAULT_OVERLAY_X = 0.5;
const DEFAULT_OVERLAY_Y = 0.65;
const DEFAULT_OVERLAY_SCALE = 0.5;
const MAX_MOMENTS = 8;
const MIN_MOMENT_DURATION_SECONDS = 1.2;
const ANIMATION_DEBUG_ENABLED = process.env.ANIMATION_DEBUG === '1';
const OPENCODE_OUTPUT_FILENAME = 'animation-opencode.raw.txt';
const DEBUG_TRACE_FILENAME = 'animation-debug-trace.json';
const GENERIC_CONTENT_PATTERNS = [
  /^introduction$/i,
  /^intro$/i,
  /^overview$/i,
  /^summary$/i,
  /^conclusion$/i,
  /^key points?$/i,
  /^main idea$/i,
  /^important concept$/i,
  /^let's begin$/i,
  /^what is .*$/i,
];

export type AnimationMoment = {
  start: number;
  duration: number;
  type: string;
  content: string;
  subtitle?: string;
  visualStyle?: string;
  motion?: string;
  layout?: string;
  emphasis?: string;
  animationPrompt?: string;
  colorPalette?: Record<string, unknown>;
  composition?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AnimationPlan = {
  moments: AnimationMoment[];
  videoDurationSeconds?: number;
};

function summarizeForLog(text: string, max = 220): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}...`;
}

function animationInfo(_message: string, _data?: Record<string, unknown>): void {
  // Logging disabled.
}

function animationWarn(_message: string, _data?: Record<string, unknown>): void {
  // Logging disabled.
}

function countRawMoments(raw: unknown): number {
  if (Array.isArray(raw)) return raw.length;
  if (!raw || typeof raw !== 'object') return 0;

  const asObj = raw as Record<string, unknown>;
  if (Array.isArray(asObj.moments)) return asObj.moments.length;
  if (Array.isArray(asObj.animations)) return asObj.animations.length;
  if (Array.isArray(asObj.plan)) return asObj.plan.length;
  if (asObj.plan && typeof asObj.plan === 'object' && Array.isArray((asObj.plan as any).moments)) {
    return (asObj.plan as any).moments.length;
  }
  return 0;
}

function isGenericMomentContent(content: string): boolean {
  const normalized = cleanText(content).toLowerCase();
  if (!normalized) return true;
  if (normalized.length < 4) return true;
  return GENERIC_CONTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isAnimationOverlayTrack(track: Pick<Track, 'type' | 'id'>): boolean {
  return track.type === 'overlay' && (track.id === 't_anim' || /^t_anim_\d+$/.test(track.id));
}

export function getAnimationProjectFolderName(projectId: string): string {
  const safe = (projectId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!safe) return 'proj_unknown';
  return safe.startsWith('proj_') ? safe : `proj_${safe}`;
}

export function cleanupAnimationCacheForProject(projectId: string): {
  remotionProjectDir: string;
  renderedProjectDir: string;
} {
  const projectFolder = getAnimationProjectFolderName(projectId);
  const remotionProjectDir = path.join(REMOTION_ROOT_DIR, projectFolder);
  const renderedProjectDir = path.join(RENDERED_ANIMATIONS_ROOT_DIR, projectFolder);

  if (fs.existsSync(remotionProjectDir)) {
    fs.rmSync(remotionProjectDir, { recursive: true, force: true });
  }
  if (fs.existsSync(renderedProjectDir)) {
    fs.rmSync(renderedProjectDir, { recursive: true, force: true });
  }

  return { remotionProjectDir, renderedProjectDir };
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

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clipLabel(moment: AnimationMoment, index: number): string {
  const snippet = cleanText(moment.content).slice(0, 30);
  if (!snippet) return `Animation ${index + 1}`;
  return snippet.length >= 30 ? `${snippet}...` : snippet;
}

function clipRangesOverlap(aStart: number, aDuration: number, bStart: number, bDuration: number): boolean {
  const aEnd = aStart + aDuration;
  const bEnd = bStart + bDuration;
  return aStart < bEnd && bStart < aEnd;
}

function assignMomentsToOverlayTracks(clips: OverlayClip[]): Track[] {
  if (clips.length === 0) {
    return [{ id: 't_anim', type: 'overlay', name: 'Animation', clips: [] }];
  }

  const sorted = [...clips].sort((a, b) => a.start - b.start);
  const grouped: OverlayClip[][] = [];

  for (const clip of sorted) {
    let placed = false;
    for (let i = 0; i < grouped.length; i++) {
      const overlaps = grouped[i].some((existing) =>
        clipRangesOverlap(existing.start, existing.duration, clip.start, clip.duration)
      );
      if (!overlaps) {
        grouped[i].push(clip);
        placed = true;
        break;
      }
    }
    if (!placed) grouped.push([clip]);
  }

  return grouped.map((trackClips, i) => ({
    id: i === 0 ? 't_anim' : `t_anim_${i + 1}`,
    type: 'overlay',
    name: i === 0 ? 'Animation' : `Animation ${i + 1}`,
    clips: trackClips,
  }));
}

function buildDialogueContext(subtitleClips: SubtitleClip[]): string {
  if (subtitleClips.length === 0) return '';
  const sorted = [...subtitleClips].sort((a, b) => a.start - b.start);
  return sorted
    .map((clip) => {
      const start = clip.start.toFixed(2);
      const end = (clip.start + clip.duration).toFixed(2);
      const speaker = clip.speaker || 'Speaker';
      return `[${start}s-${end}s] ${speaker}: ${cleanText(clip.text)}`;
    })
    .join('\n');
}

function fallbackMomentsFromSubtitles(
  subtitleClips: SubtitleClip[],
  videoDurationSeconds: number,
  maxMoments: number
): AnimationMoment[] {
  if (subtitleClips.length === 0 || videoDurationSeconds <= 0) return [];

  const sorted = [...subtitleClips].sort((a, b) => a.start - b.start);
  const desired = clamp(Math.ceil(videoDurationSeconds / 12), 1, Math.max(1, maxMoments));
  const stride = Math.max(1, Math.floor(sorted.length / desired));
  const moments: AnimationMoment[] = [];
  const fallbackStyles = ['spotlight', 'split-comparison', 'flow-diagram', 'orbit-stat', 'timeline-lane'];
  const fallbackMotion = ['snap', 'glide', 'sweep', 'orbit', 'parallax'];
  const fallbackLayout = ['center', 'split', 'timeline', 'radial', 'left-focus'];

  for (let i = 0; i < sorted.length && moments.length < Math.max(1, maxMoments); i += stride) {
    const clip = sorted[i];
    const start = clamp(clip.start, 0, Math.max(0, videoDurationSeconds - 0.05));
    const maxDuration = Math.max(0.2, videoDurationSeconds - start);
    const duration = clamp(Math.min(Math.max(clip.duration, 1.6), 4), 0.2, maxDuration);
    moments.push({
      start,
      duration,
      type: 'callout',
      subtitle: cleanText(clip.text).slice(0, 120) || `Animation moment ${moments.length + 1}`,
      content: cleanText(clip.text).split(' ').slice(0, 5).join(' ') || `Animation moment ${moments.length + 1}`,
      visualStyle: fallbackStyles[moments.length % fallbackStyles.length],
      motion: fallbackMotion[moments.length % fallbackMotion.length],
      layout: fallbackLayout[moments.length % fallbackLayout.length],
      emphasis: cleanText(clip.text).split(' ').slice(0, 2).join(' '),
      animationPrompt: `Use abstract concept visuals for: ${cleanText(clip.text).slice(0, 100)}`,
    });
  }

  return moments.sort((a, b) => a.start - b.start);
}

function normalizePlan(
  raw: unknown,
  subtitleClips: SubtitleClip[],
  videoDurationSeconds: number,
  maxMoments: number
): AnimationPlan {
  const fallbackDuration = Math.max(1, videoDurationSeconds || 1);
  const asObj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;

  const rawDuration =
    toNumber(asObj?.videoDurationSeconds) ??
    toNumber(asObj?.durationSeconds) ??
    toNumber(asObj?.videoDuration) ??
    toNumber(asObj?.duration);
  const safeDuration = rawDuration && rawDuration > 0 ? rawDuration : fallbackDuration;

  const rawMomentsValue = Array.isArray(raw)
    ? raw
    : Array.isArray(asObj?.moments)
      ? asObj?.moments
      : Array.isArray(asObj?.animations)
        ? asObj?.animations
        : Array.isArray(asObj?.plan)
          ? asObj?.plan
          : Array.isArray((asObj?.plan as Record<string, unknown> | undefined)?.moments)
            ? (asObj?.plan as Record<string, unknown>).moments
            : [];

  const normalized: AnimationMoment[] = [];
  for (const entry of rawMomentsValue as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const moment = entry as Record<string, unknown>;
    const rawStart =
      toNumber(moment.start) ??
      toNumber(moment.startSeconds) ??
      toNumber(moment.startTime) ??
      toNumber(moment.timestamp) ??
      toNumber(moment.time) ??
      0;
    const rawDurationValue =
      toNumber(moment.duration) ??
      toNumber(moment.durationSeconds) ??
      toNumber(moment.lengthSeconds) ??
      2.5;
    const maxAllowedDuration = Math.max(0.2, safeDuration - rawStart);
    const cappedMaxDuration = Math.min(6, maxAllowedDuration);
    if (maxAllowedDuration <= 0) continue;

    const start = clamp(rawStart, 0, Math.max(0, safeDuration - 0.05));
    const duration = clamp(rawDurationValue, 0.2, cappedMaxDuration);
    const type =
      (typeof moment.type === 'string' && moment.type) ||
      (typeof moment.animationType === 'string' && moment.animationType) ||
      'callout';
    const content =
      (typeof moment.content === 'string' && moment.content) ||
      (typeof moment.visualContent === 'string' && moment.visualContent) ||
      (typeof moment.sceneContent === 'string' && moment.sceneContent) ||
      (typeof moment.clipConcept === 'string' && moment.clipConcept) ||
      (typeof moment.headline === 'string' && moment.headline) ||
      (typeof moment.text === 'string' && moment.text) ||
      (typeof moment.description === 'string' && moment.description) ||
      (typeof moment.title === 'string' && moment.title) ||
      '';
    const subtitle =
      (typeof moment.subtitle === 'string' && moment.subtitle) ||
      (typeof moment.subtitleContent === 'string' && moment.subtitleContent) ||
      (typeof moment.scriptLine === 'string' && moment.scriptLine) ||
      '';
    const normalizedContent = cleanText(content);
    if (isGenericMomentContent(normalizedContent)) continue;
    const visualStyle =
      (typeof moment.visualStyle === 'string' && moment.visualStyle) ||
      (typeof moment.style === 'string' && moment.style) ||
      (typeof moment.scene === 'string' && moment.scene) ||
      '';
    const motion =
      (typeof moment.motion === 'string' && moment.motion) ||
      (typeof moment.motionStyle === 'string' && moment.motionStyle) ||
      '';
    const layout =
      (typeof moment.layout === 'string' && moment.layout) ||
      (typeof moment.composition === 'string' && moment.composition) ||
      '';
    const emphasis =
      (typeof moment.emphasis === 'string' && moment.emphasis) ||
      (typeof moment.keyword === 'string' && moment.keyword) ||
      '';
    const animationPrompt =
      (typeof moment.animationPrompt === 'string' && moment.animationPrompt) ||
      (typeof moment.scenePrompt === 'string' && moment.scenePrompt) ||
      (typeof moment.directionPrompt === 'string' && moment.directionPrompt) ||
      '';

    normalized.push({
      ...moment,
      start,
      duration,
      type: cleanText(type) || 'callout',
      content: normalizedContent || 'Animation moment',
      subtitle: cleanText(subtitle) || undefined,
      visualStyle: cleanText(visualStyle) || undefined,
      motion: cleanText(motion) || undefined,
      layout: cleanText(layout) || undefined,
      emphasis: cleanText(emphasis) || undefined,
      animationPrompt: cleanText(animationPrompt) || undefined,
    } as AnimationMoment);
  }

  const deduped = normalized
    .sort((a, b) => a.start - b.start)
    .filter((moment, idx, arr) => {
      if (idx === 0) return true;
      const prev = arr[idx - 1];
      const startGap = Math.abs(moment.start - prev.start);
      return startGap > 0.1 || moment.content !== prev.content;
    })
    .slice(0, Math.max(1, maxMoments));

  const moments =
    deduped.length > 0 ? deduped : fallbackMomentsFromSubtitles(subtitleClips, safeDuration, maxMoments);
  return { videoDurationSeconds: safeDuration, moments: applyAnimationCadence(moments, safeDuration) };
}

function getAnimationCoverageLimit(videoDurationSeconds: number): number {
  if (videoDurationSeconds <= 12) return 0.6;
  if (videoDurationSeconds <= 20) return 0.56;
  if (videoDurationSeconds <= 40) return 0.5;
  return 0.45;
}

function getMinimumGapSeconds(videoDurationSeconds: number): number {
  if (videoDurationSeconds <= 12) return 0.7;
  if (videoDurationSeconds <= 20) return 0.8;
  return 0.9;
}

function applyAnimationCadence(moments: AnimationMoment[], videoDurationSeconds: number): AnimationMoment[] {
  if (moments.length === 0 || videoDurationSeconds <= 0) return moments;

  const minGap = getMinimumGapSeconds(videoDurationSeconds);
  const perMomentMax = videoDurationSeconds <= 12 ? 4 : videoDurationSeconds <= 20 ? 4.5 : 5.5;
  const minDuration = videoDurationSeconds <= 12 ? 1.2 : 1.4;
  const maxTotalAnimated = videoDurationSeconds * getAnimationCoverageLimit(videoDurationSeconds);

  const arranged = [...moments]
    .sort((a, b) => a.start - b.start)
    .map((moment) => {
      const maxInsideTimeline = Math.max(minDuration, videoDurationSeconds - moment.start);
      return {
        ...moment,
        duration: clamp(moment.duration, minDuration, Math.min(perMomentMax, maxInsideTimeline)),
      };
    });

  const enforceSequentialCaps = (): void => {
    for (let i = 0; i < arranged.length - 1; i++) {
      const current = arranged[i];
      const next = arranged[i + 1];
      const maxDurationBeforeNext = Math.max(MIN_MOMENT_DURATION_SECONDS, next.start - current.start - minGap);
      current.duration = Math.min(current.duration, maxDurationBeforeNext);
    }
    const last = arranged[arranged.length - 1];
    const maxInsideTimeline = Math.max(MIN_MOMENT_DURATION_SECONDS, videoDurationSeconds - last.start);
    last.duration = Math.min(last.duration, maxInsideTimeline);
  };

  enforceSequentialCaps();

  let totalAnimated = arranged.reduce((sum, moment) => sum + moment.duration, 0);
  if (totalAnimated > maxTotalAnimated) {
    const scale = maxTotalAnimated / totalAnimated;
    for (const moment of arranged) {
      moment.duration = Math.max(MIN_MOMENT_DURATION_SECONDS, moment.duration * scale);
    }
    enforceSequentialCaps();
    totalAnimated = arranged.reduce((sum, moment) => sum + moment.duration, 0);

    if (totalAnimated > maxTotalAnimated) {
      let excess = totalAnimated - maxTotalAnimated;
      const adjustable = arranged
        .map((moment, index) => ({ index, slack: Math.max(0, moment.duration - MIN_MOMENT_DURATION_SECONDS) }))
        .sort((a, b) => b.slack - a.slack);
      for (const item of adjustable) {
        if (excess <= 0) break;
        const reducible = Math.min(arranged[item.index].duration - MIN_MOMENT_DURATION_SECONDS, excess);
        if (reducible <= 0) continue;
        arranged[item.index].duration -= reducible;
        excess -= reducible;
      }
      enforceSequentialCaps();
    }
  }

  return arranged.map((moment) => ({
    ...moment,
    start: Number(moment.start.toFixed(2)),
    duration: Number(moment.duration.toFixed(2)),
  }));
}

function computeTargetMomentCount(videoDurationSeconds: number): number {
  if (videoDurationSeconds <= 12) return 2;
  if (videoDurationSeconds <= 20) return 3;
  if (videoDurationSeconds <= 35) return 4;
  return clamp(Math.round(videoDurationSeconds / 8), 4, MAX_MOMENTS);
}

/**
 * Removes any JSX that renders subtitle/props.subtitle so the clip never shows
 * full-sentence captions. Subtitle is context-only for timing/audio.
 */
function stripSubtitleRenderingFromClipCode(source: string): string {
  let out = source;
  // Remove block: {subtitle && ( ... )} (match balanced parens)
  const subAndBlock = /\{\s*subtitle\s*&&\s*\(/g;
  let match: RegExpExecArray | null;
  const toRemove: { start: number; end: number }[] = [];
  while ((match = subAndBlock.exec(out)) !== null) {
    const start = match.index;
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < out.length && depth > 0) {
      const c = out[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    if (depth === 0 && i < out.length && out[i] === '}') i++; // include trailing }
    toRemove.push({ start, end: i });
  }
  for (let j = toRemove.length - 1; j >= 0; j--) {
    const { start, end } = toRemove[j];
    out = out.slice(0, start) + out.slice(end);
  }
  // Also remove {props.subtitle && ( ... )} blocks
  const propsSubBlock = /\{\s*props\.subtitle\s*&&\s*\(/g;
  toRemove.length = 0;
  while ((match = propsSubBlock.exec(out)) !== null) {
    const start = match.index;
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < out.length && depth > 0) {
      const c = out[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    if (depth === 0 && i < out.length && out[i] === '}') i++;
    toRemove.push({ start, end: i });
  }
  for (let j = toRemove.length - 1; j >= 0; j--) {
    const { start, end } = toRemove[j];
    out = out.slice(0, start) + out.slice(end);
  }
  // Blank any remaining subtitle content so nothing shows
  out = out.replace(/\{subtitle\}/g, "{''}");
  out = out.replace(/\{props\.subtitle\}/g, "{''}");
  out = out.replace(/\{\s*\(props\.subtitle\s*\|\|[^}]+\)\s*\}/g, "{''}");
  out = out.replace(/\{\s*\([^)]*props\.subtitle[^)]*\)\s*\}/g, "{''}");
  return out;
}

function cleanGeneratedCode(raw: string): string {
  const text = raw.trim();
  const fenced = text.match(/```(?:tsx|ts|jsx|js)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ? fenced[1].trim() : text;
  const normalized = candidate.replace(/\r\n/g, '\n').trim();
  return stripSubtitleRenderingFromClipCode(normalized);
}

function looksLikeGeneratedClipCode(source: string): boolean {
  return (
    /\bexport\s+const\s+GeneratedClip\b/.test(source) &&
    /from\s+["']remotion["']/.test(source) &&
    /useCurrentFrame/.test(source)
  );
}

function getGeneratedClipFilePath(index: number): string {
  return path.join(REMOTION_ROOT_DIR, 'src', `GeneratedClip${index}.tsx`);
}

function getCompositionId(index: number): string {
  return `GeneratedClip${index}`;
}

function writeGeneratedClipSource(source: string): void {
  ensureDir(path.dirname(REMOTION_GENERATED_CLIP_FILE));
  fs.writeFileSync(REMOTION_GENERATED_CLIP_FILE, source, 'utf8');
}

/** Write clip code to per-moment file for parallel render (Approach 1). */
function writeGeneratedClipSourceForIndex(source: string, index: number): void {
  const filePath = getGeneratedClipFilePath(index);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, source, 'utf8');
}

/** Generate Root.tsx that registers GeneratedClip0..GeneratedClip(N-1) for parallel render. */
function writeRemotionRoot(momentCount: number): void {
  const n = Math.min(momentCount, MAX_COMPOSITIONS);
  const maxDurationFrames = Math.ceil(7 * REMOTION_FPS);
  const lines: string[] = [
    'import React from \'react\';',
    'import { Composition } from \'remotion\';',
    ...Array.from({ length: n }, (_, i) => `import { GeneratedClip as GeneratedClip${i} } from './GeneratedClip${i}';`),
    '',
    'const RemotionRoot: React.FC = () => (',
    '  <>',
    ...Array.from({ length: n }, (_, i) =>
      `    <Composition id="GeneratedClip${i}" component={GeneratedClip${i}} durationInFrames={${maxDurationFrames}} fps={${REMOTION_FPS}} width={${REMOTION_WIDTH}} height={${REMOTION_HEIGHT}} defaultProps={{}} />`
    ),
    '  </>',
    ');',
    'export { RemotionRoot };',
    'export default RemotionRoot;',
  ];
  ensureDir(path.dirname(REMOTION_ROOT_FILE));
  fs.writeFileSync(REMOTION_ROOT_FILE, lines.join('\n'), 'utf8');
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function resetDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function runCommand(bin: string, args: string[], cwd: string, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    animationInfo('Running command', {
      label,
      bin,
      cwd,
      argsPreview: summarizeForLog(args.join(' '), 220),
    });

    const proc = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 6000) {
        stdout = stdout.slice(-6000);
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 6000) {
        stderr = stderr.slice(-6000);
      }
    });

    proc.on('error', (error) => reject(error));
    proc.on('close', (code) => {
      const elapsedMs = Date.now() - startedAt;
      if (code === 0) {
        animationInfo('Command completed', { label, bin, elapsedMs });
        resolve();
      } else {
        reject(
          new Error(
            `${bin} exited with code ${code}. stderr=${stderr.slice(-1200)} stdout=${stdout.slice(-600)}`
          )
        );
      }
    });
  });
}

function getLocalRemotionBinaryPath(): string {
  return path.join(
    REMOTION_ROOT_DIR,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'remotion.cmd' : 'remotion'
  );
}

async function ensureRemotionDependenciesInstalled(): Promise<void> {
  const remotionBin = getLocalRemotionBinaryPath();
  if (fs.existsSync(remotionBin)) return;

  animationInfo('Installing remotion-animation dependencies', {
    remotionRootDir: REMOTION_ROOT_DIR,
    remotionBin,
  });
  const installBins = process.platform === 'win32'
    ? ['npm.cmd', 'npm']
    : ['npm'];

  const installArgs = ['install', '--no-audit', '--no-fund'];
  const failures: string[] = [];

  for (const bin of installBins) {
    try {
      await runCommand(bin, installArgs, REMOTION_ROOT_DIR, 'install-remotion-dependencies');
      break;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!fs.existsSync(remotionBin)) {
    throw new Error(
      `Failed to set up remotion-animation dependencies. ${
        failures.join(' | ') || 'Install step did not produce local Remotion CLI.'
      }`
    );
  }
}

let remotionBrowserEnsured = false;

async function ensureRemotionBrowser(): Promise<void> {
  if (remotionBrowserEnsured) return;
  const localBin = getLocalRemotionBinaryPath();
  if (!fs.existsSync(localBin)) return;
  try {
    await runCommand(localBin, ['browser', 'ensure'], REMOTION_ROOT_DIR, 'remotion-browser-ensure');
    remotionBrowserEnsured = true;
  } catch (error) {
    animationWarn('Remotion browser ensure failed (render may still work)', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function renderMomentWithRemotion(
  outputPath: string,
  moment: AnimationMoment,
  index: number,
  topic: string,
  remotionProjectDir: string,
  compositionId?: string
): Promise<void> {
  await ensureRemotionDependenciesInstalled();

  const frames = Math.max(1, Math.round(moment.duration * REMOTION_FPS));
  const props = {
    type: moment.type,
    content: moment.content,
    subtitle: moment.subtitle,
    visualStyle: moment.visualStyle,
    motion: moment.motion,
    layout: moment.layout,
    emphasis: moment.emphasis,
    animationPrompt: moment.animationPrompt,
    topic,
    seed: index + 1,
    durationSeconds: moment.duration,
  };
  const propsPath = path.join(remotionProjectDir, `moment_${index}_props.json`);
  fs.writeFileSync(propsPath, JSON.stringify(props), 'utf8');

  const compId = compositionId ?? REMOTION_COMPOSITION_ID;
  const renderTimeoutMs = 60_000;
  const renderArgs = [
    'render',
    compId,
    outputPath,
    `--frames=0-${frames - 1}`,
    `--props=${propsPath}`,
    '--codec=h264',
    '--pixel-format=yuv420p',
    `--timeout=${renderTimeoutMs}`,
  ];

  try {
    const localBin = getLocalRemotionBinaryPath();
    if (fs.existsSync(localBin)) {
      await runCommand(localBin, renderArgs, REMOTION_ROOT_DIR, `render-moment-${index}`);
      return;
    }

    const bins = process.platform === 'win32'
      ? ['npx.cmd', 'npm.cmd']
      : ['npx', 'npm'];
    const failures: string[] = [];

    for (const bin of bins) {
      try {
        const args =
          bin.startsWith('npm')
            ? ['exec', '--yes', '--package', `remotion@${REMOTION_VERSION}`, '--', 'remotion', ...renderArgs]
            : ['--yes', '--package', `remotion@${REMOTION_VERSION}`, 'remotion', ...renderArgs];
        await runCommand(bin, args, REMOTION_ROOT_DIR, `render-moment-${index}-fallback`);
        return;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    throw new Error(`Remotion render failed. ${failures.join(' | ')}`);
  } finally {
    try {
      if (fs.existsSync(propsPath)) {
        fs.unlinkSync(propsPath);
      }
    } catch {
      // Non-fatal cleanup.
    }
  }
}

export async function generateAnimationPlanAndRender(params: {
  projectId: string;
  topic: string;
  subtitleClips: SubtitleClip[];
  videoDurationSeconds: number;
}): Promise<{
  animationPlan: AnimationPlan;
  overlayTracks: Track[];
  remotionProjectDir: string;
  renderedProjectDir: string;
}> {
  const { projectId, topic, subtitleClips, videoDurationSeconds } = params;
  const startedAt = Date.now();

  animationInfo('Generation started', {
    projectId,
    topic: summarizeForLog(topic, 120),
    subtitleClipCount: subtitleClips.length,
    videoDurationSeconds,
  });

  if (!fs.existsSync(REMOTION_ROOT_DIR)) {
    throw new Error(`Remotion project not found at ${REMOTION_ROOT_DIR}`);
  }

  ensureDir(RENDERED_ANIMATIONS_ROOT_DIR);

  const projectFolder = getAnimationProjectFolderName(projectId);
  const remotionProjectDir = path.join(REMOTION_ROOT_DIR, projectFolder);
  const renderedProjectDir = path.join(RENDERED_ANIMATIONS_ROOT_DIR, projectFolder);
  resetDir(remotionProjectDir);
  resetDir(renderedProjectDir);

  const dialogueContext = buildDialogueContext(subtitleClips);
  const targetMomentCount = computeTargetMomentCount(videoDurationSeconds);
  const promptSourcePath = 'backend1/src/prompts/animationTimelinePrompt.ts';
  animationInfo('Timeline prompt source selected', {
    projectId,
    source: promptSourcePath,
    dialogueChars: dialogueContext.length,
    targetMomentCount,
  });

  let parsedPlan: unknown = null;
  let aiOutput = '';
  let aiUsedAgent: string | null = null;
  let aiFallbackWithoutAgent = false;
  let aiPromptMentionsSkill = false;
  let aiDiagnostics: unknown = null;
  let aiUsedExaResearch = false;
  let aiUsedExaDirection = false;
  let aiUsedRemotionSkill = false;
  let aiResearchSummary: string | null = null;
  let aiResearchDiagnostics: unknown = null;
  try {
    const aiResult = await generateAnimationPlanWithResearch(topic, dialogueContext, {
      videoDurationSeconds,
      maxMoments: targetMomentCount,
      debugOutputDir: remotionProjectDir,
    });
    aiOutput = aiResult.output;
    aiUsedAgent = aiResult.usedAgent;
    aiFallbackWithoutAgent = aiResult.fallbackWithoutAgent;
    aiPromptMentionsSkill = aiResult.promptMentionsSkill;
    aiDiagnostics = aiResult.diagnostics;
    aiUsedExaResearch = aiResult.usedExaResearch;
    aiUsedExaDirection = aiResult.usedExaDirection;
    aiUsedRemotionSkill = aiResult.usedRemotionSkill;
    aiResearchSummary = aiResult.researchSummary;
    aiResearchDiagnostics = aiResult.researchDiagnostics;

    const aiOutputPath = path.join(remotionProjectDir, OPENCODE_OUTPUT_FILENAME);
    fs.writeFileSync(aiOutputPath, aiOutput, 'utf8');
    parsedPlan = parseOpenCodeJSON(aiOutput);

    animationInfo('AI plan response captured', {
      projectId,
      usedAgent: aiUsedAgent,
      fallbackWithoutAgent: aiFallbackWithoutAgent,
      promptMentionsSkill: aiPromptMentionsSkill,
      usedExaResearch: aiUsedExaResearch,
      usedExaDirection: aiUsedExaDirection,
      usedRemotionSkill: aiUsedRemotionSkill,
      outputChars: aiOutput.length,
      outputSnapshotPath: aiOutputPath,
      researchSummaryPreview: summarizeForLog(aiResearchSummary || '', 260),
      researchDiagnostics: aiResearchDiagnostics,
      diagnostics: aiDiagnostics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hardFailure =
      /OpenCode CLI is unavailable/i.test(message) ||
      /OpenCode MCP server "exa" is not connected/i.test(message) ||
      /did not use Exa MCP/i.test(message) ||
      /did not use the remotion-best-practices skill/i.test(message);
    if (hardFailure) {
      throw new Error(message);
    }
    console.log('[Animation] Step: AI plan failed (using fallback). Reason:', message);
    animationWarn('AI plan generation failed, falling back to subtitle-derived moments', {
      projectId,
      message,
    });
  }

  const parsedMomentCount = countRawMoments(parsedPlan);
  const normalizedPlan = normalizePlan(parsedPlan, subtitleClips, videoDurationSeconds, targetMomentCount);
  const usedFallbackMoments = parsedMomentCount === 0;
  animationInfo('Plan normalized', {
    projectId,
    parsedMomentCount,
    normalizedMomentCount: normalizedPlan.moments.length,
    usedFallbackMoments,
    firstMoments: normalizedPlan.moments.slice(0, 3).map((moment, index) => ({
      index,
      start: moment.start,
      duration: moment.duration,
      type: moment.type,
      content: summarizeForLog(moment.content, 100),
      subtitle: summarizeForLog(moment.subtitle || '', 100),
      visualStyle: moment.visualStyle,
      motion: moment.motion,
      layout: moment.layout,
    })),
  });

  if (normalizedPlan.moments.length === 0) {
    throw new Error('Animation plan has no usable moments');
  }

  const moments: AnimationMoment[] = normalizedPlan.moments.map((sourceMoment) => ({
    ...sourceMoment,
    subtitle: sourceMoment.subtitle || sourceMoment.content,
  }));

  const numMoments = moments.length;

  const OPENCODE_SERIAL_DELAY_MS = 3000;

  await new Promise((r) => setTimeout(r, OPENCODE_SERIAL_DELAY_MS));

  console.log('[Animation] Step: clip-code – generating for', numMoments, 'moments (serial)...');
  animationInfo('Generating clip code in serial', { projectId, momentCount: numMoments });

  const opencodeEnvironment = await inspectOpenCodeEnvironment(process.cwd());

  const clipCodeResults: Array<{ index: number; clipCode: string; usedExa: boolean; usedSkill: boolean }> = [];
  try {
    for (let i = 0; i < moments.length; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, OPENCODE_SERIAL_DELAY_MS));
      }
      const moment = moments[i];
      const clipCodeResult = await generateRemotionClipCodeWithSkill(
        {
          topic,
          dialogueContext,
          researchSummary: aiResearchSummary,
          moment: {
            index: i,
            totalMoments: numMoments,
            ...moment,
          },
        },
        { debugOutputDir: remotionProjectDir, environment: opencodeEnvironment }
      );
      const clipCodeOutputPath = path.join(remotionProjectDir, `clip-code-output-${i}.raw.txt`);
      fs.writeFileSync(clipCodeOutputPath, clipCodeResult.output, 'utf8');
      const candidate = cleanGeneratedCode(clipCodeResult.code || '');
      if (!candidate || !looksLikeGeneratedClipCode(candidate)) {
        throw new Error(`Generated clip code for moment ${i} was empty or invalid.`);
      }
      clipCodeResults.push({
        index: i,
        clipCode: candidate,
        usedExa: clipCodeResult.usedExaClipCode,
        usedSkill: clipCodeResult.usedRemotionSkill,
      });
      animationInfo('Clip code generated', {
        projectId,
        index: i,
        usedExaClipCode: clipCodeResult.usedExaClipCode,
        usedRemotionSkill: clipCodeResult.usedRemotionSkill,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[Animation] Step: clip-code – failed. Reason:', msg);
    throw err;
  }
  console.log('[Animation] Step: clip-code – done,', clipCodeResults.length, 'generated');

  let clipCodeGeneratedCount = clipCodeResults.length;
  let clipCodeUsedExaCount = clipCodeResults.filter((r) => r.usedExa).length;
  let clipCodeUsedSkillCount = clipCodeResults.filter((r) => r.usedSkill).length;

  for (const { index: i, clipCode } of clipCodeResults) {
    writeGeneratedClipSourceForIndex(clipCode, i);
    try {
      fs.writeFileSync(path.join(remotionProjectDir, `clip-code-${i}.tsx`), clipCode, 'utf8');
    } catch (error) {
      animationWarn('Failed writing clip source snapshot', {
        projectId,
        index: i,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  writeRemotionRoot(numMoments);

  await ensureRemotionBrowser();

  console.log('[Animation] Step: render – rendering', numMoments, 'moments (serial)...');
  animationInfo('Rendering moments in serial', { projectId, momentCount: numMoments });

  const renderedMoments: Array<{ moment: AnimationMoment; outputPath: string }> = [];
  const renderFailures: Array<{ index: number; message: string }> = [];

  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i];
    const outputPath = path.join(renderedProjectDir, `moment_${i}.mp4`);
    animationInfo('Rendering moment', {
      projectId,
      index: i,
      outputPath,
      start: moment.start,
      duration: moment.duration,
      type: moment.type,
      content: summarizeForLog(moment.content, 120),
    });
    try {
      await renderMomentWithRemotion(
        outputPath,
        moment,
        i,
        topic,
        remotionProjectDir,
        getCompositionId(i)
      );
      if (!fs.existsSync(outputPath)) {
        throw new Error(`Rendered file not found: ${outputPath}`);
      }
      renderedMoments.push({ moment, outputPath });
      animationInfo('Rendered moment successfully', {
        projectId,
        index: i,
        outputPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      renderFailures.push({ index: i, message });
      console.log('[Animation] Step: render – moment', i, 'failed:', message);
      animationWarn('Failed rendering moment', {
        projectId,
        index: i,
        message,
      });
    }
  }

  console.log('[Animation] Step: render – done,', renderedMoments.length, 'succeeded,', renderFailures.length, 'failed');
  renderedMoments.sort((a, b) => {
    const aIdx = parseInt(path.basename(a.outputPath).replace('moment_', '').replace('.mp4', ''), 10);
    const bIdx = parseInt(path.basename(b.outputPath).replace('moment_', '').replace('.mp4', ''), 10);
    return aIdx - bIdx;
  });

  if (renderedMoments.length === 0) {
    throw new Error('No animation moments were rendered successfully');
  }

  const overlayClips: OverlayClip[] = renderedMoments.map(({ moment, outputPath }, index) => ({
    id: `anim_${index}`,
    kind: 'overlay',
    start: moment.start,
    duration: moment.duration,
    assetId: `anim_${index}`,
    label: clipLabel(moment, index),
    x: DEFAULT_OVERLAY_X,
    y: DEFAULT_OVERLAY_Y,
    scale: DEFAULT_OVERLAY_SCALE,
    displayMode: 'replace',
    path: outputPath,
  }));
  const overlayTracks = assignMomentsToOverlayTracks(overlayClips);

  const finalPlan: AnimationPlan = {
    videoDurationSeconds: normalizedPlan.videoDurationSeconds,
    moments: renderedMoments.map((m) => m.moment),
  };

  const planPayload = {
    projectId,
    topic,
    generatedAt: new Date().toISOString(),
    animationPlan: finalPlan,
    renderedFiles: renderedMoments.map((m) => m.outputPath),
  };
  const planPath = path.join(remotionProjectDir, PLAN_FILENAME);
  fs.writeFileSync(planPath, JSON.stringify(planPayload, null, 2), 'utf8');

  const tracePayload = {
    projectId,
    topic,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    input: {
      subtitleClipCount: subtitleClips.length,
      videoDurationSeconds,
      targetMomentCount,
    },
    prompt: {
      sourcePath: promptSourcePath,
      promptSnapshotPath: null,
      promptChars: null,
      promptMentionsSkill: aiPromptMentionsSkill,
      preview: 'Prompt is built by buildAnimationTimelineWithResearchPrompt (timeline+research combined) in animationTimelinePrompt.ts.',
    },
    ai: {
      usedAgent: aiUsedAgent,
      fallbackWithoutAgent: aiFallbackWithoutAgent,
      promptMentionsSkill: aiPromptMentionsSkill,
      usedExaResearch: aiUsedExaResearch,
      usedExaDirection: aiUsedExaDirection,
      usedRemotionSkill: aiUsedRemotionSkill,
      researchSummaryPreview: summarizeForLog(aiResearchSummary || '', 320),
      researchDiagnostics: aiResearchDiagnostics,
      outputChars: aiOutput.length,
      diagnostics: aiDiagnostics,
      parsedMomentCount,
      usedFallbackMoments,
    },
    clipCode: {
      attempted: normalizedPlan.moments.length,
      generated: clipCodeGeneratedCount,
      usedExaCount: clipCodeUsedExaCount,
      usedRemotionSkillCount: clipCodeUsedSkillCount,
      strictMode: true,
    },
    render: {
      attempted: normalizedPlan.moments.length,
      succeeded: renderedMoments.length,
      failed: renderFailures.length,
      failures: renderFailures,
    },
    outputs: {
      remotionProjectDir,
      renderedProjectDir,
      planPath,
      renderedFiles: renderedMoments.map((m) => m.outputPath),
    },
  };

  const tracePath = path.join(remotionProjectDir, DEBUG_TRACE_FILENAME);
  try {
    fs.writeFileSync(tracePath, JSON.stringify(tracePayload, null, 2), 'utf8');
  } catch (error) {
    animationWarn('Failed writing debug trace file', {
      projectId,
      tracePath,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  animationInfo('Generation finished', {
    projectId,
    elapsedMs: Date.now() - startedAt,
    renderedMoments: renderedMoments.length,
    overlayTrackCount: overlayTracks.length,
    planPath,
    tracePath,
  });

  return {
    animationPlan: finalPlan,
    overlayTracks,
    remotionProjectDir,
    renderedProjectDir,
  };
}
