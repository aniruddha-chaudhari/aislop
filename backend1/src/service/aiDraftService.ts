import { Timeline } from '../schema/project';

/**
 * Generate AI draft timeline from audio session
 * Stub implementation - full version requires imageEmbedder and database
 */
export async function generateAiDraft(
  audioSessionId: string,
  topic: string
): Promise<Timeline> {
  console.log(`🎬 [AI DRAFT] Generating draft for session ${audioSessionId}`);
  throw new Error('AI draft generation not yet implemented in backend1. Please use backend directory.');
}
