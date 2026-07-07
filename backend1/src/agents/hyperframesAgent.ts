import fs from 'fs';
import path from 'path';
import {
  inspectOpenCodeEnvironment,
  extractEventStreamText,
  listOpenCodeSkillInvocations,
  opencodeRun,
  parseOpenCodeJSON,
  countRawMomentsInPlan,
  summarizeForLog,
  summarizeOpenCodeOutput,
  describeOpenCodeStreamProgress,
  type OpenCodeOutputDiagnostics,
  type OpenCodeStreamProgressSnapshot,
} from './opencodeagent';
import { buildHyperframesClipHtmlPrompt, type HyperframesClipHtmlPromptParams } from '../prompts/hyperframesClipHtmlPrompt';
import {
  buildHyperframesAnimationPlanPrompt,
  buildHyperframesPlanJsonContinuationPrompt,
} from '../prompts/hyperframesAnimationPlanPrompt';

export type HyperframesOpenCodeEnvironmentCheck = Awaited<ReturnType<typeof inspectOpenCodeEnvironment>> & {
  hyperframesSkillInstalled: boolean;
  hyperframesCliSkillInstalled: boolean;
  gsapSkillInstalled: boolean;
};

export interface HyperframesSkillDiagnostics {
  usedHyperframesSkill: boolean;
  usedHyperframesCliSkill: boolean;
  usedGsapSkill: boolean;
}

export interface HyperframesPlanGenerationResult {
  output: string;
  diagnostics: OpenCodeOutputDiagnostics;
  usedAgent: string | null;
  fallbackWithoutAgent: boolean;
  usedExaResearch: boolean;
  usedExaDirection: boolean;
  usedHyperframesSkill: boolean;
  usedHyperframesCliSkill: boolean;
  usedGsapSkill: boolean;
  researchSummary: string | null;
}

export interface HyperframesClipHtmlGenerationResult {
  output: string;
  html: string | null;
  diagnostics: OpenCodeOutputDiagnostics;
  usedAgent: string | null;
  fallbackWithoutAgent: boolean;
  usedHyperframesSkill: boolean;
  usedHyperframesCliSkill: boolean;
  usedGsapSkill: boolean;
}

function skillDirExists(cwd: string, skillName: string): boolean {
  let current = path.resolve(cwd);
  while (true) {
    if (
      fs.existsSync(path.join(current, '.agents', 'skills', skillName, 'SKILL.md')) ||
      fs.existsSync(path.join(current, '.agent', 'skills', skillName, 'SKILL.md'))
    ) {
      return true;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

export async function inspectHyperframesOpenCodeEnvironment(
  cwd: string
): Promise<HyperframesOpenCodeEnvironmentCheck> {
  const base = await inspectOpenCodeEnvironment(cwd);
  const raw = base.skillsRaw.toLowerCase();
  return {
    ...base,
    hyperframesSkillInstalled: raw.includes('hyperframes') || skillDirExists(cwd, 'hyperframes'),
    hyperframesCliSkillInstalled: raw.includes('hyperframes-cli') || skillDirExists(cwd, 'hyperframes-cli'),
    gsapSkillInstalled: raw.includes('gsap') || skillDirExists(cwd, 'gsap'),
  };
}

function matchesExactSkillName(invokedName: string, expectedSkill: string): boolean {
  const invoked = invokedName.toLowerCase().trim();
  const expected = expectedSkill.toLowerCase();
  if (invoked === expected) return true;
  if (invoked.endsWith(`/${expected}`) || invoked.endsWith(`\\${expected}`)) return true;
  return false;
}

function hasHyperframesSkillStreamMarker(output: string, skillName: string): boolean {
  if (skillName === 'hyperframes') {
    if (/\bloaded skill:\s*hyperframes(?!-cli)\b/i.test(output)) return true;
    const normalized = output.toLowerCase();
    return (
      normalized.includes('<skill_content name="hyperframes"') ||
      normalized.includes("<skill_content name='hyperframes'")
    );
  }
  const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\bloaded skill:\\s*${escaped}\\b`, 'i').test(output)) return true;
  const normalized = output.toLowerCase();
  return (
    normalized.includes(`<skill_content name="${skillName.toLowerCase()}"`) ||
    normalized.includes(`<skill_content name='${skillName.toLowerCase()}'`)
  );
}

function detectHyperframesSkillUsageFromInvocations(invoked: string[]): HyperframesSkillDiagnostics {
  const usedViaTool = (skillName: string) => invoked.some((name) => matchesExactSkillName(name, skillName));
  return {
    usedHyperframesSkill: usedViaTool('hyperframes'),
    usedHyperframesCliSkill: usedViaTool('hyperframes-cli'),
    usedGsapSkill: usedViaTool('gsap'),
  };
}

function detectHyperframesSkillUsage(
  _diagnostics: OpenCodeOutputDiagnostics,
  output: string
): HyperframesSkillDiagnostics {
  const fromTools = detectHyperframesSkillUsageFromInvocations(listOpenCodeSkillInvocations(output));
  return {
    usedHyperframesSkill:
      fromTools.usedHyperframesSkill || hasHyperframesSkillStreamMarker(output, 'hyperframes'),
    usedHyperframesCliSkill:
      fromTools.usedHyperframesCliSkill || hasHyperframesSkillStreamMarker(output, 'hyperframes-cli'),
    usedGsapSkill: fromTools.usedGsapSkill || hasHyperframesSkillStreamMarker(output, 'gsap'),
  };
}

function mergeSkillInvocations(target: Set<string>, output: string): void {
  for (const name of listOpenCodeSkillInvocations(output)) {
    target.add(name);
  }
}

function mergeHyperframesSkillDiagnostics(
  a: HyperframesSkillDiagnostics,
  b: HyperframesSkillDiagnostics
): HyperframesSkillDiagnostics {
  return {
    usedHyperframesSkill: a.usedHyperframesSkill || b.usedHyperframesSkill,
    usedHyperframesCliSkill: a.usedHyperframesCliSkill || b.usedHyperframesCliSkill,
    usedGsapSkill: a.usedGsapSkill || b.usedGsapSkill,
  };
}

function skillDiagnosticsFromCumulativeAndOutput(
  cumulative: Set<string>,
  output: string,
  diagnostics: OpenCodeOutputDiagnostics
): HyperframesSkillDiagnostics {
  const fromCumulative = detectHyperframesSkillUsageFromInvocations([...cumulative]);
  const fromOutput = detectHyperframesSkillUsage(diagnostics, output);
  return mergeHyperframesSkillDiagnostics(fromCumulative, fromOutput);
}

function formatMissingClipSkills(usage: HyperframesSkillDiagnostics): string {
  const missing: string[] = [];
  if (!usage.usedHyperframesSkill) missing.push('"hyperframes"');
  if (!usage.usedHyperframesCliSkill) missing.push('"hyperframes-cli"');
  if (!usage.usedGsapSkill) missing.push('"gsap"');
  return missing.join(', ');
}

function buildClipSkillLoadOnlyPrompt(
  usage: HyperframesSkillDiagnostics,
  attempt: number,
  maxAttempts: number
): string {
  const missing = formatMissingClipSkills(usage);
  const target =
    missing ||
    '"hyperframes", "hyperframes-cli", and "gsap"';
  return `You are preparing HyperFrames authoring skills. This turn is ONLY for loading skills — no HTML, no write tool.

Call the "skill" tool for each required skill: ${target}.
Use one separate tool call per skill name. Do not paraphrase skill bodies.

After all three skills (hyperframes, hyperframes-cli, gsap) are loaded, respond with JSON only: {"ok":true,"skills":["hyperframes","hyperframes-cli","gsap"]}
(attempt ${attempt} of ${maxAttempts})`;
}

function readSkillDigestFromRepo(cwd: string, skillName: string, maxChars: number): string {
  let current = path.resolve(cwd);
  while (true) {
    const skillPath = path.join(current, '.agents', 'skills', skillName, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      const raw = fs.readFileSync(skillPath, 'utf8').trim();
      return raw.length <= maxChars ? raw : `${raw.slice(0, maxChars)}\n...[truncated]`;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return '';
}

function buildHyperframesSkillDigestsAppendix(cwd: string): string {
  const perSkill = Math.max(1500, Number(process.env.HYPERFRAMES_SKILL_DIGEST_CHARS || 3500));
  const hf = readSkillDigestFromRepo(cwd, 'hyperframes', perSkill);
  const cli = readSkillDigestFromRepo(cwd, 'hyperframes-cli', perSkill);
  const gsap = readSkillDigestFromRepo(cwd, 'gsap', perSkill);
  const parts = [
    hf && `## hyperframes (SKILL.md digest)\n${hf}`,
    cli && `## hyperframes-cli (SKILL.md digest)\n${cli}`,
    gsap && `## gsap (SKILL.md digest)\n${gsap}`,
  ].filter(Boolean);
  if (!parts.length) return '';
  return `\n\nPROJECT SKILL DIGESTS (authoritative reference; still call skill tools when enforcement is on):\n${parts.join('\n\n')}`;
}

function extractSkillContentFromOpenCodeOutput(output: string, maxChars: number): string {
  const parts: string[] = [];
  const re = /<skill_content[^>]*\sname=["']([^"']+)["'][^>]*>([\s\S]*?)<\/skill_content>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(output)) !== null) {
    const name = match[1];
    const body = match[2].trim();
    if (body) parts.push(`### Loaded skill: ${name}\n${body.slice(0, 5000)}`);
  }
  const combined = parts.join('\n\n');
  if (!combined) return '';
  const body =
    combined.length <= maxChars
      ? combined
      : `${combined.slice(0, maxChars)}\n...[truncated]`;
  return `\n\nLOADED SKILL CONTENT (from prior OpenCode turn):\n${body}`;
}

const HYPERFRAMES_OPENCODE_PROGRESS_MS = Math.max(
  10000,
  Number(process.env.HYPERFRAMES_OPENCODE_PROGRESS_MS || 20000)
);

async function opencodeRunWithPreferredAgent(
  options: Parameters<typeof opencodeRun>[0],
  preferredAgent: string | null,
  phaseLabel = 'opencode'
): Promise<{ output: string; usedAgent: string | null; fallbackWithoutAgent: boolean }> {
  const phaseStarted = Date.now();
  let latestStream: OpenCodeStreamProgressSnapshot | null = null;
  let lastStdoutChars = 0;
  let stdoutStallTicks = 0;
  const runOptions: Parameters<typeof opencodeRun>[0] = {
    ...options,
    progressThrottleMs: Math.min(
      HYPERFRAMES_OPENCODE_PROGRESS_MS,
      Number(process.env.OPENCODE_PROGRESS_THROTTLE_MS || 5000)
    ),
    onProgress: (snapshot) => {
      if (snapshot.stdoutChars === lastStdoutChars) {
        stdoutStallTicks += 1;
      } else {
        stdoutStallTicks = 0;
        lastStdoutChars = snapshot.stdoutChars;
      }
      latestStream = {
        ...snapshot,
        elapsedMs: Date.now() - phaseStarted,
        ...(stdoutStallTicks >= 2 ? { stdoutStalled: true, stdoutStallTicks } : {}),
      } as OpenCodeStreamProgressSnapshot & { stdoutStalled?: boolean; stdoutStallTicks?: number };
    },
  };

  console.log('[HyperFrames Agent] opencode phase start', {
    phase: phaseLabel,
    promptChars: options.prompt?.length ?? 0,
    model: options.model ?? 'default',
    agent: preferredAgent ?? null,
    earlyCompleteForHyperframesClipHtml: options.earlyCompleteForHyperframesClipHtml ?? false,
    timeoutMs: Number(process.env.OPENCODE_RUN_TIMEOUT_MS || 300000),
  });

  const progressTimer = setInterval(() => {
    if (latestStream) {
      console.log('[HyperFrames Agent] opencode stream', {
        phase: phaseLabel,
        ...latestStream,
      });
      return;
    }
    console.log('[HyperFrames Agent] opencode phase waiting for first stream chunk', {
      phase: phaseLabel,
      elapsedMs: Date.now() - phaseStarted,
    });
  }, HYPERFRAMES_OPENCODE_PROGRESS_MS);

  const finish = (output: string, usedAgent: string | null, fallbackWithoutAgent: boolean) => {
    clearInterval(progressTimer);
    const finalSnapshot = describeOpenCodeStreamProgress(output, {
      elapsedMs: Date.now() - phaseStarted,
      earlyCompleteForHyperframesClipHtml: options.earlyCompleteForHyperframesClipHtml,
      earlyCompleteForClipCode: options.earlyCompleteForClipCode,
    });
    console.log('[HyperFrames Agent] opencode phase complete', {
      phase: phaseLabel,
      usedAgent,
      fallbackWithoutAgent,
      ...finalSnapshot,
    });
    return { output, usedAgent, fallbackWithoutAgent };
  };

  try {
    if (preferredAgent) {
      try {
        const output = await opencodeRun({ ...runOptions, agent: preferredAgent });
        return finish(output, preferredAgent, false);
      } catch {
        console.warn('[HyperFrames Agent] preferred agent failed; retrying without agent', {
          preferredAgent,
          phase: phaseLabel,
          lastStream: latestStream,
        });
      }
    }
    const output = await opencodeRun(runOptions);
    return finish(output, null, Boolean(preferredAgent));
  } catch (error) {
    clearInterval(progressTimer);
    console.error('[HyperFrames Agent] opencode phase failed', {
      phase: phaseLabel,
      elapsedMs: Date.now() - phaseStarted,
      error: error instanceof Error ? error.message : String(error),
      lastStream: latestStream,
    });
    throw error;
  }
}

function scorePlanOutput(output: string): number {
  const invoked = listOpenCodeSkillInvocations(output);
  const skills = detectHyperframesSkillUsageFromInvocations(invoked);
  let score = invoked.length;
  if (skills.usedHyperframesSkill) score += 10;
  if (skills.usedHyperframesCliSkill) score += 10;
  if (skills.usedGsapSkill) score += 10;
  if (hasUsableAnimationPlan(output)) score += 1000;
  return score;
}

function shouldLogOpenCodeOutput(): boolean {
  return process.env.HYPERFRAMES_LOG_OPENCODE_OUTPUT !== '0';
}

function logOpenCodePlanOutputForAnalysis(
  label: string,
  output: string,
  diagnostics: OpenCodeOutputDiagnostics,
  extra?: Record<string, unknown>
): void {
  const assistantText = extractAssistantTextFromOpenCodeStream(output);
  const streamText = extractEventStreamText(output);
  const maxChars = Math.max(2000, Number(process.env.HYPERFRAMES_OPENCODE_LOG_CHARS || 16000));
  const parsed = parseOpenCodeJSON(output);

  console.log(`[HyperFrames Agent] OpenCode output analysis — ${label}`, {
    outputChars: output.length,
    parsedMoments: countRawMomentsInPlan(parsed),
    skillInvocations: listOpenCodeSkillInvocations(output),
    hasMomentsKeyInRaw: /"moments"\s*:/.test(output),
    assistantTextChars: assistantText.length,
    streamTextChars: streamText.length,
    eventTypeCounts: diagnostics.eventTypeCounts,
    toolUseNames: diagnostics.toolUseNames,
    ...extra,
  });

  if (!shouldLogOpenCodeOutput()) return;

  const body = assistantText.trim();
  if (body) {
    console.log(
      `[HyperFrames Agent] OpenCode assistant text (${label}):\n${summarizeForLog(body, maxChars)}`
    );
    return;
  }

  if (streamText.trim() && !assistantText.trim()) {
    console.log(
      `[HyperFrames Agent] OpenCode printable body (${label}): (no assistant text events — tools-only or NDJSON stream; see raw file, not logging full skill dumps)`
    );
    return;
  }

  console.log(
    `[HyperFrames Agent] OpenCode printable body (${label}): (empty — likely tools-only turn with no assistant JSON)`
  );
}

const PLAN_SKILL_RETRY_SUFFIX = `

HARD RETRY REQUIREMENT:
Your previous attempt did not finish. In this turn:
1) Call "skill" for "hyperframes", "hyperframes-cli", and "gsap" (three separate calls) if not already loaded.
2) Then immediately emit the full plan JSON (non-empty moments array). Each animationPrompt must follow the full ANIMATION_PROMPT FORMAT (phase map, B/G/L/T codes, GSAP eases, punch math, hex colors) — not one-line vague directions. Do not stop after tool calls.`;

/** Clip HTML generation — all three skill tools. */
function allHyperframesSkillsUsed(skillUsage: HyperframesSkillDiagnostics): boolean {
  return (
    skillUsage.usedHyperframesSkill && skillUsage.usedHyperframesCliSkill && skillUsage.usedGsapSkill
  );
}

/** Animation plan — hyperframes + CLI; GSAP prose is in the plan prompt, gsap skill is for clip HTML. */
function allHyperframesPlanSkillsUsed(skillUsage: HyperframesSkillDiagnostics): boolean {
  return skillUsage.usedHyperframesSkill && skillUsage.usedHyperframesCliSkill;
}

function detectExaUsage(diagnostics: OpenCodeOutputDiagnostics, output: string): boolean {
  const normalized = output.toLowerCase();
  return (
    diagnostics.toolUseNames.some((name) => name.toLowerCase().includes('exa')) ||
    normalized.includes('"tool":"exa') ||
    normalized.includes('"tool":"mcp_exa') ||
    normalized.includes('exa_web_search') ||
    normalized.includes('web_search_exa')
  );
}

function shouldRequireSkillToolUsage(): boolean {
  // Default ON. Skills must be invoked or generation fails — set
  // OPENCODE_REQUIRE_SKILL_TOOL_USAGE=0 explicitly to opt out (debug only).
  return process.env.OPENCODE_REQUIRE_SKILL_TOOL_USAGE !== '0';
}

function hasUsableAnimationPlan(output: string): boolean {
  const parsed = parseOpenCodeJSON(output);
  return countRawMomentsInPlan(parsed) > 0;
}

/** Parsed JSON often carries a truncated `html` string while the real doc lives in ```html fences or raw text. */
function looksLikeHyperframesClipHtml(html: string): boolean {
  return (
    /data-composition-id\s*=\s*["'][^"']+["']/i.test(html) &&
    /gsap\.timeline\s*\(/i.test(html) &&
    html.length >= 300
  );
}

/** Tool/skill NDJSON lines embed ```html examples — never scan those when extracting the model's clip. */
function extractAssistantTextFromOpenCodeStream(output: string): string {
  const lines = output.trim().split('\n').filter(Boolean);
  let textContent = '';
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as { type?: string; part?: { text?: string } };
      if (event.type === 'text' && typeof event.part?.text === 'string') {
        textContent += event.part.text;
      }
    } catch {
      // ignore non-JSON lines
    }
  }
  return textContent;
}

/**
 * Markdown closes ```html blocks with a line that is exactly ``` (not ```js).
 * Non-greedy /```html...```/ stops at the first inner ``` and used to capture skill docs.
 */
function extractMarkdownHtmlFences(source: string): string[] {
  const blocks: string[] = [];
  let searchFrom = 0;
  const needleLc = '```html';
  while (true) {
    const rel = source.slice(searchFrom).toLowerCase().indexOf(needleLc);
    if (rel < 0) break;
    const openIdx = searchFrom + rel;
    let bodyStart = openIdx + needleLc.length;
    const nlSkip = source.slice(bodyStart).match(/^\s*\r?\n/);
    if (nlSkip) bodyStart += nlSkip[0].length;
    const rest = source.slice(bodyStart);
    const closeMatch = rest.match(/\r?\n```(?:\r?\n|$)/);
    if (!closeMatch || closeMatch.index === undefined) break;
    const chunk = rest.slice(0, closeMatch.index).trim();
    if (chunk) blocks.push(chunk);
    searchFrom = bodyStart + closeMatch.index + closeMatch[0].length;
  }
  return blocks;
}

function rankHyperframesHtmlCandidate(html: string): number {
  let score = 0;
  if (/data-composition-id\s*=\s*["'][^"']+["']/i.test(html)) score += 5000;
  if (/gsap\.timeline\s*\(\s*\{\s*paused\s*:\s*true/i.test(html)) score += 2000;
  if (/<!DOCTYPE\s+html>/i.test(html)) score += 500;
  if (/window\.__timelines/i.test(html)) score += 300;
  score += Math.min(html.length, 50000);
  return score;
}

/** When JSON parsing yields a tiny `html` string, the full document may still appear earlier/later in the OpenCode stream. */
function sliceFullHtmlAroundComposition(output: string): string | null {
  const marker = /data-composition-id\s*=\s*["'][^"']+["']/i.exec(output);
  if (!marker || marker.index === undefined) return null;
  const idx = marker.index;
  const doctypePos = output.lastIndexOf('<!DOCTYPE', idx);
  const htmlOpenPos = output.lastIndexOf('<html', idx);
  const starts = [doctypePos, htmlOpenPos].filter((p) => p >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  if (start < 0) return null;
  const end = output.indexOf('</html>', idx);
  if (end < 0) return null;
  return output.slice(start, end + '</html>'.length).trim();
}

function readClipHtmlFromAgentPath(agentWritePath: string): string | null {
  if (!agentWritePath) return null;
  try {
    if (!fs.existsSync(agentWritePath)) return null;
    const content = fs.readFileSync(agentWritePath, 'utf8').trim();
    return content.length ? content : null;
  } catch {
    return null;
  }
}

function resolveClipHtmlFromAgentOutputs(
  agentWritePath: string,
  outputs: string[]
): { html: string | null; source: 'file' | 'extracted' | null } {
  const fromFile = readClipHtmlFromAgentPath(agentWritePath);
  if (fromFile) return { html: fromFile, source: 'file' };

  const combined = outputs.filter(Boolean).join('\n');
  const extracted = combined.trim() ? extractHtmlFromOutput(combined) : null;
  if (extracted) return { html: extracted, source: 'extracted' };

  return { html: null, source: null };
}

function stripSkillContentBlocks(text: string): string {
  return text.replace(/<skill_content[\s\S]*?<\/skill_content>/gi, '');
}

function collectHtmlCandidatesFromHaystack(haystack: string, candidates: Set<string>): void {
  if (!haystack.trim()) return;

  for (const block of extractMarkdownHtmlFences(haystack)) {
    candidates.add(block);
  }

  const sliced = sliceFullHtmlAroundComposition(haystack);
  if (sliced) candidates.add(sliced);

  const docClosed = haystack.match(/<!DOCTYPE\s+html>[\s\S]*?<\/html>/i);
  if (docClosed?.[0]?.trim()) candidates.add(docClosed[0].trim());

  const looseHtml = haystack.match(/<html\b[^>]*>[\s\S]*?<\/html>/i);
  if (looseHtml?.[0]?.trim()) candidates.add(looseHtml[0].trim());
}

function extractHtmlFromOutput(output: string): string | null {
  const candidates = new Set<string>();

  const parsed = parseOpenCodeJSON<{ html?: unknown; indexHtml?: unknown }>(output);
  const fromJson = parsed?.html ?? parsed?.indexHtml;
  if (typeof fromJson === 'string' && fromJson.trim()) {
    const t = fromJson.trim();
    // Models sometimes emit a truncated JSON string; ignore fragments missing the composition root.
    if (/data-composition-id\s*=/i.test(t)) {
      candidates.add(t);
    }
  }

  const assistantText = extractAssistantTextFromOpenCodeStream(output);
  collectHtmlCandidatesFromHaystack(assistantText, candidates);

  // Bash/write tool output often lands in non-assistant stream events — search there too, minus skill dumps.
  const streamText = stripSkillContentBlocks(extractEventStreamText(output));
  if (streamText.trim() && streamText.trim() !== assistantText.trim()) {
    collectHtmlCandidatesFromHaystack(streamText, candidates);
  }

  const ranked = [...candidates].sort((a, b) => rankHyperframesHtmlCandidate(b) - rankHyperframesHtmlCandidate(a));

  const viable = ranked.filter(looksLikeHyperframesClipHtml);
  const chosen = viable[0] ?? ranked[0];
  return chosen || null;
}

function assertEnvironment(environment: HyperframesOpenCodeEnvironmentCheck): void {
  if (!environment.opencodeAvailable) {
    throw new Error(`OpenCode CLI is unavailable for HyperFrames animation generation. Command=${environment.opencodeCommand}.`);
  }
  if (!environment.hyperframesSkillInstalled) {
    throw new Error('OpenCode skill "hyperframes" is not installed.');
  }
  if (!environment.hyperframesCliSkillInstalled) {
    throw new Error('OpenCode skill "hyperframes-cli" is not installed.');
  }
  if (!environment.gsapSkillInstalled) {
    throw new Error('OpenCode skill "gsap" is not installed.');
  }
}

function buildPlanPrompt(args: {
  topic: string;
  dialogueContext: string;
  videoDurationSeconds: number;
  maxMoments: number;
}): string {
  return buildHyperframesAnimationPlanPrompt({
    topic: args.topic,
    videoDurationSeconds: args.videoDurationSeconds,
    maxMoments: args.maxMoments,
    dialogueContext: args.dialogueContext,
  });
}

export async function generateHyperframesAnimationPlanWithResearch(
  topic: string,
  dialogueContext: string,
  options?: {
    videoDurationSeconds?: number;
    maxMoments?: number;
    model?: string;
    cwd?: string;
    environment?: HyperframesOpenCodeEnvironmentCheck;
  }
): Promise<HyperframesPlanGenerationResult> {
  const startedAt = Date.now();
  const cwd = options?.cwd || process.cwd();
  const environment = options?.environment ?? (await inspectHyperframesOpenCodeEnvironment(cwd));
  console.log('[HyperFrames Agent] plan generation start', {
    topic,
    dialogueChars: dialogueContext.length,
    videoDurationSeconds: options?.videoDurationSeconds || 60,
    maxMoments: options?.maxMoments || 8,
    cwd,
    opencodeAvailable: environment.opencodeAvailable,
    hyperframesSkillInstalled: environment.hyperframesSkillInstalled,
    hyperframesCliSkillInstalled: environment.hyperframesCliSkillInstalled,
    gsapSkillInstalled: environment.gsapSkillInstalled,
  });
  assertEnvironment(environment);

  const preferredAgent = process.env.OPENCODE_HYPERFRAMES_AGENT?.trim() || null;
  const model = options?.model || 'animationGemini';
  const prompt = buildPlanPrompt({
    topic,
    dialogueContext,
    videoDurationSeconds: options?.videoDurationSeconds || 60,
    maxMoments: options?.maxMoments || 8,
  });

  const run = async (agent: string | null) => opencodeRun({
    prompt,
    model,
    format: 'json',
    quiet: true,
    cwd,
    agent: agent || undefined,
  });

  let output = '';
  let usedAgent: string | null = null;
  let fallbackWithoutAgent = false;
  if (preferredAgent) {
    try {
      output = await run(preferredAgent);
      usedAgent = preferredAgent;
    } catch {
      console.warn('[HyperFrames Agent] preferred agent failed for plan; retrying without agent', {
        preferredAgent,
      });
      output = await run(null);
      fallbackWithoutAgent = true;
    }
  } else {
    output = await run(null);
  }

  let diagnostics = summarizeOpenCodeOutput(output);
  const cumulativeSkillInvocations = new Set<string>();
  mergeSkillInvocations(cumulativeSkillInvocations, output);
  let bestOutput = output;
  let bestScore = scorePlanOutput(output);
  let skillUsage = detectHyperframesSkillUsageFromInvocations([...cumulativeSkillInvocations]);

  logOpenCodePlanOutputForAnalysis('first pass', output, diagnostics, {
    usedAgent,
    fallbackWithoutAgent,
    bestScore,
  });

  const strictSkillToolUsage = shouldRequireSkillToolUsage();
  const maxSkillAttempts = strictSkillToolUsage ? 3 : 1;
  const planAlreadyValid = hasUsableAnimationPlan(bestOutput);
  const needsSkillRetries =
    strictSkillToolUsage && !planAlreadyValid && !allHyperframesPlanSkillsUsed(skillUsage);

  if (planAlreadyValid && !allHyperframesPlanSkillsUsed(skillUsage)) {
    console.warn('[HyperFrames Agent] plan JSON already valid; skipping skill tool retries', {
      parsedMoments: countRawMomentsInPlan(parseOpenCodeJSON(bestOutput)),
      cumulativeSkillInvocations: [...cumulativeSkillInvocations],
      ...skillUsage,
    });
  }

  for (let skillAttempt = 2; needsSkillRetries && skillAttempt <= maxSkillAttempts; skillAttempt++) {
    if (allHyperframesPlanSkillsUsed(skillUsage) && hasUsableAnimationPlan(bestOutput)) break;

    console.warn('[HyperFrames Agent] plan missing required skill usage; retrying', {
      skillAttempt,
      maxSkillAttempts,
      skillInvocations: [...cumulativeSkillInvocations],
      parsedMomentsOnBestOutput: countRawMomentsInPlan(parseOpenCodeJSON(bestOutput)),
      ...skillUsage,
    });
    const retryPrompt = `${prompt}${PLAN_SKILL_RETRY_SUFFIX}
(attempt ${skillAttempt} of ${maxSkillAttempts})`;
    console.log('[HyperFrames Agent] plan retry generation start', {
      strictEnforcement: strictSkillToolUsage,
      skillAttempt,
      model,
      cwd,
      retryPromptChars: retryPrompt.length,
    });
    try {
      const retryOutput = await opencodeRun({ prompt: retryPrompt, model, format: 'json', quiet: true, cwd });
      mergeSkillInvocations(cumulativeSkillInvocations, retryOutput);
      skillUsage = detectHyperframesSkillUsageFromInvocations([...cumulativeSkillInvocations]);
      const retryScore = scorePlanOutput(retryOutput);
      if (retryScore >= bestScore) {
        bestOutput = retryOutput;
        bestScore = retryScore;
      }
      output = retryOutput;
      diagnostics = summarizeOpenCodeOutput(output);
      logOpenCodePlanOutputForAnalysis(`skill retry ${skillAttempt}`, output, diagnostics, {
        retryScore,
        bestScore,
        cumulativeSkillInvocations: [...cumulativeSkillInvocations],
        ...skillUsage,
      });
      console.log('[HyperFrames Agent] plan retry generation complete', {
        skillAttempt,
        outputChars: output.length,
        bestOutputChars: bestOutput.length,
        toolUseNames: diagnostics.toolUseNames,
        skillInvocations: listOpenCodeSkillInvocations(output),
        cumulativeSkillInvocations: [...cumulativeSkillInvocations],
        ...skillUsage,
      });
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : String(retryError);
      console.warn('[HyperFrames Agent] skill retry failed; keeping best prior output', {
        skillAttempt,
        error: message,
        bestOutputChars: bestOutput.length,
        parsedMomentsOnBestOutput: countRawMomentsInPlan(parseOpenCodeJSON(bestOutput)),
      });
      if (hasUsableAnimationPlan(bestOutput)) break;
      throw retryError;
    }
  }

  output = bestOutput;
  diagnostics = summarizeOpenCodeOutput(output);
  skillUsage = detectHyperframesSkillUsageFromInvocations([...cumulativeSkillInvocations]);

  const maxPlanJsonAttempts = 3;
  let planJsonAttempt = 0;
  while (!hasUsableAnimationPlan(output) && planJsonAttempt < maxPlanJsonAttempts) {
    planJsonAttempt += 1;
    console.warn('[HyperFrames Agent] plan JSON missing or has no moments; continuation retry', {
      planJsonAttempt,
      maxPlanJsonAttempts,
      outputChars: output.length,
      parsedMoments: countRawMomentsInPlan(parseOpenCodeJSON(output)),
    });
    const continuePrompt = buildHyperframesPlanJsonContinuationPrompt({
      topic,
      dialogueContext,
      videoDurationSeconds: options?.videoDurationSeconds || 60,
      maxMoments: options?.maxMoments || 8,
    });
    try {
      const continuedOutput = await opencodeRun({ prompt: continuePrompt, model, format: 'json', quiet: true, cwd });
      mergeSkillInvocations(cumulativeSkillInvocations, continuedOutput);
      const continuedScore = scorePlanOutput(continuedOutput);
      if (continuedScore >= scorePlanOutput(output)) {
        output = continuedOutput;
        if (continuedScore >= scorePlanOutput(bestOutput)) {
          bestOutput = continuedOutput;
        }
      }
      diagnostics = summarizeOpenCodeOutput(output);
      skillUsage = detectHyperframesSkillUsageFromInvocations([...cumulativeSkillInvocations]);
      logOpenCodePlanOutputForAnalysis(`JSON continuation ${planJsonAttempt}`, output, diagnostics, {
        continuedScore,
        parsedMoments: countRawMomentsInPlan(parseOpenCodeJSON(output)),
      });
    } catch (continuationError) {
      const message = continuationError instanceof Error ? continuationError.message : String(continuationError);
      console.warn('[HyperFrames Agent] plan JSON continuation failed', {
        planJsonAttempt,
        error: message,
        keepingOutputChars: output.length,
      });
      if (hasUsableAnimationPlan(output)) break;
      throw continuationError;
    }
  }

  if (scorePlanOutput(bestOutput) > scorePlanOutput(output)) {
    output = bestOutput;
  }
  diagnostics = summarizeOpenCodeOutput(output);
  skillUsage = detectHyperframesSkillUsageFromInvocations([...cumulativeSkillInvocations]);

  if (!hasUsableAnimationPlan(output)) {
    logOpenCodePlanOutputForAnalysis('no parseable plan after all retries', output, diagnostics, {
      planJsonAttempts: planJsonAttempt,
      cumulativeSkillInvocations: [...cumulativeSkillInvocations],
    });
    if (strictSkillToolUsage && !allHyperframesPlanSkillsUsed(skillUsage)) {
      throw new Error(
        `OpenCode produced no parseable animation plan after ${maxPlanJsonAttempts} JSON continuation(s) and missing plan skills (hyperframes=${skillUsage.usedHyperframesSkill}, hyperframes-cli=${skillUsage.usedHyperframesCliSkill}, invocations=${[...cumulativeSkillInvocations].join(',') || 'none'}). The model likely stopped after skill tools without emitting JSON. Set OPENCODE_REQUIRE_SKILL_TOOL_USAGE=0 to disable enforcement (debug only).`
      );
    }
    console.error(
      '[HyperFrames Agent] plan JSON still missing after continuation retries; downstream may use subtitle fallback'
    );
  } else if (!allHyperframesPlanSkillsUsed(skillUsage)) {
    console.warn('[HyperFrames Agent] using valid plan JSON without hyperframes plan skills loaded', {
      parsedMoments: countRawMomentsInPlan(parseOpenCodeJSON(output)),
      cumulativeSkillInvocations: [...cumulativeSkillInvocations],
      ...skillUsage,
    });
  } else if (!skillUsage.usedGsapSkill) {
    console.warn(
      '[HyperFrames Agent] plan OK without gsap skill tool (expected for plan; gsap skill is required at clip HTML generation)',
      { parsedMoments: countRawMomentsInPlan(parseOpenCodeJSON(output)) }
    );
  }

  const usedExa = detectExaUsage(diagnostics, output);
  const parsed = parseOpenCodeJSON<{ researchSummary?: unknown }>(output);
  console.log('[HyperFrames Agent] plan generation complete', {
    outputChars: output.length,
    usedExa,
    elapsedMs: Date.now() - startedAt,
    parsedMoments: countRawMomentsInPlan(parsed),
    cumulativeSkillInvocations: [...cumulativeSkillInvocations],
    ...skillUsage,
  });
  return {
    output,
    diagnostics,
    usedAgent,
    fallbackWithoutAgent,
    usedExaResearch: usedExa,
    usedExaDirection: usedExa,
    usedHyperframesSkill: skillUsage.usedHyperframesSkill,
    usedHyperframesCliSkill: skillUsage.usedHyperframesCliSkill,
    usedGsapSkill: skillUsage.usedGsapSkill,
    researchSummary: typeof parsed?.researchSummary === 'string' ? parsed.researchSummary : null,
  };
}

export async function generateHyperframesClipHtmlWithSkill(
  params: HyperframesClipHtmlPromptParams,
  options?: {
    model?: string;
    cwd?: string;
    environment?: HyperframesOpenCodeEnvironmentCheck;
    /**
     * If provided, the OpenCode agent will be instructed to write the generated
     * HTML to this path via the `write` tool (HyperFrames clips only).
     * Backend will still validate and may overwrite after normalization.
     */
    targetIndexHtmlPath?: string;
  }
): Promise<HyperframesClipHtmlGenerationResult> {
  const startedAt = Date.now();
  const cwd = options?.cwd || process.cwd();
  const environment = options?.environment ?? (await inspectHyperframesOpenCodeEnvironment(cwd));
  console.log('[HyperFrames Agent] clip HTML generation start', {
    topic: params.topic,
    momentIndex: params.moment.index,
    momentId: params.moment.animationMomentId,
    duration: params.moment.duration,
    cwd,
    opencodeAvailable: environment.opencodeAvailable,
    hyperframesSkillInstalled: environment.hyperframesSkillInstalled,
    hyperframesCliSkillInstalled: environment.hyperframesCliSkillInstalled,
    gsapSkillInstalled: environment.gsapSkillInstalled,
  });
  assertEnvironment(environment);

  const model = options?.model || 'animationGemini';
  const preferredAgent = process.env.OPENCODE_HYPERFRAMES_AGENT?.trim() || null;
  const basePrompt = buildHyperframesClipHtmlPrompt(params);
  const digestAppendix = buildHyperframesSkillDigestsAppendix(cwd);
  const agentWritePath = (options?.targetIndexHtmlPath || '').trim();
  const writeInstruction = agentWritePath
    ? `\n\nHTML DELIVERY (required — backend reads your output, not shell files):
- PRIMARY: Return JSON only with the full document: {"html":"<!DOCTYPE html>..."}.
- OPTIONAL: You may also use the built-in "write" tool (not bash/shell) for: ${agentWritePath}
- Do NOT use bash, PowerShell, heredocs, or echo to create index.html — those are ignored.
- The "html" JSON string must be the complete standalone index.html (same content you would write to disk).\n`
    : '';
  const strictEnforcement = shouldRequireSkillToolUsage();
  const maxAttempts = strictEnforcement ? 3 : 2;
  const cumulativeSkillInvocations = new Set<string>();
  const allOpenCodeOutputs: string[] = [];
  let output = '';
  let diagnostics = summarizeOpenCodeOutput('');
  let skillUsage: HyperframesSkillDiagnostics = {
    usedHyperframesSkill: false,
    usedHyperframesCliSkill: false,
    usedGsapSkill: false,
  };
  let usedAgent: string | null = null;
  let fallbackWithoutAgent = false;
  let loadedSkillContext = '';

  const runSkillPreload =
    strictEnforcement && process.env.HYPERFRAMES_CLIP_SKILL_PRELOAD === '1';
  if (runSkillPreload) {
    console.log('[HyperFrames Agent] clip skill preload enabled (HYPERFRAMES_CLIP_SKILL_PRELOAD=1)', {
      momentIndex: params.moment.index,
    });
    const maxSkillLoadAttempts = 2;
    let skillLoadOutput = '';
    for (let skillAttempt = 1; skillAttempt <= maxSkillLoadAttempts; skillAttempt++) {
      const skillPrompt = buildClipSkillLoadOnlyPrompt(skillUsage, skillAttempt, maxSkillLoadAttempts);
      const run = await opencodeRunWithPreferredAgent(
        { prompt: skillPrompt, model, format: 'json', quiet: true, cwd },
        preferredAgent,
        `clip-skill-preload-${skillAttempt}`
      );
      skillLoadOutput = run.output;
      allOpenCodeOutputs.push(skillLoadOutput);
      usedAgent = run.usedAgent ?? usedAgent;
      fallbackWithoutAgent = fallbackWithoutAgent || run.fallbackWithoutAgent;
      mergeSkillInvocations(cumulativeSkillInvocations, skillLoadOutput);
      const loadDiagnostics = summarizeOpenCodeOutput(skillLoadOutput);
      skillUsage = skillDiagnosticsFromCumulativeAndOutput(
        cumulativeSkillInvocations,
        skillLoadOutput,
        loadDiagnostics
      );
      console.log('[HyperFrames Agent] clip skill preload response', {
        momentIndex: params.moment.index,
        skillAttempt,
        skillInvocations: listOpenCodeSkillInvocations(skillLoadOutput),
        cumulativeSkillInvocations: [...cumulativeSkillInvocations],
        ...skillUsage,
      });
      if (allHyperframesSkillsUsed(skillUsage)) break;
      if (skillAttempt < maxSkillLoadAttempts) {
        console.warn('[HyperFrames Agent] clip skill preload incomplete; retrying', {
          momentIndex: params.moment.index,
          skillAttempt,
          missing: formatMissingClipSkills(skillUsage),
        });
      }
    }
    loadedSkillContext = extractSkillContentFromOpenCodeOutput(
      skillLoadOutput,
      Math.max(4000, Number(process.env.HYPERFRAMES_LOADED_SKILL_CONTEXT_CHARS || 10000))
    );
  } else if (strictEnforcement) {
    console.log('[HyperFrames Agent] clip skill preload skipped (digests inlined; set HYPERFRAMES_CLIP_SKILL_PRELOAD=1 to enable)', {
      momentIndex: params.moment.index,
      digestChars: digestAppendix.length,
    });
  }

  const skillContextPrefix = `${digestAppendix}${loadedSkillContext}`;
  const skillsReadyNote = allHyperframesSkillsUsed(skillUsage)
    ? '\n\nSKILLS: hyperframes, hyperframes-cli, and gsap were loaded in a prior step. Do NOT call skill tools again unless a skill failed to load. Proceed directly to HTML.'
    : `\n\nSKILLS REQUIRED: Call the skill tool once each for "hyperframes", "hyperframes-cli", and "gsap" (three separate calls) before writing HTML.`;

  const htmlRunOptions = {
    model,
    format: 'json' as const,
    quiet: true,
    cwd,
    earlyCompleteForHyperframesClipHtml: true,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const missing = formatMissingClipSkills(skillUsage);
    const retryBlock =
      attempt === 1
        ? ''
        : `

HARD RETRY REQUIREMENT (attempt ${attempt} of ${maxAttempts}):
Before any HTML, call the "skill" tool for each missing skill: ${missing || '"hyperframes", "hyperframes-cli", and "gsap"'}.
Use separate tool calls (one name per call). After all three are loaded, write the HTML.`;
    const prompt = `${skillContextPrefix}${skillsReadyNote}${retryBlock}\n\n${basePrompt}${writeInstruction}`;

    const run = await opencodeRunWithPreferredAgent(
      { ...htmlRunOptions, prompt },
      preferredAgent,
      `clip-html-${attempt}`
    );
    output = run.output;
    allOpenCodeOutputs.push(output);
    usedAgent = run.usedAgent ?? usedAgent;
    fallbackWithoutAgent = fallbackWithoutAgent || run.fallbackWithoutAgent;
    mergeSkillInvocations(cumulativeSkillInvocations, output);
    diagnostics = summarizeOpenCodeOutput(output);
    skillUsage = skillDiagnosticsFromCumulativeAndOutput(
      cumulativeSkillInvocations,
      output,
      diagnostics
    );
    console.log('[HyperFrames Agent] clip HTML generation response received', {
      momentIndex: params.moment.index,
      attempt,
      outputChars: output.length,
      toolUseNames: diagnostics.toolUseNames,
      skillInvocations: listOpenCodeSkillInvocations(output),
      cumulativeSkillInvocations: [...cumulativeSkillInvocations],
      elapsedMs: Date.now() - startedAt,
      usedAgent,
      ...skillUsage,
    });

    if (allHyperframesSkillsUsed(skillUsage)) {
      break;
    }

    if (attempt < maxAttempts) {
      console.warn('[HyperFrames Agent] clip HTML missing required skill usage markers; retrying', {
        momentIndex: params.moment.index,
        attempt,
        nextAttempt: attempt + 1,
        missing: formatMissingClipSkills(skillUsage),
        ...skillUsage,
      });
    }
  }

  const clipHtmlLooksUsable = (h: string | null): boolean =>
    Boolean(h && /data-composition-id\s*=/i.test(h) && /gsap\.timeline\s*\(/i.test(h));

  let html: string | null = null;
  let htmlSource: 'file' | 'extracted' | null = null;
  if (agentWritePath) {
    let resolved = resolveClipHtmlFromAgentOutputs(agentWritePath, allOpenCodeOutputs);
    html = resolved.html;
    htmlSource = resolved.source;

    if (!clipHtmlLooksUsable(html)) {
      const duration = Math.max(0.1, Number(params.moment.duration || 0));
      const retryPrompt = `${basePrompt}${writeInstruction}

CRITICAL — PRIOR OUTPUT HAD NO USABLE HTML:
Return JSON only with the full document string (do not use bash/shell):
{"html":"<!DOCTYPE html>..."}

Non-negotiable inside that HTML:
- Root div with data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1080" data-height="1920"
- gsap.timeline({ paused: true }) registered as window.__timelines["main"]

Optional: "write" tool (not bash) to ${agentWritePath} — but JSON "html" is still required.`;

      console.warn('[HyperFrames Agent] clip HTML missing/invalid; retrying for JSON or write tool', {
        momentIndex: params.moment.index,
        targetIndexHtmlPath: agentWritePath,
        priorSource: htmlSource,
        priorHtmlChars: html?.length ?? 0,
        toolUseNames: diagnostics.toolUseNames,
      });

      const fileRetryRun = await opencodeRunWithPreferredAgent(
        { ...htmlRunOptions, prompt: retryPrompt },
        preferredAgent,
        'clip-html-file-retry'
      );
      output = fileRetryRun.output;
      allOpenCodeOutputs.push(output);
      usedAgent = fileRetryRun.usedAgent ?? usedAgent;
      fallbackWithoutAgent = fallbackWithoutAgent || fileRetryRun.fallbackWithoutAgent;
      mergeSkillInvocations(cumulativeSkillInvocations, output);
      diagnostics = summarizeOpenCodeOutput(output);
      skillUsage = skillDiagnosticsFromCumulativeAndOutput(
        cumulativeSkillInvocations,
        output,
        diagnostics
      );

      resolved = resolveClipHtmlFromAgentOutputs(agentWritePath, allOpenCodeOutputs);
      html = resolved.html;
      htmlSource = resolved.source;
    }

    if (!clipHtmlLooksUsable(html)) {
      throw new Error(
        `HyperFrames clip generation failed: no valid HTML in OpenCode output or at ${agentWritePath}. Return JSON {"html":"..."} with data-composition-id and gsap.timeline({ paused: true }). Do not use bash to write files.`
      );
    }

    if (htmlSource === 'extracted' || !readClipHtmlFromAgentPath(agentWritePath)) {
      try {
        fs.mkdirSync(path.dirname(agentWritePath), { recursive: true });
        fs.writeFileSync(agentWritePath, html, 'utf8');
        console.log('[HyperFrames Agent] persisted extracted clip HTML to moment index.html', {
          momentIndex: params.moment.index,
          targetIndexHtmlPath: agentWritePath,
          htmlChars: html.length,
          htmlSource,
        });
      } catch (persistError) {
        console.warn('[HyperFrames Agent] could not persist clip HTML to moment dir; service will still use returned html', {
          momentIndex: params.moment.index,
          error: persistError instanceof Error ? persistError.message : String(persistError),
        });
      }
    }
  } else {
    // Legacy: extraction mode (no agent write target provided).
    html = extractHtmlFromOutput(allOpenCodeOutputs.join('\n') || output);
    htmlSource = html ? 'extracted' : null;
    if (!clipHtmlLooksUsable(html)) {
      const duration = Math.max(0.1, Number(params.moment.duration || 0));
      const salvagePrompt = `${basePrompt}

CRITICAL — PRIOR OUTPUT WAS UNUSABLE FOR EXTRACTION:
Either the model text stream had no valid JSON with a complete "html" string, or the HTML omitted the root composition attributes.

After the required skill tool calls, respond with JSON ONLY:
{"html":"<full standalone document with quotes escaped>"}

Inside that HTML (non-negotiable):
- A root div with data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1080" data-height="1920"
- gsap.timeline({ paused: true }) registered as window.__timelines["main"]
Do not put the document only inside skill examples — emit it as your final assistant JSON.`;

      console.warn('[HyperFrames Agent] clip HTML salvage pass — extraction unusable', {
        momentIndex: params.moment.index,
        priorHtmlChars: html?.length ?? 0,
        assistantStreamChars: extractAssistantTextFromOpenCodeStream(output).length,
      });

      const salvageRun = await opencodeRunWithPreferredAgent(
        { ...htmlRunOptions, prompt: salvagePrompt },
        preferredAgent,
        'clip-html-salvage'
      );
      output = salvageRun.output;
      allOpenCodeOutputs.push(output);
      usedAgent = salvageRun.usedAgent ?? usedAgent;
      fallbackWithoutAgent = fallbackWithoutAgent || salvageRun.fallbackWithoutAgent;
      mergeSkillInvocations(cumulativeSkillInvocations, output);
      diagnostics = summarizeOpenCodeOutput(output);
      skillUsage = skillDiagnosticsFromCumulativeAndOutput(
        cumulativeSkillInvocations,
        output,
        diagnostics
      );
      html = extractHtmlFromOutput(allOpenCodeOutputs.join('\n') || output);
      htmlSource = html ? 'extracted' : null;
    }

    if (!clipHtmlLooksUsable(html)) {
      throw new Error(
        'HyperFrames clip HTML extraction failed: expected JSON {"html":"..."} (or ```html fences in assistant text) with root data-composition-id and gsap.timeline({ paused: true }).'
      );
    }
  }

  const allSkillsInvoked =
    skillUsage.usedHyperframesSkill && skillUsage.usedHyperframesCliSkill && skillUsage.usedGsapSkill;

  if (!allSkillsInvoked) {
    if (strictEnforcement) {
      throw new Error(
        `OpenCode did not invoke the required HyperFrames skills (hyperframes=${skillUsage.usedHyperframesSkill}, hyperframes-cli=${skillUsage.usedHyperframesCliSkill}, gsap=${skillUsage.usedGsapSkill}) after ${maxAttempts} attempts. Set OPENCODE_REQUIRE_SKILL_TOOL_USAGE=0 to disable this enforcement (debug only).`
      );
    }
    if (!html) {
      throw new Error('OpenCode did not use the required HyperFrames skills for clip HTML generation, and produced no HTML.');
    }
    console.warn('[HyperFrames Agent] accepting clip HTML without explicit skill tool markers (strict enforcement disabled)', {
      momentIndex: params.moment.index,
      htmlChars: html.length,
      toolUseNames: diagnostics.toolUseNames,
      ...skillUsage,
    });
  }

  console.log('[HyperFrames Agent] clip HTML ready', {
    momentIndex: params.moment.index,
    htmlChars: html?.length ?? 0,
    htmlSource: htmlSource ?? (agentWritePath ? 'file' : 'extracted'),
    elapsedMs: Date.now() - startedAt,
    allSkillsInvoked,
    wroteIndexHtml: Boolean(agentWritePath),
  });
  return {
    output,
    html,
    diagnostics,
    usedAgent,
    fallbackWithoutAgent,
    usedHyperframesSkill: skillUsage.usedHyperframesSkill,
    usedHyperframesCliSkill: skillUsage.usedHyperframesCliSkill,
    usedGsapSkill: skillUsage.usedGsapSkill,
  };
}
