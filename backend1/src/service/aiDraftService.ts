import fs from 'fs';
import path from 'path';
import { Timeline, Track, Clip } from '../schema/project';
import { inferDialogueEmotion } from '../utils/inferDialogueEmotion';
import { applyEmotionVarietyNudges, generateCharacterEmotionsWithAi } from './characterEmotionAi';
import { ImageEmbeddingService } from './imageEmbedder';
import { MIN_SUBTITLE_CLIP_DURATION } from './subtitleClipNormalize';

const AUDIO_STORAGE_DIR = path.join(process.cwd(), 'storage', 'audio');

type SessionConversationFile = {
  characterSet?: string;
  selectedCharacter?: string;
};

/**
 * Single-voice sessions persist the real TTS identity in conversation.json (`selectedCharacter`).
 * Prisma `dialogue.character` often stays "Narrator" even when `characterSet` / `selectedCharacter`
 * were never written — still use Peter (or selectedCharacter) for subtitles + character clips.
 */
function readSessionConversationMeta(sessionId: string): SessionConversationFile | null {
  try {
    const filePath = path.join(AUDIO_STORAGE_DIR, sessionId, 'conversation.json');
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as SessionConversationFile;
  } catch {
    return null;
  }
}

function resolveClipSpeakerLabel(sessionId: string, dialogueCharacter: string): string {
  const raw = (dialogueCharacter ?? '').trim();
  const meta = readSessionConversationMeta(sessionId);
  const selected =
    typeof meta?.selectedCharacter === 'string' && meta.selectedCharacter.trim() !== ''
      ? meta.selectedCharacter.trim()
      : null;

  if (meta?.characterSet === 'single' && selected) {
    return selected;
  }

  if (/^narrator$/i.test(raw)) {
    return selected ?? 'Peter';
  }

  return raw || dialogueCharacter;
}

/**
 * Character plan (subtitles + bottom character clips + audio lane metadata).
 * Independent from image plan — run `generateImagePlan` separately when you want overlay stills.
 */
export type SubtitlesAndCharactersResult = {
  duration: number;
  subtitleTrack: Track;
  characterTrack: Track;
  audioTrack: Track;
};

/** Image plan: overlay tracks (t_imgs / t_imgs_N) only. Does not create or modify character clips. */
export type ImagePlanResult = {
  overlayTracks: Track[];
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
  const characterClips = await generateCharacterClips(session, audioSessionId, topic);

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
 * Generate clip plan overlay clips only (AI-suggested image/video slots).
 * Use this for the "Clip Plan" action.
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

  // Assign overlapping clips to different tracks so user can remove/choose/trim in editor
  const overlayTracks = assignOverlappingClipsToTracks(overlayClips);

  return { overlayTracks };
}

/** Clips overlap if their time ranges intersect. */
function clipsOverlap(
  startA: number,
  durationA: number,
  startB: number,
  durationB: number
): boolean {
  const endA = startA + durationA;
  const endB = startB + durationB;
  return startA < endB && startB < endA;
}

/**
 * Assign overlay clips to tracks so that overlapping clips end up on different tracks.
 * First track is "Clips" (t_imgs), then "Clips 2" (t_imgs_2), etc.
 */
function assignOverlappingClipsToTracks(clips: Clip[]): Track[] {
  if (clips.length === 0) {
    return [{ id: 't_imgs', type: 'overlay', name: 'Clips', clips: [] }];
  }

  const sorted = [...clips].sort((a, b) => a.start - b.start);
  const trackClips: Clip[][] = [];

  for (const clip of sorted) {
    const start = clip.start;
    const duration = clip.duration;
    let placed = false;
    for (let t = 0; t < trackClips.length; t++) {
      const hasOverlap = trackClips[t].some(
        (c) => clipsOverlap(c.start, c.duration, start, duration)
      );
      if (!hasOverlap) {
        trackClips[t].push(clip);
        placed = true;
        break;
      }
    }
    if (!placed) {
      trackClips.push([clip]);
    }
  }

  return trackClips.map((clipsInTrack, i) => ({
    id: i === 0 ? 't_imgs' : `t_imgs_${i + 1}`,
    type: 'overlay' as const,
    name: i === 0 ? 'Clips' : `Clips ${i + 1}`,
    clips: clipsInTrack,
  }));
}

/**
 * Build a timeline that contains only subtitles, character clips, and audio — no image-plan overlays.
 * For still image moments, call `generateImagePlan` separately and merge on the server via
 * `generateImagePlanForProject` (or compose tracks yourself).
 */
export async function generateAiDraft(
  audioSessionId: string,
  topic: string
): Promise<Timeline> {
  const { duration, audioTrack, subtitleTrack, characterTrack } = await generateSubtitlesAndCharacters(
    audioSessionId,
    topic
  );
  return {
    duration,
    tracks: [audioTrack, subtitleTrack, characterTrack],
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
 * Generate subtitle clips from clean sentence alignment.
 * Keep draft clips simple/stable (backend behavior), and add karaoke words later in preview/export.
 */
async function generateSubtitleClips(session: any, _audioSessionId: string): Promise<Clip[]> {
  const { getWhisperXCleanAlignment } = await import('./videoGenerator');
  const clips: Clip[] = [];

  let cumulativeTime = 0;

  for (const dialogue of session.dialogues) {
    if (!dialogue.audioFile?.filePath) continue;

    const speaker = resolveClipSpeakerLabel(_audioSessionId, dialogue.character);

    // Use clean sentence-level alignment (same strategy as backend)
    const alignment = await getWhisperXCleanAlignment(
      dialogue.audioFile.filePath,
      dialogue.text
    );

    if (alignment.success && alignment.sentences && alignment.sentences.length > 0) {
      const dialogueDuration = await getAudioFileDuration(dialogue);
      let sentenceAcc = cumulativeTime;
      for (let i = 0; i < alignment.sentences.length; i++) {
        const sentence = alignment.sentences[i];
        const rawStart = cumulativeTime + sentence.start;
        const rawEnd = cumulativeTime + sentence.end;
        const clipStart = Math.max(rawStart, sentenceAcc);
        const clipEnd = Math.max(rawEnd, clipStart + MIN_SUBTITLE_CLIP_DURATION);
        const clipDuration = clipEnd - clipStart;

        clips.push({
          id: `sub_${dialogue.id}_${i}`,
          kind: 'subtitle',
          start: clipStart,
          duration: clipDuration,
          speaker,
          text: sentence.text,
        });
        sentenceAcc = clipStart + clipDuration;
      }
      cumulativeTime += dialogueDuration;
    } else {
      // Fallback: entire dialogue as one subtitle clip
      const ffmpeg = require('fluent-ffmpeg');
      const duration = await new Promise<number>((resolve) => {
        ffmpeg.ffprobe(dialogue.audioFile!.filePath, (err: any, metadata: any) => {
          if (err) resolve(3);
          else resolve(metadata.format?.duration || 3);
        });
      });

      clips.push({
        id: `sub_${dialogue.id}`,
        kind: 'subtitle',
        start: cumulativeTime,
        duration,
        speaker,
        text: dialogue.text,
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
async function generateCharacterClips(session: any, audioSessionId: string, topic: string): Promise<Clip[]> {
  const dialoguesWithAudio = (session.dialogues as any[]).filter((d) => d?.audioFile?.filePath);
  const emotionItems = dialoguesWithAudio.map((d) => ({
    id: String(d.id),
    text: String(d.text ?? ''),
  }));
  const aiEmotions =
    emotionItems.length > 0 ? await generateCharacterEmotionsWithAi(emotionItems, topic) : {};

  const emotionById: Record<string, string> = {};
  for (const d of dialoguesWithAudio) {
    const id = String(d.id);
    emotionById[id] = aiEmotions[id] ?? inferDialogueEmotion(String(d.text ?? ''));
  }
  applyEmotionVarietyNudges(emotionItems, emotionById);

  const clips: Clip[] = [];
  let cumulativeTime = 0;

  for (const dialogue of session.dialogues) {
    if (!dialogue.audioFile?.filePath) continue;

    const duration = await getAudioFileDuration(dialogue);
    const character = resolveClipSpeakerLabel(audioSessionId, dialogue.character);

    // Position: duo uses Stewie/Peter corners; single-voice (Narrator) uses Peter slot.
    const x =
      character === 'Stewie' ? 0.78 : character === 'Peter' || character === 'Narrator' ? 0.16 : 0.5;
    const y = 0.70;
    const scale = 0.60;

    const dialogueId = String(dialogue.id);
    const emotion: string | undefined = character ? emotionById[dialogueId] : undefined;

    clips.push({
      id: `char_${dialogue.id}`,
      kind: 'character',
      start: cumulativeTime,
      duration,
      character,
      x,
      y,
      scale,
      ...(emotion && { emotion }),
    });

    cumulativeTime += duration;
  }

  return clips;
}
