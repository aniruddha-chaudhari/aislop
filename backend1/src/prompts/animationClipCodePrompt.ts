export interface AnimationClipCodePromptParams {
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
}

export interface AnimationClipCodePromptOptions {
  requireExa: boolean;
  requireRemotionSkill: boolean;
  compact: boolean;
}

export function buildAnimationClipCodePrompt(
  params: AnimationClipCodePromptParams,
  options: AnimationClipCodePromptOptions
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

  const overlapBlock = options.compact
    ? `LAYOUT SAFETY:
- Respect 9:16 safe zone: x in [60, 1020], y in [120, 1800].
- Max 2 text blocks. Never overlap text-to-text or text-to-icon.
- Every text container must define width and lineHeight; set overflow: "visible".
- Keep all animated transforms bounded so final painted box stays in safe zone.
- If risk of collision, reduce text amount and stack vertically with clear spacing.`
    : `LAYOUT SAFETY (CRITICAL, NON-NEGOTIABLE):
- Canvas is 1080x1920. Safe zone must be enforced for every frame:
  left >= 60, right <= 1020, top >= 120, bottom <= 1800.
- Max 2 text blocks total on screen. Never create 3+ competing text elements.
- Use explicit layout constants:
  const SAFE = {left:60, right:1020, top:120, bottom:1800};
  const GUTTER = 24;
- Every text block must set:
  width (fixed or computed),
  lineHeight (>= 1.05),
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  whiteSpace: "normal".
- Avoid clipping:
  do NOT place text inside parent with overflow:"hidden" unless it is a deliberate reveal mask.
  Main readable text must remain overflow:"visible".
- Collision prevention:
  if using title + secondary text, maintain at least 20px vertical gap after transforms.
  if adding icon/shape near text, keep at least 28px clearance from text bounding region.
  never animate two large text blocks into the same x/y lane at the same time.
- Font sizing guardrails:
  primary headline: 66-120px,
  secondary label: 42-64px,
  never below 36px.
  Keep total headline lines <= 3. If longer, trim words.
- Motion guardrails:
  animation amplitude must keep content in bounds (translateY <= 80, translateX <= 70 unless you recompute bounds).
  no scaling that pushes text outside safe zone at peak.
- If MOMENT_JSON content is long, compress on-screen copy to 1-4 words and rely on visuals for meaning.`;

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
- Include: useCurrentFrame, useVideoConfig, interpolate, spring, Easing from remotion. Use Easing (capital E) for easing curves: Easing.bezier(), Easing.inOut(), Easing.out(), Easing.linear() â€” never "easing" (lowercase) which is not a function.
- Keep code deterministic and render-safe (no timers, no async effects, no DOM measurements, no external fetches).
- Motion cadence: 1-2 active beats + at least one calmer hold/readability window.
- Mobile-first composition, high contrast, avoid tiny text.
- Treat props.subtitle as context only. Do NOT render it. No JSX that displays subtitle or props.subtitle â€” no bottom caption strip, no full-sentence text. If you need on-screen text, use content/emphasis only (short 1â€“4 words).
- Avoid generic full-screen text card. Use layered motion and visual metaphor tied to MOMENT_JSON.

${overlapBlock}

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
- Remotion easing: import Easing (capital E) from "remotion" and use Easing.bezier(), Easing.inOut(), Easing.out(), etc. Do not use "easing" (lowercase) â€” it is not a function and will throw "easing is not a function".
- Ensure the component does NOT render subtitle or props.subtitle anywhere (no bottom bar, no caption). Remove any such JSX before returning.
- Ensure generated layout obeys safe-zone and non-overlap rules at entry, hold, and exit keyframes.
- Fix any such errors before returning the componentCode. The code must compile and run in a Remotion project with no node_module or runtime errors.

OUTPUT JSON ONLY:
{
  "componentCode": "full TSX code string with export const GeneratedClip"
}

The code must compile as-is in a Remotion project.`;
}

