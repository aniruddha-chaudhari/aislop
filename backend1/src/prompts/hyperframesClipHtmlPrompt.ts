// =============================================================================
// HyperFrames Animation Prompt Builder
// Renderer: HeyGen HyperFrames (HTML + GSAP + data-* attributes)
// Target: Short-form vertical video 9:16 — TikTok, Instagram Reels, YouTube Shorts
// =============================================================================

import type { AnimationMoment } from '../service/hyperframesAnimationPlanService';

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
  const cappedMoments = Math.max(1, Math.min(16, Math.floor(maxMoments || 8)));

  return `You are the HyperFrames animation planning agent for SHORT-FORM VERTICAL VIDEO (9:16).
Target: TikTok, Instagram Reels, YouTube Shorts.
Use the HyperFrames skill for everything in this task: research, planning, HTML authoring, timing, and validation.

RENDERER CONTRACT:
- Output: HTML with data-* timing, GSAP timelines (seconds, not frames).
- No React, Remotion, TSX, useCurrentFrame(), interpolate(), spring(), or 3D (perspective, rotateX/Y).
- Root: <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920">
- GSAP timeline registered: window.__timelines["main"] = gsap.timeline({ paused: true })
- Animated elements need: class="clip" data-start data-duration data-track-index
- Use only: GSAP, CSS animations, Lottie, 2D canvas/WebGL, SVG.

CORE JOB:
1. Research "${topic}" with Exa MCP. Gather 4 facts, 3 visual angles, 3 motion trends (2024-2026), 2 things to avoid.
2. Build ${cappedMoments} moments max. Each 2.0-7.0s. Hook timing: punch-lock the hero displayText to spoken word ±0.2s.
3. displayText: 1-4 words only. narratorText: audio pipeline (never rendered).
4. Every moment: 3 layers — B-series ambient bg + G/L context + T-series hero with punch lock.

TOPIC: "${topic}"
DURATION: ${duration}s
MOMENTS: ${cappedMoments}
DIALOGUE:
${dialogueContext || 'No dialogue context.'}

AESTHETIC SYSTEMS (pick one per moment):
- "deep-glow": warm radial bloom (filter:blur(55px)) behind text. Warm accent color.
- "neo-brutalist": flat bg, 7px 7px hard shadow, thick borders, sharp transitions.
- "kinetic-max": word-by-word explosive entries, elastic bounce, high energy holds.
- "warm-minimal": negative space, single hero, soft gradient drift. Calm.
- "grain-retro": film grain overlay (feTurbulence, opacity 0.14-0.18). Warm, analog feel.
- "ui-native": iOS/Android style (pill chips, badges, progress arcs). Instant familiarity.
- "data-editorial": Bloomberg/NYT inspired. Hairline rules, stat counters, animated bars. Authoritative.

TYPOGRAPHY TECHNIQUES (pick 1+ per moment):
- T1 WORD-BY-WORD CASCADE: words enter 0.08-0.1s stagger via back.out(1.7). Underline sweep on hero word.
- T2 SQUASH-STRETCH: single word squashes, color pops. Elastic.out bounce.
- T3 HIGHLIGHT SWEEP: accent bar width 0→100% under text. Pair with scale pulse.
- T4 TYPEWRITER: chars at 18-22/sec. Blinking cursor. Monospace only.
- T5 MASKED WIPE: text inside overflow:hidden parent. Mask width 0→100% reveals. Or translateY wipe.
- T8 STAT COUNTER: number rolls via gsap TextPlugin or object tween. Land with scale pulse.

GRAPHIC/SHAPE TECHNIQUES (pick 1+ per moment):
- G1 WARM BLOOM: radial-gradient circle + blur(55px). tl.from() scale 0.2→1, hold pulse yoyo.
- G3 HARD CARD: boxShadow "7px 7px 0px accent". border 2px. back.out entry, power2.in exit.
- G4 PILL CASCADE: borderRadius 9999px, accent bg. Stagger 0.11s, land with scale pulse.
- G5 PROGRESS ARC: SVG circle, strokeDashoffset drawn via power3.out. Background at 0.12 opacity.
- G7 DATA BARS: height 13px, width 0→target. Linear gradient fill. Value labels fade in after.

LAYOUT TECHNIQUES (pick 1+ per moment):
- L1 ASYMMETRIC SPLIT: flex row 65/35. G3 line divider. Staggered column entries.
- L2 BOTTOM STRIP: 35% height bar at bottom. 1-3 pills or label only. No full sentences.
- L3 CENTER GRAVITY: hero center, supporting elements spring from 80px outward. Radial vignette bg.
- L4 FULL-BLEED POSTER: type only. 72-96px, fontWeight 900. >=40% negative space. Flat solid bg.

COLOR PALETTE (pick one, adjust for dialogue):
- "obsidian-gold": bg:#0d0d0d primary:#c9a84c accent:#f5e6c8 text:#ffffff
- "slate-ember": bg:#14171a primary:#2d3436 accent:#e84118 text:#f0f0f0
- "mocha-mousse-2025": bg:#1a130f primary:#8a5a44 accent:#d7a06f text:#f6eee6
- "grain-retro": bg:#0c0a05 primary:#d4820a accent:#f5c842 text:#fefaf0

CONSTRAINTS:
- bg/text contrast >= 4.5:1. No cyan/teal/aqua hex. No pure #000/#fff bg.
- Max 2 text elements per moment, both >=48px. Primary >=72px, fontWeight 800-900.
- Safe zone: left/right >=120px, top/bottom >=180px. Text horizontal only.
- No 3D, no perspective, no rotateX/Y, no isometric. 2D transforms only.
- Entry 0.3-0.5s. Hold dominates remaining time. No beat2 unless duration >=6.0s AND genuine event.
- First moment: motionCharacter "punchy" (back.out 1.7 entry). Last: "cinematic" or "floaty".
- Never two consecutive moments same motionCharacter.
- Hold easing: "breathe" / "drift" / "pulse-glow" / "drift-x" / "slow-scale". Never static.
- GSAP easing: power3.out (entry), elastic.out(1,0.5) (bouncy), power2.in (exit).

PUNCH LOCK MATH:
- Hook word timestamp from dialogue → compute punchTimeSeconds relative to clip start.
- Hero displayText hidden until punchTimeSeconds. Pre-punch: B-series bg + G/L context only.
- At punchTimeSeconds: tl.from("#hero", { opacity:0, y:60, duration:0.4, ease:"power3.out" }, punchTimeSeconds)
- Punch sync example: "Hook word 'vulnerable' at 2.3s into clip. tl.from(#hero, {...}, 2.3) — locks at punch."

OUTPUT JSON ONLY:
{
  "videoDurationSeconds": ${duration},
  "researchSummary": "Facts:\\n- [4 key facts]\\n\\nVisual angles:\\n- [3 visual concepts]\\n\\nMotion trends:\\n- [3 2024-2026 trends]\\n\\nAvoid:\\n- [2 outdated patterns]",
  "moments": [
    {
      "start": number,
      "duration": number,
      "type": "kinetic-type" | "data-callout" | "diagram" | "ui-metaphor" | "quote-punch",
      "narratorText": "audio only - never rendered visually",
      "displayText": "1-4 words max",
      "content": "semantic visual label",
      "colorPalette": { "bg": "#hex", "primary": "#hex", "accent": "#hex", "text": "#hex" },
      "composition": {
        "layout": "string",
        "aestheticSystem": "deep-glow|neo-brutalist|kinetic-max|warm-minimal|grain-retro|ui-native|data-editorial",
        "motionCharacter": "punchy|floaty|rhythmic|cinematic",
        "aestheticNotes": "1 sentence tying aesthetic to dialogue + trend reference from Exa",
        "colorNotes": "hex→element mapping. e.g. bg:#0d0d0d on full frame. accent:#f5e6c8 on underline. text:#ffffff on type.",
        "elements": ["display-headline:TEXT — 96px", "stat-counter:VALUE — 88px", "bloom:accent-150px", "noise:opacity-0.15"],
        "beat1": { "description": "entry + context", "techniques": ["B1", "G1", "T1"], "entryEasing": "back.out(1.7)" },
        "holdWindow": { "description": "readable hold", "holdEasing": "breathe", "durationHint": "dominant time block" },
        "beat2OrNull": null,
        "exitEasing": "power2.in"
      },
      "emphasis": "key takeaway this moment highlights",
      "animationPrompt": "Line 1: 'Seconds 0-[punchTime]s: [B-series pattern] + [G/L context], hero hidden.\\nLine 2: 'Seconds [punchTime]-[clipEnd]s: [hold easing] amplitude/period.\\nLine 3: 'Punch: hook word [WORD] at [X.Xs]; tl.from(#hero, {...}, [X.X]).\\nLine 4: 'beat2: [description or null].\\nLine 5: 'Colors: [hex mappings].\\nLine 6: 'Assets: [Lucide icons / SVG / Lottie or none].'"
    }
  ]
}`;
}

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
  const punchAnchor = Math.min(Math.max(duration * 0.35, 0.6), Math.max(0.6, duration - 1.6));

  return `You are a senior HyperFrames motion designer authoring HTML + GSAP.

MANDATORY TOOL CALLS (before any HTML):
1. Load skill "hyperframes" - taxonomy, palettes, B/G/L/T technique catalog, pacing.
2. Load skill "hyperframes-cli" - what \`hyperframes lint\` validates.
3. Load skill "gsap" - ease vocabulary and timeline patterns.
Three separate skill calls, then write the HTML.

TASK:
Generate ONE standalone HyperFrames index.html for a single 9:16 moment. Be creative - the loaded skills give you a deep palette of techniques. Use them. Don't default to "big text on a glow" unless the moment genuinely calls for it.

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

RENDERER CONTRACT (hard requirements - anything else is creative freedom):
- Return JSON only: {"html":"...full index.html..."}.
- MUST be a complete HTML document (HyperFrames lint rejects fragments): <!DOCTYPE html>, <html lang="en">, <head> with <meta charset="UTF-8">, then <body> wrapping ALL content including scripts. Never output only the composition div — preview and bundler require the document shell.
- Root composition stays inside <body>: <div data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1080" data-height="1920">.
- Include GSAP via https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js.
- Synchronously: const tl = gsap.timeline({ paused: true }); window.__timelines["main"] = tl;
- Deterministic only. No Math.random / Date.now / timers / async / fetches / repeat:-1.
- No Remotion / React / TSX / useCurrentFrame / interpolate / spring() / 3D transforms.
- TRANSPARENT overlay: html, body, root, and full-frame wrappers all transparent. No opaque full-frame card or solid background fill - the source video shows through.
- Animate opacity / transforms / colors / strokes. Don't animate display or visibility.
- Use the provided palette. If MOMENT_JSON.animationPrompt names a specific hex, prefer that.

VISUAL CONTRACT (the validator enforces this - failures get rejected and retried):
- HTML must contain at least 3 distinct visual layer types as separate DOM nodes:
    ambient backdrop (bloom / grain / scrim / particles / soft topo) +
    context anchor (non-text graphic - shape, icon SVG, chart fragment, UI mock, badge, divider, diagram node) +
    hero text (1-4 words, >=72px, weight 800-900).
  Text + a single bloom is rejected as visually empty.
- MOMENT_JSON.animationPrompt is the storyboard. Honor named technique codes (B/G/L/T/I) and named scene objects. If it says "stat counter spins to 27", build a counter; don't substitute with generic text.
- Text inside safe zone (left/right >=120px, top/bottom >=180px). No full subtitles - short display text only.

PACING CONTRACT (validator enforces):
- No tween shorter than 0.18s (renders as a flash).
- Punch around ${punchAnchor.toFixed(2)}s (+/-0.25s). Not before 0.45s, not in the last 1.0s.
- After punch, give the viewer a real hold window - at least ~${(duration * 0.4).toFixed(1)}s with no new keyframed entries/exits. Subtle ambient breathe/drift only.
- Code must include either a "// Phase map: ..." comment or a "// hold state" / "// idle window" comment so pacing is auditable.
- Use tl.addLabel('entry'/'punch'/'hold'/'exit', seconds) for clarity.

OUTPUT JSON ONLY:
{
  "html": "full standalone index.html string"
}`;
}

// =============================================================================
// PREVIOUS PROMPT VERSION — kept for reference. Do not delete without replacing.
// =============================================================================
/*
export function buildHyperframesClipHtmlPrompt_v1(params: HyperframesClipHtmlPromptParams): string {
  const duration = Math.max(0.1, Number(params.moment.duration || 0));
  const palette = params.moment.colorPalette || {};
  const momentJson = JSON.stringify(params.moment, null, 2);
  const punchAnchor = Math.min(Math.max(duration * 0.35, 0.6), Math.max(0.6, duration - 1.6));

  return `You are a senior HyperFrames motion designer authoring HTML + GSAP.

MANDATORY TOOL CALLS (before any HTML):
1. Load skill "hyperframes" — taxonomy, palettes, B/G/L/T technique catalog, pacing.
2. Load skill "hyperframes-cli" — what \`hyperframes lint\` validates.
3. Load skill "gsap" — ease vocabulary and timeline patterns.
Three separate skill calls, then write the HTML.

TASK:
Generate ONE standalone HyperFrames index.html for a single 9:16 moment. Be creative — the loaded skills give you a deep palette of techniques. Use them. Don't default to "big text on a glow" unless the moment genuinely calls for it.

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

RENDERER CONTRACT (hard requirements — anything else is creative freedom):
- Return JSON only: {"html":"...full index.html..."}.
- Root: <div data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1080" data-height="1920">.
- Include GSAP via https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js.
- Synchronously: const tl = gsap.timeline({ paused: true }); window.__timelines["main"] = tl;
- Deterministic only. No Math.random / Date.now / timers / async / fetches / repeat:-1.
- No Remotion / React / TSX / useCurrentFrame / interpolate / spring() / 3D transforms.
- TRANSPARENT overlay: html, body, root, and full-frame wrappers all transparent. No opaque full-frame card or solid background fill — the source video shows through.
- Animate opacity / transforms / colors / strokes. Don't animate display or visibility.
- Use the provided palette. If MOMENT_JSON.animationPrompt names a specific hex, prefer that.

VISUAL CONTRACT (the validator enforces this — failures get rejected and retried):
- HTML must contain at least 3 distinct visual layer types as separate DOM nodes:
    ambient backdrop (bloom / grain / scrim / particles / soft topo) +
    context anchor (non-text graphic — shape, icon SVG, chart fragment, UI mock, badge, divider, diagram node) +
    hero text (1-4 words, ≥72px, weight 800-900).
  Text + a single bloom is rejected as visually empty.
- MOMENT_JSON.animationPrompt is the storyboard. Honor named technique codes (B/G/L/T/I) and named scene objects. If it says "stat counter spins to 27", build a counter; don't substitute with generic text.
- Text inside safe zone (left/right ≥120px, top/bottom ≥180px). No full subtitles — short display text only.

PACING CONTRACT (validator enforces):
- No tween shorter than 0.18s (renders as a flash).
- Punch around ${punchAnchor.toFixed(2)}s (±0.25s). Not before 0.45s, not in the last 1.0s.
- After punch, give the viewer a real hold window — at least ~${(duration * 0.4).toFixed(1)}s with no new keyframed entries/exits. Subtle ambient breathe/drift only.
- Code must include either a "// Phase map: ..." comment or a "// hold state" / "// idle window" comment so pacing is auditable.
- Use tl.addLabel('entry'/'punch'/'hold'/'exit', seconds) for clarity.

OUTPUT JSON ONLY:
{
  "html": "full standalone index.html string"
}`;
}
*/
