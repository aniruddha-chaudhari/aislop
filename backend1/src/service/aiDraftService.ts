import { Timeline, Track, Clip } from '../schema/project';
import { ImageEmbeddingService } from './imageEmbedder';

export type SubtitlesAndCharactersResult = {
  duration: number;
  subtitleTrack: Track;
  characterTrack: Track;
  audioTrack: Track;
};

export type ImagePlanResult = {
  overlayTrack: Track;
};

/**
 * Generate subtitles and character clips only (local WhisperX - no image plan).
 * Use this for the "Subtitles & Characters" action.
 */
export async function generateSubtitlesAndCharacters(
  audioSessionId: string,
  topic: string
): Promise<SubtitlesAndCharactersResult> {
  const session = await loadAudioSession(audioSessionId);
  if (!session) {
    throw new Error(`Audio session ${audioSessionId} not found`);
  }

  const subtitleClips = await generateSubtitleClips(session, audioSessionId);
  const characterClips = await generateCharacterClips(session, audioSessionId);

  const audioTrack: Track = {
    id: 't_audio',
    type: 'audio',
    name: 'Audio',
    clips: [{
      id: 'a1',
      kind: 'audio',
      start: 0,
      duration: session.totalDuration,
      label: `Session ${audioSessionId}`,
    }],
    locked: true,
  };

  const subtitleTrack: Track = {
    id: 't_subs',
    type: 'subtitle',
    name: 'Subtitles',
    clips: subtitleClips,
  };

  const characterTrack: Track = {
    id: 't_chars',
    type: 'character',
    name: 'Characters',
    clips: characterClips,
  };

  return {
    duration: session.totalDuration,
    audioTrack,
    subtitleTrack,
    characterTrack,
  };
}

/**
 * Generate image plan overlay clips only.
 * Use this for the "Image Plan" action.
 */
export async function generateImagePlan(
  audioSessionId: string,
  topic: string
): Promise<ImagePlanResult> {
  const session = await loadAudioSession(audioSessionId);
  if (!session) {
    throw new Error(`Audio session ${audioSessionId} not found`);
  }

  const imagePlan = await ImageEmbeddingService.generateImageEmbeddingPlanFromCleanTimestamps(
    audioSessionId,
    session.dialogues,
    topic || session.name || 'Technical conversation'
  );

  const requirements = imagePlan.imageRequirements || [];

  const overlayClips = requirements.map((req: { id?: string; timestamp?: number; contextualDuration?: number; duration?: number; title?: string; imagePath?: string }, index: number) => ({
    id: `img_${req.id ?? index}`,
    kind: 'overlay' as const,
    start: req.timestamp ?? 0,
    duration: req.contextualDuration ?? req.duration ?? 8,
    assetId: req.id ?? `img_${index}`,
    label: req.title ?? `Image ${index + 1}`,
    x: 0.5,   // Center horizontally
    y: 0.65,  // Towards bottom (matches backend video generation)
    scale: 0.5,
    ...(req.imagePath && { path: req.imagePath }),
  }));

  const overlayTrack: Track = {
    id: 't_imgs',
    type: 'overlay',
    name: 'Images',
    clips: overlayClips,
  };

  return { overlayTrack };
}

/**
 * @deprecated Use generateSubtitlesAndCharacters + generateImagePlan separately
 * Generate full AI draft (backward compatibility)
 */
export async function generateAiDraft(
  audioSessionId: string,
  topic: string
): Promise<Timeline> {
  const { duration, audioTrack, subtitleTrack, characterTrack } = await generateSubtitlesAndCharacters(audioSessionId, topic);
  let overlayTrack: Track = { id: 't_imgs', type: 'overlay', name: 'Images', clips: [] };
  try {
    const plan = await generateImagePlan(audioSessionId, topic);
    overlayTrack = plan.overlayTrack;
  } catch (_e) {}
  return {
    duration,
    tracks: [audioTrack, subtitleTrack, overlayTrack, characterTrack],
  };
}

/**
 * Load audio session from database
 */
async function loadAudioSession(sessionId: string) {
  const { PrismaClient } = await import('../generated/prisma');
  const prisma = new PrismaClient();

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
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
    } else {
      // Fallback: Calculate total duration from audio files
      const fs = require('fs');
      const ffmpeg = require('fluent-ffmpeg');

      for (const dialogue of session.dialogues) {
        if (dialogue.audioFile?.filePath && fs.existsSync(dialogue.audioFile.filePath)) {
          const duration = await new Promise<number>((resolve) => {
            ffmpeg.ffprobe(dialogue.audioFile!.filePath, (err: any, metadata: any) => {
              if (err) resolve(3); // Fallback duration
              else resolve(metadata.format.duration || 3);
            });
          });
          totalDuration += duration;
        }
      }
    }

    return {
      sessionId: session.id,
      name: session.name || '',
      dialogues: session.dialogues,
      totalDuration,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get actual audio file duration (must match concatenated audio used in export/preview)
 */
async function getAudioFileDuration(dialogue: { audioFile?: { filePath: string; duration?: number } | null }): Promise<number> {
  if (!dialogue.audioFile?.filePath) return 3;
  if (typeof dialogue.audioFile.duration === 'number' && dialogue.audioFile.duration > 0) {
    return dialogue.audioFile.duration;
  }
  const ffmpeg = require('fluent-ffmpeg');
  return new Promise<number>((resolve) => {
    ffmpeg.ffprobe(dialogue.audioFile!.filePath, (err: any, metadata: any) => {
      if (err) resolve(3);
      else resolve(metadata.format?.duration || 3);
    });
  });
}

/**
 * Generate subtitle clips with WhisperX timings (word-level for karaoke)
 */
async function generateSubtitleClips(session: any, _audioSessionId: string): Promise<Clip[]> {
  const { getWhisperXAlignment, getWhisperXCleanAlignment } = await import('./videoGenerator');
  const clips: Clip[] = [];

  let cumulativeTime = 0;

  for (const dialogue of session.dialogues) {
    if (!dialogue.audioFile?.filePath) continue;

    // Get word-level timestamps for karaoke effect
    const words = await getWhisperXAlignment(
      dialogue.audioFile.filePath,
      dialogue.text
    );

    // Get sentence-level for grouping (fallback to clean alignment)
    const alignment = await getWhisperXCleanAlignment(
      dialogue.audioFile.filePath,
      dialogue.text
    );

    if (alignment.success && alignment.sentences && alignment.sentences.length > 0) {
      const dialogueDuration = await getAudioFileDuration(dialogue);
      for (let i = 0; i < alignment.sentences.length; i++) {
        const sentence = alignment.sentences[i];
        const clipStart = cumulativeTime + sentence.start;
        const clipDuration = sentence.end - sentence.start;

        // Extract words that fall within this sentence (relative to dialogue start)
        const sentenceWords = (words || []).filter(
          (w) => w.end > sentence.start && w.start < sentence.end
        ).map((w) => ({
          word: w.word,
          start: w.start - sentence.start,
          end: w.end - sentence.start,
        }));

        clips.push({
          id: `sub_${dialogue.id}_${i}`,
          kind: 'subtitle',
          start: clipStart,
          duration: clipDuration,
          speaker: dialogue.character,
          text: sentence.text,
          ...(sentenceWords.length > 0 && { words: sentenceWords }),
        });
      }
      cumulativeTime += dialogueDuration;
    } else {
      // Fallback: entire dialogue as one clip, with words if available
      const ffmpeg = require('fluent-ffmpeg');
      const duration = await new Promise<number>((resolve) => {
        ffmpeg.ffprobe(dialogue.audioFile!.filePath, (err: any, metadata: any) => {
          if (err) resolve(3);
          else resolve(metadata.format?.duration || 3);
        });
      });

      const sentenceWords = (words || []).map((w) => ({ word: w.word, start: w.start, end: w.end }));

      clips.push({
        id: `sub_${dialogue.id}`,
        kind: 'subtitle',
        start: cumulativeTime,
        duration,
        speaker: dialogue.character,
        text: dialogue.text,
        ...(sentenceWords.length > 0 && { words: sentenceWords }),
      });
      cumulativeTime += duration;
    }
  }

  return clips;
}

/**
 * Generate character clips based on speakers
 * Uses actual audio file duration (not WhisperX) so clips align with concatenated audio
 */
async function generateCharacterClips(session: any, _audioSessionId: string): Promise<Clip[]> {
  const clips: Clip[] = [];
  let cumulativeTime = 0;

  for (const dialogue of session.dialogues) {
    if (!dialogue.audioFile?.filePath) continue;

    const duration = await getAudioFileDuration(dialogue);
    const character = dialogue.character;

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
