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
4. Use Exa MCP to research "${topic}" AND parallel visual lanes (pick what fits): editorial motion graphics, product UI (inbox/calendar/dashboard), infographic/data viz, poster typography, film title-card grammar. Harvest 2024-2026 references: spacing systems, surface treatments (paper vs glass vs matte), and motion grammar — not just factual bullets about the topic.

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
- Each moment is a full-frame 9:16 replace-mode clip with an OPAQUE base from colorPalette.bg (solid stage — previews and exports must not rely on transparency). Decorative ambient layers stack above that base as translucent blooms/scrims/grain/etc.
- Three layers per moment, all visible as distinct DOM elements in the eventual HTML:
    Ambient — effects above the opaque base (bloom, grain, scrim, particles, soft topo lines); the canvas still has solid bg underneath.
    Context anchor — a non-text graphic (shape, icon, chart fragment, UI mock, divider, diagram node) tied to meaning.
    Hero — the punch text.
  Text-only or text+gradient is invalid.
- **Full 2D vocabulary** — use whatever flat motion the beat demands (within HyperFrames/no-3D rules): SVG strokes and nodes, dashed path draws (strokeDashoffset), smooth vs jagged arrows, branching flows, timelines, rail comparisons, masks and clip-paths, alternating slice exits (+/- x), kinetic type slams with scale from-to, backdrop/filter pulses (e.g. drop-shadow blur widen on an accent stroke), grain scrims — no obligation to resemble UI chrome when the dialogue wants logic, causality, or contrast.
- Creative spread (non-negotiable): vary the *species* of motion across the video — do not default every beat to "black stage → glow → notification card springs from bottom." Rotate metaphors: editorial poster crops, schematic diagrams, **intended-path vs unintended-consequence ruptures**, ticker/stripe rails, stamp seals, paper tearing masks, magnetic UI snaps, chart sparks, magazine pull-quotes, kinetic-type-only beats with unusual easing, etc. If two adjacent moments would feel like the same template, redesign one.
- Surface & theme balance: aim for mixed lighting across the timeline — include several **light-stage** moments (airy product/inbox/editorial looks). Reserve deep/dark bases for beats that truly need drama; never paint the whole video as a void unless the dialogue demands it. Light stages still use opaque bases off-white/warm gray (e.g. #f3f4f6, #eef1f5, #faf8f5 — never pure #fff bg), hairline rules (#dadce0–#e8eaed range), soft diffuse shadows (low blur, subtle y-offset), and restrained accent chips — modern inbox/product redesign language: breathable spacing, calm hierarchy, tiny purposeful micro-motion on icons or CTAs rather than constant bounce.
- Hold dominates the clip. After entry+punch, leave readable space — minimum one idle window of 0.6s+ in any moment ≥ 3.0s. Pulse-and-rest cadence.
- Pull aesthetic system, palette, and technique codes (B-series ambient / G-series graphic / L-series layout / T-series typography / I-series interrupts) from the loaded hyperframes skill. Don't invent new taxonomies.
- displayText 1-4 words. narratorText is audio only, never rendered.
- Don't repeat motionCharacter on consecutive moments. First moment "punchy", final moment "cinematic" or "floaty".
- bg/text contrast ≥ 4.5:1. No cyan/teal/aqua. No pure #000 or #fff bg.
- When authoring HTML later: no CSS \`transform: translate(...)\` centering on elements GSAP moves/scales — hyperframes lint rejects it; use px positioning or GSAP xPercent/yPercent. Centered headline bands: explicit horizontal anchoring to the stage (\`left:0\` plus \`width:100%\` within 1080, or equivalent), flex column stacks with \`align-items:center\` for multi-line type — not \`text-align:center\` + \`inline-block\` alone — and omitting \`left\`/\`right\` on full-width absolutely positioned typography rows is invalid. Tight letter-spacing: prefer \`width: max-content\` + auto side margins per line instead of \`padding-left\` compensation. When a graphic (grid, diagram, card) sits above the hero, animationPrompt must call for a real vertical gap (graphic bottom + glow/scale + >=~120px) so the headline never collides with the context layer in export.

PUNCH MATH (show your work in animationPrompt):
- punchTimeSeconds = hookWordAbsoluteStart - moment.start (must be ≥ 0.45s, never in the last 1.0s of the clip).
- Pre-punch: ambient + context anchor only, hero hidden.
- At punchTimeSeconds: hero locks in with a T-series technique from the skill.
- Hold: subtle ambient breathe/drift on existing elements (sine.inOut yoyo, low amplitude). No **new** elements entering/leaving — deepening is OK (pulse a stroke's filter, drift an on-stage label, oscillate dash-offset on an existing arrow).
- Diagram beats: pre-punch may **establish the story graph** (nodes fading in sequence, ruler or grid, arrows drawing calmly) without revealing the punch hero early; punch is the rupture/contrast sync (accent branch, glitch stroke, slap-in headline over the fork). Match dialogue contrasts: expectation vs fallout, coding vs emergence, planned vs rogue.

ANIMATION_PROMPT FORMAT (per moment — cinematic briefing-style prose; boring laundry lists are wrong):
- Line 0 (hook title): one evocative micro-title (2-6 words, optional metaphor) that captures the beat's vibe, then a horizontal rule separator "---" on its own line — same spirit as legacy HyperFrames plans ("Blank Neural Net", etc.).
- Line 1: "Phase map: pre-punch [0-A], punch-sync [A-B], hold [B-C], exit [C-D]."
- For each phase, describe BOTH text behavior AND non-text layer behavior (ambient + context) with **specific GSAP verbs**: from/fromTo/to, duration, ease names (e.g. elastic.out(1,0.6), power3.in, sine.inOut), stagger, yoyo. Vary eases and entrances beat-to-beat — creativity is measured by how differently each moment would **feel** if muted.
- Name the technique codes you'll use (e.g. "B4 data scrim + G3 hard-offset card + T1 word-by-word slam") and reference the skill for implementation details.
- **Causal / contrast choreography** (when dialogue implies two fates): spell out phased motion like reference-quality storyboards — e.g. pre-punch builds the benign path (node A→arrow draw↓→node B); punch-sync on the hook word injects hostile horizontal branch + hero slam (scale tween, violent ease); hold adds surviving tension (pulse on danger stroke via filter, slow drift on headline); exit clears frame (paired off-screen wipes, alternating directions). Tie every motion to timestamps.
- UI / inbox metaphors: when mail, notifications, or agents appear, describe a **credible light-theme mail surface** — rounded message panel, compact header strip (search/notifications as abstract shapes), avatar disk, subject row with muted secondary line for meta, optional pastel emphasis slab behind the hero clause — not a neon cyberpunk HUD unless the topic is explicitly that.
- Show punch math: "Hook word '[WORD]' spoken at [X.Xs] into clip; tl.from(#hero, {...}, [X.X])."
- Mention the idle window: "Idle window seconds [A]-[B], no new keyframed events."
- Name hex colors mapped to elements (for light stages include rule/divider/shadow-tint hexes, not only text/accent).
- Be concrete about scene objects (which shapes/icons/UI elements appear and what they reference from the dialogue). Skipping non-text layers because the topic feels short or unclear is forbidden — lean on the visual catalog harder.

OUTPUT JSON ONLY (no markdown fences, no explanation outside JSON):
{
  "videoDurationSeconds": ${duration},
  "researchSummary": "Facts:\\n- ...\\n\\nVisual angles:\\n- ...\\n\\nMotion trends:\\n- ...\\n\\nSurfaces & themes:\\n- (light vs dark staging, product UI vs editorial — what you'll actually steal)\\n\\nAvoid:\\n- ...",
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
