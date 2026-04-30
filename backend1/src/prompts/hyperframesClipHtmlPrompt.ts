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

  // Concrete pacing numbers derived from clip duration so the model has no
  // room to invent its own (broken) cadence.
  const minTweenDuration = 0.18; // ~5.4 frames at 30fps — anything shorter renders as a flash.
  const entryWindowMax = Math.min(0.9, Math.max(0.45, duration * 0.25));
  const punchAnchor = Math.min(Math.max(duration * 0.35, 0.6), Math.max(0.6, duration - 1.6));
  const minHoldWindow = Math.max(0.8, Number((duration * 0.45).toFixed(2)));
  const maxKeyEvents = duration <= 3.5 ? 2 : duration <= 5.9 ? 3 : 4;
  const minTotalTweenDuration = Number((duration * 0.55).toFixed(2));

  return `You are a senior HyperFrames motion designer and HTML/GSAP author.

MANDATORY AGENT RULES (do these BEFORE writing any HTML — failure to call these tools is a hard rejection):
- Call the "skill" tool and load "hyperframes" — use its taxonomy and pacing rules.
- Call the "skill" tool and load "hyperframes-cli" — to know what \`hyperframes lint\` will validate.
- Call the "skill" tool and load "gsap" — pull entry/hold/exit ease vocabulary from it.
- After the three skill calls, then author the HTML. Do not collapse multiple skills into one call.
- Do not use Remotion, React, TSX, useCurrentFrame(), interpolate(), spring(), or any 3D transform.

TASK:
Generate ONE complete, self-contained HyperFrames index.html for a single 9:16 animation moment.

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
- This composition is rendered as a transparent WebM overlay on top of the source video. The page, body, root, and any full-canvas wrappers must use transparent backgrounds.
- Do not author an opaque full-frame background, solid canvas fill, or full-screen card that hides the video. Use the palette only for foreground text, strokes, glows, partial shapes, badges, and translucent accents.
- Ambient visual treatment is mandatory but must be overlay-safe:
  1) Ambient accent layer active from 0s using translucent glows, outlines, particles, sweeps, or partial shapes only; keep it low-energy and non-distracting.
  2) Context anchor layer that appears before hero text.
  3) Hero text/primary focal layer that locks on the punch timing.
- Keep animated elements visually above the source video but out of the subtitle-safe bottom area unless MOMENT_JSON explicitly requires otherwise.
- Text must be large, readable, and inside the safe box: left/right >= 120px, top/bottom >= 180px.
- Do not render full subtitles or narrator sentences. Use only short display text from MOMENT_JSON.

PACING CONTRACT (HARD NUMBERS — derived from this clip's ${duration}s duration):
- Minimum duration of any single tl.to/tl.from/tl.fromTo/gsap.to call: ${minTweenDuration}s. Anything shorter renders as a one-frame flash and is a hard rejection.
- Use tl.set(...) ONLY for instant style snaps that are NOT meant to look like motion (e.g. setting an initial transform). Never use tl.set as a stand-in for a fast tween.
- Pre-punch entry stack must finish by ${entryWindowMax.toFixed(2)}s. Stagger entries naturally inside that window — do not cram every element into the first 0.35s.
- The hero text "punch" lock should land at approximately ${punchAnchor.toFixed(2)}s (±0.25s). Never punch before 0.45s, never punch in the last 1.0s of the clip.
- After the punch, a continuous readable hold of at least ${minHoldWindow.toFixed(2)}s with NO new keyframed entry/exit events. Subtle ambient breathe/drift on existing elements is allowed (sine.inOut yoyo, amplitude <= 4% scale or <= 8px translate).
- Total animated time across all tweens (sum of durations on the timeline, not wall-clock) should be at least ${minTotalTweenDuration}s — empty space is bad too. Aim for "few but well-paced events" rather than "lots of micro-flashes" or "dead static frame".
- Maximum number of distinct key events (entries, exits, emphasis hits) total: ${maxKeyEvents}. Ambient yoyo/drift loops do NOT count toward this limit.
- Group tweens by labels in code: tl.addLabel('entry', 0); tl.addLabel('punch', ${punchAnchor.toFixed(2)}); tl.addLabel('hold', ${(punchAnchor + 0.5).toFixed(2)}); — this makes pacing auditable.
- Add an HTML comment block above the timeline summarising phases, e.g.:
    // Phase map: entry 0-${entryWindowMax.toFixed(2)}s | punch ${punchAnchor.toFixed(2)}s | hold ${(punchAnchor + 0.5).toFixed(2)}-${duration.toFixed(2)}s | idle window
  The phrase "idle window" or "hold state" must literally appear in code comments.
- Forbidden patterns (will be rejected):
    × duration: 0.0X with X < 18 (sub-frame flashes)
    × all entries packed into the first 12% of the clip
    × punch before 0.45s
    × no labels and no phase comment
    × repeat:-1 anywhere

OUTPUT JSON ONLY:
{
  "html": "full standalone index.html string"
}`;
}