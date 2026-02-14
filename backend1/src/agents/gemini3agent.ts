import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const OPENCODE_BIN_ENV = process.env.OPENCODE_BIN?.trim() || '';
const OPENCODE_DEFAULT_BIN = 'opencode';
const OPENCODE_DEBUG_ENABLED = process.env.OPENCODE_DEBUG !== '0';
const OPENCODE_LOG_EVERY_WORD = process.env.OPENCODE_LOG_EVERY_WORD !== '0';
let CACHED_OPENCODE_COMMAND: string | null = null;

export const OPENCODE_MODELS = {
  flash: 'google/antigravity-gemini-3-flash',
  pro: 'google/antigravity-gemini-3-pro',
} as const;

export interface OpenCodeRunOptions {
  prompt: string;
  model?: keyof typeof OPENCODE_MODELS | string;
  format?: 'default' | 'json';
  quiet?: boolean;
  agent?: string;
  cwd?: string;
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
  usedRemotionSkill: boolean;
  researchSummary: string | null;
  researchDiagnostics: OpenCodeOutputDiagnostics | null;
}

type OpenCodeEnvironmentCheck = {
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

function opencodeInfo(message: string, data?: Record<string, unknown>): void {
  if (!OPENCODE_DEBUG_ENABLED) return;
  if (data && Object.keys(data).length > 0) {
    console.info(`[OpenCode] ${message}`, data);
    return;
  }
  console.info(`[OpenCode] ${message}`);
}

function opencodeWarn(message: string, data?: Record<string, unknown>): void {
  if (data && Object.keys(data).length > 0) {
    console.warn(`[OpenCode] ${message}`, data);
    return;
  }
  console.warn(`[OpenCode] ${message}`);
}

function opencodeError(message: string, data?: Record<string, unknown>): void {
  if (data && Object.keys(data).length > 0) {
    console.error(`[OpenCode] ${message}`, data);
    return;
  }
  console.error(`[OpenCode] ${message}`);
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

function isPathLikeCommand(command: string): boolean {
  return /[\\/]/.test(command) || /^[a-zA-Z]:/.test(command) || command.endsWith('.cmd') || command.endsWith('.exe');
}

function resolveOpenCodeCommand(): string {
  if (CACHED_OPENCODE_COMMAND) return CACHED_OPENCODE_COMMAND;

  const candidates: string[] = [];
  if (OPENCODE_BIN_ENV) candidates.push(OPENCODE_BIN_ENV);

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    const userProfile = process.env.USERPROFILE;
    if (appData) candidates.push(path.join(appData, 'npm', 'opencode.cmd'));
    if (userProfile) candidates.push(path.join(userProfile, 'AppData', 'Roaming', 'npm', 'opencode.cmd'));
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

function detectExaUsage(diagnostics: OpenCodeOutputDiagnostics, output: string): boolean {
  const toolUsedExa = diagnostics.toolUseNames.some((name) => {
    const normalized = name.toLowerCase();
    return (
      normalized === 'exa' ||
      normalized.startsWith('exa_') ||
      normalized.startsWith('exa-') ||
      normalized.includes('.exa')
    );
  });
  if (toolUsedExa) return true;

  if (diagnostics.eventTypeCounts.tool_use && diagnostics.eventTypeCounts.tool_use > 0) {
    const normalizedOutput = output.toLowerCase();
    if (
      normalizedOutput.includes('"tool":"exa') ||
      normalizedOutput.includes("'tool':'exa") ||
      /\bexa\b/i.test(normalizedOutput)
    ) {
      return true;
    }
  }

  if (output.toLowerCase().includes('exa_web_search_exa')) {
    return true;
  }

  if (diagnostics.toolUseNames.length > 0 && diagnostics.toolUseNames.some((name) => name.toLowerCase().includes('exa'))) {
    return true;
  }

  return false;
}

function detectRemotionSkillUsage(diagnostics: OpenCodeOutputDiagnostics, output: string): boolean {
  if (diagnostics.toolUseNames.some((name) => /\bskill\b/i.test(name))) {
    return true;
  }

  const normalized = output.toLowerCase();
  if (/\bremotion-best-practices\b/.test(normalized)) return true;
  if (diagnostics.mentionsSkill && diagnostics.mentionsRemotion) return true;
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

async function inspectOpenCodeEnvironment(cwd: string): Promise<OpenCodeEnvironmentCheck> {
  const opencodeCommand = resolveOpenCodeCommand();
  const mcp = await runLocalCommandCapture(opencodeCommand, ['mcp', 'list'], cwd);
  const skills = await runLocalCommandCapture(opencodeCommand, ['debug', 'skill'], cwd);

  const mcpRaw = stripAnsi(`${mcp.stdout}\n${mcp.stderr}`.trim());
  const skillsRaw = stripAnsi(`${skills.stdout}\n${skills.stderr}`.trim());
  const combinedRaw = `${mcpRaw}\n${skillsRaw}`;
  const opencodeAvailable =
    (mcp.code === 0 || skills.code === 0) && !/\bENOENT\b/i.test(combinedRaw) && !/\buv_spawn\b/i.test(combinedRaw);

  const exaConnected = /\bexa\b[\s\S]*\bconnected\b/i.test(mcpRaw);

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
  const resolvedModel =
    options.model && OPENCODE_MODELS[options.model as keyof typeof OPENCODE_MODELS]
      ? OPENCODE_MODELS[options.model as keyof typeof OPENCODE_MODELS]
      : options.model;
  const opencodeCommand = resolveOpenCodeCommand();

  const cwd = options.cwd || process.cwd();
  opencodeInfo('Run starting', {
    model: resolvedModel || 'default',
    format: options.format || 'default',
    agent: options.agent || null,
    opencodeCommand,
    cwd,
    promptChars: options.prompt.length,
  });

  return new Promise((resolve, reject) => {
    const target = resolveOpenCodeSpawnTarget(opencodeCommand);
    const command = target.command;
    const args: string[] = ['run'];
    if (options.prompt) {
      args.push(options.prompt);
    }
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
    });

    const proc = spawn(command, [...target.prefixArgs, ...args], {
      cwd,
      env: target.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (OPENCODE_LOG_EVERY_WORD) {
        console.info(`[OpenCode][stdout] ${chunk}`);
      }
    });

    proc.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (OPENCODE_LOG_EVERY_WORD) {
        console.info(`[OpenCode][stderr] ${chunk}`);
      }
      const isProgress =
        chunk.includes('> build') || chunk.includes('> run') || chunk.includes('·') || chunk.trim() === '';

      if (isProgress) {
        opencodeInfo('Progress', { chunk: summarizeForLog(chunk, 180) });
      } else {
        opencodeWarn('Stderr chunk', { chunk: summarizeForLog(chunk, 320) });
      }
    });

    proc.on('close', (exitCode) => {
      const diagnostics = summarizeOpenCodeOutput(stdout);
      opencodeInfo('Run finished', {
        exitCode,
        stdoutChars: stdout.length,
        stderrChars: stderr.length,
        diagnostics,
      });
      if (OPENCODE_LOG_EVERY_WORD && stdout) {
        console.info('[OpenCode][stdout-full-start]');
        console.info(stdout);
        console.info('[OpenCode][stdout-full-end]');
      }
      if (OPENCODE_LOG_EVERY_WORD && stderr) {
        console.info('[OpenCode][stderr-full-start]');
        console.info(stderr);
        console.info('[OpenCode][stderr-full-end]');
      }

      if (exitCode !== 0) {
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
  const requireExaForAnimation = process.env.OPENCODE_REQUIRE_EXA_FOR_ANIMATION !== '0';
  const requireRemotionSkillForAnimation = process.env.OPENCODE_REQUIRE_REMOTION_SKILL_FOR_ANIMATION !== '0';

  const fallbackPrompt = `You are a senior short-form motion designer planning Remotion moments for a VERTICAL 9:16 educational video.
Design visually distinct scenes, not repetitive text cards.

TOPIC: "${topic}"
VIDEO_DURATION_SECONDS: ${videoDurationSeconds}
MAX_MOMENTS: ${maxMoments}

DIALOGUE CONTEXT:
${dialogueContext || 'No subtitle context provided'}

TASK:
Create varied, high-clarity moments (not repeated title cards) that improve understanding and retention.

Rules:
- Output JSON only.
- Use at most MAX_MOMENTS moments.
- Keep each moment inside the total video duration.
- Duration per moment: 1.0 to 6.0 seconds.
- Prefer non-overlapping moments with natural spacing.
- One key idea per moment, concise and mobile-friendly.
- Prefer varied moment types plus varied visual styles, motion styles, and layouts.
- Avoid dense jargon, long sentences, tiny text, and generic repeated phrases.

Return exactly this JSON shape:
{
  "videoDurationSeconds": ${videoDurationSeconds},
  "moments": [
    {
      "start": 0.0,
      "duration": 2.5,
      "type": "definition",
      "content": "Pod: Smallest deployable unit",
      "visualStyle": "spotlight",
      "motion": "snap",
      "layout": "center",
      "emphasis": "Pod"
    }
  ]
}`;

  const basePrompt = options?.promptTemplate || fallbackPrompt;
  const preferredAgent = process.env.OPENCODE_ANIMATION_AGENT?.trim() || 'remotion';
  let promptMentionsSkill = /\bskills?\b/i.test(basePrompt);

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

  opencodeInfo('Animation plan request', {
    topic: summarizeForLog(topic, 100),
    model,
    preferredAgent,
    promptChars: basePrompt.length,
    dialogueChars: dialogueContext.length,
    videoDurationSeconds,
    maxMoments,
    promptMentionsSkill,
    requireExaForAnimation,
    requireRemotionSkillForAnimation,
  });

  const researchPromptBase = `You are preparing research notes for a Remotion animation planner.
TOPIC: "${topic}"
VIDEO_DURATION_SECONDS: ${videoDurationSeconds}
DIALOGUE_CONTEXT:
${dialogueContext || 'No subtitle context provided'}

MANDATORY:
- Use Exa MCP tools to gather up-to-date factual references for this topic.
- Collect at least 3 concise facts and 2 distinct visual angles.
- Keep output concise and practical for scene planning.

Return plain text with sections:
Facts:
- ...
Visual angles:
- ...
Source hints:
- ...`;
  if (debugOutputDir) {
    try {
      fs.writeFileSync(path.join(debugOutputDir, 'animation-research-prompt.sent.txt'), researchPromptBase, 'utf8');
    } catch (error) {
      opencodeWarn('Failed to write research prompt snapshot', {
        debugOutputDir,
        error: summarizeForLog(error instanceof Error ? error.message : String(error), 180),
      });
    }
  }

  let researchOutput = '';
  let researchDiagnostics: OpenCodeOutputDiagnostics | null = null;
  let researchSummary: string | null = null;
  let usedExaResearch = false;
  let researchRun = await runWithPreferredAgent(researchPromptBase, 'Animation research');
  researchOutput = researchRun.output;
  researchDiagnostics = summarizeOpenCodeOutput(researchOutput);
  usedExaResearch = detectExaUsage(researchDiagnostics, researchOutput);
  researchSummary = summarizeForLog(extractEventStreamText(researchOutput), 4000);

  if (requireExaForAnimation && !usedExaResearch) {
    const forcedResearchPrompt = `${researchPromptBase}

HARD REQUIREMENT:
You must call Exa MCP tools before answering. If you did not call Exa MCP tools yet, call them now and then answer.`;
    if (debugOutputDir) {
      try {
        fs.writeFileSync(
          path.join(debugOutputDir, 'animation-research-prompt.retry.sent.txt'),
          forcedResearchPrompt,
          'utf8'
        );
      } catch (error) {
        opencodeWarn('Failed to write retry research prompt snapshot', {
          debugOutputDir,
          error: summarizeForLog(error instanceof Error ? error.message : String(error), 180),
        });
      }
    }
    const retriedResearchRun = await runWithPreferredAgent(
      forcedResearchPrompt,
      'Animation research retry with forced Exa'
    );
    researchRun = retriedResearchRun;
    researchOutput = researchRun.output;
    researchDiagnostics = summarizeOpenCodeOutput(researchOutput);
    usedExaResearch = detectExaUsage(researchDiagnostics, researchOutput);
    researchSummary = summarizeForLog(extractEventStreamText(researchOutput), 4000);
  }

  opencodeInfo('Animation research diagnostics', {
    usedExaResearch,
    diagnostics: researchDiagnostics,
    summaryPreview: summarizeForLog(researchSummary || '', 360),
  });

  if (requireExaForAnimation && !usedExaResearch) {
    throw new Error('OpenCode did not use Exa MCP during animation research after retry.');
  }

  const planningPrompt = `${basePrompt}

MANDATORY TOOLING REQUIREMENTS:
- Use the "skill" tool to load and follow "remotion-best-practices".
- Use the Exa-backed research context below; avoid generic wobble-card patterns.
- Produce varied scenes with distinct visualStyle and layout values.

RESEARCH_CONTEXT:
${researchSummary || 'No research summary available.'}
`;
  if (debugOutputDir) {
    try {
      fs.writeFileSync(path.join(debugOutputDir, 'animation-planning-prompt.sent.txt'), planningPrompt, 'utf8');
    } catch (error) {
      opencodeWarn('Failed to write planning prompt snapshot', {
        debugOutputDir,
        error: summarizeForLog(error instanceof Error ? error.message : String(error), 180),
      });
    }
  }
  promptMentionsSkill = /\bskills?\b|\bremotion-best-practices\b/i.test(planningPrompt);

  let run = await runWithPreferredAgent(planningPrompt, 'Animation plan');
  let output = run.output;
  let usedAgent: string | null = run.usedAgent;
  let fallbackWithoutAgent = run.fallbackWithoutAgent;
  let diagnostics = summarizeOpenCodeOutput(output);
  let usedRemotionSkill = detectRemotionSkillUsage(diagnostics, output);

  if (requireRemotionSkillForAnimation && !usedRemotionSkill) {
    const forcedSkillPrompt = `${planningPrompt}

HARD REQUIREMENT:
You must call the "skill" tool and load "remotion-best-practices" before finalizing the JSON output.`;
    if (debugOutputDir) {
      try {
        fs.writeFileSync(path.join(debugOutputDir, 'animation-planning-prompt.retry.sent.txt'), forcedSkillPrompt, 'utf8');
      } catch (error) {
        opencodeWarn('Failed to write retry planning prompt snapshot', {
          debugOutputDir,
          error: summarizeForLog(error instanceof Error ? error.message : String(error), 180),
        });
      }
    }
    run = await runWithPreferredAgent(forcedSkillPrompt, 'Animation plan retry with forced skill');
    output = run.output;
    usedAgent = run.usedAgent;
    fallbackWithoutAgent = run.fallbackWithoutAgent;
    diagnostics = summarizeOpenCodeOutput(output);
    usedRemotionSkill = detectRemotionSkillUsage(diagnostics, output);
  }

  if (requireRemotionSkillForAnimation && !usedRemotionSkill) {
    throw new Error('OpenCode did not use the remotion-best-practices skill after retry.');
  }

  opencodeInfo('Animation plan response diagnostics', {
    usedAgent,
    fallbackWithoutAgent,
    usedExaResearch,
    usedRemotionSkill,
    researchDiagnostics,
    diagnostics,
  });

  return {
    output,
    diagnostics,
    usedAgent,
    fallbackWithoutAgent,
    promptMentionsSkill,
    usedExaResearch,
    usedRemotionSkill,
    researchSummary,
    researchDiagnostics,
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
