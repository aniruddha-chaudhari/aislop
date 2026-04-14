import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { buildAnimationDirectionPrompt } from '../prompts/animationDirectionPrompt';
import { buildAnimationTimelineWithResearchPrompt } from '../prompts/animationTimelinePrompt';
import { buildAnimationClipCodePrompt } from '../prompts/animationClipCodePrompt';

const OPENCODE_BIN_ENV = process.env.OPENCODE_BIN?.trim() || '';
const OPENCODE_DEFAULT_BIN = 'opencode';
const OPENCODE_DEBUG_ENABLED = process.env.OPENCODE_DEBUG !== '0';
/** Log every stdout/stderr chunk — very verbose. Default OFF. Set OPENCODE_LOG_EVERY_WORD=1 to enable. */
const OPENCODE_LOG_EVERY_WORD = process.env.OPENCODE_LOG_EVERY_WORD === '1';
const parsePositiveMs = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};
const OPENCODE_RUN_TIMEOUT_MS = parsePositiveMs(process.env.OPENCODE_RUN_TIMEOUT_MS, 300000);
const OPENCODE_HEARTBEAT_INTERVAL_MS = parsePositiveMs(process.env.OPENCODE_HEARTBEAT_INTERVAL_MS, 15000);
let CACHED_OPENCODE_COMMAND: string | null = null;

/** OpenCode model ids. `animationGemini` = Gemini 3.1 Pro for the full animation flow (timeline, direction, Remotion TSX). `default` / `pro` = GPT 5.3 Codex for research, SFX, image plans, and other non-animation OpenCode tasks. */
export const OPENCODE_MODELS = {
  default: 'github-copilot/gpt-5.3-codex',
  pro: 'github-copilot/gpt-5.3-codex',
  minimax: 'opencode/minimax-m2.5-free',
  animationGemini: 'github-copilot/gemini-3.1-pro-preview',
} as const;

const OPENCODE_DEFAULT_MODEL: keyof typeof OPENCODE_MODELS = 'default';

export interface OpenCodeRunOptions {
  prompt: string;
  model?: keyof typeof OPENCODE_MODELS | string;
  format?: 'default' | 'json';
  quiet?: boolean;
  agent?: string;
  cwd?: string;
  /** When true, resolve early once the stream contains valid GeneratedClip component code — avoids hanging after output is ready. */
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
  timelinePrompt: string;
  directionPrompt: string;
  timelinePlanJson: string;
  dialogueWindowsByMoment: string;
  timelineOutput: string;
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
    e.part?.state?.input?.name,
    e.part?.state?.tool,
    e.state?.input?.name,
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

function isPathLikeCommand(command: string): boolean {
  return /[\\/]/.test(command) || /^[a-zA-Z]:/.test(command) || command.endsWith('.cmd') || command.endsWith('.exe');
}

function resolveOpenCodeCommand(): string {
  if (CACHED_OPENCODE_COMMAND) return CACHED_OPENCODE_COMMAND;

  const candidates: string[] = [];
  if (OPENCODE_BIN_ENV) candidates.push(OPENCODE_BIN_ENV);

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    const pnpmHome = process.env.PNPM_HOME;
    const userProfile = process.env.USERPROFILE;
    if (appData) candidates.push(path.join(appData, 'npm', 'opencode.cmd'));
    if (userProfile) candidates.push(path.join(userProfile, 'AppData', 'Roaming', 'npm', 'opencode.cmd'));
    // pnpm global bin locations (common on Windows)
    if (pnpmHome) candidates.push(path.join(pnpmHome, 'opencode.cmd'));
    if (localAppData) candidates.push(path.join(localAppData, 'pnpm', 'opencode.cmd'));
    if (appData) candidates.push(path.join(appData, 'pnpm', 'opencode.cmd'));
    if (userProfile) candidates.push(path.join(userProfile, 'AppData', 'Local', 'pnpm', 'opencode.cmd'));
    // project-local install fallback
    candidates.push(path.join(process.cwd(), 'node_modules', '.bin', 'opencode.cmd'));
  }

  if (process.platform !== 'win32') {
    candidates.push(path.join(process.cwd(), 'node_modules', '.bin', 'opencode'));
  }

  candidates.push(OPENCODE_DEFAULT_BIN);
  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

  const existingPathCandidate = uniqueCandidates.find((candidate) => {
    if (!isPathLikeCommand(candidate)) return false;
    return fs.existsSync(candidate);
  });

  CACHED_OPENCODE_COMMAND =
    existingPathCandidate || uniqueCandidates.find((candidate) => !isPathLikeCommand(candidate)) || OPENCODE_DEFAULT_BIN;
  return CACHED_OPENCODE_COMMAND;
}

function withPathPrepended(dirPath: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (!dirPath) return env;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const current = env[pathKey] || '';
  const parts = current
    .split(path.delimiter)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.toLowerCase());
  if (!parts.includes(dirPath.toLowerCase())) {
    env[pathKey] = current ? `${dirPath}${path.delimiter}${current}` : dirPath;
  }
  return env;
}

function resolveOpenCodeSpawnTarget(opencodeCommand: string): {
  command: string;
  env: NodeJS.ProcessEnv;
  commandLabel: string;
  prefixArgs: string[];
} {
  if (process.platform !== 'win32') {
    return { command: opencodeCommand, env: { ...process.env }, commandLabel: opencodeCommand, prefixArgs: [] };
  }

  if (opencodeCommand.toLowerCase().endsWith('.cmd') && isPathLikeCommand(opencodeCommand)) {
    const dirPath = path.dirname(opencodeCommand);
    const env = withPathPrepended(dirPath);
    const scriptPath = path.join(dirPath, 'node_modules', 'opencode-ai', 'bin', 'opencode');
    const localNodeExe = path.join(dirPath, 'node.exe');
    const nodeCommand = fs.existsSync(localNodeExe) ? localNodeExe : 'node';
    if (fs.existsSync(scriptPath)) {
      return {
        command: nodeCommand,
        env,
        commandLabel: `${nodeCommand} ${scriptPath} (via ${opencodeCommand})`,
        prefixArgs: [scriptPath],
      };
    }
    const basename = path.basename(opencodeCommand);
    if (/\s/.test(opencodeCommand)) {
      return {
        command: basename,
        env,
        commandLabel: `${basename} (resolved from ${opencodeCommand})`,
        prefixArgs: [],
      };
    }
    return { command: opencodeCommand, env, commandLabel: opencodeCommand, prefixArgs: [] };
  }

  return { command: opencodeCommand, env: { ...process.env }, commandLabel: opencodeCommand, prefixArgs: [] };
}

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
      normalized.startsWith('mcp_exa') ||
      normalized.includes('.exa') ||
      // MCP tools may be named e.g. mcp_exa_web_search_exa
      (normalized.includes('exa') &&
        (normalized.includes('web_search') ||
          normalized.includes('get_code_context') ||
          normalized.includes('company_research')))
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
    normalizedOutput.includes('"tool":"exa_company_research_exa"') ||
    normalizedOutput.includes('"tool":"mcp_exa') ||
    (normalizedOutput.includes('"tool":') && normalizedOutput.includes('exa') && (normalizedOutput.includes('web_search') || normalizedOutput.includes('get_code_context') || normalizedOutput.includes('company_research')))
  );
}

function detectRemotionSkillUsage(diagnostics: OpenCodeOutputDiagnostics, output: string): boolean {
  const toolEvents = extractToolUseEvents(output);
  for (const event of toolEvents) {
    const toolName = extractToolName(event)?.toLowerCase() || '';
    if (toolName === 'skill' || toolName.endsWith('.skill') || toolName.includes('skill')) {
      const requestedNameCandidates = [
        event.part?.state?.input?.name,
        event.part?.input?.name,
        event.state?.input?.name,
        event.input?.name,
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
  if (/"name"\s*:\s*"remotion-best-practices"/.test(normalized) && diagnostics.toolUseNames.some((n) => /skill/i.test(n))) return true;
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

/**
 * Returns true once the accumulated event-stream output already contains a complete,
 * valid GeneratedClip TSX component. Used to resolve the opencodeRun promise early
 * (before the OpenCode process exits) so we don't hang waiting for cleanup/extra output
 * after the useful result has already arrived.
 */
function hasCompleteClipCodeInStream(output: string): boolean {
  if (!output || output.length < 200) return false;
  let textContent = '';
  for (const line of output.split('\n')) {
    try {
      const event = JSON.parse(line) as Record<string, unknown> & { type?: string; part?: { text?: string } };
      if (event.type === 'text' && typeof event.part?.text === 'string') {
        textContent += event.part.text;
      }
    } catch {
      // ignore non-JSON lines
    }
  }
  if (!textContent.trim()) return false;
  const parsed = parseJsonFromText<{ componentCode?: unknown; code?: unknown }>(textContent);
  if (!parsed || typeof parsed !== 'object') return false;
  const raw = parsed.componentCode ?? parsed.code;
  if (typeof raw !== 'string' || !raw.trim()) return false;
  const normalized = raw
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
  return (
    /\bexport\s+const\s+GeneratedClip\b/.test(normalized) &&
    /from\s+["']remotion["']/.test(normalized) &&
    (/\buseCurrentFrame\b/.test(normalized) || /\buseVideoConfig\b/.test(normalized))
  );
}

function extractSessionIdFromOutput(output: string): string | null {
  const lines = output.trim().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, any>;
      const sessionID = typeof event.sessionID === 'string' ? event.sessionID : null;
      if (sessionID) return sessionID;
      const nested = typeof event.part?.sessionID === 'string' ? event.part.sessionID : null;
      if (nested) return nested;
    } catch {
      // ignore non-JSON lines
    }
  }
  return null;
}

function extractModelFromSessionExport(raw: string): { providerID: string; modelID: string } | null {
  try {
    const parsed = JSON.parse(raw) as { messages?: Array<{ info?: any }> };
    const assistant = parsed.messages?.find((message) => message?.info?.role === 'assistant');
    const providerID = assistant?.info?.providerID;
    const modelID = assistant?.info?.modelID;
    if (typeof providerID === 'string' && typeof modelID === 'string') {
      return { providerID, modelID };
    }
  } catch {
    // ignore parse issues
  }
  return null;
}

async function runLocalCommandCapture(
  command: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const target = resolveOpenCodeSpawnTarget(command);
    const proc = spawn(target.command, [...target.prefixArgs, ...args], {
      cwd,
      env: target.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk) => (stdout += chunk.toString()));
    proc.stderr?.on('data', (chunk) => (stderr += chunk.toString()));
    proc.on('close', (code) => resolve({ stdout, stderr, code }));
    proc.on('error', (error) =>
      resolve({
        stdout,
        stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}`,
        code: -1,
      })
    );
  });
}

export async function inspectOpenCodeEnvironment(cwd: string): Promise<OpenCodeEnvironmentCheck> {
  const opencodeCommand = resolveOpenCodeCommand();
  const mcp = await runLocalCommandCapture(opencodeCommand, ['mcp', 'list'], cwd);
  const skills = await runLocalCommandCapture(opencodeCommand, ['debug', 'skill'], cwd);

  const mcpRaw = stripAnsi(`${mcp.stdout}\n${mcp.stderr}`.trim());
  const skillsRaw = stripAnsi(`${skills.stdout}\n${skills.stderr}`.trim());
  const combinedRaw = `${mcpRaw}\n${skillsRaw}`;
  const opencodeAvailable =
    (mcp.code === 0 || skills.code === 0) && !/\bENOENT\b/i.test(combinedRaw) && !/\buv_spawn\b/i.test(combinedRaw);

  // MCP list is global. Exa connected = any line has both "exa" and "connected", or both appear somewhere in the output.
  const exaConnected =
    mcpRaw.split(/\r?\n/).some((line) => /\bexa\b/i.test(line) && /\bconnected\b/i.test(line)) ||
    (/\bexa\b/i.test(mcpRaw) && /\bconnected\b/i.test(mcpRaw));

  let remotionSkillInstalled = false;
  try {
    const parsed = JSON.parse(skills.stdout) as Array<{ name?: string; location?: string }>;
    remotionSkillInstalled = parsed.some((skill) => {
      const name = (skill.name || '').toLowerCase();
      const location = (skill.location || '').toLowerCase();
      return name.includes('remotion') || location.includes('remotion-best-practices');
    });
  } catch {
    remotionSkillInstalled = /\bremotion-best-practices\b/i.test(skillsRaw);
  }

  return {
    opencodeCommand,
    opencodeAvailable,
    exaConnected,
    remotionSkillInstalled,
    mcpListRaw: summarizeForLog(mcpRaw, 1000),
    skillsRaw: summarizeForLog(skillsRaw, 1000),
  };
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

export async function opencodeRun(options: OpenCodeRunOptions): Promise<string> {
  const prompt = normalizePromptText(options.prompt || '');
  if (!prompt) {
    throw new Error('OpenCode prompt is empty.');
  }

  const modelKeyOrId = options.model ?? OPENCODE_DEFAULT_MODEL;
  const resolvedModel =
    modelKeyOrId && OPENCODE_MODELS[modelKeyOrId as keyof typeof OPENCODE_MODELS]
      ? OPENCODE_MODELS[modelKeyOrId as keyof typeof OPENCODE_MODELS]
      : modelKeyOrId;
  const opencodeCommand = resolveOpenCodeCommand();

  const cwd = options.cwd || process.cwd();
  opencodeInfo('Run starting', {
    model: resolvedModel || 'default',
    format: options.format || 'default',
    agent: options.agent || null,
    opencodeCommand,
    cwd,
    promptChars: prompt.length,
  });

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const target = resolveOpenCodeSpawnTarget(opencodeCommand);
    const command = target.command;
    const args: string[] = ['run'];
    const useStdinPrompt = true;
    if (options.format && options.format !== 'default') {
      args.push('--format', options.format);
    }
    if (resolvedModel) {
      args.push('--model', resolvedModel);
    }
    if (options.agent) {
      args.push('--agent', options.agent);
    }
    opencodeInfo('Using direct runner', {
      command: target.commandLabel,
      argsPreview: summarizeForLog(args.join(' '), 220),
      promptTransport: useStdinPrompt ? 'stdin' : 'argv',
    });

    const proc = spawn(command, [...target.prefixArgs, ...args], {
      cwd,
      env: target.env,
      windowsHide: true,
      stdio: [useStdinPrompt ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let closed = false;
    let timedOut = false;

    const heartbeatTimer = setInterval(() => {
      if (closed) return;
      opencodeInfo('Run heartbeat', {
        elapsedMs: Date.now() - startedAt,
        promptChars: prompt.length,
        stdoutChars: stdout.length,
        stderrChars: stderr.length,
      });
    }, Math.max(5000, OPENCODE_HEARTBEAT_INTERVAL_MS));

    const timeoutTimer = setTimeout(() => {
      if (closed) return;
      timedOut = true;
      opencodeError('Run timed out', {
        elapsedMs: Date.now() - startedAt,
        timeoutMs: OPENCODE_RUN_TIMEOUT_MS,
        promptChars: prompt.length,
        stdoutChars: stdout.length,
        stderrChars: stderr.length,
      });
      try {
        proc.kill();
      } catch {
        // ignore kill failures
      }
    }, Math.max(30000, OPENCODE_RUN_TIMEOUT_MS));

    proc.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (OPENCODE_LOG_EVERY_WORD) {
        // Verbose logging disabled.
      }
      // Early completion: once valid clip code JSON is in the stream we no longer need
      // to wait for the OpenCode process to exit — resolve now and kill to free resources.
      if (
        !closed &&
        options.earlyCompleteForClipCode &&
        options.format === 'json' &&
        hasCompleteClipCodeInStream(stdout)
      ) {
        closed = true;
        clearInterval(heartbeatTimer);
        clearTimeout(timeoutTimer);
        opencodeInfo('Early completion: valid clip code detected in stream', {
          stdoutChars: stdout.length,
          elapsedMs: Date.now() - startedAt,
        });
        try {
          proc.kill();
        } catch {
          // ignore kill failures
        }
        resolve(stdout);
      }
    });

    proc.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (OPENCODE_LOG_EVERY_WORD) {
        // Verbose logging disabled.
      }
      const isProgress =
        chunk.includes('> build') || chunk.includes('> run') || chunk.includes('Ã‚Â·') || chunk.trim() === '';

      if (isProgress) {
        opencodeInfo('Progress', { chunk: summarizeForLog(chunk, 180) });
      } else {
        opencodeWarn('Stderr chunk', { chunk: summarizeForLog(chunk, 320) });
      }
    });

    if (useStdinPrompt) {
      try {
        proc.stdin?.write(`${prompt}\n`);
        proc.stdin?.end();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        opencodeError('Failed writing prompt to stdin', { message });
      }
    }

    proc.on('close', (exitCode) => {
      closed = true;
      clearInterval(heartbeatTimer);
      clearTimeout(timeoutTimer);
      const diagnostics = summarizeOpenCodeOutput(stdout);
      opencodeInfo('Run finished', {
        exitCode,
        stdoutChars: stdout.length,
        stderrChars: stderr.length,
        diagnostics,
      });
      if (OPENCODE_LOG_EVERY_WORD && (stdout || stderr)) {
        // Verbose full output disabled.
      }

      if (exitCode !== 0) {
        if (timedOut) {
          reject(
            new Error(
              `opencode run timed out after ${OPENCODE_RUN_TIMEOUT_MS}ms. stdout=${stdout.length} chars stderr=${stderr.length} chars`
            )
          );
          return;
        }
        const errorMsg = stderr || stdout || 'Unknown error';
        opencodeError('Process failed', {
          exitCode,
          stderr: summarizeForLog(stderr, 700),
          stdoutTail: summarizeForLog(stdout.slice(-700), 700),
        });
        reject(new Error(`opencode run exited with ${exitCode}: ${errorMsg}`));
        return;
      }

      if (!stdout && stderr) {
        opencodeWarn('No stdout with non-empty stderr', {
          stderr: summarizeForLog(stderr, 320),
        });
      }

      resolve(stdout);
    });

    proc.on('error', (error) => {
      closed = true;
      clearInterval(heartbeatTimer);
      clearTimeout(timeoutTimer);
      const message = error instanceof Error ? error.message : String(error);
      const notFoundHint =
        /\bENOENT\b/i.test(message) || /\bnot found\b/i.test(message)
          ? ' OpenCode CLI was not found. Set OPENCODE_BIN to your absolute opencode path (for example C:\\Users\\<you>\\AppData\\Roaming\\npm\\opencode.cmd).'
          : '';
      opencodeError('Spawn error', {
        opencodeCommand,
        message: `${message}${notFoundHint}`,
      });
      reject(new Error(`${message}${notFoundHint}`));
    });
  });
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
      if (event.type === 'text' || event.type === 'step_start' || event.type === 'tool_use') {
        hasEventStreamHints = true;
      }
      if (event.type === 'text' && typeof event.part?.text === 'string') {
        textContent += event.part.text;
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

/** Upper bound on animation moments per video; keep in sync with Remotion MAX_COMPOSITIONS in animationPlanService. */
export const ANIMATION_GLOBAL_MOMENT_CEILING = 16;

function buildAnimationBudgetPlan(videoDurationSeconds: number, maxMoments: number): AnimationBudgetPlan {
  const durationSeconds = Math.max(1, toFiniteNumber(videoDurationSeconds, 60));
  const maxAllowedMoments = Math.max(
    1,
    Math.min(ANIMATION_GLOBAL_MOMENT_CEILING, Math.floor(toFiniteNumber(maxMoments, ANIMATION_GLOBAL_MOMENT_CEILING)))
  );

  if (durationSeconds <= 12) {
    const hardMomentCap = Math.min(4, maxAllowedMoments);
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
    const hardMomentCap = Math.min(6, maxAllowedMoments);
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
    const hardMomentCap = Math.min(10, maxAllowedMoments);
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

  const hardMomentCap = Math.min(ANIMATION_GLOBAL_MOMENT_CEILING, maxAllowedMoments);
  const targetMomentCount = Math.min(hardMomentCap, Math.max(4, Math.round(durationSeconds / 6)));
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
    lines.push(`- TARGET_ANIMATED_SECONDS_RANGE: ${budget.minAnimatedSeconds.toFixed(2)}s to ${budget.maxAnimatedSeconds.toFixed(2)}s`);
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
    moments: moments.length > 0
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
    const content = cleanOneLineText(moment.content, 180) || cleanOneLineText(moment.title, 180);
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
          moment.duration = Number((Math.max(1.8, moment.duration * scale)).toFixed(2));
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
      `Moment ${i + 1} [${formatSeconds(moment.start)}-${formatSeconds(moment.start + moment.duration)}], local window [${formatSeconds(windowStart)}-${formatSeconds(windowEnd)}]:\n${details}`
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
    const subtitle = cleanOneLineText(source.subtitle, NO_CHAR_CAP) || nearbyDialogue?.text || baseMoment.content;
    const content = cleanOneLineText(source.content, NO_CHAR_CAP) || baseMoment.content;
    const emphasis = cleanOneLineText(source.emphasis, NO_CHAR_CAP);
    const animationPrompt =
      cleanOneLineText(source.animationPrompt, NO_CHAR_CAP) ||
      `Scene focus: ${content}. Motion cadence: 1-2 active beats, then one hold beat for readability.`;

    return {
      ...source,
      start: Number(baseMoment.start.toFixed(2)),
      duration: Number(baseMoment.duration.toFixed(2)),
      type: cleanOneLineText(source.type, NO_CHAR_CAP) || baseMoment.type,
      subtitle,
      content,
      visualStyle: cleanOneLineText(source.visualStyle, NO_CHAR_CAP) || fallbackStyles[index % fallbackStyles.length],
      motion: cleanOneLineText(source.motion, NO_CHAR_CAP) || fallbackMotion[index % fallbackMotion.length],
      layout: cleanOneLineText(source.layout, NO_CHAR_CAP) || fallbackLayout[index % fallbackLayout.length],
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
  return buildAnimationClipCodePrompt(params, options);
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

/** Timeline + research + direction JSON for animation. Defaults to `animationGemini` (Gemini 3.1 Pro). */
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
  const model = options?.model || 'animationGemini';
  const cwd = options?.cwd || process.cwd();
  const debugOutputDir = options?.debugOutputDir;
  const videoDurationSeconds = options?.videoDurationSeconds ?? 60;
  const maxMoments = options?.maxMoments ?? ANIMATION_GLOBAL_MOMENT_CEILING;
  const animationBudget = buildAnimationBudgetPlan(videoDurationSeconds, maxMoments);
  const animationBudgetBlock = buildAnimationBudgetBlock(animationBudget);
  const requireExaForAnimation = process.env.OPENCODE_REQUIRE_EXA_FOR_ANIMATION !== '0';
  const requireRemotionSkillForAnimation = process.env.OPENCODE_REQUIRE_REMOTION_SKILL_FOR_ANIMATION !== '0';

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
    ['MANDATORY TOOLING:', 'TIMELINE_PLAN_JSON:', 'ANIMATION_BUDGET:', 'RESEARCH_CONTEXT:']
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
    timelinePrompt,
    directionPrompt: validatedDirectionPrompt,
    timelinePlanJson,
    dialogueWindowsByMoment,
    timelineOutput,
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

/** Per-moment Remotion `GeneratedClip` TSX via OpenCode. Defaults to `animationGemini` (same Gemini 3.1 Pro as planning). */
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
  const model = options?.model || 'animationGemini';
  const cwd = options?.cwd || process.cwd();
  const debugOutputDir = options?.debugOutputDir;
  // Clip-code receives research summary in the prompt; it does not need to call Exa again. Only Remotion skill is required.
  const requireExaForClipCode = false;
  // Clip-code always uses Remotion skill for consistent, high-quality animation code.
  const requireRemotionSkill = true;
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
          earlyCompleteForClipCode: true,
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
      earlyCompleteForClipCode: true,
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
