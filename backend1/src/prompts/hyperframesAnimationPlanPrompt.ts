// =============================================================================
// HyperFrames Animation Prompt Builder
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

  return `You are the HyperFrames animation planning, direction, and research agent for SHORT-FORM VERTICAL VIDEO (9:16).
Target platforms: TikTok, Instagram Reels, YouTube Shorts.
Your output is consumed by HeyGen's HyperFrames renderer — an HTML + GSAP engine.

RENDERER CONTRACT (NON-NEGOTIABLE):
- Output is HTML with data-* attribute timing, not React/Remotion/TSX.
- All timing values are in SECONDS (GSAP timeline), not frame numbers.
- Every animated element must carry class="clip" data-start data-duration data-track-index.
- All GSAP timelines must be created with { paused: true } and registered on window.__timelines["composition-id"].
- Use GSAP tl.to() / tl.from() / tl.fromTo() with second-based position offsets.
- Springs are approximated with GSAP's elastic/back eases or CustomEase — no Remotion spring() calls.
- Do NOT use Remotion, React, useCurrentFrame(), interpolate(), or any React hooks.
- The "Frame Adapter" pattern: your composition is a plain HTML document. GSAP is the only animation runtime.

MANDATORY AGENT RULES:
- Use the "skill" tool and load "hyperframes" before writing any composition code.
- Use the "skill" tool and load "hyperframes-cli" for CLI reference.
- Use the "skill" tool and load "gsap" for animation patterns.
- For palette, background texture, and aesthetic system choices, use the hyperframes skill as the source of truth instead of inventing new taxonomies.
- Use Exa MCP before final answer for current (2024-2026) visual/motion references.

PRIMARY JOB — HIGHLIGHT THE PUNCH (NOT GENERIC DECORATION)
Every moment must answer: what is the ONE takeaway in this spoken line?
That takeaway is the hero displayText and receives the strongest motion treatment.
Do not make generic cards that could fit any topic.
Example: narrator says "sixty three percent of instances are vulnerable" → displayText is "63% VULNERABLE", big type, accent motion, timed to land exactly when that phrase is spoken.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — RESEARCH FIRST (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Research "${topic}" with Exa MCP before planning.

Collect and summarize:
1) Facts (at least 4) useful for narration and emphasis.
2) Visual metaphor angles (at least 3) feasible in 2D HTML/CSS/SVG.
3) Motion language cues (at least 3) from current short-form trends (2024-2026).
4) Things to avoid (at least 2) that feel outdated in 2025-2026.

Research must stay practical for deterministic GSAP timelines.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — INTERNET STYLE VALIDATION (EXA REQUIRED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before writing final JSON, use Exa MCP to validate each moment's aesthetic/motion
direction against current (2024-2026) short-form motion language.

Per moment:
- Identify 1-2 style references or trend patterns from web research.
- Translate into concrete GSAP decisions (entry pattern, hold behavior, type treatment, UI choreography).
- Write influence into composition.aestheticNotes and animationPrompt.
- No generic "make it modern" — be specific about the trend and how it appears in HTML/GSAP.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — TIMELINE PLANNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOPIC: "${topic}"
VIDEO_DURATION_SECONDS: ${duration}
TARGET_MOMENTS: ${targetMoments}
HARD_MOMENT_CAP: ${hardMomentCap}
MAX_ANIMATED_SECONDS: ${maxAnimatedSeconds}
MIN_GAP_SECONDS: ${minGapSeconds}
DIALOGUE_CONTEXT:
${dialogueContext || 'No subtitle context provided.'}

Planning rules:
- Choose around ${targetMoments} moments. When in doubt, include a moment for each meaningful semantic beat instead of collapsing multiple beats into one generic moment.
- Never exceed HARD_MOMENT_CAP (${hardMomentCap}).
- Total sum of moment durations should stay under MAX_ANIMATED_SECONDS (${maxAnimatedSeconds}s).
- Leave at least MIN_GAP_SECONDS (${minGapSeconds}s) between the end of one animation moment and the start of the next.
- Build a beat candidate list from dialogue first, then choose moments from it:
  - hook claims / bold statements
  - numeric facts, percentages, rankings, deltas, or time markers
  - contrasts and turns ("but", "however", "instead", "until", "then")
  - actions and state changes ("broke", "escaped", "sent", "launched", "failed", "fixed")
  - quoted phrases and memorable punch lines
- Coverage target: animate at least 70% of high-signal beat candidates, unless that would violate HARD_MOMENT_CAP.
- Avoid skipping back-to-back key beats just because they are close in time; if both matter, create separate short moments with clean transitions.
- Each moment duration must be 2.0 to 7.0 seconds.
- Align starts to dialogue timing using the word timestamps when provided.
- For a hook phrase, set moment.start about 0.15-0.35 seconds before the first hook word so the animation can build in and the hero lock lands exactly on the spoken word. Do not start after the hook word.
- Keep pulse-and-rest pacing, but prefer denser moment coverage over long inactive stretches when dialogue is information-rich.
- Use event-driven motion only: animate when meaning changes, not continuously across the whole clip.
- Insert intentional idle windows between motion bursts so viewers can read:
  - Minimum one idle window of 0.6s+ in every moment >= 3.0s.
  - For 2.0-3.5s moments: at most one primary motion burst + settle.
  - For 3.6-5.9s moments: at most two bursts total (entry/punch + optional micro-accent).
  - For 6.0-7.0s moments: two bursts by default; third burst only if dialogue has a true second semantic beat.
- displayText stays short and punchy: 1-4 words maximum.
- Moments must include non-text visual storytelling tied to meaning (for example: UI card, chart arc, badge, path line, icon, diagram node, sandbox/container box, signal pulse, object motion), not text-only animation.
- Use text as the semantic lock while shape/UI/object layers carry setup and impact.
- narratorText is audio pipeline context only — it is NEVER rendered visually.

MOMENT TYPE TAXONOMY (choose one per moment):
- "kinetic-type"
- "data-callout"
- "diagram"
- "ui-metaphor"
- "quote-punch"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — HYPERFRAMES HTML STRUCTURE CONTRACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every moment maps to a HyperFrames composition. The animationPrompt must be
implementable as a valid HTML document following these rules:

ROOT ELEMENT:
  <div id="root" data-composition-id="{id}"
       data-start="0" data-width="1080" data-height="1920">

TIMED CLIP ELEMENTS:
  Every animated element needs ALL FOUR:
    class="clip"
    data-start="{seconds}"
    data-duration="{seconds}"
    data-track-index="{0-n}"

GSAP TIMELINE REGISTRATION:
  const tl = gsap.timeline({ paused: true });
  tl.from("#hero", { opacity: 0, y: 60, duration: 0.4, ease: "power3.out" }, 0);
  window.__timelines = window.__timelines || {};
  window.__timelines["{composition-id}"] = tl;

POSITION SYNTAX (seconds, not frames):
  tl.to(el, { ... }, 0.3)           // absolute second offset
  tl.to(el, { ... }, "+=0.2")       // relative offset
  tl.to(el, { ... }, "<")           // align with previous start
  tl.to(el, { ... }, "<+=0.1")      // 0.1s after previous starts

FORBIDDEN IN HYPERFRAMES:
  × useCurrentFrame() — Remotion only
  × interpolate() — Remotion only
  × spring() — Remotion only
  × React components, JSX, TSX
  × Any Remotion import
  × perspective CSS (3D is banned)
  × rotateX / rotateY

ALLOWED ANIMATION RUNTIMES:
  ✓ GSAP 3 (primary)
  ✓ CSS transitions/animations
  ✓ Lottie JSON
  ✓ Three.js (2D canvas only — no z-axis depth)
  ✓ WebGL shaders (advanced)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — TIMING MATH (PUNCH LOCK)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HyperFrames uses SECONDS throughout. All timing is GSAP timeline seconds.

PUNCH LOCK WORKFLOW:
1. Identify the hook word/phrase timestamp from DIALOGUE_CONTEXT.
2. Derive punchTimeSeconds = (spoken timestamp) within the clip.
3. Hero displayText must NOT be fully visible before punchTimeSeconds.
4. Before punchTimeSeconds: Layer 1 background + Layer 2 context anchor only.
5. At punchTimeSeconds: hero text locks via a T-series technique.
6. If DIALOGUE_CONTEXT includes "word@start-end" timings, compute punchTimeSeconds = hookWordAbsoluteStart - moment.start and keep it >= 0.15s.

Show your punch math explicitly in animationPrompt:
  "Hook word '[WORD]' spoken at [X.Xs] into clip.
   tl.from('#hero', { ... }, [X.X]) — hard lock at punch time."

Storyboard structure requirement for animationPrompt:
- Use explicit second ranges for four phases: Pre-punch context build, Punch-sync event, Post-punch readable hold, Exit/transition.
- In every phase, describe both text behavior AND non-text layer behavior (background + context object/UI/shape).
- Reject plans where only text appears or only text animates.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — DIRECTION SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULE A: NO DEAD BACKGROUNDS
Each moment must include 3 active layers:
  Layer 1 — Ambient background: one explicit B-series pattern, low contrast, continuous motion.
  Layer 2 — Context anchor: a G-series or L-series element that enters before hero text.
  Layer 3 — Hero text: delayed lock using a T-series technique at punch time.
Static flat background + simple opacity fade = INVALID. Rejected.
Important pacing constraint:
- "Active layers" does not mean constant new motion.
- After entry/punch settles, hold state should be mostly stable with subtle ambient movement only.
- Hero and context layers should spend meaningful time in readable stillness between events.

RULE B: TEXT SIZE + READABILITY
- Max 2 text elements visible per moment.
- Primary text: >=72px, fontWeight 800-900, 1-4 words.
- Secondary text (optional): >=48px, max 3 words, fontWeight 600+.
- Any text below 48px is banned (no source labels, no footnotes, no icon labels).
- Every text entry in elements[] must list its fontSize.

RULE C: COLOR + CONTRAST
- Per-moment colorPalette: bg, primary, accent, text.
- bg/text contrast ratio >= 4.5:1.
- accent used on exactly ONE element per moment.
- No cyan, electric teal, aqua, or blue-green in any hex.
- No pure #000000 or pure #FFFFFF as bg.
- No two adjacent moments share the same bg color.

RULE D: SAFE ZONE (1080x1920 canvas)
- Text-safe box: top >= 180px, bottom <= 1740px, left >= 120px, right <= 960px.
- Text must be horizontal only (no vertical, diagonal, or curved-path text).
- No top-strip text or corner micro-labels.
- Preferred y-center for primary displayText: 38%-68% of frame height.

RULE E: PACING ARCHITECTURE
- First moment: motionCharacter must be "punchy".
- Final moment: motionCharacter must be "cinematic" or "floaty".
- Never two consecutive moments with the same motionCharacter.
- Entry animation settles within first 0.3-0.5s of GSAP timeline.
- Hold window dominates clip duration (not entry, not exit).
- beat2OrNull: null unless duration >= 6.0s AND a genuine second event exists.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 7 — COLOR SYSTEM (2025-2026 NATIVE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each moment gets its own color palette derived from the dialogue content — not topic heuristics.
Apply 60-30-10 rule: 60% bg / 30% primary / 10% accent.

Palette selection:
- Use palette guidance from the hyperframes skill (preferred).
- If inventing a palette, keep it warm/editorial and mobile-legible.
- Keep bg/text contrast >= 4.5:1.

HARD RULES:
- Never cyan, electric teal, aqua, or any hex near #00ffff.
- Never pure #ffffff or #000000 as bg.
- Verify bg/text >= 4.5:1 contrast every moment.
- accent on exactly ONE element per moment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 8 — VISUAL AESTHETIC SYSTEM (pick one per moment)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Choose one per moment (details from hyperframes skill):
- deep-glow
- bezier-flow
- kinetic-max
- warm-minimal
- grain-retro
- ui-native
- soft-brutalist
- data-editorial

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 9 — BACKGROUND PATTERN CATALOG (B-SERIES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Layer 1 must use one B-series pattern. All patterns are CSS/HTML — never GSAP-animated
at high frequency, never sharp contrast.

B1. Slow Gradient Drift
B2. Architectural Grid
B3. LED Dot Matrix
B4. Monospace Data Scrim
B5. Soft Topography Lines
B6. Subdued Film Grain

Use hyperframes skill guidance for exact implementation details.

Anti-interference: B-series stays far back, low contrast, never competes with readable text.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 10 — TECHNIQUE CATALOG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reference by code in animationPrompt. At least one T code + one G or L code per moment.
All timings below are GSAP seconds, not frame numbers.

TYPOGRAPHY TECHNIQUES (T-series)
─────────────────────────────────
T1. WORD-BY-WORD SLAM CASCADE
  Words enter sequentially at 0.08-0.1s stagger via GSAP tl.from() stagger.
  Per word: scaleX/Y 0→1.18→1.0 via "back.out(1.7)" ease.
  Last word lands → all words breathe (scale 1.0→1.012→1.0, 2s GSAP repeat yoyo).
  Most important word: after landing (0.08s delay), accent-colored rect width 0→100%
  via tl.to("#underline", { width: "100%", ease: "power3.out", duration: 0.3 }).
  Exit: tl.to(all, { opacity: 0, duration: 0.27, ease: "power2.in" }).
  Best for: hooks, key claims. Max 6 words per cascade. Two cascades max per moment.

T2. SQUASH-STRETCH KINETIC HIT
  One word (heaviest) gets independent GSAP tween:
    tl.to("#word", { scaleY: 0.45, scaleX: 1.5, duration: 0.13, ease: "power2.in" })
    tl.to("#word", { scaleY: 1.35, scaleX: 0.8, duration: 0.23, ease: "power2.out" })
    tl.to("#word", { scaleX: 1, scaleY: 1, duration: 0.3, ease: "elastic.out(1, 0.5)" })
    tl.to("#word", { color: accent, duration: 0.33, yoyo: true, repeat: 1 })
  Max one T2 word per moment.
  Best for: kinetic-max, single most important word, emotional peaks.

T3. HIGHLIGHT SWEEP
  Text already on screen. A div (accent bg, height 10px, width 0) sits 4px below target.
    tl.to("#sweep", { width: "100%", duration: 0.37, ease: "power3.out" })
    tl.to("#text", { scale: 1.025, duration: 0.4, ease: "back.out(2)", yoyo: true, repeat: 1 })
  grain-retro: height varies 8-13px for analog feel. bezier-flow: exactly 10px, matching curve stroke weight.
  Best for: stats, key terms, grain-retro + bezier-flow.

T4. TYPEWRITER + CURSOR BLINK
  Characters appear via GSAP step-animation or CSS animation at 18-22 chars/sec.
  Blinking cursor: tl.to("#cursor", { opacity: 0, duration: 0.55, repeat: -1, yoyo: true }).
  Cursor color: accent. On line complete: cursor blinks 0.6s then fades.
  Font must be monospace.
  Best for: data reveals, tech/AI topics, "loading" framing.

T5. MASKED TEXT WIPE
  Text div inside parent overflow:hidden. Sibling mask div starts width:100%.
    tl.to("#mask", { width: "0%", duration: 0.6, ease: "power3.out" }) — reveals text.
  OR: text translateY starts +100%, parent overflow:hidden clips until final position.
  Hold: scale 1.0→1.012→1.0 via GSAP yoyo repeat.
  Best for: warm-minimal, data-editorial, big single-line reveals.

T8. STAT COUNTER ROLL
  Number div uses GSAP TextPlugin or custom object tween:
    gsap.to(counter, { innerText: finalVal, duration: clipDuration * 0.85,
                        ease: "power3.out", snap: { innerText: 1 } })
  On counter land: tl.to("#number", { scale: 1.07, duration: 0.2, yoyo: true, repeat: 1 })
  Unit label: tl.from("#unit", { opacity: 0, x: 10, duration: 0.3, ease: "back.out(2)" }, "land")
  Best for: any numeric data, data-editorial especially.

T10. STOMP TEXT
  Each word: tl.from("#word", { y: -50, scale: 1.25, duration: 0.17, ease: "power4.out" })
  Stagger: 0.13-0.16s between words.
  Optional: brief white overlay div opacity 0.18→0 on each word's landing.
  Words feel like they have mass landing on screen.
  Best for: kinetic-max, bezier-flow, high-urgency facts.

T12. WORD MORPH SWAP
  Word A on screen. Word B replaces it:
    tl.to("#wordA", { scaleX: 0, filter: "blur(8px)", duration: 0.2, ease: "power2.in" })
    tl.from("#wordB", { scaleX: 0, x: 20, filter: "blur(8px)", duration: 0.27,
                         ease: "elastic.out(1, 0.6)" }, "swap")
  Both words share same DOM position (absolute, same anchor).
  Best for: "X becomes Y", contrasts, kinetic-max.

T13. SLOT MACHINE NUMBER
  Hero number div: solid fill, static — never moves.
  Above/below: outline-only clones (webkit-text-stroke, fill transparent).
  Clones translateY via GSAP continuous tween at ~1 lineHeight/sec, looping via modulo.
  Parent overflow:hidden, height = 1 lineHeight. Clones opacity 0.2-0.35.
  Best for: hero statistics, data-editorial + deep-glow, any big number moment.

GRAPHIC / SHAPE TECHNIQUES (G-series)
──────────────────────────────────────
G1. WARM RADIAL BLOOM
  Div with CSS radial-gradient(circle, accent 0%, transparent 70%) + filter:blur(55px).
    tl.from("#bloom", { opacity: 0, scale: 0.2, duration: 0.5, ease: "power2.out" })
  Hold: tl.to("#bloom", { opacity: 0.2, duration: 1.5, repeat: -1, yoyo: true, ease: "sine.inOut" })
  Text/shapes above this in higher z-index. Bloom color must be warm.

G2. NOISE/FILM GRAIN OVERLAY
  SVG filter: <feTurbulence type="fractalNoise" baseFrequency="0.65"/><feColorMatrix type="saturate" values="0"/>
  Applied as global overlay div, z-index top, opacity 0.14-0.18, pointer-events:none.
  For animated grain: CSS animation cycling 3 pre-generated noise frames at 12fps.
  Present entire moment — no entrance/exit animation on this layer.

G3. HARD-OFFSET CARD
    tl.from("#card", { y: 40, opacity: 0, duration: 0.4, ease: "back.out(1.7)" })
  boxShadow: "7px 7px 0px 0px {accent}" at rest.
  backgroundColor: primary. border: "2px solid {accent or text}".
  borderRadius: 4px (bezier-flow / soft-brutalist) or 0px (sharp editorial).
  Exit: tl.to("#card", { opacity: 0, y: -20, duration: 0.27, ease: "power2.in" })

G4. PILL BADGE CASCADE
  Each pill: borderRadius:9999px, backgroundColor:accent, color:bg.
    tl.from(".pill", { y: 30, opacity: 0, duration: 0.4, ease: "back.out(1.7)", stagger: 0.11 })
  After all visible: tl.to(".pill", { scale: 1.028, duration: 0.3, yoyo: true, repeat: 1 })
  Best for: ui-native, "categories/features/reasons".

G5. PROGRESS ARC DRAW
  SVG circle. stroke-dasharray = circumference.
    tl.to("#arc", { strokeDashoffset: circumference*(1-target/100), duration: 1.4, ease: "power3.out" })
  Background circle: same radius, strokeOpacity 0.12.
  On arc complete: tl.to("#arc", { strokeWidth: 17, duration: 0.2, yoyo: true, repeat: 1 })
  T8 stat counter runs simultaneously.

G7. ANIMATED DATA BARS
  Each bar: height 13px, borderRadius 4px, width starts "0%".
    tl.to(".bar", { width: targetPct+"%", duration: 1, ease: "power3.out", stagger: 0.14 })
  background: linear-gradient(90deg, primary, accent).
  Right value label: tl.from(".val", { x: 10, opacity: 0, duration: 0.3, ease: "back.out(2)" }, "bar-end")

G8. NOTIFICATION BADGE BOUNCE
  Div: borderRadius:50%, width/height:48px, backgroundColor:accent.
    tl.from("#badge", { scale: 0, duration: 0.5, ease: "elastic.out(1, 0.5)" })
  G1 bloom behind badge runs simultaneously.
  Enters 0.4s after main content.

G10. LAYERED PARALLAX PLANES (2D ONLY)
  Three wrapper divs — translateX/Y ONLY. No perspective, no rotate3d.
    tl.to("#bg-layer", { x: 3, duration: clipDuration, ease: "none", repeat: -1, yoyo: true })
    tl.to("#mid-layer", { y: "sin", ... }) // use GSAP MotionPathPlugin or manual sine
  Differential motion creates perceived depth without any 3D property.

G11. MAGNETIC DIVIDER LINE
  Div or SVG line. Width (or height) starts 0.
    tl.from("#line", { scaleX: 0, transformOrigin: "left center", duration: 0.5, ease: "power3.out" })
  Label springs in after line: tl.from("#label", { x: -10, opacity: 0, duration: 0.3, ease: "back.out(2)" }, "+=0.1")

G12. CARD STACK FAN
  3 divs stacked. Entry together via tl.from(".card", { y: 60, duration: 0.5, ease: "back.out(1.7)", stagger: 0.07 })
  Fan reveal: tl.to("#card-left", { x: -75, duration: 0.4, ease: "elastic.out(1, 0.6)" }, "fan")
             tl.to("#card-right", { x: 75, ... }, "fan")
  Hold: tl.to(".card", { scale: 1.012, duration: 2, repeat: -1, yoyo: true, ease: "sine.inOut" })

LAYOUT TECHNIQUES (L-series)
─────────────────────────────
L1. ASYMMETRIC SPLIT
  Parent flex row. 65% + 35% divs. G11 line draws vertically between them.
  65% side: tl.from("#hero-col", { x: -30, opacity: 0, duration: 0.4, ease: "back.out(1.7)" })
  35% side: same with 0.08s delay and positive x.

L2. BOTTOM-THIRD INFO STRIP
  Info strip div (35% height, backgroundColor primary at 0.88 opacity).
    tl.from("#strip", { y: "100%", duration: 0.4, ease: "power3.out" }, 0.33)
  Strip content: 1-3 pill badges OR single 2-3 word label at 64px+. Nothing else.
  BANNED from strip: full sentences, narration text, source labels.

L3. CENTER-RADIAL GRAVITY
  Hero at absolute center. G1 bloom fires on entry. Supporting elements spring from 80px outward.
  Background: radial-gradient vignette. Exploits mobile center-gravity eye scan.

L4. FULL-BLEED TYPOGRAPHIC POSTER
  No graphics. Pure type. MAX 2 text elements. 72-96px display. fontWeight 900.
  Generous negative space (>=40% frame empty). Flat solid bg from palette.

L5. STACKED REVEAL COLUMN
  Per row: tl.from(".row", { x: -30, opacity: 0, duration: 0.4, ease: "back.out(1.7)", stagger: 0.12 })
  Separator line between rows: tl.from(".sep", { scaleX: 0, transformOrigin: "left", duration: 0.3 }, "row-end+=0.06")
  After all rows: T3 highlight sweep across all rows simultaneously.

L6. CORNER-ANCHOR PERIPHERAL
  Main content at center. Non-textual icon/badge at corner (G8 or shape-only G4 pill).
    tl.from("#corner", { scale: 0, duration: 0.4, ease: "elastic.out(1, 0.5)" }, "main-settled+=0.4")
  No corner text labels.

PATTERN INTERRUPTS (I-series)
──────────────────────────────
I1. FLASH-CUT INTERRUPT
  Overlay div full-frame, z-index top:
    tl.fromTo("#flash", { opacity: 0 }, { opacity: 0.35, duration: 0.1 })
    tl.to("#flash", { opacity: 0, duration: 0.2, ease: "power2.out" })
  Total ~0.33s. Fires between beat1 and beat2 only when a real second beat exists.
  Optional pattern interrupt — never mandatory.

I2. SCALE PUNCH
  Root div: tl.to("#root", { scale: 1.07, duration: 0.27, ease: "power2.out" })
            tl.to("#root", { scale: 1.0, duration: 0.5, ease: "power2.inOut" })

I3. BLUR-TO-SHARP FOCUS REVEAL
    tl.fromTo("#hero", { filter: "blur(16px)", opacity: 0.4 },
                        { filter: "blur(0px)", opacity: 1, duration: 0.47, ease: "power3.out" })
  Most effective on large display-weight text.

I5. COLOR TEMP SHIFT
  Root bg div transitions across moment boundary via GSAP:
    tl.to("#root", { backgroundColor: nextBgColor, duration: 0.27, ease: "power2.out" })
  Not a flash — a gradual warm shift. Signals emotional/narrative transition.

I6. HARD CUT COLOR BLOCK
  backgroundColor changes in exactly 0 duration (GSAP set):
    tl.set("#root", { backgroundColor: newColor }, punchTime)
  New content enters immediately via spring-snappy. Abruptness is the point.
  Dark→light or light→dark only (must be meaningfully different). Max twice per video.

I7. POP-LAND-SLIDE-OUT (6s+ clips only)
  Element A:
    tl.from("#elemA", { scale: 0, duration: 0.33, ease: "elastic.out(1, 0.5)" })
    tl.to("#elemA", { y: 80, opacity: 0, duration: 0.27, ease: "power2.in" }, "elemB-start-=0.1")
  Element B:
    tl.from("#elemB", { y: -80, opacity: 0, duration: 0.33, ease: "back.out(1.7)" }, "elemB-start")
  A exits down, B enters from above — scoreboard flip feel.
  Pairs with T8 stat counter on Element B.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 11 — EASING VOCABULARY (GSAP NATIVE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use these exact GSAP ease strings in animationPrompt.

ENTRY:
  "power3.out"           — fast start, graceful settle. Default for 80% of entries.
  "back.out(1.7)"        — snappy overshoot. Punchy entries.
  "elastic.out(1, 0.5)"  — bouncy spring. Playful entries.
  "elastic.out(0.75,0.4)"— floaty spring. Cinematic entries.
  "power4.out"           — very fast. Stomp-style stamp.

HOLD (subtle continuous motion — never fully static):
  "breathe"    → gsap.to(el, { scale: 1.015, duration: 2.5, repeat: -1, yoyo: true, ease: "sine.inOut" })
  "drift"      → gsap.to(el, { y: 3, duration: 3, repeat: -1, yoyo: true, ease: "sine.inOut" })
  "pulse-glow" → gsap.to("#bloom", { opacity: 0.55, duration: 1.5, repeat: -1, yoyo: true, ease: "quad.out" })
  "drift-x"    → gsap.to(el, { x: 4, duration: 3, repeat: -1, yoyo: true, ease: "sine.inOut" })
  "slow-scale" → gsap.to(el, { scale: 1.013, duration: 2.5, repeat: -1, yoyo: true, ease: "sine.inOut" })
  BANNED: never use "none" / no hold motion / completely static holds.

EXIT:
  "power2.in"      — clean, definitive exit.
  "power4.in"      — rockets off. Emphatic scene exit.
  "elastic.in(1)"  — snaps inward. Energy-retaining exit (I4).
  "power2.inOut"   — gentle shrink-fade.
  GSAP set()       — instant 1-frame cut. Hard editorial snap-cut.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 12 — PACING ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLIP DURATION REALITY:
  3s clip → entry (0.3-0.5s) + hold (rest). That's the whole moment.
  5s clip → entry + hold + ONE small event during hold. Two things total.
  7s clip → entry + hold + optionally a second element or reveal mid-hold.

Entry animation completes within 0.3-0.5s. The remaining time is the hold.
Make the hold readable and visually confident. Never invent beat2 to fill space.
Default structure per moment:
  - Motion Window A (entry + punch): 0.25-0.8s total.
  - Idle Window: 0.6-2.0s where no new keyframed events fire (ambient drift is allowed).
  - Optional Motion Window B: 0.2-0.6s only if there is a genuine semantic second beat.
  - Remaining time: readable hold with minimal movement.

Animation density caps (hard limits):
  - 2.0-3.5s moments: max 1 key event after entry.
  - 3.6-5.9s moments: max 2 key events total.
  - 6.0-7.0s moments: max 3 key events total, and only when content clearly warrants it.
If unsure, remove motion rather than add filler motion.

MOTION CHARACTER DEFINITIONS (GSAP implementation):
  "punchy"    → back.out(1.7) entries. breathe/drift holds. power2.in exits.
  "floaty"    → elastic.out(0.75,0.4) entries. drift/slow-scale holds. power2.inOut exits.
  "rhythmic"  → elements enter on even 0.1s cadence. moderate back.out(1.4).
  "cinematic" → slow elastic.out entry (0.8s+) + I3 blur-to-sharp. long low-amplitude drift. power4.in exit.
  "glitchy"   → T7 glitch via translateX chroma split (3 sibling divs). rest of moment stays clean. Max once per video.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 13 — PRE-OUTPUT CHECKLIST (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Verify every item before returning JSON:
□ displayText is 1-4 words maximum. Cut if longer.
□ narratorText is audio only — never rendered on screen.
□ No full-sentence bottom caption strip anywhere.
□ Max 2 text elements per moment, both >=48px.
□ Primary text >=72px fontWeight 800-900.
□ Each moment has colorPalette: bg, primary, accent, text.
□ No two adjacent moments share same bg color.
□ No cyan/teal/aqua in any hex value.
□ bg/text contrast >=4.5:1 verified for every moment.
□ accent used on exactly ONE element per moment.
□ colorNotes explicitly maps each hex → element.
□ beat1.techniques[] lists at least one B* code, one G* or L* code, one T* code.
□ Each moment has Layer 1 B-series background (explicit B code).
□ elements[] lists every visible element with type:value AND fontSize for all text.
□ No text element in elements[] below 48px.
□ Punch math explicitly shown in animationPrompt (seconds, not frames).
□ All timing in animationPrompt uses GSAP seconds, not frame numbers.
□ No useCurrentFrame(), interpolate(), spring(), React, Remotion, JSX, TSX.
□ animationPrompt includes the 6 required anchor lines.
□ animationPrompt maps: pre-punch context build, punch lock, hold, beat2 (or null), exit.
□ animationPrompt has concrete values: second ranges, scale/opacity values, ease names, loop periods.
□ "seconds" appears at least 3 times in every animationPrompt.
□ animationPrompt explicitly identifies at least one idle window (0.6s+) with no new keyframed events.
□ No filler choreography: every non-ambient motion event ties to a spoken semantic beat.
□ Hold easing is present and not "static" / not absent.
□ beat2OrNull is null unless duration >= 6.0s AND genuine second event exists.
□ No two adjacent moments share same motionCharacter.
□ start:0 moment has motionCharacter "punchy".
□ Final moment has motionCharacter "cinematic" or "floaty".
□ All text inside safe zone: top>=180, bottom<=1740, left>=120, right<=960 (1080x1920).
□ Text horizontal only — no vertical/diagonal/rotated text.
□ No top-strip text, no corner micro-labels.
□ No 3D: no perspective, rotateX, rotateY, isometric, z-axis depth.
□ No outdated styles: no card-wobble, no generic lower-third slide, no plain fade-in text.
□ Exa-based style validation reflected in aestheticNotes + animationPrompt.
□ Each moment spotlights its specific spoken punch — not a generic card.
□ Return JSON only. No markdown fences. No explanation text outside JSON.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT JSON ONLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "videoDurationSeconds": ${duration},
  "researchSummary": "Facts:\\n- ...\\n\\nVisual angles:\\n- ...\\n\\nMotion language:\\n- ...\\n\\nAvoid:\\n- ...",
  "moments": [
    {
      "start": number,
      "duration": number,
      "type": "kinetic-type" | "data-callout" | "diagram" | "ui-metaphor" | "quote-punch",
      "narratorText": "full spoken sentence — audio pipeline only, NEVER rendered on screen",
      "displayText": "1-4 words max",
      "content": "semantic visual concept label for HyperFrames composition",
      "colorPalette": {
        "bg": "#hex",
        "primary": "#hex",
        "accent": "#hex — used on ONE element only",
        "text": "#hex"
      },
      "composition": {
        "layout": "string",
        "aestheticSystem": "deep-glow|bezier-flow|kinetic-max|warm-minimal|grain-retro|ui-native|soft-brutalist|data-editorial",
        "motionCharacter": "punchy|floaty|rhythmic|cinematic|glitchy",
        "aestheticNotes": "1-2 sentences on how aesthetic manifests here specifically, including Exa-sourced trend reference",
        "colorNotes": "explicit hex→element mapping e.g. bg:#0d0d0d fills full frame. primary:#c9a84c on progress arc. accent:#f5e6c8 on underline sweep. text:#ffffff on all type.",
        "elements": [
          "display-headline:TEXT — 96px",
          "stat-counter:VALUE — 88px",
          "pill-badge:LABEL — 52px",
          "progress-arc:78%",
          "warm-bloom:accent-color-radius-160px",
          "noise-overlay:opacity-0.15",
          "hard-shadow-card:primary-fill-accent-7px-shadow"
        ],
        "beat1": {
          "description": "entry + punch setup",
          "techniques": ["B1", "G1", "T1"],
          "entryEasing": "back.out(1.7)",
          "timingHint": "punch lock at Xs into clip"
        },
        "holdWindow": {
          "description": "dominant readable hold behavior",
          "holdEasing": "breathe|drift|pulse-glow|drift-x|slow-scale",
          "durationHint": "X.Xs to end of clip"
        },
        "beat2OrNull": null,
        "exitEasing": "power2.in"
      },
      "emphasis": "single key takeaway this moment spotlights",
      "animationPrompt": "Detailed second-by-second HyperFrames/GSAP storyboard. Required anchor lines:\\nLine 0: 'Phase map: Pre-punch [0-A], Punch-sync [A-B], Hold [B-C], Exit [C-D].'\\nLine 1: 'Seconds 0-[punchTime]: [B-series bg behavior] + [G/L context entry], hero text hidden.'\\nLine 2: 'Punch sync [A-B]: hook-aligned event where context object reacts and hero text locks together.'\\nLine 3: 'Seconds [punchTime]-[clipEnd]: [hold easing behavior] with amplitude and loop timing.'\\nLine 4: 'At [Xs]: [beat2 description or explicitly: beat2 is null, no second event fires].'\\nLine 5: 'Idle window: Seconds [A]-[B] hold readable state with no new keyframed events (ambient drift only).'\\nLine 6: 'Colors: [hex→element with contrast-safe pairings].'\\nLine 7: 'Icons/assets: [Lucide name, Simple Icons slug, SVG description, or none].'\\nLine 8: 'Non-text layers: explicitly list object/UI/shape behavior per phase; text-only choreography is invalid.'\\nThen add additional second-anchored lines for full lifecycle clarity. All values in GSAP seconds. No frame numbers. No Remotion APIs. Prefer fewer, meaningful motion bursts over continuous animation."
    }
  ]
}`;
}

// Backward-compatible exports used by the existing HyperFrames agent integration.
export type HyperframesAnimationPlanPromptParams = HyperframesPromptParams;
export const buildHyperframesAnimationPlanPrompt = buildHyperframesPrompt;