import fs from 'fs';
import path from 'path';
import {
  inspectOpenCodeEnvironment,
  opencodeRun,
  parseOpenCodeJSON,
  summarizeOpenCodeOutput,
  type OpenCodeOutputDiagnostics,
} from './opencodeagent';
import { buildHyperframesClipHtmlPrompt, type HyperframesClipHtmlPromptParams } from '../prompts/hyperframesClipHtmlPrompt';
import { buildHyperframesAnimationPlanPrompt } from '../prompts/hyperframesAnimationPlanPrompt';

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

function outputMentionsSkill(output: string, diagnostics: OpenCodeOutputDiagnostics, skillName: string): boolean {
  const normalizedSkill = skillName.toLowerCase();
  const normalized = output.toLowerCase();
  if (new RegExp(`loaded skill:\\s*${normalizedSkill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(normalized)) {
    return true;
  }
  if (normalized.includes(`<skill_content name="${normalizedSkill}"`)) return true;
  if (normalized.includes(`"name":"${normalizedSkill}"`) || normalized.includes(`"name": "${normalizedSkill}"`)) {
    return diagnostics.toolUseNames.some((name) => /skill/i.test(name));
  }
  return diagnostics.toolUseNames.some((name) => /skill/i.test(name)) && normalized.includes(normalizedSkill);
}

function detectHyperframesSkillUsage(
  diagnostics: OpenCodeOutputDiagnostics,
  output: string
): HyperframesSkillDiagnostics {
  return {
    usedHyperframesSkill: outputMentionsSkill(output, diagnostics, 'hyperframes'),
    usedHyperframesCliSkill: outputMentionsSkill(output, diagnostics, 'hyperframes-cli'),
    usedGsapSkill: outputMentionsSkill(output, diagnostics, 'gsap'),
  };
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
  const parsed = parseOpenCodeJSON<{ moments?: unknown }>(output);
  return Boolean(parsed && Array.isArray(parsed.moments) && parsed.moments.length > 0);
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
  // Never fall back to raw NDJSON: skill tool payloads duplicate ```html + data-composition-id and poison extraction.
  const haystack = assistantText.trim();

  for (const block of extractMarkdownHtmlFences(haystack)) {
    candidates.add(block);
  }

  const sliced = sliceFullHtmlAroundComposition(haystack);
  if (sliced) candidates.add(sliced);

  const docClosed = haystack.match(/<!DOCTYPE\s+html>[\s\S]*?<\/html>/i);
  if (docClosed?.[0]?.trim()) candidates.add(docClosed[0].trim());

  const looseHtml = haystack.match(/<html\b[^>]*>[\s\S]*?<\/html>/i);
  if (looseHtml?.[0]?.trim()) candidates.add(looseHtml[0].trim());

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
  let skillUsage = detectHyperframesSkillUsage(diagnostics, output);
  console.log('[HyperFrames Agent] plan generation first pass complete', {
    outputChars: output.length,
    usedAgent,
    fallbackWithoutAgent,
    toolUseNames: diagnostics.toolUseNames,
    ...skillUsage,
  });
  const strictSkillToolUsage = shouldRequireSkillToolUsage();
  if (!skillUsage.usedHyperframesSkill || !skillUsage.usedHyperframesCliSkill || !skillUsage.usedGsapSkill) {
    if (!strictSkillToolUsage && hasUsableAnimationPlan(output)) {
      console.warn('[HyperFrames Agent] accepting plan without explicit skill tool markers', {
        strictEnforcement: strictSkillToolUsage,
        outputChars: output.length,
        toolUseNames: diagnostics.toolUseNames,
        ...skillUsage,
      });
    } else {
      console.warn('[HyperFrames Agent] plan missing required skill usage; retrying', skillUsage);
      const retryPrompt = `${prompt}

HARD RETRY REQUIREMENT:
Before final JSON, call the "skill" tool for "hyperframes", "hyperframes-cli", and "gsap".`;
      console.log('[HyperFrames Agent] plan retry generation start', {
        strictEnforcement: strictSkillToolUsage,
        model,
        cwd,
        retryPromptChars: retryPrompt.length,
      });
      output = await opencodeRun({ prompt: retryPrompt, model, format: 'json', quiet: true, cwd });
      diagnostics = summarizeOpenCodeOutput(output);
      skillUsage = detectHyperframesSkillUsage(diagnostics, output);
      console.log('[HyperFrames Agent] plan retry generation complete', {
        outputChars: output.length,
        toolUseNames: diagnostics.toolUseNames,
        ...skillUsage,
      });
    }
  }

  if (
    (!skillUsage.usedHyperframesSkill || !skillUsage.usedHyperframesCliSkill || !skillUsage.usedGsapSkill) &&
    (strictSkillToolUsage || !hasUsableAnimationPlan(output))
  ) {
    throw new Error('OpenCode did not use the required HyperFrames skills after retry.');
  }

  const usedExa = detectExaUsage(diagnostics, output);
  const parsed = parseOpenCodeJSON<{ researchSummary?: unknown }>(output);
  console.log('[HyperFrames Agent] plan generation complete', {
    outputChars: output.length,
    usedExa,
    elapsedMs: Date.now() - startedAt,
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
  const basePrompt = buildHyperframesClipHtmlPrompt(params);
  const strictEnforcement = shouldRequireSkillToolUsage();
  const maxAttempts = strictEnforcement ? 3 : 2;
  let output = '';
  let diagnostics = summarizeOpenCodeOutput('');
  let skillUsage: HyperframesSkillDiagnostics = {
    usedHyperframesSkill: false,
    usedHyperframesCliSkill: false,
    usedGsapSkill: false,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = attempt === 1
      ? basePrompt
      : `${basePrompt}

HARD RETRY REQUIREMENT (attempt ${attempt} of ${maxAttempts}):
Your previous attempt did not invoke the required skill tools. Before producing any HTML, call the "skill" tool THREE separate times, once each for:
  1) name: "hyperframes"
  2) name: "hyperframes-cli"
  3) name: "gsap"
Do not collapse them into one call. Do not paraphrase the skill content. After all three calls succeed, write the HTML.`;

    output = await opencodeRun({ prompt, model, format: 'json', quiet: true, cwd });
    diagnostics = summarizeOpenCodeOutput(output);
    skillUsage = detectHyperframesSkillUsage(diagnostics, output);
    console.log('[HyperFrames Agent] clip HTML generation response received', {
      momentIndex: params.moment.index,
      attempt,
      outputChars: output.length,
      toolUseNames: diagnostics.toolUseNames,
      elapsedMs: Date.now() - startedAt,
      ...skillUsage,
    });

    if (skillUsage.usedHyperframesSkill && skillUsage.usedHyperframesCliSkill && skillUsage.usedGsapSkill) {
      break;
    }

    if (attempt < maxAttempts) {
      console.warn('[HyperFrames Agent] clip HTML missing required skill usage markers; retrying', {
        momentIndex: params.moment.index,
        attempt,
        nextAttempt: attempt + 1,
        ...skillUsage,
      });
    }
  }

  let html = extractHtmlFromOutput(output);

  const clipHtmlLooksUsable = (h: string | null): boolean =>
    Boolean(h && /data-composition-id\s*=/i.test(h) && /gsap\.timeline\s*\(/i.test(h));

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

    output = await opencodeRun({ prompt: salvagePrompt, model, format: 'json', quiet: true, cwd });
    diagnostics = summarizeOpenCodeOutput(output);
    const postSalvageSkills = detectHyperframesSkillUsage(diagnostics, output);
    skillUsage = {
      usedHyperframesSkill: skillUsage.usedHyperframesSkill || postSalvageSkills.usedHyperframesSkill,
      usedHyperframesCliSkill: skillUsage.usedHyperframesCliSkill || postSalvageSkills.usedHyperframesCliSkill,
      usedGsapSkill: skillUsage.usedGsapSkill || postSalvageSkills.usedGsapSkill,
    };
    html = extractHtmlFromOutput(output);
  }

  if (!clipHtmlLooksUsable(html)) {
    throw new Error(
      'HyperFrames clip HTML extraction failed: expected JSON {"html":"..."} (or ```html fences in assistant text) with root data-composition-id and gsap.timeline({ paused: true }).'
    );
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

  console.log('[HyperFrames Agent] clip HTML extraction complete', {
    momentIndex: params.moment.index,
    htmlChars: html?.length ?? 0,
    elapsedMs: Date.now() - startedAt,
    allSkillsInvoked,
  });
  return {
    output,
    html,
    diagnostics,
    usedAgent: null,
    fallbackWithoutAgent: false,
    usedHyperframesSkill: skillUsage.usedHyperframesSkill,
    usedHyperframesCliSkill: skillUsage.usedHyperframesCliSkill,
    usedGsapSkill: skillUsage.usedGsapSkill,
  };
}
