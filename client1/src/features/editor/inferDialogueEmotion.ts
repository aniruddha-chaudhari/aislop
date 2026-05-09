/**
 * Mirrors backend `inferDialogueEmotion` — values must match EMOTION_VARIANTS in characterImages.ts.
 */
export function inferDialogueEmotion(text: string): string {
  const t = (text || '').trim();
  if (!t) return 'neutral';

  const lower = t.toLowerCase();

  if (
    /\b(hate|hates|hated|angry|anger|furious|rage|raging|annoyed|idiot|stupid|damn it|screw you|shut up)\b/i.test(t)
  ) {
    return 'angry';
  }
  if (/\b(sad|sadly|cry|crying|tears|sob|sorry|depressed|mourn|tragic|unfortunate|heartbreaking)\b/i.test(t)) {
    return 'sad';
  }
  if (
    /\b(awesome|amazing|incredible|fantastic|love it|let's go|woohoo|yay|hurray|best day)\b/i.test(t) ||
    /[!]{2,}/.test(t)
  ) {
    return 'excited';
  }
  if (/\b(huh\??|confused|doesn't make sense|what do you mean|i don't get)\b/i.test(t)) {
    return 'confused';
  }
  if (/\b(wow|whoa|no way|unbelievable|seriously\??)\b/i.test(t)) {
    return 'surprised';
  }
  if (
    /\b(hmm|wonder|thinking|let me think|not sure if|maybe|perhaps)\b/i.test(lower) ||
    (/\b(why|how come|what if)\b/i.test(lower) && /\?/.test(t))
  ) {
    return 'thinking';
  }

  return 'neutral';
}
