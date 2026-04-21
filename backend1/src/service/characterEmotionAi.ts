import { opencodeRun, parseOpenCodeJSON } from '../agents/opencodeagent';
import { SUPPORTED_CHARACTER_EMOTIONS } from '../utils/characterImages';
import { inferDialogueEmotion } from '../utils/inferDialogueEmotion';

const ALLOWED = new Set(SUPPORTED_CHARACTER_EMOTIONS.map((e) => e.toLowerCase()));
const CHUNK_SIZE = 24;
const MAX_TEXT_LEN = 450;
const MAX_TOPIC_LEN = 220;

function truncateText(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function normalizeEmotion(raw: unknown, fallbackText: string): string {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s && ALLOWED.has(s)) return s;
  return inferDialogueEmotion(fallbackText);
}

const WEAK_FLAT_EMOTIONS = new Set(['neutral', 'talking']);

/**
 * Breaks up long runs of the same flat emotion so portraits change a bit more often.
 * Applied after AI + heuristic merge, in dialogue order.
 */
export function applyEmotionVarietyNudges(
  ordered: { id: string; text: string }[],
  emotionById: Record<string, string>
): void {
  let i = 0;
  while (i < ordered.length) {
    const em = emotionById[ordered[i].id];
    if (!em || !WEAK_FLAT_EMOTIONS.has(em)) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < ordered.length && emotionById[ordered[j].id] === em) j++;
    const len = j - i;
    if (len >= 2) {
      for (let k = 1; k < len; k += 2) {
        const item = ordered[i + k];
        const h = inferDialogueEmotion(item.text);
        emotionById[item.id] = h !== em ? h : em === 'neutral' ? 'thinking' : 'neutral';
      }
    }
    i = j;
  }
}

/**
 * One OpenCode (JSON) call per chunk. Returns map dialogueId → emotion.
 * On failure or when `CHARACTER_EMOTION_AI=0`, returns `{}` so callers use heuristics only.
 */
export async function generateCharacterEmotionsWithAi(
  items: { id: string; text: string }[],
  topic: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (items.length === 0) return result;
  if (process.env.CHARACTER_EMOTION_AI === '0') {
    return result;
  }

  const allowedList = SUPPORTED_CHARACTER_EMOTIONS.join(', ');
  const topicShort = truncateText(topic || 'Video', MAX_TOPIC_LEN);

  for (let offset = 0; offset < items.length; offset += CHUNK_SIZE) {
    const chunk = items.slice(offset, offset + CHUNK_SIZE);
    const payload = chunk.map((d) => ({
      id: d.id,
      text: truncateText(d.text, MAX_TEXT_LEN),
    }));

    const prompt = `You assign ONE facial-expression emotion per spoken dialogue line for an on-screen character portrait (cartoon cutout style).

VIDEO TOPIC: ${topicShort}

Allowed emotion labels ONLY (use these exact lowercase strings): ${allowedList}

Guidelines:
- Match the emotional tone of THIS line (not the whole video).
- **Avoid long stretches of the same label.** If you would label several lines in a row "neutral", alternate with "thinking" (new idea, aside, reasoning) or a subtle "happy" when the line is mildly upbeat — unless the script is deliberately deadpan the whole time.
- Do **not** give the same emotion to more than **two lines in a row** unless the wording is truly identical in affect; on the third consecutive similar line, switch to at least "thinking" or another gentle shift.
- When a line adds an example, contrast, punchline, or rhetorical question, change emotion from the previous line whenever it fits.
- Use "neutral" for calm explanation or factual delivery, but not as the default for every line.
- Prefer "happy", "excited", "sad", "angry", "surprised", "confused", or "thinking" when the line carries that affect even lightly.
- Use "talking" sparingly — only when the line is pure filler with no readable affect (otherwise prefer "neutral" or "thinking").

INPUT JSON:
${JSON.stringify({ dialogues: payload }, null, 2)}

OUTPUT: Return ONLY valid JSON of this shape (cover every id exactly once):
{"emotions":[{"id":"<same id as input>","emotion":"<label>"}]}`;

    try {
      const output = await opencodeRun({
        prompt,
        model: 'pro',
        format: 'json',
        quiet: true,
      });

      const parsed = parseOpenCodeJSON<{ emotions?: Array<{ id?: string; emotion?: unknown }> }>(output);
      const list = parsed?.emotions;

      if (!Array.isArray(list) || list.length === 0) {
        console.warn('[CharacterEmotion AI] Bad or empty JSON; using heuristic for chunk', {
          chunkStart: offset,
          chunkLen: chunk.length,
        });
        for (const d of chunk) {
          result[d.id] = inferDialogueEmotion(d.text);
        }
        continue;
      }

      const byId = new Map<string, unknown>();
      for (const row of list) {
        if (row && typeof row.id === 'string') {
          byId.set(row.id, row.emotion);
        }
      }

      for (const d of chunk) {
        result[d.id] = normalizeEmotion(byId.get(d.id), d.text);
      }
    } catch (err) {
      console.warn('[CharacterEmotion AI] OpenCode chunk failed; heuristic for this chunk', {
        chunkStart: offset,
        chunkLen: chunk.length,
        message: err instanceof Error ? err.message : String(err),
      });
      for (const d of chunk) {
        result[d.id] = inferDialogueEmotion(d.text);
      }
    }
  }

  return result;
}
