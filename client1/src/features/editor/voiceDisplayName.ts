/**
 * Dialogue rows often use "Narrator" while portraits follow the Peter asset set.
 * Use this for timeline labels, properties, and `/api/character-image/...` URLs.
 */
export function voiceDisplayName(name: string | undefined | null): string {
  if (name == null) return '';
  const t = name.trim();
  if (/^narrator$/i.test(t)) return 'Peter';
  return name;
}
