import { Timeline, Track, Clip } from '../schema/project';
import { ImageEmbeddingService } from './imageEmbedder';

/**
 * Generate AI draft timeline from audio session
 * Reuses existing WhisperX + image plan + character logic
 */
export async function generateAiDraft(
  audioSessionId: string,
  topic: string
): Promise<Timeline> {
  console.log(`🎬 [AI DRAFT] Generating draft for session ${audioSessionId}`);

  try {
    // 1. Load audio session data
    const session = await loadAudioSession(audioSessionId);
    if (!session) {
      throw new Error(`Audio session ${audioSessionId} not found`);
    }

    console.log(`📊 [AI DRAFT] Session has ${session.dialogues.length} dialogues, total duration: ${session.totalDuration}s`);

    // 2. Generate image plan using clean timestamps (reuse existing logic)
    // This internally runs WhisperX and gets sentence-level timings
    const imagePlan = await ImageEmbeddingService.generateImageEmbeddingPlanFromCleanTimestamps(
      audioSessionId,
      session.dialogues,
      topic || session.name || 'Technical conversation'
    );

    console.log(`✅ [AI DRAFT] Image plan generated: ${imagePlan.imageRequirements.length} images`);

    // 3. Build subtitle track from dialogues with WhisperX timings
    // The image plan service already processed WhisperX for each dialogue
    // We'll extract timings from the image plan's entries or regenerate them
    const subtitleClips = await generateSubtitleClips(session, audioSessionId);

    // 4. Build overlay track from image plan (use imagePath when plan has it)
    const overlayClips = imagePlan.imageRequirements.map((req: { id?: string; timestamp?: number; contextualDuration?: number; duration?: number; title?: string; imagePath?: string }, index: number) => ({
      id: `img_${req.id ?? index}`,
      kind: 'overlay' as const,
      start: req.timestamp ?? 0,
      duration: req.contextualDuration ?? req.duration ?? 8,
      assetId: req.id ?? `img_${index}`,
      label: req.title ?? `Image ${index + 1}`,
      x: 0.5,
      y: 0.3,
      scale: 0.5,
      ...(req.imagePath && { path: req.imagePath }),
    }));

    // 5. Build character track based on speakers
    const characterClips = await generateCharacterClips(session, audioSessionId);

    // 6. Build audio track (single clip referencing the session)
    const audioTrack: Track = {
      id: 't_audio',
      type: 'audio',
      name: 'Audio',
      clips: [
        {
          id: 'a1',
          kind: 'audio',
          start: 0,
          duration: session.totalDuration,
          label: `Session ${audioSessionId}`,
        },
      ],
      locked: true,
    };

    const subtitleTrack: Track = {
      id: 't_subs',
      type: 'subtitle',
      name: 'Subtitles',
      clips: subtitleClips,
    };

    const overlayTrack: Track = {
      id: 't_imgs',
      type: 'overlay',
      name: 'Images',
      clips: overlayClips,
    };

    const characterTrack: Track = {
      id: 't_chars',
      type: 'character',
      name: 'Characters',
      clips: characterClips,
    };

    const timeline: Timeline = {
      duration: session.totalDuration,
      tracks: [audioTrack, subtitleTrack, overlayTrack, characterTrack],
    };

    console.log(`✅ [AI DRAFT] Timeline generated with ${timeline.tracks.length} tracks`);
    return timeline;
  } catch (error) {
    console.error('❌ [AI DRAFT] Error generating AI draft:', error);
    throw error;
  }
}

/**
 * Load audio session from database
 */
async function loadAudioSession(sessionId: string) {
  const { PrismaClient } = await import('../generated/prisma');
  const prisma = new PrismaClient();

  try {
    const session = await prisma.audioSession.findUnique({
      where: { sessionId },
      include: {
        dialogues: {
          include: {
            audioFile: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    // Use stored totalDuration if available
    let totalDuration = 0;
    if (typeof session.totalDuration === 'number' && session.totalDuration > 0) {
      totalDuration = session.totalDuration;
      console.log(`✅ [AI DRAFT] Using stored session duration: ${totalDuration}s`);
    } else {
      // Fallback: Calculate total duration from audio files
      const fs = require('fs');
      const ffmpeg = require('fluent-ffmpeg');

      for (const dialogue of session.dialogues) {
        if (dialogue.audioFile?.path && fs.existsSync(dialogue.audioFile.path)) {
          const duration = await new Promise<number>((resolve, reject) => {
            ffmpeg.ffprobe(dialogue.audioFile!.path, (err: any, metadata: any) => {
              if (err) resolve(3); // Fallback duration
              else resolve(metadata.format.duration || 3);
            });
          });
          totalDuration += duration;
        }
      }
      console.log(`✅ [AI DRAFT] Calculated session duration: ${totalDuration}s`);
    }

    return {
      sessionId: session.sessionId,
      name: session.name || '',
      dialogues: session.dialogues,
      totalDuration,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Generate subtitle clips with WhisperX timings
 */
async function generateSubtitleClips(session: any, audioSessionId: string): Promise<Clip[]> {
  const { getWhisperXCleanAlignment } = await import('./videoGenerator');
  const clips: Clip[] = [];

  let cumulativeTime = 0;

  for (const dialogue of session.dialogues) {
    if (!dialogue.audioFile?.path) continue;

    // Get WhisperX clean alignment for this dialogue
    const alignment = await getWhisperXCleanAlignment(
      dialogue.audioFile.path,
      dialogue.text
    );

    if (alignment.success && alignment.sentences) {
      // Create clips for each sentence
      for (let i = 0; i < alignment.sentences.length; i++) {
        const sentence = alignment.sentences[i];
        clips.push({
          id: `sub_${dialogue.id}_${i}`,
          kind: 'subtitle',
          start: cumulativeTime + sentence.start,
          duration: sentence.end - sentence.start,
          speaker: dialogue.character,
          text: sentence.text,
        });
      }

      cumulativeTime += alignment.total_duration || 0;
    } else {
      // Fallback: use entire dialogue as one clip
      const ffmpeg = require('fluent-ffmpeg');
      const fs = require('fs');
      
      const duration = await new Promise<number>((resolve) => {
        ffmpeg.ffprobe(dialogue.audioFile!.path, (err: any, metadata: any) => {
          if (err) resolve(3);
          else resolve(metadata.format.duration || 3);
        });
      });

      clips.push({
        id: `sub_${dialogue.id}`,
        kind: 'subtitle',
        start: cumulativeTime,
        duration,
        speaker: dialogue.character,
        text: dialogue.text,
      });

      cumulativeTime += duration;
    }
  }

  return clips;
}

/**
 * Generate character clips based on speakers
 */
async function generateCharacterClips(session: any, audioSessionId: string): Promise<Clip[]> {
  const { getWhisperXCleanAlignment } = await import('./videoGenerator');
  const clips: Clip[] = [];

  let cumulativeTime = 0;

  for (const dialogue of session.dialogues) {
    if (!dialogue.audioFile?.path) continue;

    // Get WhisperX clean alignment for timing
    const alignment = await getWhisperXCleanAlignment(
      dialogue.audioFile.path,
      dialogue.text
    );

    const character = dialogue.character;
    let duration: number;

    if (alignment.success && alignment.total_duration) {
      duration = alignment.total_duration;
    } else {
      // Fallback duration
      const ffmpeg = require('fluent-ffmpeg');
      duration = await new Promise<number>((resolve) => {
        ffmpeg.ffprobe(dialogue.audioFile!.path, (err: any, metadata: any) => {
          if (err) resolve(3);
          else resolve(metadata.format.duration || 3);
        });
      });
    }

    // Position character based on speaker
    const x = character === 'Stewie' ? 0.78 : character === 'Peter' ? 0.16 : 0.5;
    const y = 0.70;
    const scale = 0.60;

    clips.push({
      id: `char_${dialogue.id}`,
      kind: 'character',
      start: cumulativeTime,
      duration,
      character,
      x,
      y,
      scale,
    });

    cumulativeTime += duration;
  }

  return clips;
}
