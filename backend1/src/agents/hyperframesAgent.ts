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
  return process.env.OPENCODE_REQUIRE_SKILL_TOOL_USAGE === '1';
}

function hasUsableAnimationPlan(output: string): boolean {
  const parsed = parseOpenCodeJSON<{ moments?: unknown }>(output);
  return Boolean(parsed && Array.isArray(parsed.moments) && parsed.moments.length > 0);
}

function extractHtmlFromOutput(output: string): string | null {
  const parsed = parseOpenCodeJSON<{ html?: unknown; indexHtml?: unknown }>(output);
  const raw = parsed?.html ?? parsed?.indexHtml;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();

  const fenced = output.match(/```html\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  const htmlMatch = output.match(/<!DOCTYPE html>[\s\S]*<\/html>/i);
  return htmlMatch?.[0]?.trim() || null;
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
  const prompt = buildHyperframesClipHtmlPrompt(params);
  let output = await opencodeRun({ prompt, model, format: 'json', quiet: true, cwd });
  let diagnostics = summarizeOpenCodeOutput(output);
  let skillUsage = detectHyperframesSkillUsage(diagnostics, output);
  console.log('[HyperFrames Agent] clip HTML generation response received', {
    momentIndex: params.moment.index,
    outputChars: output.length,
    toolUseNames: diagnostics.toolUseNames,
    elapsedMs: Date.now() - startedAt,
    ...skillUsage,
  });

  if (!skillUsage.usedHyperframesSkill || !skillUsage.usedHyperframesCliSkill || !skillUsage.usedGsapSkill) {
    console.warn('[HyperFrames Agent] clip HTML missing required skill usage markers; retrying once', {
      momentIndex: params.moment.index,
      ...skillUsage,
    });
    const retryPrompt = `${prompt}

HARD RETRY REQUIREMENT:
Before final JSON, call the "skill" tool for "hyperframes", "hyperframes-cli", and "gsap".`;
    output = await opencodeRun({ prompt: retryPrompt, model, format: 'json', quiet: true, cwd });
    diagnostics = summarizeOpenCodeOutput(output);
    skillUsage = detectHyperframesSkillUsage(diagnostics, output);
  }

  let html = extractHtmlFromOutput(output);
  if (!skillUsage.usedHyperframesSkill || !skillUsage.usedHyperframesCliSkill || !skillUsage.usedGsapSkill) {
    const strictEnforcement = shouldRequireSkillToolUsage();
    if (strictEnforcement || !html) {
      throw new Error('OpenCode did not use the required HyperFrames skills for clip HTML generation.');
    }
    console.warn('[HyperFrames Agent] accepting clip HTML without explicit skill tool markers', {
      momentIndex: params.moment.index,
      strictEnforcement,
      htmlChars: html.length,
      toolUseNames: diagnostics.toolUseNames,
      ...skillUsage,
    });
  }

  console.log('[HyperFrames Agent] clip HTML extraction complete', {
    momentIndex: params.moment.index,
    htmlChars: html?.length ?? 0,
    elapsedMs: Date.now() - startedAt,
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
