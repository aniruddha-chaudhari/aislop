import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { OverlayClip, SubtitleClip, Track } from '../schema/project';
import { generateAnimationPlanWithResearch, parseOpenCodeJSON } from '../agents/gemini3agent';

const REMOTION_ROOT_DIR = path.join(process.cwd(), 'storage', 'remotion-animation');
const RENDERED_ANIMATIONS_ROOT_DIR = path.join(process.cwd(), 'storage', 'rendered-animations');
const PROMPT_PATHS = [
  path.join(REMOTION_ROOT_DIR, 'ANIMATION_OVERLAY_PROMPT.md'),
  path.join(process.cwd(), 'backend1', 'storage', 'remotion-animation', 'ANIMATION_OVERLAY_PROMPT.md'),
];
const REMOTION_COMPOSITION_ID = 'StewiePeterOverlay';
const REMOTION_FPS = 30;
const PLAN_FILENAME = 'animation-plan.json';
const REMOTION_VERSION = '4.0.419';

const DEFAULT_OVERLAY_X = 0.5;
const DEFAULT_OVERLAY_Y = 0.65;
const DEFAULT_OVERLAY_SCALE = 0.5;
const MAX_MOMENTS = 8;
const ANIMATION_DEBUG_ENABLED = process.env.ANIMATION_DEBUG === '1';
const PROMPT_SNAPSHOT_FILENAME = 'animation-prompt.sent.txt';
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
  visualStyle?: string;
  motion?: string;
  layout?: string;
  emphasis?: string;
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

function animationInfo(message: string, data?: Record<string, unknown>): void {
  if (!ANIMATION_DEBUG_ENABLED) return;
  if (data && Object.keys(data).length > 0) {
    console.info(`[Animation Plan] ${message}`, data);
    return;
  }
  console.info(`[Animation Plan] ${message}`);
}

function animationWarn(message: string, data?: Record<string, unknown>): void {
  if (data && Object.keys(data).length > 0) {
    console.warn(`[Animation Plan] ${message}`, data);
    return;
  }
  console.warn(`[Animation Plan] ${message}`);
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

function fallbackMomentsFromSubtitles(subtitleClips: SubtitleClip[], videoDurationSeconds: number): AnimationMoment[] {
  if (subtitleClips.length === 0 || videoDurationSeconds <= 0) return [];

  const sorted = [...subtitleClips].sort((a, b) => a.start - b.start);
  const desired = clamp(Math.ceil(videoDurationSeconds / 12), 1, MAX_MOMENTS);
  const stride = Math.max(1, Math.floor(sorted.length / desired));
  const moments: AnimationMoment[] = [];
  const fallbackStyles = ['spotlight', 'split-comparison', 'flow-diagram', 'orbit-stat', 'timeline-lane'];
  const fallbackMotion = ['snap', 'glide', 'sweep', 'orbit', 'parallax'];
  const fallbackLayout = ['center', 'split', 'timeline', 'radial', 'left-focus'];

  for (let i = 0; i < sorted.length && moments.length < MAX_MOMENTS; i += stride) {
    const clip = sorted[i];
    const start = clamp(clip.start, 0, Math.max(0, videoDurationSeconds - 0.05));
    const maxDuration = Math.max(0.2, videoDurationSeconds - start);
    const duration = clamp(Math.min(Math.max(clip.duration, 1.6), 4), 0.2, maxDuration);
    moments.push({
      start,
      duration,
      type: 'callout',
      content: cleanText(clip.text).slice(0, 120) || `Animation moment ${moments.length + 1}`,
      visualStyle: fallbackStyles[moments.length % fallbackStyles.length],
      motion: fallbackMotion[moments.length % fallbackMotion.length],
      layout: fallbackLayout[moments.length % fallbackLayout.length],
      emphasis: cleanText(clip.text).split(' ').slice(0, 2).join(' '),
    });
  }

  return moments.sort((a, b) => a.start - b.start);
}

function normalizePlan(raw: unknown, subtitleClips: SubtitleClip[], videoDurationSeconds: number): AnimationPlan {
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
      (typeof moment.headline === 'string' && moment.headline) ||
      (typeof moment.text === 'string' && moment.text) ||
      (typeof moment.description === 'string' && moment.description) ||
      (typeof moment.title === 'string' && moment.title) ||
      '';
    const normalizedContent = cleanText(content).slice(0, 180);
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

    normalized.push({
      start,
      duration,
      type: cleanText(type).slice(0, 40) || 'callout',
      content: normalizedContent || 'Animation moment',
      visualStyle: cleanText(visualStyle).slice(0, 40) || undefined,
      motion: cleanText(motion).slice(0, 30) || undefined,
      layout: cleanText(layout).slice(0, 24) || undefined,
      emphasis: cleanText(emphasis).slice(0, 60) || undefined,
    });
  }

  const deduped = normalized
    .sort((a, b) => a.start - b.start)
    .filter((moment, idx, arr) => {
      if (idx === 0) return true;
      const prev = arr[idx - 1];
      const startGap = Math.abs(moment.start - prev.start);
      return startGap > 0.1 || moment.content !== prev.content;
    })
    .slice(0, MAX_MOMENTS);

  const moments = deduped.length > 0 ? deduped : fallbackMomentsFromSubtitles(subtitleClips, safeDuration);
  return { videoDurationSeconds: safeDuration, moments };
}

function readPromptTemplate(): { template: string; sourcePath: string | null } {
  for (const promptPath of PROMPT_PATHS) {
    if (fs.existsSync(promptPath)) {
      return {
        template: fs.readFileSync(promptPath, 'utf8'),
        sourcePath: promptPath,
      };
    }
  }
  return {
    template: `You are a short-form Remotion animation planner for VERTICAL 9:16 educational videos.
Plan visually distinct motion scenes, not repetitive text cards.

TOPIC: {{TOPIC}}
VIDEO_DURATION_SECONDS: {{VIDEO_DURATION_SECONDS}}
MAX_MOMENTS: {{MAX_MOMENTS}}

DIALOGUE_CONTEXT:
{{DIALOGUE_CONTEXT}}

Return JSON only:
{
  "videoDurationSeconds": number,
  "moments": [
    {
      "start": number,
      "duration": number,
      "type": string,
      "content": string,
      "visualStyle": string,
      "motion": string,
      "layout": string,
      "emphasis": string
    }
  ]
}

Rules:
- Output JSON only (no markdown/prose).
- Use at most MAX_MOMENTS moments.
- Every moment must stay inside the video duration.
- Duration per moment: 1.0 to 6.0 seconds.
- Prefer non-overlapping moments and natural spacing across the timeline.
- One core idea per moment; avoid repeated generic title cards.
- Design for fast mobile readability (short, scannable text).
- Prefer varied moment types and varied visualStyle/layout values across the plan.
- Avoid long sentences, dense jargon, code snippets, and tiny-text concepts.`,
    sourcePath: null,
  };
}

function applyPromptTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(pattern, value);
  }
  return result;
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

async function renderMomentWithRemotion(
  outputPath: string,
  moment: AnimationMoment,
  index: number,
  topic: string,
  remotionProjectDir: string
): Promise<void> {
  await ensureRemotionDependenciesInstalled();

  const frames = Math.max(1, Math.round(moment.duration * REMOTION_FPS));
  const props = {
    type: moment.type,
    content: moment.content,
    visualStyle: moment.visualStyle,
    motion: moment.motion,
    layout: moment.layout,
    emphasis: moment.emphasis,
    topic,
    seed: index + 1,
    durationSeconds: moment.duration,
  };
  const propsPath = path.join(remotionProjectDir, `moment_${index}_props.json`);
  fs.writeFileSync(propsPath, JSON.stringify(props), 'utf8');

  const renderArgs = [
    'render',
    REMOTION_COMPOSITION_ID,
    outputPath,
    `--frames=0-${frames - 1}`,
    `--props=${propsPath}`,
    '--codec=h264',
    '--pixel-format=yuv420p',
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
  const { template: promptTemplate, sourcePath: promptSourcePath } = readPromptTemplate();
  const finalPrompt = applyPromptTemplate(promptTemplate, {
    TOPIC: topic,
    VIDEO_DURATION_SECONDS: String(videoDurationSeconds),
    MAX_MOMENTS: String(MAX_MOMENTS),
    DIALOGUE_CONTEXT: dialogueContext,
  });
  const promptMentionsSkill = /\bskills?\b/i.test(finalPrompt);
  const promptSnapshotPath = path.join(remotionProjectDir, PROMPT_SNAPSHOT_FILENAME);
  fs.writeFileSync(promptSnapshotPath, finalPrompt, 'utf8');
  animationInfo('Prompt prepared', {
    projectId,
    source: promptSourcePath || 'inline-default',
    promptChars: finalPrompt.length,
    dialogueChars: dialogueContext.length,
    promptMentionsSkill,
    promptSnapshotPath,
  });

  let parsedPlan: unknown = null;
  let aiOutput = '';
  let aiUsedAgent: string | null = null;
  let aiFallbackWithoutAgent = false;
  let aiPromptMentionsSkill = promptMentionsSkill;
  let aiDiagnostics: unknown = null;
  let aiUsedExaResearch = false;
  let aiUsedRemotionSkill = false;
  let aiResearchSummary: string | null = null;
  let aiResearchDiagnostics: unknown = null;
  try {
    const aiResult = await generateAnimationPlanWithResearch(topic, dialogueContext, {
      videoDurationSeconds,
      maxMoments: MAX_MOMENTS,
      promptTemplate: finalPrompt,
      debugOutputDir: remotionProjectDir,
    });
    aiOutput = aiResult.output;
    aiUsedAgent = aiResult.usedAgent;
    aiFallbackWithoutAgent = aiResult.fallbackWithoutAgent;
    aiPromptMentionsSkill = aiResult.promptMentionsSkill;
    aiDiagnostics = aiResult.diagnostics;
    aiUsedExaResearch = aiResult.usedExaResearch;
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
    animationWarn('AI plan generation failed, falling back to subtitle-derived moments', {
      projectId,
      message,
    });
  }

  const parsedMomentCount = countRawMoments(parsedPlan);
  const normalizedPlan = normalizePlan(parsedPlan, subtitleClips, videoDurationSeconds);
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
      visualStyle: moment.visualStyle,
      motion: moment.motion,
      layout: moment.layout,
    })),
  });

  if (normalizedPlan.moments.length === 0) {
    throw new Error('Animation plan has no usable moments');
  }

  const renderedMoments: Array<{ moment: AnimationMoment; outputPath: string }> = [];
  const renderFailures: Array<{ index: number; message: string }> = [];
  for (let i = 0; i < normalizedPlan.moments.length; i++) {
    const moment = normalizedPlan.moments[i];
    const outputPath = path.join(renderedProjectDir, `moment_${i}.mp4`);
    try {
      animationInfo('Rendering moment', {
        projectId,
        index: i,
        outputPath,
        start: moment.start,
        duration: moment.duration,
        type: moment.type,
        content: summarizeForLog(moment.content, 120),
      });
      await renderMomentWithRemotion(outputPath, moment, i, topic, remotionProjectDir);
      if (!fs.existsSync(outputPath)) {
        throw new Error(`Rendered file not found: ${outputPath}`);
      }
      renderedMoments.push({ moment, outputPath });
      animationInfo('Rendered moment successfully', {
        projectId,
        index: i,
        outputPath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      renderFailures.push({ index: i, message });
      animationWarn('Failed rendering moment', {
        projectId,
        index: i,
        message,
      });
    }
  }

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
    },
    prompt: {
      sourcePath: promptSourcePath,
      promptSnapshotPath,
      promptChars: finalPrompt.length,
      promptMentionsSkill,
      preview: summarizeForLog(finalPrompt, 400),
    },
    ai: {
      usedAgent: aiUsedAgent,
      fallbackWithoutAgent: aiFallbackWithoutAgent,
      promptMentionsSkill: aiPromptMentionsSkill,
      usedExaResearch: aiUsedExaResearch,
      usedRemotionSkill: aiUsedRemotionSkill,
      researchSummaryPreview: summarizeForLog(aiResearchSummary || '', 320),
      researchDiagnostics: aiResearchDiagnostics,
      outputChars: aiOutput.length,
      diagnostics: aiDiagnostics,
      parsedMomentCount,
      usedFallbackMoments,
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
