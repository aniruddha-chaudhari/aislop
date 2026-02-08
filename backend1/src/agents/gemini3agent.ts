/**
 * Gemini 3 Agent - OpenCode Runner Mode
 * 
 * Currently using OpenCode for agentic tasks with:
 * - Internet access via Exa MCP
 * - Access to smarter models (Gemini 3 Pro)
 * - Image/SFX plan generation with web research
 * 
 * AI SDK approach is commented out for now - can be re-enabled later.
 */

// ═══════════════════════════════════════════════════════════════════════════
// AI SDK IMPORTS (DISABLED - uncomment to re-enable)
// ═══════════════════════════════════════════════════════════════════════════
// import { generateObject, generateText } from "ai";
// import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
// import { z, type ZodSchema } from "zod";

import { spawn } from "child_process";
import path from "path";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const OPENCODE_BIN = "opencode";

// Default models for OpenCode
export const OPENCODE_MODELS = {
    flash: "google/antigravity-gemini-3-flash",
    pro: "google/antigravity-gemini-3-pro",
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// AI SDK CONFIG (DISABLED - uncomment to re-enable)
// ═══════════════════════════════════════════════════════════════════════════
// const PRIMARY_GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
// const SECONDARY_GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY_SECONDARY;
// 
// const googlePrimary = createGoogleGenerativeAI({
//     apiKey: PRIMARY_GEMINI_KEY,
// });
// 
// const googleSecondary = SECONDARY_GEMINI_KEY
//     ? createGoogleGenerativeAI({ apiKey: SECONDARY_GEMINI_KEY })
//     : null;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface OpenCodeRunOptions {
    prompt: string;
    model?: keyof typeof OPENCODE_MODELS | string;
    format?: "default" | "json";
    quiet?: boolean;
    agent?: string;
    cwd?: string;
}

export interface OpenCodeResult {
    output: string;
    elapsedMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// AI SDK UTILITY FUNCTIONS (DISABLED - uncomment to re-enable)
// ═══════════════════════════════════════════════════════════════════════════

// export interface DirectSDKOptions<T extends ZodSchema> {
//     prompt: string;
//     schema?: T;
//     model?: string;
//     systemPrompt?: string;
// }

// function isGeminiQuotaError(error: unknown): boolean {
//     const err = error as any;
//     const msg: string | undefined = err?.message;
//     const statusCode: number | undefined = err?.statusCode ?? err?.status;
//     const body: string | undefined = err?.responseBody ?? err?.body;
//     const quotaRegex = /quota|RESOURCE_EXHAUSTED/i;
//     return (
//         statusCode === 429 ||
//         (typeof msg === "string" && quotaRegex.test(msg)) ||
//         (typeof body === "string" && quotaRegex.test(body))
//     );
// }

// export async function withGeminiFallback<T>(
//     modelName: string,
//     runWithModel: (model: any) => Promise<T>
// ): Promise<T> {
//     const primaryModel = googlePrimary(modelName);
//     try {
//         return await runWithModel(primaryModel);
//     } catch (error) {
//         if (!googleSecondary || !isGeminiQuotaError(error)) {
//             throw error;
//         }
//         console.log("🔄 Primary Gemini API quota exceeded, falling back to secondary key...");
//         const secondaryModel = googleSecondary(modelName);
//         return await runWithModel(secondaryModel);
//     }
// }

// ═══════════════════════════════════════════════════════════════════════════
// AI SDK DIRECT FUNCTIONS (DISABLED - uncomment to re-enable)
// ═══════════════════════════════════════════════════════════════════════════

// export async function directGenerateObject<T extends ZodSchema>(
//     options: DirectSDKOptions<T>
// ): Promise<z.infer<T>> {
//     const { prompt, schema, model = "gemini-3-flash-preview", systemPrompt } = options;
//     if (!schema) {
//         throw new Error("Schema is required for directGenerateObject");
//     }
//     const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
//     const result = await withGeminiFallback(model, (geminiModel) =>
//         generateObject({
//             model: geminiModel,
//             schema: schema as any,
//             prompt: fullPrompt,
//         })
//     );
//     return result.object;
// }

// export async function directGenerateText(
//     options: Omit<DirectSDKOptions<any>, "schema">
// ): Promise<string> {
//     const { prompt, model = "gemini-3-flash-preview", systemPrompt } = options;
//     const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
//     const result = await withGeminiFallback(model, (geminiModel) =>
//         generateText({
//             model: geminiModel,
//             prompt: fullPrompt,
//         })
//     );
//     return result.text;
// }


// ═══════════════════════════════════════════════════════════════════════════
// APPROACH 2: OPENCODE RUNNER (Agentic, Web Access)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run OpenCode CLI and return stdout as string.
 * In non-interactive mode OpenCode auto-approves permissions so it won't hang.
 * 
 * Best for:
 * - Research tasks requiring web access (Exa MCP)
 * - Complex agentic workflows
 * - Tasks benefiting from smarter models
 * 
 * @example
 * ```ts
 * const result = await opencodeRun({
 *   prompt: "Research the latest trends in TypeScript and suggest visual diagrams",
 *   model: "pro", // Uses Gemini 3 Pro
 *   format: "json"
 * });
 * ```
 */
export async function opencodeRun(options: OpenCodeRunOptions): Promise<string> {
    const fs = await import('fs');
    const os = await import('os');
    const pathModule = await import('path');

    // Resolve model shorthand to full model ID
    const resolvedModel =
        options.model && OPENCODE_MODELS[options.model as keyof typeof OPENCODE_MODELS]
            ? OPENCODE_MODELS[options.model as keyof typeof OPENCODE_MODELS]
            : options.model;

    // Write prompt to a temp file to handle long prompts
    let promptFile: string | null = null;
    if (options.prompt) {
        const tempDir = os.tmpdir();
        promptFile = pathModule.join(tempDir, `opencode_prompt_${Date.now()}.txt`);
        fs.writeFileSync(promptFile, options.prompt, 'utf8');
        console.log(`📄 [OpenCode] Wrote prompt to temp file: ${promptFile}`);
        console.log(`📄 [OpenCode] Prompt length: ${options.prompt.length} chars`);
    }

    const cwd = options.cwd || process.cwd();

    // Build a PowerShell command that reads the file and passes it to opencode
    // According to docs: opencode run [message..] - message is POSITIONAL, not a flag
    // For 'opencode run': --format json gives streaming JSON events (we parse these)
    // For 'opencode -p': --output-format json gives single response (different command)
    // --model: Model to use
    const formatArg = options.format && options.format !== "default" ? `--format ${options.format}` : "";
    const modelArg = resolvedModel ? `--model ${resolvedModel}` : "";
    const agentArg = options.agent ? `--agent ${options.agent}` : "";

    // Use PowerShell to read file, escape quotes, and pass as single positional argument
    // The message must be quoted as a single string
    const psCommand = promptFile
        ? `$p = Get-Content -Raw '${promptFile}'; $p = $p -replace '"', '\\"'; opencode run "$p" ${formatArg} ${modelArg} ${agentArg}`.trim()
        : `opencode run ${formatArg} ${modelArg} ${agentArg}`.trim();

    console.log(`🚀 [OpenCode] Running with model: ${resolvedModel || "default"}`);
    console.log(`📂 [OpenCode] CWD: ${cwd}`);
    console.log(`📝 [OpenCode] PowerShell command length: ${psCommand.length} chars`);

    // Cleanup function for temp file
    const cleanup = () => {
        if (promptFile) {
            try {
                fs.unlinkSync(promptFile);
                console.log(`🧹 [OpenCode] Cleaned up temp file: ${promptFile}`);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    };

    return new Promise((resolve, reject) => {
        // Use PowerShell on Windows to handle long prompts via file reading
        const isWindows = process.platform === 'win32';

        let command: string;
        let args: string[];

        if (isWindows) {
            // Use PowerShell to read prompt from file and pass to opencode
            command = 'powershell.exe';
            args = ['-NoProfile', '-Command', psCommand];
            console.log(`📝 [OpenCode] Using PowerShell with command: ${psCommand.substring(0, 100)}...`);
        } else {
            // On Unix, we can use bash with cat - opencode run expects message as positional arg
            command = 'bash';
            const bashCommand = promptFile
                ? `opencode run "$(cat '${promptFile}')" ${formatArg} ${modelArg} ${agentArg}`
                : `opencode run ${formatArg} ${modelArg} ${agentArg}`;
            args = ['-c', bashCommand];
            console.log(`📝 [OpenCode] Using bash with command: ${bashCommand.substring(0, 100)}...`);
        }

        const proc = spawn(command, args, {
            cwd,
            stdio: ['inherit', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
            const chunk = data.toString();
            stdout += chunk;
            // Log output as it comes in for debugging
            console.log(`[OpenCode stdout]: ${chunk.substring(0, 200)}${chunk.length > 200 ? '...' : ''}`);
        });

        proc.stderr?.on('data', (data) => {
            const chunk = data.toString();
            stderr += chunk;

            // Filter out progress indicators (not real errors)
            const isProgress = chunk.includes('> build') ||
                chunk.includes('> run') ||
                chunk.includes('·') ||
                chunk.trim() === '';

            if (!isProgress) {
                console.error(`[OpenCode stderr]: ${chunk}`);
            } else {
                console.log(`[OpenCode progress]: ${chunk.trim()}`);
            }
        });

        proc.on('close', (exitCode) => {
            console.log(`🏁 [OpenCode] Exited with code: ${exitCode}`);
            console.log(`📊 [OpenCode] Stdout length: ${stdout.length} chars`);
            console.log(`📊 [OpenCode] Stderr length: ${stderr.length} chars`);

            cleanup();  // Clean up temp file

            if (exitCode !== 0) {
                const errorMsg = stderr || stdout || "Unknown error";
                console.error("❌ [OpenCode] Process Failed!");
                console.error("❌ [OpenCode] Stderr:", stderr);
                console.error("❌ [OpenCode] Stdout (last 500 chars):", stdout.slice(-500));

                reject(new Error(`opencode run exited with ${exitCode}: ${errorMsg}`));
                return;
            }

            if (!stdout && stderr) {
                console.warn("⚠️ [OpenCode] Warning: No stdout but stderr exists:", stderr);
            }

            if (stdout) {
                console.log(`✅ [OpenCode] Got response, first 300 chars: ${stdout.substring(0, 300)}...`);
            }

            resolve(stdout);
        });

        proc.on('error', (err) => {
            console.error("❌ [OpenCode] Spawn error:", err);
            cleanup();  // Clean up temp file
            reject(err);
        });
    });
}

/**
 * Run OpenCode and return output with elapsed time in milliseconds
 */
export async function opencodeRunWithTiming(
    options: OpenCodeRunOptions
): Promise<OpenCodeResult> {
    const start = performance.now();
    const output = await opencodeRun(options);
    const elapsedMs = Math.round(performance.now() - start);
    return { output, elapsedMs };
}

/**
 * Run OpenCode with multiple models and return results for each.
 * Useful for comparing outputs from different models.
 */
export async function opencodeRunMultiModel(
    options: Omit<OpenCodeRunOptions, "model"> & { models: string[] }
): Promise<Record<string, string>> {
    const results: Record<string, string> = {};

    for (const model of options.models) {
        console.log(`🔄 [OpenCode] Running with model: ${model}`);
        const output = await opencodeRun({ ...options, model });
        results[model] = output;
    }

    return results;
}

/**
 * Parse JSON from OpenCode output
 * Handles both direct JSON and event stream format from 'opencode run --format json'
 * The event stream contains multiple JSON objects, one per line, with types like:
 * - step_start, step_finish
 * - tool_use
 * - text (contains the actual AI response)
 */
export function parseOpenCodeJSON<T = any>(output: string): T | null {
    try {
        // First, check if this is an event stream (multiple JSON lines)
        const lines = output.trim().split('\n');
        const isEventStream = lines.length > 1 &&
            lines.some(line => {
                try {
                    const obj = JSON.parse(line);
                    return obj.type === 'text' || obj.type === 'step_start';
                } catch {
                    return false;
                }
            });

        if (isEventStream) {
            console.log(`📊 [OpenCode] Detected event stream format with ${lines.length} events`);

            // Extract text content from "type":"text" events
            let textContent = '';
            for (const line of lines) {
                try {
                    const event = JSON.parse(line);
                    if (event.type === 'text' && event.part?.text) {
                        textContent += event.part.text;
                    }
                } catch {
                    // Skip non-JSON lines
                }
            }

            if (textContent) {
                console.log(`📝 [OpenCode] Extracted ${textContent.length} chars of text content`);
                console.log(`📝 [OpenCode] Text preview: ${textContent.substring(0, 300)}...`);

                // Now try to parse the text content as JSON
                try {
                    return JSON.parse(textContent.trim());
                } catch {
                    // Try to find JSON in markdown code blocks
                    const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                    if (jsonMatch?.[1]) {
                        try {
                            return JSON.parse(jsonMatch[1].trim());
                        } catch {
                            // Continue
                        }
                    }

                    // Try to find raw JSON object or array
                    const objectMatch = textContent.match(/\{[\s\S]*\}/);
                    const arrayMatch = textContent.match(/\[[\s\S]*\]/);
                    const match = objectMatch || arrayMatch;

                    if (match) {
                        try {
                            return JSON.parse(match[0]);
                        } catch {
                            // Continue
                        }
                    }
                }
            }

            console.warn("⚠️ [OpenCode] Event stream contained no parseable text content");
            return null;
        }

        // Not an event stream, try direct parse
        return JSON.parse(output.trim());
    } catch {
        // Try to find JSON in the output (might be wrapped in markdown or text)
        const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch?.[1]) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            } catch {
                // Continue to next attempt
            }
        }

        // Try to find raw JSON object or array
        const objectMatch = output.match(/\{[\s\S]*\}/);
        const arrayMatch = output.match(/\[[\s\S]*\]/);
        const match = objectMatch || arrayMatch;

        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch {
                // Continue
            }
        }

        console.warn("⚠️ [OpenCode] Could not parse JSON from output");
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIALIZED AGENTIC FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Research a topic using OpenCode with Exa MCP for web access
 * Returns research findings as structured text
 */
export async function researchWithOpenCode(
    topic: string,
    options?: { model?: string; detailed?: boolean }
): Promise<string> {
    const model = options?.model || "pro";
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

    const result = await opencodeRun({
        prompt,
        model,
        quiet: true,
    });

    return result;
}

/**
 * Generate image plan suggestions using OpenCode with web research
 * Uses Exa MCP for real-time research on the topic
 */
export async function generateImagePlanWithResearch(
    topic: string,
    dialogueContext: string,
    options?: { model?: string }
): Promise<string> {
    const model = options?.model || "pro";

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

    const result = await opencodeRun({
        prompt,
        model,
        quiet: true,
    });

    return result;
}

/**
 * Generate animation overlay moments using OpenCode.
 * Returns JSON describing time ranges and content for animation clips.
 */
export async function generateAnimationPlanWithResearch(
    topic: string,
    dialogueContext: string,
    options?: {
        model?: string;
        videoDurationSeconds?: number;
        maxMoments?: number;
        promptTemplate?: string;
    }
): Promise<string> {
    const model = options?.model || "pro";
    const videoDurationSeconds = options?.videoDurationSeconds ?? 60;
    const maxMoments = options?.maxMoments ?? 8;

    const fallbackPrompt = `You are an expert short-form video animation planner.
Use the Remotion skill/tools while planning so the output is practical for Remotion rendering.

TOPIC: "${topic}"
VIDEO_DURATION_SECONDS: ${videoDurationSeconds}
MAX_MOMENTS: ${maxMoments}

DIALOGUE CONTEXT:
${dialogueContext || "No subtitle context provided"}

TASK:
Plan animation overlay moments that make the video more engaging.

Rules:
- Output only JSON.
- Keep moments within the video duration.
- Moment duration should be 1 to 6 seconds.
- Use at most MAX_MOMENTS moments.
- Content should be concise and readable in an overlay.

Return exactly this JSON shape:
{
  "videoDurationSeconds": ${videoDurationSeconds},
  "moments": [
    {
      "start": 0.0,
      "duration": 2.5,
      "type": "callout",
      "content": "Short overlay text"
    }
  ]
}
`;

    const prompt = options?.promptTemplate || fallbackPrompt;

    const result = await opencodeRun({
        prompt,
        model,
        format: 'json',
        quiet: true,
    });

    return result;
}

/**
 * Generate SFX suggestions using OpenCode with web research
 * Can research trending sounds and best practices
 */
export async function generateSFXPlanWithResearch(
    topic: string,
    overlayTimings: Array<{ start: number; description: string }>,
    options?: { model?: string; videoDuration?: number }
): Promise<string> {
    const model = options?.model || "pro";

    // Calculate video duration from overlay timings
    const maxTimestamp = overlayTimings.length > 0
        ? Math.max(...overlayTimings.map(t => t.start))
        : 15;
    const videoDuration = options?.videoDuration || maxTimestamp + 5;

    const timingsStr = overlayTimings
        .map((t) => `[${t.start.toFixed(1)}s] ${t.description}`)
        .join("\n");

    console.log(`🔊 [SFX] Generating for ${overlayTimings.length} overlay events, ~${videoDuration.toFixed(0)}s video`);

    const prompt = `Audio designer for short-form educational video.

TOPIC: "${topic}"
DURATION: ${videoDuration.toFixed(0)}s

VISUAL EVENTS (overlay transitions):
${timingsStr || "No overlays provided"}

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

    console.log('🔊 [SFX] Using OpenCode for SFX plan...');

    const result = await opencodeRun({
        prompt,
        model,
        format: 'json',
        quiet: true,
    });

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// HYBRID APPROACH (DISABLED - requires AI SDK)
// ═══════════════════════════════════════════════════════════════════════════

// /**
//  * Research with OpenCode, then structure with Direct SDK
//  * Combines web research capabilities with type-safe output
//  */
// export async function researchAndStructure<T extends ZodSchema>(
//     topic: string,
//     schema: T,
//     structurePrompt: string,
//     options?: { researchModel?: string; structureModel?: string }
// ): Promise<z.infer<T>> {
//     // Step 1: Research with OpenCode (has web access)
//     console.log("🔍 [Hybrid] Step 1: Researching with OpenCode...");
//     const research = await researchWithOpenCode(topic, {
//         model: options?.researchModel || "pro",
//         detailed: true,
//     });
//
//     // Step 2: Structure with Direct SDK (type-safe output)
//     console.log("📊 [Hybrid] Step 2: Structuring with Direct SDK...");
//     const structuredResult = await directGenerateObject({
//         prompt: `${structurePrompt}
//
// RESEARCH DATA:
// ${research}
//
// Now structure this information according to the required format.`,
//         schema,
//         model: options?.structureModel || "gemini-3-flash-preview",
//     });
//
//     return structuredResult;
// }
