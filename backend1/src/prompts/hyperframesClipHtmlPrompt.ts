import type { AnimationMoment } from '../service/hyperframesAnimationPlanService';

export interface HyperframesClipHtmlPromptParams {
  topic: string;
  dialogueContext: string;
  moment: AnimationMoment & {
    index: number;
    totalMoments?: number;
  };
  researchSummary?: string | null;
}

export function buildHyperframesClipHtmlPrompt(params: HyperframesClipHtmlPromptParams): string {
  const duration = Math.max(0.1, Number(params.moment.duration || 0));
  const palette = params.moment.colorPalette || {};
  const momentJson = JSON.stringify(params.moment, null, 2);

  return `You are a senior HyperFrames motion designer and HTML/GSAP author.

MANDATORY AGENT RULES:
- Use the "skill" tool and load "hyperframes" before authoring HTML.
- Use the "skill" tool and load "hyperframes-cli" for lint, validation, and render requirements.
- Use the "skill" tool and load "gsap" for animation choreography.
- Use GSAP for animation; do not use Remotion, React, TSX, frame hooks, or component code.

TASK:
Generate one complete, self-contained HyperFrames index.html for a single 9:16 animation moment.

INPUTS:
TOPIC: "${params.topic}"
DURATION_SECONDS: ${duration}
CANVAS: 1080x1920
COLOR_PALETTE:
${JSON.stringify(palette, null, 2)}
MOMENT_JSON:
${momentJson}
DIALOGUE_CONTEXT:
${params.dialogueContext || 'No dialogue context provided.'}
RESEARCH_CONTEXT:
${params.researchSummary || 'No research summary provided.'}

STRICT HYPERFRAMES CONTRACT:
- Return JSON only: {"html":"...full index.html..."}.
- The HTML must be a standalone HyperFrames composition, not a template.
- Root element must include data-composition-id="main", data-start="0", data-duration="${duration}", data-width="1080", data-height="1920".
- Use data-track-index on timed media/clip elements where relevant.
- Include GSAP from CDN: https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js
- Create a timeline synchronously: const tl = gsap.timeline({ paused: true });
- Register it synchronously: window.__timelines["main"] = tl;
- Use only deterministic logic. No Math.random(), Date.now(), timers, async, await, Promises, or external fetches.
- No repeat:-1. If ambient loops are needed, use a finite repeat count based on DURATION_SECONDS.
- Do not call play(), pause(), or seek() on media.
- Do not animate display or visibility. Animate opacity and transforms.
- Build the final layout in CSS first, then use gsap.from() entrance animations into those positions.
- Use the provided palette. Do not use generic default colors.
- Treat MOMENT_JSON.animationPrompt as the primary storyboard: preserve its timing intent and implement all specified beats.
- Keep implementation detail-rich in natural language terms from the plan (no simplification to generic effects).
- Background is mandatory and must be explicitly authored with layered behavior:
  1) Ambient background layer active from 0s.
  2) Context anchor layer that appears before hero text.
  3) Hero text/primary focal layer that locks on the punch timing.
- Text must be large, readable, and inside the safe box: left/right >= 120px, top/bottom >= 180px.
- Do not render full subtitles or narrator sentences. Use only short display text from MOMENT_JSON.

OUTPUT JSON ONLY:
{
  "html": "full standalone index.html string"
}`;
}
