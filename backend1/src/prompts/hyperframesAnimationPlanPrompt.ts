// =============================================================================
// HyperFrames Animation Plan Prompt
// Renderer: HeyGen HyperFrames (HTML + GSAP + data-* attributes)
// Target: Short-form vertical video 9:16 — TikTok, Instagram Reels, YouTube Shorts
// =============================================================================

export interface HyperframesPromptParams {
  topic: string;
  videoDurationSeconds: number;
  maxMoments: number;
  dialogueContext: string;
}

export function buildHyperframesPrompt({
  topic,
  videoDurationSeconds,
  maxMoments,
  dialogueContext,
}: HyperframesPromptParams): string {
  const duration = Math.max(1, Number(videoDurationSeconds || 60));
  const hardMomentCap = Math.max(1, Math.min(16, Math.floor(maxMoments || 8)));
  const targetMoments =
    duration <= 12
      ? Math.min(4, hardMomentCap)
      : duration <= 20
        ? Math.min(6, hardMomentCap)
        : duration <= 40
          ? Math.min(10, hardMomentCap)
          : Math.min(Math.max(9, Math.round(duration / 5.5)), hardMomentCap);
  const maxAnimatedSeconds = Number((duration * (duration <= 20 ? 0.68 : 0.62)).toFixed(2));
  const minGapSeconds = duration <= 20 ? 0.3 : 0.5;

  return `You are the HyperFrames animation planning agent for a 9:16 short-form video.

MANDATORY TOOL CALLS (do these BEFORE writing JSON):
1. Call the "skill" tool to load "hyperframes" — it has the full taxonomy, palettes, B/G/L/T techniques, and aesthetic systems. Use it.
2. Call the "skill" tool to load "hyperframes-cli" — for what \`hyperframes lint\` validates.
3. Call the "skill" tool to load "gsap" — for ease/timeline patterns.
4. Use Exa MCP to research "${topic}" for current 2024-2026 visual/motion references and at least 4 facts you can lean on.

PRIMARY JOB:
For each spoken beat in the dialogue, decide what ONE takeaway the viewer should walk away with. That becomes the moment's hero displayText (1-4 words). The rest of the moment is the visual setup that lands the takeaway. Be specific to the dialogue — generic decoration that could fit any topic is a failure.

INPUTS:
TOPIC: "${topic}"
VIDEO_DURATION_SECONDS: ${duration}
TARGET_MOMENTS: ${targetMoments}
HARD_MOMENT_CAP: ${hardMomentCap}
MAX_ANIMATED_SECONDS: ${maxAnimatedSeconds}
MIN_GAP_SECONDS: ${minGapSeconds}
DIALOGUE_CONTEXT:
${dialogueContext || 'No subtitle context provided.'}

PLANNING RULES:
- Aim for ~${targetMoments} moments. Never exceed ${hardMomentCap}.
- Each moment 2.0-7.0s. Total animated time ≤ ${maxAnimatedSeconds}s. Gap between moments ≥ ${minGapSeconds}s.
- Build a beat candidate list from dialogue first (hook claims, numbers, contrasts, state changes, quotable phrases), then pick the strongest. Cover at least ~70% of high-signal beats unless that breaks the cap.
- Align moment.start ~0.15-0.35s BEFORE the hook word so the punch lock lands on the spoken word. Never start after.
- Each moment is rendered as a TRANSPARENT overlay on top of source video. Plan visuals that compose well on top of footage, not full-frame opaque cards.
- Three layers per moment, all visible as distinct DOM elements in the eventual HTML:
    Ambient — translucent backdrop element (bloom, grain, scrim, particles, soft topo lines).
    Context anchor — a non-text graphic (shape, icon, chart fragment, UI mock, divider, diagram node) tied to meaning.
    Hero — the punch text.
  Text-only or text+gradient is invalid.
- Hold dominates the clip. After entry+punch, leave readable space — minimum one idle window of 0.6s+ in any moment ≥ 3.0s. Pulse-and-rest cadence.
- Pull aesthetic system, palette, and technique codes (B-series ambient / G-series graphic / L-series layout / T-series typography / I-series interrupts) from the loaded hyperframes skill. Don't invent new taxonomies.
- displayText 1-4 words. narratorText is audio only, never rendered.
- Don't repeat motionCharacter on consecutive moments. First moment "punchy", final moment "cinematic" or "floaty".
- bg/text contrast ≥ 4.5:1. No cyan/teal/aqua. No pure #000 or #fff bg.

PUNCH MATH (show your work in animationPrompt):
- punchTimeSeconds = hookWordAbsoluteStart - moment.start (must be ≥ 0.45s, never in the last 1.0s of the clip).
- Pre-punch: ambient + context anchor only, hero hidden.
- At punchTimeSeconds: hero locks in with a T-series technique from the skill.
- Hold: subtle ambient breathe/drift on existing elements (sine.inOut yoyo, low amplitude). No new entries/exits.

ANIMATION_PROMPT FORMAT (per moment, free-form prose with these required anchors):
- "Phase map: pre-punch [0-A], punch-sync [A-B], hold [B-C], exit [C-D]."
- For each phase, describe BOTH text behavior AND non-text layer behavior (ambient + context).
- Name the technique codes you'll use (e.g. "B4 data scrim + G3 hard-offset card + T1 word-by-word slam") and reference the skill for implementation details.
- Show punch math: "Hook word '[WORD]' spoken at [X.Xs] into clip; tl.from(#hero, {...}, [X.X])."
- Mention the idle window: "Idle window seconds [A]-[B], no new keyframed events."
- Name hex colors mapped to elements.
- Be concrete about scene objects (which shapes/icons/UI elements appear and what they reference from the dialogue). Skipping non-text layers because the topic feels short or unclear is forbidden — lean on the visual catalog harder.

OUTPUT JSON ONLY (no markdown fences, no explanation outside JSON):
{
  "videoDurationSeconds": ${duration},
  "researchSummary": "Facts:\\n- ...\\n\\nVisual angles:\\n- ...\\n\\nMotion trends:\\n- ...\\n\\nAvoid:\\n- ...",
  "moments": [
    {
      "start": number,
      "duration": number,
      "type": "kinetic-type" | "data-callout" | "diagram" | "ui-metaphor" | "quote-punch",
      "narratorText": "full spoken sentence — audio only, never rendered",
      "displayText": "1-4 words",
      "content": "short visual concept label",
      "emphasis": "single key takeaway",
      "colorPalette": { "bg": "#hex", "primary": "#hex", "accent": "#hex", "text": "#hex" },
      "composition": {
        "aestheticSystem": "name from hyperframes skill",
        "motionCharacter": "punchy|floaty|rhythmic|cinematic|glitchy",
        "aestheticNotes": "1-2 sentences tying the look to dialogue + an Exa-sourced 2024-2026 reference",
        "elements": ["short list of named visual elements you expect in the HTML — shape/icon/text with sizes"]
      },
      "animationPrompt": "free-form prose with the anchor lines listed above"
    }
  ]
}`;
}

// Backward-compatible exports used by the existing HyperFrames agent integration.
export type HyperframesAnimationPlanPromptParams = HyperframesPromptParams;
export const buildHyperframesAnimationPlanPrompt = buildHyperframesPrompt;
