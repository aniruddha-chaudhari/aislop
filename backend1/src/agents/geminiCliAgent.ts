import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import { buildAnimationDirectionPrompt } from '../prompts/animationDirectionPrompt';
import { buildAnimationTimelineWithResearchPrompt } from '../prompts/animationTimelinePrompt';

// ------------------------------------------------------------------------------------
// Gemini CLI headless wrapper (replaces the OpenCode CLI process invocation).
// ------------------------------------------------------------------------------------

const GEMINI_BIN_ENV = process.env.GEMINI_BIN?.trim() || '';
const GEMINI_DEFAULT_BIN = 'gemini';
const GEMINI_CLI_PACKAGE = '@google/gemini-cli';
let CACHED_GEMINI_COMMAND: string | null = null;

function isPathLikeCommand(command: string): boolean {
  return /[\\/]/.test(command) || /^[a-zA-Z]:/.test(command) || command.endsWith('.cmd') || command.endsWith('.exe');
}

function resolveGeminiCommand(): string {
  if (CACHED_GEMINI_COMMAND) return CACHED_GEMINI_COMMAND;

  // Respect explicit override first.
  if (GEMINI_BIN_ENV) {
    CACHED_GEMINI_COMMAND = GEMINI_BIN_ENV;
    return CACHED_GEMINI_COMMAND;
  }

  // Then prefer project-local install if present.
  const localBin = path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'gemini.cmd' : 'gemini'
  );
  if (fs.existsSync(localBin)) {
    CACHED_GEMINI_COMMAND = localBin;
    return CACHED_GEMINI_COMMAND;
  }

  // Finally rely on PATH.
  CACHED_GEMINI_COMMAND = GEMINI_DEFAULT_BIN;
  return CACHED_GEMINI_COMMAND;
}

function pushUnique(list: string[], seen: Set<string>, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  const key = process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
  if (seen.has(key)) return;
  seen.add(key);
  list.push(trimmed);
}

function buildCommandCandidates(base: string): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  if (process.platform !== 'win32') {
    const localBin = path.join(process.cwd(), 'node_modules', '.bin', base);
    if (fs.existsSync(localBin)) pushUnique(values, seen, localBin);
    pushUnique(values, seen, base);
    return values;
  }

  const cmd = `${base}.cmd`;
  const localCmd = path.join(process.cwd(), 'node_modules', '.bin', cmd);

  if (fs.existsSync(localCmd)) pushUnique(values, seen, localCmd);
  pushUnique(values, seen, cmd);
  pushUnique(values, seen, base);

  return values;
}

function isLikelyMissingCommandError(message: string): boolean {
  return (
    /\bENOENT\b/i.test(message) ||
    /\buv_spawn\b/i.test(message) ||
    /\bnot found\b/i.test(message) ||
    /is not recognized as an internal or external command/i.test(message) ||
    /\bcould not locate executable\b/i.test(message)
  );
}

type GeminiFallbackAttempt = {
  command: string;
  prefixArgs: string[];
  description: string;
  timeoutMs?: number;
};

function buildGeminiFallbackAttempts(): GeminiFallbackAttempt[] {
  const attempts: GeminiFallbackAttempt[] = [];
  const seen = new Set<string>();
  const add = (command: string, prefixArgs: string[], description: string, timeoutMs?: number): void => {
    const key = `${process.platform === 'win32' ? command.toLowerCase() : command}|${prefixArgs.join('\u0000')}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push({ command, prefixArgs, description, timeoutMs });
  };

  for (const command of buildCommandCandidates('pnpm')) {
    add(command, ['dlx', GEMINI_CLI_PACKAGE], `${command} dlx ${GEMINI_CLI_PACKAGE}`, GEMINI_FALLBACK_RUN_TIMEOUT_MS);
  }

  for (const command of buildCommandCandidates('npx')) {
    add(
      command,
      ['--yes', '--package', GEMINI_CLI_PACKAGE, 'gemini'],
      `${command} --yes --package ${GEMINI_CLI_PACKAGE} gemini`,
      GEMINI_FALLBACK_RUN_TIMEOUT_MS
    );
  }

  for (const command of buildCommandCandidates('npm')) {
    add(
      command,
      ['exec', '--yes', '--package', GEMINI_CLI_PACKAGE, '--', 'gemini'],
      `${command} exec --yes --package ${GEMINI_CLI_PACKAGE} -- gemini`,
      GEMINI_FALLBACK_RUN_TIMEOUT_MS
    );
  }

  if (process.platform === 'win32') {
    add(
      'corepack.cmd',
      ['pnpm', 'dlx', GEMINI_CLI_PACKAGE],
      'corepack pnpm dlx @google/gemini-cli',
      GEMINI_FALLBACK_RUN_TIMEOUT_MS
    );
    add(
      'corepack',
      ['pnpm', 'dlx', GEMINI_CLI_PACKAGE],
      'corepack pnpm dlx @google/gemini-cli',
      GEMINI_FALLBACK_RUN_TIMEOUT_MS
    );
  } else {
    add(
      'corepack',
      ['pnpm', 'dlx', GEMINI_CLI_PACKAGE],
      'corepack pnpm dlx @google/gemini-cli',
      GEMINI_FALLBACK_RUN_TIMEOUT_MS
    );
  }

  return attempts;
}

type GeminiHeadlessResult = {
  response: string;
  raw: unknown;
};

type GeminiHeadlessOptions = {
  prompt: string;
  cwd?: string;
  model?: string;
};

const GEMINI_RUN_TIMEOUT_MS = Number(process.env.GEMINI_RUN_TIMEOUT_MS || 420_000);
const GEMINI_FALLBACK_RUN_TIMEOUT_MS = Number(process.env.GEMINI_FALLBACK_RUN_TIMEOUT_MS || 420_000);
const GEMINI_STREAM_LOGS = process.env.GEMINI_CLI_STREAM_LOGS !== '0';
const GEMINI_CAPACITY_FALLBACK_MODELS = (process.env.GEMINI_CLI_CAPACITY_FALLBACK_MODELS ||
  'gemini-3-pro-preview,gemini-2.5-pro')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function normalizeTimeoutMs(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(5_000, Math.round(parsed));
}

function isCapacityExhaustedError(message: string): boolean {
  return (
    /\bMODEL_CAPACITY_EXHAUSTED\b/i.test(message) ||
    /\bNo capacity available for model\b/i.test(message) ||
    /\bRESOURCE_EXHAUSTED\b/i.test(message)
  );
}

async function runGeminiOnce(
  command: string,
  prefixArgs: string[],
  options: GeminiHeadlessOptions,
  timeoutMs: number
): Promise<GeminiHeadlessResult> {
  const prompt = options.prompt.trim();
  if (!prompt) {
    throw new Error('Gemini prompt is empty.');
  }

  const model = options.model?.trim() || '';
  const cwd = options.cwd || process.cwd();
  const safeTimeoutMs = normalizeTimeoutMs(timeoutMs, GEMINI_RUN_TIMEOUT_MS);

  return new Promise<GeminiHeadlessResult>((resolve, reject) => {
    const args: string[] = [...prefixArgs];
    if (model) {
      args.push('--model', model);
    }
    args.push('--output-format', 'json', '--prompt', prompt);
    if (GEMINI_STREAM_LOGS) {
      const displayArgs = [...prefixArgs];
      if (model) {
        displayArgs.push('--model', model);
      }
      displayArgs.push('--output-format', 'json', '--prompt', `<prompt:${prompt.length} chars>`);
      console.log(`[Gemini CLI] Running: ${command} ${displayArgs.join(' ')}`);
    }

    const proc = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const startedAt = Date.now();
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        proc.kill('SIGKILL');
      } catch {
        // Ignore cleanup errors.
      }
      const elapsedMs = Date.now() - startedAt;
      reject(
        new Error(
          `${command} timed out after ${elapsedMs}ms. stderr=${stderr.slice(-600) || '(empty)'} stdout=${stdout.slice(-200) || '(empty)'}`
        )
      );
    }, safeTimeoutMs);

    proc.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (GEMINI_STREAM_LOGS && text) {
        process.stdout.write(text);
      }
    });

    proc.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (GEMINI_STREAM_LOGS && text) {
        process.stderr.write(text);
      }
    });

    proc.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error(String(error)));
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (GEMINI_STREAM_LOGS) {
        const elapsedMs = Date.now() - startedAt;
        console.log(`[Gemini CLI] Process closed: code=${code} elapsedMs=${elapsedMs}`);
      }
      if (code !== 0) {
        reject(
          new Error(
            `${command} exited with code ${code}. stderr=${stderr || '(empty)'}`
          )
        );
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(stdout);
      } catch (error) {
        reject(
          new Error(
            `Failed to parse Gemini JSON output. error=${error instanceof Error ? error.message : String(error)}`
          )
        );
        return;
      }

      const responseText =
        typeof parsed?.response === 'string'
          ? parsed.response
          : typeof parsed?.result?.response === 'string'
            ? parsed.result.response
            : '';

      if (!responseText) {
        reject(new Error('Gemini JSON output did not contain a response string.'));
        return;
      }

      resolve({ response: responseText, raw: parsed });
    });
  });
}

export async function runGeminiHeadless(options: GeminiHeadlessOptions): Promise<GeminiHeadlessResult> {
  const prompt = options.prompt.trim();
  if (!prompt) {
    throw new Error('Gemini prompt is empty.');
  }

  const geminiCommand = resolveGeminiCommand();
  const initialAttempt: GeminiFallbackAttempt = {
    command: geminiCommand,
    prefixArgs: [],
    description: geminiCommand,
    timeoutMs: GEMINI_RUN_TIMEOUT_MS,
  };
  const fallbackAttempts = buildGeminiFallbackAttempts();
  const attemptErrors: string[] = [];
  let sawNonMissingFailure = false;
  const requestedModel = options.model?.trim() || '';

  for (const attempt of [initialAttempt, ...fallbackAttempts]) {
    try {
      if (GEMINI_STREAM_LOGS) {
        console.log(`[Gemini CLI] Attempt: ${attempt.description}`);
      }
      // Primary attempt: direct gemini CLI (or GEMINI_BIN), then package-manager fallbacks.
      const timeoutMs =
        attempt.timeoutMs ??
        (attempt.prefixArgs.length === 0 ? GEMINI_RUN_TIMEOUT_MS : GEMINI_FALLBACK_RUN_TIMEOUT_MS);
      return await runGeminiOnce(attempt.command, attempt.prefixArgs, options, timeoutMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (requestedModel && isCapacityExhaustedError(message)) {
        for (const fallbackModel of GEMINI_CAPACITY_FALLBACK_MODELS) {
          if (fallbackModel.toLowerCase() === requestedModel.toLowerCase()) continue;
          try {
            if (GEMINI_STREAM_LOGS) {
              console.log(
                `[Gemini CLI] Capacity fallback: ${requestedModel} -> ${fallbackModel} (attempt: ${attempt.description})`
              );
            }
            const timeoutMs =
              attempt.timeoutMs ??
              (attempt.prefixArgs.length === 0 ? GEMINI_RUN_TIMEOUT_MS : GEMINI_FALLBACK_RUN_TIMEOUT_MS);
            return await runGeminiOnce(
              attempt.command,
              attempt.prefixArgs,
              { ...options, model: fallbackModel },
              timeoutMs
            );
          } catch (fallbackError) {
            const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            attemptErrors.push(`${attempt.description} [model=${fallbackModel}] => ${fallbackMessage}`);
          }
        }
      }
      const isNotFound = isLikelyMissingCommandError(message);
      if (isNotFound) {
        attemptErrors.push(`${attempt.description} => ${message}`);
        continue;
      }
      sawNonMissingFailure = true;
      if (attempt === initialAttempt) {
        throw error;
      }
      attemptErrors.push(`${attempt.description} => ${message}`);
    }
  }

  const details = attemptErrors.length > 0 ? ` Attempts: ${attemptErrors.join(' | ')}` : '';
  if (sawNonMissingFailure) {
    throw new Error(
      `Gemini CLI invocation failed across all attempts. Configure GEMINI_BIN to a known working gemini executable.${details}`
    );
  }
  throw new Error(
    `Gemini CLI was not found. Set GEMINI_BIN to an absolute gemini executable path or install ${GEMINI_CLI_PACKAGE}.${details}`
  );
}

// ------------------------------------------------------------------------------------
// Port of gemini3agent.ts logic, with "opencode" process calls replaced by Gemini CLI.
// ------------------------------------------------------------------------------------

export const OPENCODE_MODELS = {
  // Force explicit Gemini 3-series model IDs for CLI.
  flash: process.env.GEMINI_CLI_FLASH_MODEL?.trim() || 'gemini-3-flash-preview',
  pro: process.env.GEMINI_CLI_PRO_MODEL?.trim() || 'gemini-3.1-pro-preview',
  // Gemini CLI cannot run non-Gemini models; keep compatibility by mapping to pro.
  minimax: process.env.GEMINI_CLI_MINIMAX_FALLBACK_MODEL?.trim() || 'gemini-3.1-pro-preview',
} as const;

function resolveGeminiCliModel(model: keyof typeof OPENCODE_MODELS | string | undefined): string {
  const raw = (model || 'pro').trim();
  if (!raw) return OPENCODE_MODELS.pro;

  if (raw in OPENCODE_MODELS) {
    return OPENCODE_MODELS[raw as keyof typeof OPENCODE_MODELS];
  }

  // Backward-compatibility for legacy internal model IDs.
  const normalized = raw.toLowerCase();
  if (normalized.includes('antigravity-gemini-3.1-pro')) return OPENCODE_MODELS.pro;
  if (normalized.includes('antigravity-gemini-3-flash')) return OPENCODE_MODELS.flash;
  if (normalized.includes('minimax')) return OPENCODE_MODELS.minimax;
  if (normalized === 'pro' || normalized === 'auto') return OPENCODE_MODELS.pro;
  if (normalized === 'flash') return OPENCODE_MODELS.flash;

  return raw;
}

export interface OpenCodeRunOptions {
  prompt: string;
  model?: keyof typeof OPENCODE_MODELS | string;
  format?: 'default' | 'json';
  quiet?: boolean;
  agent?: string;
  cwd?: string;
  earlyCompleteForClipCode?: boolean;
}

export interface OpenCodeResult {
  output: string;
  elapsedMs: number;
}

export interface OpenCodeOutputDiagnostics {
  isEventStream: boolean;
  totalLines: number;
  parsedEvents: number;
  eventTypeCounts: Record<string, number>;
  toolUseNames: string[];
  mentionsSkill: boolean;
  mentionsRemotion: boolean;
  mentionsAgent: boolean;
}

export interface AnimationPlanGenerationResult {
  output: string;
  diagnostics: OpenCodeOutputDiagnostics;
  usedAgent: string | null;
  fallbackWithoutAgent: boolean;
  promptMentionsSkill: boolean;
  usedExaResearch: boolean;
  usedExaDirection: boolean;
  usedRemotionSkill: boolean;
  researchSummary: string | null;
  researchDiagnostics: OpenCodeOutputDiagnostics | null;
}

export interface AnimationClipCodeGenerationResult {
  output: string;
  code: string | null;
  diagnostics: OpenCodeOutputDiagnostics;
  usedAgent: string | null;
  fallbackWithoutAgent: boolean;
  usedExaClipCode: boolean;
  usedRemotionSkill: boolean;
}

export type OpenCodeEnvironmentCheck = {
  opencodeCommand: string;
  opencodeAvailable: boolean;
  exaConnected: boolean;
  remotionSkillInstalled: boolean;
  mcpListRaw: string;
  skillsRaw: string;
};

function summarizeForLog(text: string, max = 240): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}...`;
}

function opencodeInfo(_message: string, _data?: Record<string, unknown>): void {
  // Logging disabled; use ANIMATION_PROMPT_DETAIL for animation timeline prompt detail.
}

function opencodeWarn(_message: string, _data?: Record<string, unknown>): void {
  // Logging disabled.
}

function opencodeError(_message: string, _data?: Record<string, unknown>): void {
  // Logging disabled.
}

function normalizePromptText(prompt: string): string {
  return prompt.replace(/\r\n/g, '\n').trim();
}

function validatePromptForRun(label: string, prompt: string, requiredTokens: string[] = []): string {
  const normalized = normalizePromptText(prompt);
  if (!normalized) {
    throw new Error(`${label} is empty.`);
  }
  if (/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/.test(normalized)) {
    throw new Error(`${label} has unresolved template placeholders.`);
  }
  const missing = requiredTokens.filter((token) => !normalized.includes(token));
  if (missing.length > 0) {
    throw new Error(`${label} is missing required sections: ${missing.join(', ')}`);
  }
  return normalized;
}

function extractToolName(event: Record<string, unknown>): string | null {
  const e = event as Record<string, any>;
  const candidates = [
    e.toolName,
    e.name,
    e.tool,
    e.tool?.name,
    e.tool_use?.name,
    e.part?.tool,
    e.part?.toolName,
    e.part?.name,
  ];
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return null;
}

function collectEventText(event: Record<string, unknown>): string {
  const e = event as Record<string, any>;
  const chunks: string[] = [];
  const direct = [e.text, e.message, e.content];
  for (const value of direct) {
    if (typeof value === 'string' && value.trim()) chunks.push(value);
  }
  if (typeof e.part?.text === 'string' && e.part.text.trim()) {
    chunks.push(e.part.text);
  }
  return chunks.join('\n');
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

// ------------------------------------------------------------------------------------
// Environment + "opencode" run implementation backed by Gemini CLI
// ------------------------------------------------------------------------------------

export async function inspectOpenCodeEnvironment(_cwd: string): Promise<OpenCodeEnvironmentCheck> {
  // Gemini-backed stub: assume CLI and tools are available.
  return {
    opencodeCommand: resolveGeminiCommand(),
    opencodeAvailable: true,
    exaConnected: true,
    remotionSkillInstalled: true,
    mcpListRaw: 'gemini-cli stub environment',
    skillsRaw: 'gemini-cli stub skills',
  };
}

export async function opencodeRun(options: OpenCodeRunOptions): Promise<string> {
  const prompt = normalizePromptText(options.prompt || '');
  if (!prompt) {
    throw new Error('OpenCode/Gemini prompt is empty.');
  }

  const cwd = options.cwd || process.cwd();
  const requestedModel = typeof options.model === 'string' ? options.model : 'pro';
  const model = resolveGeminiCliModel(requestedModel);

  const { response } = await runGeminiHeadless({
    prompt,
    cwd,
    model,
  });

  return response;
}

export async function opencodeRunWithTiming(options: OpenCodeRunOptions): Promise<OpenCodeResult> {
  const start = performance.now();
  const output = await opencodeRun(options);
  const elapsedMs = Math.round(performance.now() - start);
  return { output, elapsedMs };
}

export async function opencodeRunMultiModel(
  options: Omit<OpenCodeRunOptions, 'model'> & { models: string[] }
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const model of options.models) {
    opencodeInfo('Running model variant', { model });
    results[model] = await opencodeRun({ ...options, model });
  }
  return results;
}

// ------------------------------------------------------------------------------------
// The rest of this file is a mostly-direct copy of gemini3agent.ts domain logic,
// reusing the Gemini-backed opencodeRun implementation above.
// ------------------------------------------------------------------------------------

function extractToolUseEvents(output: string): Array<Record<string, any>> {
  const lines = output.trim().split('\n').filter(Boolean);
  const toolEvents: Array<Record<string, any>> = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, any>;
      const eventType = typeof event.type === 'string' ? event.type : null;
      if (eventType === 'tool_use') {
        toolEvents.push(event);
      }
    } catch {
      // ignore non-JSON lines
    }
  }
  return toolEvents;
}

function detectExaUsage(diagnostics: OpenCodeOutputDiagnostics, output: string): boolean {
  const hasExaToolName = (name: string): boolean => {
    const normalized = name.toLowerCase();
    return (
      normalized === 'exa' ||
      normalized.startsWith('exa_') ||
      normalized.startsWith('exa-') ||
      normalized.includes('.exa')
    );
  };

  if (diagnostics.toolUseNames.some((name) => hasExaToolName(name))) {
    return true;
  }

  const toolEvents = extractToolUseEvents(output);
  for (const event of toolEvents) {
    const toolName = extractToolName(event);
    if (toolName && hasExaToolName(toolName)) return true;
  }

  const normalizedOutput = output.toLowerCase();
  return (
    normalizedOutput.includes('"tool":"exa') ||
    normalizedOutput.includes('"tool":"exa_web_search_exa"') ||
    normalizedOutput.includes('"tool":"exa_get_code_context_exa"') ||
    normalizedOutput.includes('"tool":"exa_company_research_exa"')
  );
}

function detectRemotionSkillUsage(diagnostics: OpenCodeOutputDiagnostics, output: string): boolean {
  const toolEvents = extractToolUseEvents(output);
  for (const event of toolEvents) {
    const toolName = extractToolName(event)?.toLowerCase() || '';
    if (toolName === 'skill' || toolName.endsWith('.skill') || toolName.includes('skill')) {
      const requestedNameCandidates = [
        (event as any).part?.state?.input?.name,
        (event as any).part?.input?.name,
        (event as any).state?.input?.name,
        (event as any).input?.name,
      ];
      const requestedName = requestedNameCandidates.find((value) => typeof value === 'string') as string | undefined;
      if (requestedName && requestedName.toLowerCase().includes('remotion-best-practices')) {
        return true;
      }
    }
  }

  const normalized = output.toLowerCase();
  if (/\bloaded skill:\s*remotion-best-practices\b/.test(normalized)) return true;
  if (/<skill_content\s+name=["']remotion-best-practices["']/.test(normalized)) return true;
  if (/"name"\s*:\s*"remotion-best-practices"/.test(normalized) && diagnostics.toolUseNames.some((n) => /skill/i.test(n)))
    return true;
  return false;
}

function extractEventStreamText(output: string): string {
  const trimmed = output.trim();
  if (!trimmed) return '';

  const lines = trimmed.split('\n').filter(Boolean);
  if (lines.length <= 1) return trimmed;

  const chunks: string[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const text = collectEventText(event);
      if (text) chunks.push(text);
    } catch {
      // ignore non-JSON lines in output
    }
  }

  const combined = chunks.join('\n').trim();
  return combined || trimmed;
}

export function summarizeOpenCodeOutput(output: string): OpenCodeOutputDiagnostics {
  const trimmed = output.trim();
  const lines = trimmed ? trimmed.split('\n') : [];
  const eventTypeCounts: Record<string, number> = {};
  const toolNames = new Set<string>();
  const textSnippets: string[] = [];
  let parsedEvents = 0;
  let eventStreamSignals = 0;

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      parsedEvents += 1;

      const eventType = typeof (event as any).type === 'string' ? (event as any).type : null;
      if (eventType) {
        eventTypeCounts[eventType] = (eventTypeCounts[eventType] || 0) + 1;
        if (eventType === 'text' || eventType === 'step_start' || eventType === 'tool_use') {
          eventStreamSignals += 1;
        }
      }

      if (eventType === 'tool_use') {
        const toolName = extractToolName(event);
        if (toolName) toolNames.add(toolName);
      }

      const text = collectEventText(event);
      if (text) textSnippets.push(summarizeForLog(text, 400));
    } catch {
      // Ignore non-JSON lines in output.
    }
  }

  const signalText = `${textSnippets.join('\n')}\n${trimmed.slice(0, 2600)}`.toLowerCase();
  return {
    isEventStream: parsedEvents > 0 && eventStreamSignals > 0,
    totalLines: lines.length,
    parsedEvents,
    eventTypeCounts,
    toolUseNames: [...toolNames],
    mentionsSkill: /\bskills?\b/.test(signalText),
    mentionsRemotion: /\bremotion\b/.test(signalText),
    mentionsAgent: /\bagent\b/.test(signalText),
  };
}

// ------------------------------------------------------------------------------------
// Domain-specific animation & clip helpers (copied from gemini3agent.ts)
// ------------------------------------------------------------------------------------

type AnimationBudgetPlan = {
  durationSeconds: number;
  targetMomentCount: number;
  hardMomentCap: number;
  maxCoverageRatio: number;
  maxAnimatedSeconds: number;
  minAnimatedSeconds: number;
  minGapSeconds: number;
};

type TimelineMoment = {
  start: number;
  duration: number;
  type: string;
  content: string;
};

type TimelinePlan = {
  videoDurationSeconds: number;
  moments: TimelineMoment[];
};

type DialogueLine = {
  start: number;
  end: number;
  speaker: string;
  text: string;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function cleanOneLineText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxChars ? normalized.slice(0, maxChars).trim() : normalized;
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

function buildAnimationBudgetPlan(videoDurationSeconds: number, maxMoments: number): AnimationBudgetPlan {
  const durationSeconds = Math.max(1, toFiniteNumber(videoDurationSeconds, 60));
  const maxAllowedMoments = Math.max(1, Math.min(8, Math.floor(toFiniteNumber(maxMoments, 8))));

  if (durationSeconds <= 12) {
    const hardMomentCap = Math.min(2, maxAllowedMoments);
    const maxAnimatedSeconds = Math.min(7, Number((durationSeconds * 0.65).toFixed(2)));
    const minAnimatedSeconds = Math.min(maxAnimatedSeconds, Math.max(3.5, Math.min(5, durationSeconds * 0.45)));
    return {
      durationSeconds,
      targetMomentCount: hardMomentCap,
      hardMomentCap,
      maxCoverageRatio: Number((maxAnimatedSeconds / durationSeconds).toFixed(3)),
      maxAnimatedSeconds,
      minAnimatedSeconds: Number(minAnimatedSeconds.toFixed(2)),
      minGapSeconds: 0.7,
    };
  }

  if (durationSeconds <= 20) {
    const hardMomentCap = Math.min(3, maxAllowedMoments);
    return {
      durationSeconds,
      targetMomentCount: hardMomentCap,
      hardMomentCap,
      maxCoverageRatio: 0.56,
      maxAnimatedSeconds: Number((durationSeconds * 0.56).toFixed(2)),
      minAnimatedSeconds: Number((durationSeconds * 0.35).toFixed(2)),
      minGapSeconds: 0.8,
    };
  }

  if (durationSeconds <= 40) {
    const hardMomentCap = Math.min(4, maxAllowedMoments);
    return {
      durationSeconds,
      targetMomentCount: hardMomentCap,
      hardMomentCap,
      maxCoverageRatio: 0.5,
      maxAnimatedSeconds: Number((durationSeconds * 0.5).toFixed(2)),
      minAnimatedSeconds: Number((durationSeconds * 0.32).toFixed(2)),
      minGapSeconds: 0.9,
    };
  }

  const hardMomentCap = Math.min(8, maxAllowedMoments);
  const targetMomentCount = Math.min(hardMomentCap, Math.max(4, Math.round(durationSeconds / 10)));
  return {
    durationSeconds,
    targetMomentCount,
    hardMomentCap,
    maxCoverageRatio: 0.45,
    maxAnimatedSeconds: Number((durationSeconds * 0.45).toFixed(2)),
    minAnimatedSeconds: Number((durationSeconds * 0.28).toFixed(2)),
    minGapSeconds: 0.9,
  };
}

function buildAnimationBudgetBlock(budget: AnimationBudgetPlan): string {
  const maxCoveragePercent = Math.round(budget.maxCoverageRatio * 100);
  const lines = [
    'ANIMATION_BUDGET:',
    `- TARGET_MOMENTS: ${budget.targetMomentCount}`,
    `- HARD_MOMENT_CAP: ${budget.hardMomentCap}`,
    `- MAX_COVERAGE_RATIO: ${maxCoveragePercent}%`,
    `- MAX_ANIMATED_SECONDS: ${budget.maxAnimatedSeconds.toFixed(2)}s`,
    `- MIN_GAP_SECONDS: ${budget.minGapSeconds.toFixed(2)}s`,
  ];
  if (budget.durationSeconds <= 12) {
    lines.push(
      `- TARGET_ANIMATED_SECONDS_RANGE: ${budget.minAnimatedSeconds.toFixed(2)}s to ${budget.maxAnimatedSeconds.toFixed(
        2
      )}s`
    );
  }
  lines.push('- DENSITY_POLICY: pulse-and-rest cadence; avoid constant animation.');
  return lines.join('\n');
}

function buildFallbackTimelinePlan(topic: string, budget: AnimationBudgetPlan): TimelinePlan {
  const count = Math.max(1, budget.targetMomentCount);
  const durationSeconds = budget.durationSeconds;
  const maxTotal = Math.min(budget.maxAnimatedSeconds, Math.max(1, durationSeconds - 0.8));
  const baseDuration = clampNumber(maxTotal / count, durationSeconds <= 12 ? 2 : 1.8, 5.5);
  const totalAnimated = baseDuration * count;
  const gapPool = Math.max(0.3, durationSeconds - totalAnimated);
  const gap = count > 1 ? Math.max(budget.minGapSeconds, gapPool / (count + 1)) : Math.max(0.3, gapPool / 2);
  const moments: TimelineMoment[] = [];

  let cursor = gap;
  for (let i = 0; i < count; i++) {
    const maxInside = Math.max(0.8, durationSeconds - cursor);
    const duration = Math.min(baseDuration, maxInside);
    if (duration < 0.8) break;
    moments.push({
      start: Number(cursor.toFixed(2)),
      duration: Number(duration.toFixed(2)),
      type: i === 0 ? 'hook' : i === count - 1 ? 'takeaway' : 'explain',
      content: i === 0 ? `Core idea: ${topic}` : i === count - 1 ? 'Key takeaway' : `Supporting point ${i}`,
    });
    cursor += duration + gap;
    if (cursor >= durationSeconds - 0.2) break;
  }

  return {
    videoDurationSeconds: durationSeconds,
    moments:
      moments.length > 0
        ? moments
        : [
            {
              start: 0,
              duration: Number(Math.min(5.5, Math.max(2, durationSeconds * 0.45)).toFixed(2)),
              type: 'hook',
              content: `Core idea: ${topic}`,
            },
          ],
  };
}

function normalizeTimelinePlanForBudget(rawPlan: unknown, topic: string, budget: AnimationBudgetPlan): TimelinePlan {
  const rawMoments = Array.isArray((rawPlan as any)?.moments)
    ? ((rawPlan as any).moments as unknown[])
    : Array.isArray(rawPlan)
      ? (rawPlan as unknown[])
      : [];

  const minDuration = budget.durationSeconds <= 12 ? 2 : 1.6;
  const normalized: TimelineMoment[] = [];
  const sorted = rawMoments
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Record<string, unknown>)
    .sort((a, b) => toFiniteNumber(a.start, 0) - toFiniteNumber(b.start, 0));

  let nextMinStart = 0;
  for (const moment of sorted) {
    if (normalized.length >= budget.hardMomentCap) break;
    const content = cleanOneLineText(moment.content, 180) || cleanOneLineText((moment as any).title, 180);
    if (!content) continue;

    let start = clampNumber(toFiniteNumber(moment.start, 0), 0, Math.max(0, budget.durationSeconds - 0.2));
    start = Math.max(start, nextMinStart);
    const maxAllowedDuration = Math.min(7, Math.max(0, budget.durationSeconds - start));
    if (maxAllowedDuration < 0.8) continue;
    const duration = clampNumber(toFiniteNumber(moment.duration, minDuration), minDuration, maxAllowedDuration);

    normalized.push({
      start,
      duration,
      type: cleanOneLineText(moment.type, 40) || 'concept',
      content,
    });
    nextMinStart = start + duration + budget.minGapSeconds;
  }

  if (normalized.length === 0) {
    return buildFallbackTimelinePlan(topic, budget);
  }

  let reduced = normalized;
  let totalAnimated = reduced.reduce((sum, moment) => sum + moment.duration, 0);
  if (totalAnimated > budget.maxAnimatedSeconds && totalAnimated > 0) {
    const scale = budget.maxAnimatedSeconds / totalAnimated;
    reduced = reduced.map((moment) => ({
      ...moment,
      duration: Math.max(budget.durationSeconds <= 12 ? 1.8 : 1.4, moment.duration * scale),
    }));
  }

  const resolved: TimelineMoment[] = [];
  let cursor = 0;
  for (let i = 0; i < reduced.length; i++) {
    const moment = reduced[i];
    const start = Math.max(moment.start, cursor);
    const maxInside = Math.max(0, budget.durationSeconds - start);
    if (maxInside < 0.8) continue;

    const nextStart = i < reduced.length - 1 ? Math.max(reduced[i + 1].start, start) : budget.durationSeconds;
    const maxBeforeNext = Math.max(0.8, nextStart - start - budget.minGapSeconds);
    const duration = clampNumber(moment.duration, 0.8, Math.min(7, maxInside, maxBeforeNext));
    resolved.push({
      start: Number(start.toFixed(2)),
      duration: Number(duration.toFixed(2)),
      type: moment.type,
      content: moment.content,
    });
    cursor = start + duration + budget.minGapSeconds;
  }

  if (resolved.length === 0) {
    return buildFallbackTimelinePlan(topic, budget);
  }

  if (budget.durationSeconds <= 12) {
    let total = resolved.reduce((sum, moment) => sum + moment.duration, 0);
    if (total < budget.minAnimatedSeconds) {
      let missing = budget.minAnimatedSeconds - total;
      for (let i = 0; i < resolved.length && missing > 0; i++) {
        const current = resolved[i];
        const nextStart = i < resolved.length - 1 ? resolved[i + 1].start : budget.durationSeconds;
        const maxAllowed = Math.min(5.5, nextStart - budget.minGapSeconds - current.start);
        const room = Math.max(0, maxAllowed - current.duration);
        if (room <= 0) continue;
        const gain = Math.min(room, missing);
        current.duration = Number((current.duration + gain).toFixed(2));
        missing -= gain;
      }
      total = resolved.reduce((sum, moment) => sum + moment.duration, 0);
      if (total > budget.maxAnimatedSeconds) {
        const scale = budget.maxAnimatedSeconds / total;
        for (const moment of resolved) {
          moment.duration = Number(Math.max(1.8, moment.duration * scale).toFixed(2));
        }
      }
    }
  }

  return {
    videoDurationSeconds: budget.durationSeconds,
    moments: resolved.slice(0, budget.hardMomentCap),
  };
}

function parseDialogueLines(dialogueContext: string): DialogueLine[] {
  if (!dialogueContext.trim()) return [];
  const lines: DialogueLine[] = [];
  for (const row of dialogueContext.split('\n')) {
    const line = row.trim();
    if (!line) continue;
    const match = line.match(/^\[(\d+(?:\.\d+)?)s-(\d+(?:\.\d+)?)s\]\s*([^:]+):\s*(.+)$/);
    if (!match) continue;
    const start = toFiniteNumber(match[1], 0);
    const end = toFiniteNumber(match[2], start);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    lines.push({
      start,
      end,
      speaker: cleanOneLineText(match[3], 80) || 'Speaker',
      text: cleanOneLineText(match[4], 220),
    });
  }
  return lines.sort((a, b) => a.start - b.start);
}

function buildDialogueWindowsByMoment(dialogueContext: string, timelinePlan: TimelinePlan): string {
  const lines = parseDialogueLines(dialogueContext);
  if (lines.length === 0 || timelinePlan.moments.length === 0) {
    return 'No timestamped subtitle lines available.';
  }

  const blocks: string[] = [];
  for (let i = 0; i < timelinePlan.moments.length; i++) {
    const moment = timelinePlan.moments[i];
    const windowStart = Math.max(0, moment.start - 2);
    const windowEnd = Math.min(timelinePlan.videoDurationSeconds, moment.start + moment.duration + 2);
    const nearby = lines.filter((line) => line.end > windowStart && line.start < windowEnd).slice(0, 5);
    const details =
      nearby.length > 0
        ? nearby
            .map((line) => `- [${formatSeconds(line.start)}-${formatSeconds(line.end)}] ${line.speaker}: ${line.text}`)
            .join('\n')
        : '- (no nearby subtitle lines in this window)';
    blocks.push(
      `Moment ${i + 1} [${formatSeconds(moment.start)}-${formatSeconds(
        moment.start + moment.duration
      )}], local window [${formatSeconds(windowStart)}-${formatSeconds(windowEnd)}]:\n${details}`
    );
  }

  return blocks.join('\n\n');
}

const NO_CHAR_CAP = 500000;

function alignDirectionOutputToTimeline(
  output: string,
  timelinePlan: TimelinePlan,
  dialogueContext: string
): { alignedOutput: string; usedFallback: boolean } {
  const parsed = parseOpenCodeJSON<{ videoDurationSeconds?: unknown; moments?: unknown[] }>(output);
  const dialogueLines = parseDialogueLines(dialogueContext);
  const fallbackStyles = ['spotlight', 'split-comparison', 'flow-diagram', 'orbit-stat', 'timeline-lane', 'stack-cards'];
  const fallbackMotion = ['snap', 'glide', 'pulse', 'orbit', 'sweep', 'parallax'];
  const fallbackLayout = ['center', 'split', 'left-focus', 'right-focus', 'radial', 'timeline'];
  const sourceMoments =
    parsed && Array.isArray(parsed.moments)
      ? (parsed.moments.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>)
      : [];

  const alignedMoments = timelinePlan.moments.map((baseMoment, index) => {
    const source = sourceMoments[index] || {};
    const nearbyDialogue = dialogueLines.find(
      (line) => line.end > baseMoment.start && line.start < baseMoment.start + baseMoment.duration
    );
    const subtitle = cleanOneLineText((source as any).subtitle, NO_CHAR_CAP) || nearbyDialogue?.text || baseMoment.content;
    const content = cleanOneLineText((source as any).content, NO_CHAR_CAP) || baseMoment.content;
    const emphasis = cleanOneLineText((source as any).emphasis, NO_CHAR_CAP);
    const animationPrompt =
      cleanOneLineText((source as any).animationPrompt, NO_CHAR_CAP) ||
      `Scene focus: ${content}. Motion cadence: 1-2 active beats, then one hold beat for readability.`;

    return {
      ...(source as any),
      start: Number(baseMoment.start.toFixed(2)),
      duration: Number(baseMoment.duration.toFixed(2)),
      type: cleanOneLineText((source as any).type, NO_CHAR_CAP) || baseMoment.type,
      subtitle,
      content,
      visualStyle: cleanOneLineText((source as any).visualStyle, NO_CHAR_CAP) || fallbackStyles[index % fallbackStyles.length],
      motion: cleanOneLineText((source as any).motion, NO_CHAR_CAP) || fallbackMotion[index % fallbackMotion.length],
      layout: cleanOneLineText((source as any).layout, NO_CHAR_CAP) || fallbackLayout[index % fallbackLayout.length],
      emphasis: emphasis || subtitle.split(' ').slice(0, 3).join(' '),
      animationPrompt,
    };
  });

  return {
    alignedOutput: JSON.stringify(
      {
        videoDurationSeconds: timelinePlan.videoDurationSeconds,
        moments: alignedMoments,
      },
      null,
      2
    ),
    usedFallback: sourceMoments.length === 0,
  };
}

function limitChars(value: string | null | undefined, maxChars: number): string {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()} ...`;
}

function isNoOutputTimeoutError(message: string): boolean {
  return /timed out after \d+ms/i.test(message);
}

// ------------------------------------------------------------------------------------
// Clip-code prompt & deterministic fallback (copied from gemini3agent, still used here)
// ------------------------------------------------------------------------------------

function buildClipCodePrompt(
  params: {
    topic: string;
    dialogueContext: string;
    moment: {
      index: number;
      totalMoments?: number;
      start: number;
      duration: number;
      type: string;
      content: string;
      subtitle?: string;
      animationPrompt?: string;
      emphasis?: string;
      visualStyle?: string;
      motion?: string;
      layout?: string;
      [key: string]: unknown;
    };
    researchSummary?: string | null;
    clipType?: string;
  },
  options: { requireExa: boolean; requireRemotionSkill: boolean; compact: boolean }
): string {
  const momentPosition = `${params.moment.index + 1}/${params.moment.totalMoments ?? '?'}`;
  const momentJson = JSON.stringify(params.moment, null, 2);
  const dialogueContext = params.dialogueContext || 'No dialogue context provided';
  const researchContext = params.researchSummary || 'No research summary provided';
  const requiredTools = [
    options.requireRemotionSkill ? '- Use the "skill" tool and load "remotion-best-practices" before final answer.' : '',
    options.requireExa ? '- Use Exa MCP tools before final answer.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `You are a senior Remotion motion designer and TSX generator.

TASK:
Generate one production-ready Remotion clip component for a single timeline moment in a short educational 9:16 video.

MANDATORY TOOLS:
${requiredTools || '- Follow Remotion best practices for performance and readability.'}

INPUTS:
TOPIC: "${params.topic}"
CLIP_TYPE: ${params.clipType || 'B-roll moment'}
MOMENT_POSITION: ${momentPosition}
MOMENT_JSON:
${momentJson}
DIALOGUE_CONTEXT:
${dialogueContext || 'No dialogue context provided'}
RESEARCH_CONTEXT:
${researchContext || 'No research summary provided'}

ENGINEERING RULES:
- Return TSX code for exactly: export const GeneratedClip
- Use only imports from "react" and "remotion".
- Include: useCurrentFrame, useVideoConfig, interpolate, spring, Easing from remotion. Use Easing (capital E) for easing curves: Easing.bezier(), Easing.inOut(), Easing.out(), Easing.linear() — never "easing" (lowercase) which is not a function.
- Keep code deterministic and render-safe (no timers, no async effects, no DOM measurements, no external fetches).
- Motion cadence: 1-2 active beats + at least one calmer hold/readability window.
- Mobile-first composition, high contrast, avoid tiny text.
- Treat props.subtitle as context only. Do NOT render it. No JSX that displays subtitle or props.subtitle — no bottom caption strip, no full-sentence text. If you need on-screen text, use content/emphasis only (short 1–4 words).
- Avoid generic full-screen text card. Use layered motion and visual metaphor tied to MOMENT_JSON.

TYPE CONTRACT (must match exactly):
\`\`\`ts
export type GeneratedClipProps = {
  subtitle?: string;
  content: string;
  topic?: string;
  seed?: number;
  durationSeconds?: number;
  emphasis?: string;
};
\`\`\`

BEFORE FINALIZING OUTPUT:
- Review the generated TSX for errors: wrong or missing imports, invalid React/Remotion API usage, syntax errors, undefined variables, or use of packages not available in the project (only "react" and "remotion" are allowed).
- Remotion easing: import Easing (capital E) from "remotion" and use Easing.bezier(), Easing.inOut(), Easing.out(), etc. Do not use "easing" (lowercase) — it is not a function and will throw "easing is not a function".
- Ensure the component does NOT render subtitle or props.subtitle anywhere (no bottom bar, no caption). Remove any such JSX before returning.
- Fix any such errors before returning the componentCode. The code must compile and run in a Remotion project with no node_module or runtime errors.

OUTPUT JSON ONLY:
{
  "componentCode": "full TSX code string with export const GeneratedClip"
}

The code must compile as-is in a Remotion project.`;
}

function buildDeterministicFallbackClipCode(params: {
  topic: string;
  moment: {
    content: string;
    subtitle?: string;
    emphasis?: string;
  };
}): string {
  const topicLiteral = JSON.stringify(limitChars(params.topic, 80) || 'Topic');
  const contentLiteral = JSON.stringify(limitChars(params.moment.content, 140) || 'Key concept');
  const subtitleLiteral = JSON.stringify(
    limitChars(params.moment.subtitle || params.moment.content || 'Key point', 140) || 'Key point'
  );
  const emphasisLiteral = JSON.stringify(limitChars(params.moment.emphasis || '', 60) || 'Focus');

  return `import React from "react";
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";

export type GeneratedClipProps = {
  subtitle?: string;
  content: string;
  topic?: string;
  seed?: number;
  durationSeconds?: number;
  emphasis?: string;
};

const baseTopic = ${topicLiteral};
const baseContent = ${contentLiteral};
const baseSubtitle = ${subtitleLiteral};
const baseEmphasis = ${emphasisLiteral};

export const GeneratedClip: React.FC<GeneratedClipProps> = (props) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 16, stiffness: 120}});
  const drift = Math.sin(frame / 18);
  const pulse = interpolate(Math.sin(frame / 11), [-1, 1], [0.96, 1.04]);

  const title = (props.content || baseContent).slice(0, 90);
  const subtitle = (props.subtitle || baseSubtitle).slice(0, 120);
  const topic = (props.topic || baseTopic).slice(0, 80);
  const emphasis = (props.emphasis || baseEmphasis).slice(0, 40);

  const orbScale = interpolate(enter, [0, 1], [0.7, 1]);
  const cardY = interpolate(enter, [0, 1], [46, 0]);
  const accentX = interpolate(frame % Math.max(45, Math.floor((props.durationSeconds || 3) * fps)), [0, Math.max(1, Math.floor((props.durationSeconds || 3) * fps))], [-120, width + 120]);

  return (
    <AbsoluteFill style={{backgroundColor: "#0A1022", overflow: "hidden", fontFamily: "Inter, system-ui, sans-serif"}}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 20% 18%, rgba(61,175,255,0.35), transparent 38%), radial-gradient(circle at 82% 84%, rgba(255,154,77,0.25), transparent 34%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: width * 0.12 + drift * 6,
          top: height * 0.18,
          width: 180 * orbScale * pulse,
          height: 180 * orbScale * pulse,
          borderRadius: 999,
          background: "linear-gradient(135deg, #46C4FF, #7F7BFF)",
          filter: "blur(1px)",
          opacity: 0.9,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: -120,
          top: height * 0.42,
          width: 240,
          height: 4,
          background: "linear-gradient(90deg, transparent, #FFB06A, transparent)",
          transform: \`translateX(\${accentX}px)\`,
          opacity: 0.7,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: width * 0.1,
          top: height * 0.28 + cardY,
          width: width * 0.8,
          borderRadius: 22,
          padding: "26px 24px",
          background: "rgba(6, 11, 28, 0.78)",
          border: "1px solid rgba(125, 170, 255, 0.35)",
          boxShadow: "0 14px 40px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div style={{fontSize: 16, letterSpacing: 1.1, color: "#9BC7FF", marginBottom: 12}}>{topic.toUpperCase()}</div>
        <div style={{fontSize: 44, lineHeight: 1.08, fontWeight: 800, color: "#F7FBFF"}}>{title}</div>
        <div style={{marginTop: 12, fontSize: 18, color: "#FFCE9F", fontWeight: 700}}>{emphasis}</div>
      </div>

      {/* Subtitle intentionally not rendered; kept only for audio/timing context. */}
    </AbsoluteFill>
  );
};`;
}

// ------------------------------------------------------------------------------------
// JSON parsing helpers (unchanged)
// ------------------------------------------------------------------------------------

function parseJsonFromText<T = any>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to permissive parsing
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Continue
    }
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  const raw = objectMatch?.[0] || arrayMatch?.[0];
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseOpenCodeJSON<T = any>(output: string): T | null {
  const direct = parseJsonFromText<T>(output);
  if (direct) return direct;

  const lines = output.trim().split('\n').filter(Boolean);
  if (lines.length <= 1) {
    opencodeWarn('Could not parse JSON from output');
    return null;
  }

  let textContent = '';
  let hasEventStreamHints = false;
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, any>;
      if ((event as any).type === 'text' || (event as any).type === 'step_start' || (event as any).type === 'tool_use') {
        hasEventStreamHints = true;
      }
      if ((event as any).type === 'text' && typeof (event as any).part?.text === 'string') {
        textContent += (event as any).part.text;
      }
    } catch {
      // ignore
    }
  }

  if (!hasEventStreamHints) {
    opencodeWarn('Could not parse JSON from output');
    return null;
  }

  opencodeInfo('Detected event stream output', { events: lines.length, extractedChars: textContent.length });
  const parsed = parseJsonFromText<T>(textContent);
  if (!parsed) {
    opencodeWarn('Event stream had no parseable JSON text');
  }
  return parsed;
}

// ------------------------------------------------------------------------------------
// High-level exports ported from gemini3agent (backed by Gemini CLI)
// ------------------------------------------------------------------------------------

export async function researchWithOpenCode(
  topic: string,
  options?: { model?: string; detailed?: boolean }
): Promise<string> {
  const model = options?.model || 'pro';
  const detailed = options?.detailed ?? true;

  const prompt = detailed
    ? `Research the topic "${topic}" thoroughly using web search.

Provide:
1. Key concepts and definitions
2. Latest developments and trends (2024-2025)
3. Best practices and recommendations
4. Technical details relevant for educational content
5. Visual diagram suggestions (what diagrams would help explain this)

Focus on accurate, up-to-date information.`
    : `Quickly research "${topic}" and provide a concise summary with key points.`;

  return await opencodeRun({
    prompt,
    model,
    quiet: true,
  });
}

export async function generateImagePlanWithResearch(
  topic: string,
  dialogueContext: string,
  options?: { model?: string }
): Promise<string> {
  const model = options?.model || 'pro';

  const prompt = `You are an expert visual content strategist for educational Instagram Reels.

TOPIC: "${topic}"

DIALOGUE CONTEXT:
${dialogueContext}

TASK:
1. Research this topic using web search to understand current best practices
2. Suggest specific educational images/diagrams that would enhance the video
3. For each image, provide:
   - Timestamp (when it should appear based on dialogue)
   - Image type (diagram, comparison, code snippet, architecture, process flow)
   - Title (max 4 words)
   - Description (what the image should show)
   - Priority (high/medium/low)
   - Duration (how long to display)

Focus on visuals that:
- Are mobile-optimized (readable on phones)
- Explain technical concepts simply
- Enhance viewer retention
- Are not too complex (3-5 components max per diagram)

Return your suggestions in a structured format.`;

  return await opencodeRun({
    prompt,
    model,
    quiet: true,
  });
}

export async function generateAnimationPlanWithResearch(
  topic: string,
  dialogueContext: string,
  options?: {
    model?: string;
    videoDurationSeconds?: number;
    maxMoments?: number;
    promptTemplate?: string;
    cwd?: string;
    debugOutputDir?: string;
  }
): Promise<AnimationPlanGenerationResult> {
  const model = options?.model || 'pro';
  const cwd = options?.cwd || process.cwd();
  const debugOutputDir = options?.debugOutputDir;
  const videoDurationSeconds = options?.videoDurationSeconds ?? 60;
  const maxMoments = options?.maxMoments ?? 8;
  const animationBudget = buildAnimationBudgetPlan(videoDurationSeconds, maxMoments);
  const animationBudgetBlock = buildAnimationBudgetBlock(animationBudget);
  // Gemini CLI headless output may omit tool-use event telemetry; keep strict Exa enforcement opt-in.
  const requireExaForAnimation = process.env.OPENCODE_REQUIRE_EXA_FOR_ANIMATION === '1';
  const requireRemotionSkillForAnimation = process.env.OPENCODE_REQUIRE_REMOTION_SKILL_FOR_ANIMATION === '1';

  const rawDialogue = dialogueContext || '';
  const maxDialogueChars = 4000;
  const cappedDialogue =
    rawDialogue.length <= maxDialogueChars
      ? rawDialogue
      : rawDialogue.slice(-maxDialogueChars);

  const fallbackTimelinePrompt = buildAnimationTimelineWithResearchPrompt({
    topic,
    durationSeconds: animationBudget.durationSeconds,
    targetMomentCount: animationBudget.targetMomentCount,
    hardMomentCap: animationBudget.hardMomentCap,
    animationBudgetBlock,
    dialogueContext: cappedDialogue,
  });

  const timelinePrompt = validatePromptForRun(
    'Animation timeline prompt',
    options?.promptTemplate || fallbackTimelinePrompt
  );
  const preferredAgentEnv = process.env.OPENCODE_ANIMATION_AGENT?.trim();
  const preferredAgent = preferredAgentEnv ? preferredAgentEnv : null;
  let promptMentionsSkill = /\bskills?\b/i.test(timelinePrompt);

  const environment = await inspectOpenCodeEnvironment(cwd);
  opencodeInfo('Animation environment check', {
    opencodeCommand: environment.opencodeCommand,
    opencodeAvailable: environment.opencodeAvailable,
    exaConnected: environment.exaConnected,
    remotionSkillInstalled: environment.remotionSkillInstalled,
    mcpListRaw: environment.mcpListRaw,
    skillsRaw: environment.skillsRaw,
  });
  if (!environment.opencodeAvailable) {
    throw new Error(
      `OpenCode CLI is unavailable for this backend process. Command=${environment.opencodeCommand}. Set OPENCODE_BIN to the absolute CLI path.`
    );
  }
  if (requireExaForAnimation && !environment.exaConnected) {
    throw new Error('OpenCode MCP server "exa" is not connected.');
  }
  if (requireRemotionSkillForAnimation && !environment.remotionSkillInstalled) {
    throw new Error('OpenCode skill "remotion-best-practices" is not installed.');
  }

  opencodeInfo('Animation timeline request', {
    topic: summarizeForLog(topic, 100),
    model,
    preferredAgent,
    promptChars: timelinePrompt.length,
    dialogueChars: dialogueContext.length,
    videoDurationSeconds: animationBudget.durationSeconds,
    maxMoments,
    targetMoments: animationBudget.targetMomentCount,
    hardMomentCap: animationBudget.hardMomentCap,
    maxCoverageRatio: animationBudget.maxCoverageRatio,
    promptMentionsSkill,
    requireExaForAnimation,
    requireRemotionSkillForAnimation,
  });

  const runWithPreferredAgent = async (
    promptText: string,
    label: string
  ): Promise<{ output: string; usedAgent: string | null; fallbackWithoutAgent: boolean }> => {
    let output = '';
    let usedAgent: string | null = null;
    let fallbackWithoutAgent = false;

    if (preferredAgent) {
      usedAgent = preferredAgent;
      try {
        output = await opencodeRun({
          prompt: promptText,
          model,
          format: 'json',
          quiet: true,
          agent: preferredAgent,
          cwd,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        opencodeWarn(`${label} run with explicit agent failed; retrying without agent`, {
          preferredAgent,
          error: summarizeForLog(message, 260),
        });
        output = await opencodeRun({
          prompt: promptText,
          model,
          format: 'json',
          quiet: true,
          cwd,
        });
        usedAgent = null;
        fallbackWithoutAgent = true;
      }
    } else {
      output = await opencodeRun({
        prompt: promptText,
        model,
        format: 'json',
        quiet: true,
        cwd,
      });
    }

    return { output, usedAgent, fallbackWithoutAgent };
  };
  if (debugOutputDir) {
    try {
      fs.writeFileSync(path.join(debugOutputDir, 'animation-timeline-prompt.sent.txt'), timelinePrompt, 'utf8');
    } catch (error) {
      opencodeWarn('Failed to write timeline prompt snapshot', {
        debugOutputDir,
        error: summarizeForLog(error instanceof Error ? error.message : String(error), 180),
      });
    }
  }

  {
    const dialogueLines = cappedDialogue.trim().split(/\r?\n/).filter(Boolean);
    console.log('[Animation Timeline Prompt]', JSON.stringify({
      promptChars: timelinePrompt.length,
      dialogueCharsRaw: rawDialogue.length,
      dialogueCharsCapped: cappedDialogue.length,
      dialogueLineCount: dialogueLines.length,
      dialoguePreviewFirst: cappedDialogue.slice(0, 500),
      dialoguePreviewLast: cappedDialogue.length > 500 ? cappedDialogue.slice(-300) : null,
      videoDurationSeconds: animationBudget.durationSeconds,
      targetMoments: animationBudget.targetMomentCount,
      hardMomentCap: animationBudget.hardMomentCap,
      topicLength: topic.length,
      topicPreview: topic.slice(0, 120),
    }, null, 2));
  }

  console.log('[Animation] Step: timeline+research – calling OpenCode (may take several minutes)...');
  let timelineRun: { output: string; usedAgent: string | null; fallbackWithoutAgent: boolean };
  try {
    timelineRun = await runWithPreferredAgent(timelinePrompt, 'Animation timeline+research');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[Animation] Step: timeline+research – failed. Reason:', msg);
    throw err;
  }
  let timelineOutput = timelineRun.output;
  let usedAgent: string | null = timelineRun.usedAgent;
  let fallbackWithoutAgent = timelineRun.fallbackWithoutAgent;
  console.log('[Animation] Step: timeline+research – done, output length:', timelineOutput.length);
  let timelineDiagnostics = summarizeOpenCodeOutput(timelineOutput);

  const timelineParsed = parseOpenCodeJSON<{
    videoDurationSeconds?: number;
    moments?: unknown[];
    researchSummary?: string;
  }>(timelineOutput);
  const timelinePlan = normalizeTimelinePlanForBudget(timelineParsed, topic, animationBudget);

  let researchSummary: string | null =
    (typeof timelineParsed?.researchSummary === 'string' && timelineParsed.researchSummary.trim())
      ? timelineParsed.researchSummary
      : summarizeForLog(extractEventStreamText(timelineOutput), 4000);
  let usedExaResearch = detectExaUsage(timelineDiagnostics, timelineOutput);

  if (requireExaForAnimation && !usedExaResearch) {
    const forcedTimelinePrompt = `${timelinePrompt}

HARD REQUIREMENT:
You must call Exa MCP tools before producing the JSON. If you did not call Exa MCP tools yet, call them now and then output the timeline JSON.`;
    if (debugOutputDir) {
      try {
        fs.writeFileSync(
          path.join(debugOutputDir, 'animation-timeline-with-research-retry.sent.txt'),
          forcedTimelinePrompt,
          'utf8'
        );
      } catch (error) {
        opencodeWarn('Failed to write retry prompt snapshot', {
          debugOutputDir,
          error: summarizeForLog(error instanceof Error ? error.message : String(error), 180),
        });
      }
    }
    const retriedRun = await runWithPreferredAgent(
      forcedTimelinePrompt,
      'Animation timeline+research retry with forced Exa'
    );
    timelineOutput = retriedRun.output;
    timelineDiagnostics = summarizeOpenCodeOutput(timelineOutput);
    const retriedParsed = parseOpenCodeJSON<{
      videoDurationSeconds?: number;
      moments?: unknown[];
      researchSummary?: string;
    }>(timelineOutput);
    if (retriedParsed && (Array.isArray(retriedParsed.moments) ? retriedParsed.moments.length : 0) > 0) {
      const retriedPlan = normalizeTimelinePlanForBudget(retriedParsed, topic, animationBudget);
      timelinePlan.videoDurationSeconds = retriedPlan.videoDurationSeconds;
      timelinePlan.moments.length = 0;
      timelinePlan.moments.push(...retriedPlan.moments);
      researchSummary =
        (typeof retriedParsed.researchSummary === 'string' && retriedParsed.researchSummary.trim())
          ? retriedParsed.researchSummary
          : summarizeForLog(extractEventStreamText(timelineOutput), 4000);
    }
    usedExaResearch = detectExaUsage(timelineDiagnostics, timelineOutput);
  }

  const timelinePlanJson = JSON.stringify(timelinePlan, null, 2);
  const dialogueWindowsByMoment = buildDialogueWindowsByMoment(dialogueContext, timelinePlan);
  if (debugOutputDir) {
    try {
      fs.writeFileSync(path.join(debugOutputDir, 'animation-timeline-plan.json'), timelinePlanJson, 'utf8');
    } catch (error) {
      opencodeWarn('Failed to write timeline plan snapshot', {
        debugOutputDir,
        error: summarizeForLog(error instanceof Error ? error.message : String(error), 180),
      });
    }
  }

  const researchDiagnostics: OpenCodeOutputDiagnostics = timelineDiagnostics;
  opencodeInfo('Animation timeline+research diagnostics', {
    usedAgent,
    fallbackWithoutAgent,
    usedExaResearch,
    diagnostics: timelineDiagnostics,
    parsedMoments: Array.isArray(timelinePlan?.moments) ? timelinePlan.moments.length : 0,
    researchSummaryPreview: summarizeForLog(researchSummary || '', 360),
  });

  if (requireExaForAnimation && !usedExaResearch) {
    throw new Error('OpenCode did not use Exa MCP during animation timeline+research after retry.');
  }

  const directionPrompt = validatePromptForRun(
    'Animation direction prompt',
    `You are the Stage-2 Remotion animation direction agent.
Your job: transform the timeline plan into non-generic, visual-first clip directions.
Do not produce simple b-roll text cards.

MANDATORY TOOLING REQUIREMENTS:
- Use the "skill" tool to load and follow "remotion-best-practices".
- Use research context below.
- Generate clip directions that feel bespoke and cinematic for short-form educational video.

INPUTS:
TOPIC: "${topic}"
VIDEO_DURATION_SECONDS: ${animationBudget.durationSeconds}
${animationBudgetBlock}
DIALOGUE_CONTEXT:
${dialogueContext || 'No subtitle context provided'}
TIMELINE_PLAN_JSON:
${timelinePlanJson}
DIALOGUE_WINDOWS_BY_MOMENT:
${dialogueWindowsByMoment}

RESEARCH_CONTEXT:
${researchSummary || 'No research summary available.'}

OUTPUT JSON ONLY:
{
  "videoDurationSeconds": ${animationBudget.durationSeconds},
  "moments": [
    {
      "start": number,
      "duration": number,
      "type": string,
      "subtitle": string,
      "content": string,
      "visualStyle": "kinetic-typography" | "split-comparison" | "flow-diagram" | "orbit-stat" | "warning-signal" | "spotlight" | "timeline-lane" | "stack-cards",
      "motion": "snap" | "glide" | "pulse" | "orbit" | "sweep" | "parallax",
      "layout": "center" | "split" | "left-focus" | "right-focus" | "radial" | "timeline",
      "emphasis": string,
      "animationPrompt": string
    }
  ]
}

RULES:
- Keep the exact number/order/start/duration from TIMELINE_PLAN_JSON.
- Keep moments at or below HARD_MOMENT_CAP from ANIMATION_BUDGET.
- subtitle: short script-aligned cue (what narrator is saying).
- content: visual concept label for rendering (NOT subtitle text repetition).
- animationPrompt: 2-4 lines with scene objects, camera/motion intent, transitions, depth, icon/logo ideas, and at least one hold/low-motion beat.
- Avoid generic wobble cards and plain text-on-card scenes.
- Do not keep every second highly animated. Use pulse-and-rest cadence to maintain engagement.
- For each moment, include at most 2 active beats and 1 intentional hold/readability window.
- For <= 12s videos, keep to the timeline's low clip count (typically 2).
- Prefer visual metaphors, system diagrams, UI-like motion, icons, and symbolic objects.
- If brand/logo/icon helps, mention practical sources (Lucide, shadcn/ui iconography, Simple Icons, custom SVG).
- Keep mobile readability and fast comprehension.
- Return JSON only.`,
    ['MANDATORY TOOLING REQUIREMENTS:', 'TIMELINE_PLAN_JSON:', 'ANIMATION_BUDGET:', 'RESEARCH_CONTEXT:']
  );
  const validatedDirectionPrompt = validatePromptForRun(
    'Animation direction prompt (2025 vertical)',
    buildAnimationDirectionPrompt({
      topic,
      animationBudgetDurationSeconds: animationBudget.durationSeconds,
      animationBudgetBlock,
      dialogueContext,
      timelinePlanJson,
      dialogueWindowsByMoment,
      researchSummary,
    }),
    ['MANDATORY TOOLING', 'TIMELINE_PLAN_JSON:', 'ANIMATION_BUDGET:', 'RESEARCH_CONTEXT:']
  );
  if (debugOutputDir) {
    try {
      fs.writeFileSync(path.join(debugOutputDir, 'animation-direction-prompt.sent.txt'), validatedDirectionPrompt, 'utf8');
    } catch (error) {
      opencodeWarn('Failed to write direction prompt snapshot', {
        debugOutputDir,
        error: summarizeForLog(error instanceof Error ? error.message : String(error), 180),
      });
    }
  }
  promptMentionsSkill = /\bskills?\b|\bremotion-best-practices\b/i.test(validatedDirectionPrompt);

  console.log('[Animation] Step: direction – calling OpenCode...');
  let run: { output: string; usedAgent: string | null; fallbackWithoutAgent: boolean };
  try {
    run = await runWithPreferredAgent(validatedDirectionPrompt, 'Animation direction');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[Animation] Step: direction – failed. Reason:', msg);
    throw err;
  }
  let output = run.output;
  usedAgent = run.usedAgent;
  fallbackWithoutAgent = run.fallbackWithoutAgent;
  console.log('[Animation] Step: direction – done, output length:', output.length);
  let diagnostics = summarizeOpenCodeOutput(output);
  let usedRemotionSkill = detectRemotionSkillUsage(diagnostics, output);
  let usedExaDirection = detectExaUsage(diagnostics, output);

  if (requireExaForAnimation && !usedExaDirection) {
    const forcedExaDirectionPrompt = `${validatedDirectionPrompt}

HARD REQUIREMENT:
You must call Exa MCP tools before answering. If you did not call Exa MCP tools yet during this animation direction step, call them now and then answer.`;
    if (debugOutputDir) {
      try {
        fs.writeFileSync(
          path.join(debugOutputDir, 'animation-direction-prompt.exa-retry.sent.txt'),
          forcedExaDirectionPrompt,
          'utf8'
        );
      } catch (error) {
        opencodeWarn('Failed to write retry direction prompt snapshot (Exa)', {
          debugOutputDir,
          error: summarizeForLog(error instanceof Error ? error.message : String(error), 180),
        });
      }
    }
    run = await runWithPreferredAgent(forcedExaDirectionPrompt, 'Animation direction retry with forced Exa');
    output = run.output;
    usedAgent = run.usedAgent;
    fallbackWithoutAgent = run.fallbackWithoutAgent;
    diagnostics = summarizeOpenCodeOutput(output);
    usedRemotionSkill = detectRemotionSkillUsage(diagnostics, output);
    usedExaDirection = detectExaUsage(diagnostics, output);
  }

  if (requireExaForAnimation && !usedExaDirection) {
    throw new Error('OpenCode did not use Exa MCP during animation direction after retry.');
  }

  if (requireRemotionSkillForAnimation && !usedRemotionSkill) {
    const forcedSkillPrompt = `${validatedDirectionPrompt}

HARD REQUIREMENT:
You must call the "skill" tool and load "remotion-best-practices" before finalizing the JSON output.`;
    if (debugOutputDir) {
      try {
        fs.writeFileSync(path.join(debugOutputDir, 'animation-direction-prompt.retry.sent.txt'), forcedSkillPrompt, 'utf8');
      } catch (error) {
        opencodeWarn('Failed to write retry direction prompt snapshot', {
          debugOutputDir,
          error: summarizeForLog(error instanceof Error ? error.message : String(error), 180),
        });
      }
    }
    run = await runWithPreferredAgent(forcedSkillPrompt, 'Animation direction retry with forced skill');
    output = run.output;
    usedAgent = run.usedAgent;
    fallbackWithoutAgent = run.fallbackWithoutAgent;
    diagnostics = summarizeOpenCodeOutput(output);
    usedRemotionSkill = detectRemotionSkillUsage(diagnostics, output);
    usedExaDirection = detectExaUsage(diagnostics, output);
  }

  if (requireRemotionSkillForAnimation && !usedRemotionSkill) {
    throw new Error('OpenCode did not use the remotion-best-practices skill after retry.');
  }

  const alignedDirection = alignDirectionOutputToTimeline(output, timelinePlan, dialogueContext);
  output = alignedDirection.alignedOutput;
  if (debugOutputDir) {
    try {
      fs.writeFileSync(path.join(debugOutputDir, 'animation-direction-output.aligned.json'), output, 'utf8');
    } catch (error) {
      opencodeWarn('Failed to write aligned direction output snapshot', {
        debugOutputDir,
        error: summarizeForLog(error instanceof Error ? error.message : String(error), 180),
      });
    }
  }

  opencodeInfo('Animation plan response diagnostics', {
    usedAgent,
    fallbackWithoutAgent,
    usedExaResearch,
    usedExaDirection,
    usedRemotionSkill,
    directionAlignedToTimeline: true,
    directionAlignmentUsedFallback: alignedDirection.usedFallback,
    researchDiagnostics,
    diagnostics,
  });

  console.log('[Animation] Step: AI plan complete.');
  return {
    output,
    diagnostics,
    usedAgent,
    fallbackWithoutAgent,
    promptMentionsSkill,
    usedExaResearch,
    usedExaDirection,
    usedRemotionSkill,
    researchSummary,
    researchDiagnostics,
  };
}

function extractGeneratedClipCode(output: string): string | null {
  const normalizeCodeCandidate = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.includes('\\n') && !trimmed.includes('\n')) {
      return trimmed
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .trim();
    }
    return trimmed;
  };

  const looksLikeGeneratedClipModule = (value: string): boolean => {
    const candidate = normalizeCodeCandidate(value);
    if (!candidate) return false;
    return (
      /\bexport\s+const\s+GeneratedClip\b/.test(candidate) &&
      /from\s+["']remotion["']/.test(candidate) &&
      (/\bReact\.FC\b/.test(candidate) || /\buseCurrentFrame\b/.test(candidate) || /\buseVideoConfig\b/.test(candidate))
    );
  };

  const parsed = parseOpenCodeJSON<{ componentCode?: unknown; code?: unknown }>(output);
  let fallbackParsedCandidate = '';
  if (parsed && typeof parsed === 'object') {
    const parsedCandidates = [parsed.componentCode, parsed.code]
      .filter((item): item is string => typeof item === 'string')
      .map((item) => normalizeCodeCandidate(item))
      .filter(Boolean);
    if (parsedCandidates.length > 0) {
      fallbackParsedCandidate = parsedCandidates[0];
      const validParsed = parsedCandidates.find((item) => looksLikeGeneratedClipModule(item));
      if (validParsed) return validParsed;
    }
  }

  const text = extractEventStreamText(output) || output;
  const fencedBlocks = [...text.matchAll(/```(?:tsx|ts|jsx|js)?\s*([\s\S]*?)\s*```/gi)];
  for (const block of fencedBlocks) {
    const candidate = normalizeCodeCandidate(block?.[1] || '');
    if (looksLikeGeneratedClipModule(candidate)) return candidate;
  }

  const textCandidate = normalizeCodeCandidate(text);
  if (looksLikeGeneratedClipModule(textCandidate)) return textCandidate;

  if (fallbackParsedCandidate) return fallbackParsedCandidate;
  const firstFenced = fencedBlocks[0]?.[1];
  if (typeof firstFenced === 'string' && firstFenced.trim()) return normalizeCodeCandidate(firstFenced);
  return textCandidate || null;
}

export async function generateRemotionClipCodeWithSkill(
  params: {
    topic: string;
    dialogueContext: string;
    moment: {
      index: number;
      totalMoments?: number;
      start: number;
      duration: number;
      type: string;
      content: string;
      subtitle?: string;
      animationPrompt?: string;
      emphasis?: string;
      visualStyle?: string;
      motion?: string;
      layout?: string;
    };
    researchSummary?: string | null;
    clipType?: string;
  },
  options?: {
    model?: string;
    cwd?: string;
    debugOutputDir?: string;
    environment?: OpenCodeEnvironmentCheck;
  }
): Promise<AnimationClipCodeGenerationResult> {
  const model = options?.model || 'pro';
  const cwd = options?.cwd || process.cwd();
  const debugOutputDir = options?.debugOutputDir;
  const requireExaForClipCode = false;
  const requireRemotionSkill = process.env.OPENCODE_REQUIRE_REMOTION_SKILL_FOR_CLIP_CODE === '1';
  const preferredAgentEnv = process.env.OPENCODE_ANIMATION_AGENT?.trim();
  const preferredAgent = preferredAgentEnv ? preferredAgentEnv : null;

  const environment = options?.environment ?? (await inspectOpenCodeEnvironment(cwd));
  if (!environment.opencodeAvailable) {
    throw new Error(
      `OpenCode CLI is unavailable for clip code generation. Command=${environment.opencodeCommand}.`
    );
  }
  if (requireExaForClipCode && !environment.exaConnected) {
    throw new Error('OpenCode MCP server "exa" is not connected.');
  }
  if (requireRemotionSkill && !environment.remotionSkillInstalled) {
    throw new Error('OpenCode skill "remotion-best-practices" is not installed.');
  }

  const prompt = validatePromptForRun(
    `Clip code prompt for moment ${params.moment.index}`,
    buildClipCodePrompt(params, {
      requireExa: requireExaForClipCode,
      requireRemotionSkill,
      compact: false,
    }),
    ['MOMENT_JSON:', 'OUTPUT JSON ONLY:']
  );

  const compactPrompt = validatePromptForRun(
    `Compact clip code prompt for moment ${params.moment.index}`,
    buildClipCodePrompt(params, {
      requireExa: requireExaForClipCode,
      requireRemotionSkill,
      compact: true,
    }),
    ['MOMENT_JSON:', 'OUTPUT JSON ONLY:']
  );
  const ultraCompactPrompt = validatePromptForRun(
    `Ultra compact clip code prompt for moment ${params.moment.index}`,
    `Generate Remotion TSX for one clip.
TOPIC: "${limitChars(params.topic, 80)}"
MOMENT_JSON:
${JSON.stringify(params.moment, null, 2)}
RULES:
- Return JSON only: {"componentCode":"..."}.
- Code must export const GeneratedClip and GeneratedClipProps.
- Use only react + remotion imports.
- Frame-driven motion only. Keep subtitle in lower safe area.
- Before returning: find and fix any errors (imports, syntax, undefined refs). Code must compile in Remotion.
${requireRemotionSkill ? '- Load remotion-best-practices skill.' : ''}
${requireExaForClipCode ? '- Call Exa MCP before final answer.' : ''}
OUTPUT JSON ONLY.`,
    ['MOMENT_JSON:', 'OUTPUT JSON ONLY.']
  );
  if (debugOutputDir) {
    try {
      fs.writeFileSync(path.join(debugOutputDir, `clip-code-prompt-${params.moment.index}.sent.txt`), prompt, 'utf8');
      fs.writeFileSync(path.join(debugOutputDir, `clip-code-prompt-${params.moment.index}.compact.sent.txt`), compactPrompt, 'utf8');
      fs.writeFileSync(
        path.join(debugOutputDir, `clip-code-prompt-${params.moment.index}.ultra-compact.sent.txt`),
        ultraCompactPrompt,
        'utf8'
      );
    } catch (error) {
      opencodeWarn('Failed to write clip code prompt snapshot', {
        debugOutputDir,
        index: params.moment.index,
        error: summarizeForLog(error instanceof Error ? error.message : String(error), 160),
      });
    }
  }

  const runWithPreferredAgent = async (
    promptText: string
  ): Promise<{ output: string; usedAgent: string | null; fallbackWithoutAgent: boolean }> => {
    if (preferredAgent) {
      try {
        const output = await opencodeRun({
          prompt: promptText,
          model,
          format: 'json',
          quiet: true,
          agent: preferredAgent,
          cwd,
        });
        return { output, usedAgent: preferredAgent, fallbackWithoutAgent: false };
      } catch (error) {
        opencodeWarn('Clip code run with explicit agent failed; retrying without agent', {
          preferredAgent,
          index: params.moment.index,
          error: summarizeForLog(error instanceof Error ? error.message : String(error), 240),
        });
      }
    }

    const output = await opencodeRun({
      prompt: promptText,
      model,
      format: 'json',
      quiet: true,
      cwd,
    });
    return { output, usedAgent: null, fallbackWithoutAgent: Boolean(preferredAgent) };
  };

  let activePrompt = prompt;
  let usedCompactPrompt = false;
  let usedUltraCompactPrompt = false;
  let degradedMode = false;

  const safeRunPrompt = async (
    promptText: string,
    label: string
  ): Promise<{ output: string; usedAgent: string | null; fallbackWithoutAgent: boolean } | null> => {
    try {
      return await runWithPreferredAgent(promptText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isNoOutputTimeoutError(message)) throw error;
      degradedMode = true;
      opencodeWarn('Clip code run timed out with no output', {
        index: params.moment.index,
        label,
        promptChars: promptText.length,
        message: summarizeForLog(message, 220),
      });
      return null;
    }
  };

  let run = await safeRunPrompt(activePrompt, 'primary');
  if (!run) {
    activePrompt = compactPrompt;
    usedCompactPrompt = true;
    run = await safeRunPrompt(activePrompt, 'compact-fallback');
  }
  if (!run) {
    activePrompt = ultraCompactPrompt;
    usedUltraCompactPrompt = true;
    run = await safeRunPrompt(activePrompt, 'ultra-compact-fallback');
  }
  if (!run) {
    const fallbackCode = buildDeterministicFallbackClipCode(params);
    const fallbackOutput = JSON.stringify(
      {
        componentCode: fallbackCode,
        degradedMode: true,
        reason: 'all_opencode_runs_timed_out',
      },
      null,
      2
    );
    const fallbackDiagnostics = summarizeOpenCodeOutput(fallbackOutput);
    opencodeWarn('Using deterministic fallback clip code after repeated no-output timeouts', {
      index: params.moment.index,
      promptChars: activePrompt.length,
    });
    return {
      output: fallbackOutput,
      code: fallbackCode,
      diagnostics: fallbackDiagnostics,
      usedAgent: null,
      fallbackWithoutAgent: Boolean(preferredAgent),
      usedExaClipCode: false,
      usedRemotionSkill: false,
    };
  }

  let output = run.output;
  let diagnostics = summarizeOpenCodeOutput(output);
  let usedExaClipCode = detectExaUsage(diagnostics, output);
  let usedRemotionSkill = detectRemotionSkillUsage(diagnostics, output);

  if (requireExaForClipCode && !usedExaClipCode && !degradedMode) {
    const retryExaPrompt = `${activePrompt}

HARD REQUIREMENT:
You must call Exa MCP tools before final JSON. If you did not call Exa MCP tools yet, call them now and then answer.`;
    if (debugOutputDir) {
      try {
        fs.writeFileSync(
          path.join(debugOutputDir, `clip-code-prompt-${params.moment.index}.exa-retry.sent.txt`),
          retryExaPrompt,
          'utf8'
        );
      } catch (error) {
        opencodeWarn('Failed to write Exa retry clip code prompt snapshot', {
          debugOutputDir,
          index: params.moment.index,
          error: summarizeForLog(error instanceof Error ? error.message : String(error), 160),
        });
      }
    }
    const retryRun = await safeRunPrompt(retryExaPrompt, 'exa-retry');
    if (retryRun) {
      run = retryRun;
      output = run.output;
      diagnostics = summarizeOpenCodeOutput(output);
      usedExaClipCode = detectExaUsage(diagnostics, output);
      usedRemotionSkill = detectRemotionSkillUsage(diagnostics, output);
    }
  }

  if (requireExaForClipCode && !usedExaClipCode && !degradedMode) {
    throw new Error('OpenCode did not use Exa MCP during clip code generation after retry.');
  }

  if (requireRemotionSkill && !usedRemotionSkill && !degradedMode) {
    const retryPrompt = `${activePrompt}

HARD REQUIREMENT:
You must call the "skill" tool and load "remotion-best-practices" before final JSON.
${requireExaForClipCode ? 'You must also call Exa MCP tools before final JSON.' : ''}`;
    if (debugOutputDir) {
      try {
        fs.writeFileSync(
          path.join(debugOutputDir, `clip-code-prompt-${params.moment.index}.retry.sent.txt`),
          retryPrompt,
          'utf8'
        );
      } catch (error) {
        opencodeWarn('Failed to write retry clip code prompt snapshot', {
          debugOutputDir,
          index: params.moment.index,
          error: summarizeForLog(error instanceof Error ? error.message : String(error), 160),
        });
      }
    }
    const retryRun = await safeRunPrompt(retryPrompt, 'skill-retry');
    if (retryRun) {
      run = retryRun;
      output = run.output;
      diagnostics = summarizeOpenCodeOutput(output);
      usedExaClipCode = detectExaUsage(diagnostics, output);
      usedRemotionSkill = detectRemotionSkillUsage(diagnostics, output);
    }
  }

  if (requireExaForClipCode && !usedExaClipCode && !degradedMode) {
    throw new Error('OpenCode did not use Exa MCP during clip code generation after skill retry.');
  }

  if (requireRemotionSkill && !usedRemotionSkill && !degradedMode) {
    throw new Error('OpenCode did not use the remotion-best-practices skill for clip code generation.');
  }
  if ((requireExaForClipCode && !usedExaClipCode) || (requireRemotionSkill && !usedRemotionSkill)) {
    opencodeWarn('Proceeding in degraded clip-code mode due timeout-related tool unavailability', {
      index: params.moment.index,
      usedExaClipCode,
      usedRemotionSkill,
      degradedMode,
    });
  }

  let code = extractGeneratedClipCode(output);
  if (!code || !/\bexport\s+const\s+GeneratedClip\b/.test(code)) {
    degradedMode = true;
    code = buildDeterministicFallbackClipCode(params);
    output = JSON.stringify(
      {
        componentCode: code,
        degradedMode: true,
        reason: 'invalid_or_missing_component_code',
      },
      null,
      2
    );
    diagnostics = summarizeOpenCodeOutput(output);
    opencodeWarn('Using deterministic fallback clip code due invalid model output', {
      index: params.moment.index,
    });
  }

  opencodeInfo('Clip code generation diagnostics', {
    index: params.moment.index,
    usedCompactPrompt,
    usedUltraCompactPrompt,
    degradedMode,
    promptChars: activePrompt.length,
    usedExaClipCode,
    usedRemotionSkill,
    diagnostics,
  });

  return {
    output,
    code,
    diagnostics,
    usedAgent: run.usedAgent,
    fallbackWithoutAgent: run.fallbackWithoutAgent,
    usedExaClipCode,
    usedRemotionSkill,
  };
}

export async function generateSFXPlanWithResearch(
  topic: string,
  overlayTimings: Array<{ start: number; description: string }>,
  options?: { model?: string; videoDuration?: number }
): Promise<string> {
  const model = options?.model || 'pro';
  const maxTimestamp = overlayTimings.length > 0 ? Math.max(...overlayTimings.map((t) => t.start)) : 15;
  const videoDuration = options?.videoDuration || maxTimestamp + 5;

  opencodeInfo('SFX plan generation started', {
    overlayEvents: overlayTimings.length,
    videoDuration: Number(videoDuration.toFixed(0)),
  });

  const timingsStr = overlayTimings.map((t) => `[${t.start.toFixed(1)}s] ${t.description}`).join('\n');
  const prompt = `Audio designer for short-form educational video.

TOPIC: "${topic}"
DURATION: ${videoDuration.toFixed(0)}s

VISUAL EVENTS (overlay transitions):
${timingsStr || 'No overlays provided'}

TASK: Suggest sound effects ONLY for the visual events listed above. Each overlay transition may need a subtle sound effect.

SFX TYPES:
- whoosh/swipe: for slide-in/out transitions
- pop/blip: for element appearances
- ding/chime: for reveals or emphasis
- click: for UI interactions

RULES:
- Only suggest SFX where it enhances the visual
- Not every overlay needs a sound - be selective
- Volume: 0.4-0.7 range (dialogue-friendly)
- Duration: 0.3-0.8s typical
- Space sounds 2+ seconds apart

Return ONLY valid JSON:
{"suggestions":[{"timestamp":0.0,"sfxType":"whoosh","description":"intro sweep","volume":0.5,"duration":0.4}]}

No markdown.`;

  opencodeInfo('SFX plan using OpenCode');
  return await opencodeRun({
    prompt,
    model,
    format: 'json',
    quiet: true,
  });
}

// ------------------------------------------------------------------------------------
// Public high-level helpers (you can call these instead of opencodeRun directly)
// ------------------------------------------------------------------------------------

export type GeminiClipGenerationParams = {
  topic: string;
  dialogueContext: string;
  outputFilePath: string;
};

export async function generateRemotionClipWithGemini(
  params: GeminiClipGenerationParams
): Promise<{ code: string; outputFilePath: string }> {
  const { topic, dialogueContext, outputFilePath } = params;
  const absoluteOutputPath = path.isAbsolute(outputFilePath)
    ? outputFilePath
    : path.join(process.cwd(), outputFilePath);

  const prompt = `You are a senior Remotion motion designer and TypeScript engineer.

TASK:
Generate production-ready TSX code for a single Remotion clip component for a vertical educational video.

TOPIC: "${topic}"

DIALOGUE CONTEXT:
${dialogueContext || 'No dialogue context provided.'}

ENGINEERING RULES:
- Return ONLY raw TSX code, no markdown fences.
- The module must export exactly: export const GeneratedClip
- Use only imports from "react" and "remotion".
- Include: useCurrentFrame, useVideoConfig, interpolate, spring from "remotion".
- Keep the component deterministic and render-safe (no timers, no async effects, no external fetches).
- Mobile-first design, high contrast, and avoid tiny text.

TYPE CONTRACT (must match exactly):
\`\`\`ts
export type GeneratedClipProps = {
  subtitle?: string;
  content: string;
  topic?: string;
  seed?: number;
  durationSeconds?: number;
  emphasis?: string;
};
\`\`\`

REQUIREMENTS:
- Implement and export GeneratedClipProps.
- Implement and export const GeneratedClip: React.FC<GeneratedClipProps>.
- Do not use any imports other than "react" and "remotion".
- Double-check imports, types, and JSX so the code compiles in a Remotion project.

OUTPUT:
Return ONLY the TSX source code for the file. Do NOT wrap it in JSON or markdown.`;

  const { response } = await runGeminiHeadless({
    prompt,
    cwd: path.dirname(absoluteOutputPath),
    model: OPENCODE_MODELS.pro,
  });

  const code = response.trim();
  if (!code) {
    throw new Error('Gemini returned an empty clip component.');
  }

  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  fs.writeFileSync(absoluteOutputPath, code, 'utf8');

  return { code, outputFilePath: absoluteOutputPath };
}
