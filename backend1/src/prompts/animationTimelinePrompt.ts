export interface AnimationTimelinePromptParams {
  topic: string;
  durationSeconds: number;
  targetMomentCount: number;
  hardMomentCap: number;
  animationBudgetBlock: string;
  dialogueContext: string;
}

/**
 * Builds the prompt used to generate the animation plan (timestamps and moments).
 * Detailed, timestamp-anchored prompt (image-plan style). Output is JSON with
 * videoDurationSeconds and moments (start, duration, type, content, subtitle).
 */
export function buildAnimationTimelinePrompt({
  topic,
  durationSeconds,
  targetMomentCount,
  hardMomentCap,
  animationBudgetBlock,
  dialogueContext,
}: AnimationTimelinePromptParams): string {
  return `You are a senior short-form video TIMELINE planner. Your job is to decide WHEN (exact seconds) and WHAT (one idea per moment) to show motion-graphic animations so they stay in sync with the spoken script. Do NOT design visual style, colors, or motion in this stage—only time and semantic intent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INPUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOPIC: "${topic}"
VIDEO_DURATION_SECONDS: ${durationSeconds}
MAX_MOMENTS: ${targetMomentCount}
HARD_MOMENT_CAP: ${hardMomentCap}

${animationBudgetBlock}

DIALOGUE SEQUENCE (this is your source of truth for timestamps):
Each line has the form: [start s-end s] Speaker: text
- "start" and "end" are in SECONDS (e.g. 2.50 means 2.5 seconds from the start of the video).
- You MUST use these exact numbers when setting moment "start" and when choosing how long a moment runs (duration).
- Example: "[2.50s-6.00s] Peter: What is Kubernetes?" means from 2.5s to 6.0s Peter says that line. A moment anchored here should have start: 2.5 and duration at most 3.5 (so it ends by 6.0) or less.

${dialogueContext || 'No subtitle context provided.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK (follow in order)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. READ the DIALOGUE SEQUENCE. List in your head each segment's start (seconds), end (seconds), and text.

2. CHOOSE which segments deserve an animation moment:
   - Prefer segments that introduce a key concept, define a term, compare things, or state a punchy conclusion.
   - Skip filler, greetings, or very short lines unless they are the only content.
   - Use at most TARGET_MOMENTS (${targetMomentCount}) and never exceed HARD_MOMENT_CAP (${hardMomentCap}).
   - For videos ≤ 12s, use at most TARGET_MOMENTS (${targetMomentCount}) with clear rest gaps between beats (do not animate the whole clip wall-to-wall).

3. FOR EACH CHOSEN MOMENT:
   - start: Set to the EXACT start time (in seconds) of the dialogue segment you picked. Copy the number from the segment's "[X.XXs-..." (e.g. if the line is [5.20s-9.00s], use start: 5.2 or 5.20). Do not invent round numbers like 5.0 or 10.0 unless they appear in the sequence.
   - duration: Between 2.0 and 7.0 seconds. The moment must end by (start + duration). Prefer ending at or before the segment end so animation does not run past the spoken line. Example: segment [5.2s-9.0s] → duration 3.8 or less (e.g. 3.5).
   - type: Pick the ONE value that best matches the segment (see "MOMENT FIELDS: type and content" below). Use detailed, specific intent.
   - content: Write a detailed semantic description (1–2 sentences or a rich phrase, ~15–40 words). See "MOMENT FIELDS: type and content" below.
   - subtitle: The EXACT dialogue text for this segment (copy from the DIALOGUE SEQUENCE line). This field is for audio timing and semantic context ONLY. Downstream stages and the renderer NEVER display "subtitle" as on-screen text or captions.

4. ORDER and SPACING:
   - Output moments in chronological order by start time.
   - Non-overlapping: the next moment must start after the previous one's end (previous start + previous duration). Prefer at least 4 seconds gap between the end of one moment and the start of the next when possible.
   - Respect ANIMATION_BUDGET: do not cover the whole video with animation; leave intentional rest gaps so the viewer can absorb.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOMENT FIELDS: type and content (use detailed values)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Keep the same JSON keys (start, duration, type, content, subtitle). Fill type and content with detailed, specific values as below.

TYPE — choose exactly one; use the value that best fits the segment:
- "definition": Explaining what something is, a term, or a concept. Use when the dialogue defines or introduces a key idea.
- "callout": Highlighting one takeaway, punch line, or emphasis. Use for a single strong point or "remember this" moment.
- "comparison": Two (or few) things contrasted (A vs B, before/after, X versus Y). Use when the dialogue compares or contrasts.
- "process": Steps, stages, or a sequence (step 1, step 2; first-then-finally). Use when the dialogue describes a procedure or flow.
- "timeline": Events in time, history, or order (e.g. "in 2014... then in 2020"). Use for chronological narrative.
- "quote": A direct quote, tagline, or memorable line. Use when the dialogue is meant to be quoted or repeated on screen.
- "stat": A number, metric, or statistic with a short label. Use when the dialogue gives a specific figure or fact.
- "list": A short list of items (bullets or items). Use when the dialogue enumerates several things.

CONTENT — write a detailed semantic description (no visual or design instructions):
- Length: about 15–35 words (max ~180 characters). One to two clear sentences or one rich phrase so the direction stage has enough to work with.
- Include: the main idea, key terms, and enough context so a motion designer knows what the animation should convey (e.g. "Kubernetes is a system that runs containers at scale across many machines; the key idea is orchestration and automation" not just "Kubernetes in one line").
- For comparison: name the two sides and the contrast (e.g. "Docker runs on one machine; Kubernetes orchestrates many containers across a cluster").
- For process: name the steps or stages in order (e.g. "Three steps: build the image, push to a registry, then deploy to the cluster").
- For stat: include the number and what it means (e.g. "Over 80% of Fortune 500 companies use Kubernetes for container orchestration").
- Do not include: "show a diagram", "use blue", "animate from left", or any visual/direction instructions—only what the moment is about.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES (mandatory)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Output ONLY valid JSON. No markdown, no explanation outside the JSON.
- Every moment "start" MUST equal a segment start time from the DIALOGUE SEQUENCE. Do not use arbitrary or rounded times that do not appear in the sequence.
- Keep each moment inside [0, VIDEO_DURATION_SECONDS]: start ≥ 0 and (start + duration) ≤ ${durationSeconds}.
- Duration per moment: minimum 2.0, maximum 7.0 seconds.
- content: detailed semantic description, 15–35 words / ~180 characters max (see "MOMENT FIELDS: type and content"). No design instructions.
- subtitle: must be the exact dialogue line for that segment; it is used ONLY for audio sync and context and is NEVER rendered as visual text or captions in any downstream stage.
- Avoid generic one-liners; give enough detail for the direction stage to design the animation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL TIMING RULES (like image plan)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Video length is exactly ${durationSeconds} seconds. All start and (start + duration) must lie in [0, ${durationSeconds}].
- Anchor every moment to one dialogue line: use that line's [start] value as moment "start", and choose "duration" so the moment fits inside that segment's [start, end] (or ends shortly after the segment end).
- Space moments apart: at least 4 seconds between the end of one moment and the start of the next when the script allows.
- Quality over quantity: fewer, well-timed moments are better than many vague or poorly aligned ones.
- For short videos (≤ 12s): use 2 moments and one clear rest gap; do not pack the timeline.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKED EXAMPLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If DIALOGUE SEQUENCE contains:
  [0.00s-3.20s] Peter: Hey, today we talk about Kubernetes.
  [3.20s-7.50s] Peter: Kubernetes is a system that runs your containers at scale.
  [7.50s-12.00s] Stewie: So you run pods on nodes.

Then a valid moment plan could be:
- Moment 1: start 3.2, duration 4.3, type "definition", content "Kubernetes is a system that runs your containers at scale; the key idea is orchestration of many containers across multiple machines.", subtitle "Kubernetes is a system that runs your containers at scale."
- Moment 2: start 7.5, duration 3.5, type "callout", content "Pods are the smallest deployable units; they run on nodes, which are the machines in the cluster. Emphasize pods and nodes as the core building blocks.", subtitle "So you run pods on nodes."
Do NOT use start 0.0 for the first moment unless the first segment is the one you chose; do NOT use start 3.0 or 4.0—use 3.2 because that is what the sequence gives.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (return only this JSON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "videoDurationSeconds": ${durationSeconds},
  "moments": [
    {
      "start": 0.0,
      "duration": 4.0,
      "type": "definition",
      "content": "A clear, detailed sentence or two describing what this moment is about: the main concept, key terms, and the takeaway the viewer should get. No visual instructions—only semantic intent so the motion designer knows what to convey.",
      "subtitle": "Exact dialogue text for this segment from the sequence"
    },
    {
      "start": 8.5,
      "duration": 3.5,
      "type": "callout",
      "content": "Another moment with enough detail: name the idea, the contrast or the steps if relevant, and what should be emphasized. Again, 15–40 words of semantic description only.",
      "subtitle": "Exact dialogue for this segment"
    }
  ]
}

Use the exact property names: videoDurationSeconds, moments, start, duration, type, content, subtitle. All times in seconds (numbers). Values for type and content must be detailed as described above.`;
}

/**
 * Combined timeline + research prompt. One OpenCode run that:
 * 1. Uses Exa MCP to research the topic first
 * 2. Creates the timeline plan (informed by research)
 * 3. Outputs JSON with videoDurationSeconds, moments, and researchSummary
 */
export function buildAnimationTimelineWithResearchPrompt({
  topic,
  durationSeconds,
  targetMomentCount,
  hardMomentCap,
  animationBudgetBlock,
  dialogueContext,
}: AnimationTimelinePromptParams): string {
  return `You are a senior short-form video TIMELINE planner with web research. You will do TWO things in this task:
(A) Research the topic using Exa MCP tools to gather up-to-date facts and visual ideas.
(B) Create a timeline plan from the dialogue (as described below).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — MANDATORY: Research (use Exa MCP first)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use Exa MCP tools to research "${topic}". Gather:
- At least 4 concise facts
- At least 3 distinct visual metaphor angles
- Concrete nouns/objects that can be animated (systems, ports, dashboards, nodes, pipes, charts, logos, icons)
- Keep it concise and practical for scene direction

Do this BEFORE producing the timeline JSON.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INPUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOPIC: "${topic}"
VIDEO_DURATION_SECONDS: ${durationSeconds}
MAX_MOMENTS: ${targetMomentCount}
HARD_MOMENT_CAP: ${hardMomentCap}

${animationBudgetBlock}

DIALOGUE SEQUENCE (source of truth for timestamps):
Each line: [start s-end s] Speaker: text. Use these exact numbers for moment "start" and "duration".

${dialogueContext || 'No subtitle context provided.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — Create timeline plan
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. READ the DIALOGUE SEQUENCE. Note each segment's start, end, and text.
2. CHOOSE segments for animation moments (at most ${targetMomentCount}, never exceed ${hardMomentCap}).
   Prefer key concepts, definitions, comparisons, punchy conclusions.
3. FOR EACH MOMENT: start (exact from dialogue), duration (2–7s), type, content (15–35 words), subtitle (exact dialogue, used ONLY for audio timing/context and NEVER rendered as on-screen text).
4. Moments in chronological order, non-overlapping, 4s gap when possible.

TYPE values: definition, callout, comparison, process, timeline, quote, stat, list
CONTENT: semantic description only—no visual instructions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (JSON only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "videoDurationSeconds": ${durationSeconds},
  "moments": [
    {
      "start": 0.0,
      "duration": 4.0,
      "type": "definition",
      "content": "Detailed semantic description, 15–40 words.",
      "subtitle": "Exact dialogue for this segment (context-only; never rendered as captions or on-screen text)"
    }
  ],
  "researchSummary": "Facts:\\n- ...\\n\\nVisual angles:\\n- ...\\n\\nSource hints:\\n- ..."
}

- researchSummary: Format your Exa research as plain text with sections Facts:, Visual angles:, Source hints:
- Use exact property names: videoDurationSeconds, moments, researchSummary
- Moment keys: start, duration, type, content, subtitle
- All times in seconds (numbers)`;
}
