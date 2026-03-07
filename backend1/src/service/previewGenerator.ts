import * as fs from 'fs';
import * as path from 'path';
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
import { PrismaClient } from '../generated/prisma';
import type { Project, SubtitleClip, OverlayClip, CharacterClip, MusicClip, SfxClip } from '../schema/project';
import { getCharacterImagePath } from '../utils/characterImages';
import { computeOverlayPlacement } from './overlayTransform';

const prisma = new PrismaClient();
const TEMP_DIR = path.join(process.cwd(), 'storage', 'temp');
const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'images');

// Set ffmpeg path
const customFfmpegPath = process.env.CUSTOM_FFMPEG_PATH;
const ffmpegPath = customFfmpegPath || ffmpegInstaller.path;
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Preview configuration - scaled 1/3 from 1080x1920 (matches timelineCompiler full export)
const PREVIEW_DIR = path.join(process.cwd(), 'storage', 'previews');
const HLS_ROOT_DIR = path.join(PREVIEW_DIR, 'hls');
const PREVIEW_WIDTH = 360;
const PREVIEW_HEIGHT = 640;
const SCALE = PREVIEW_HEIGHT / 1920; // Same proportion as timelineCompiler 1080x1920
const PREVIEW_BITRATE = '500k'; // Low bitrate for fast generation

// Overlay base size (legacy default scale=0.5) and legacy top offset.
const OVERLAY_BASE_W = Math.floor(960 * (PREVIEW_WIDTH / 1080)); // 320 at 360px width
const OVERLAY_BASE_H = Math.floor(720 * (PREVIEW_HEIGHT / 1920)); // 240 at 640px height
const OVERLAY_LEGACY_TOP_Y = Math.floor(40 * (PREVIEW_HEIGHT / 1920)); // 13 at 640px height (~40px at 1920)

function isImageOverlayTrackId(trackId: string): boolean {
  return trackId === 't_imgs' || /^t_imgs_\d+$/.test(trackId);
}

function isAnimationOverlayTrackId(trackId: string): boolean {
  return trackId === 't_anim' || /^t_anim_\d+$/.test(trackId);
}

function isPlanOverlayTrack(track: { type?: string; id?: string }): boolean {
  if (track.type !== 'overlay') return false;
  if (!track.id || track.id === 't_overlay_template') return false;
  return isImageOverlayTrackId(track.id) || isAnimationOverlayTrackId(track.id);
}

function resolveOverlayAssetPath(clip: OverlayClip, audioSessionId: string): string {
  return clip.path ?? path.join(IMAGE_UPLOAD_DIR, audioSessionId, `${clip.assetId}.png`);
}

function isStillImageAsset(filePath: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(filePath);
}

/**
 * Add an overlay as an input. For still images: loop for full timeline.
 * For video (e.g. animation moment): trim to clip.duration only so overlay plays 0→duration in order;
 * the filter chain must apply setpts=PTS+clip.start/TB so it lines up with timeline.
 */
function addOverlayInput(
  command: any,
  overlayPath: string,
  clip: OverlayClip,
  timelineDurationSeconds: number
): void {
  if (isStillImageAsset(overlayPath)) {
    command.input(overlayPath).inputOptions(['-loop', '1', '-t', timelineDurationSeconds.toString()]);
    return;
  }
  // Video overlay: input only clip.duration seconds from the start (no loop) so the overlay
  // plays straight 0→duration. Filter will use setpts to align with clip.start on the timeline.
  const clipDur = Math.max(0.05, clip.duration);
  command.input(overlayPath).inputOptions(['-t', clipDur.toString()]);
}

type TimeRange = { start: number; end: number };

function isReplaceOverlayClip(clip: OverlayClip): boolean {
  return clip.displayMode === 'replace';
}

function buildReplaceOverlayRanges(clips: OverlayClip[]): TimeRange[] {
  return clips
    .filter(isReplaceOverlayClip)
    .map((clip) => ({ start: clip.start, end: clip.start + clip.duration }));
}

function excludeSubtitlesInRanges(subtitleClips: SubtitleClip[], excludedRanges: TimeRange[]): SubtitleClip[] {
  if (excludedRanges.length === 0) return subtitleClips;
  return subtitleClips.filter((clip) => {
    const clipStart = clip.start;
    const clipEnd = clip.start + clip.duration;
    return !excludedRanges.some((range) => clipStart < range.end && range.start < clipEnd);
  });
}

// Ensure preview directory exists
if (!fs.existsSync(PREVIEW_DIR)) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}
if (!fs.existsSync(HLS_ROOT_DIR)) {
  fs.mkdirSync(HLS_ROOT_DIR, { recursive: true });
}

/**
 * Generate a low-res preview video from template + audio session
 * Uses FFmpeg to composite template video with audio session files
 * Returns path to generated preview video
 */
export async function generatePreview(
  projectId: string,
  templatePath: string,
  audioSessionId: string,
  onProgress?: (percent: number, message: string) => void
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  try {
    // Load audio session to get dialogue files
    const session = await prisma.session.findUnique({
      where: { id: audioSessionId },
      include: {
        dialogues: {
          include: { audioFile: true },
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!session) {
      return { success: false, error: `Audio session ${audioSessionId} not found` };
    }

    // Get all successful audio files
    const audioFiles = session.dialogues
      .filter(d => d.audioFile && d.audioFile.success)
      .map(d => d.audioFile!.filePath);

    if (audioFiles.length === 0) {
      return { success: false, error: 'No audio files in session' };
    }

    // Calculate total duration from audio files
    const totalDuration = session.totalDuration || 60; // Fallback to 60s

    const outputPath = path.join(PREVIEW_DIR, `preview_${projectId}.mp4`);

    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    onProgress?.(10, 'Concatenating audio files...');

    const audioListPath = path.join(TEMP_DIR, `preview_audio_list_${projectId}.txt`);
    const audioListContent = audioFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(audioListPath, audioListContent);

    const concatenatedAudioPath = path.join(TEMP_DIR, `preview_audio_${projectId}.wav`);
    await new Promise<void>((resolve, reject) => {
      const concatCmd = ffmpeg()
        .input(audioListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'pcm_s16le'])
        .output(concatenatedAudioPath);
      concatCmd.on('start', () => {});
      concatCmd.on('stderr', () => {});
      concatCmd.on('end', () => resolve());
      concatCmd.on('error', (err: Error) => reject(err));
      concatCmd.run();
    });

    onProgress?.(40, 'Processing template video...');

    // Check if template is image or video
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(templatePath);

    // Build FFmpeg command
    const command = ffmpeg();

    if (isImage) {
      // If template is an image, loop it for the duration
      command
        .input(templatePath)
        .inputOptions(['-loop', '1', '-t', totalDuration.toString()]);
    } else {
      // If template is a video, loop it to match audio duration
      command
        .input(templatePath)
        .inputOptions(['-stream_loop', '-1', '-t', totalDuration.toString()]);
    }

    // Add concatenated audio
    command.input(concatenatedAudioPath);

    onProgress?.(60, 'Encoding preview...');

    // Output options: low-res, fast encode
    // CRITICAL: -map 0:v uses template VIDEO, -map 1:a uses DIALOGUE audio (not template audio!)
    // Use GPU encoding (h264_nvenc) when available for faster preview generation.
    command
      .outputOptions([
        '-map', '0:v', // Video from template (input 0)
        '-map', '1:a', // Audio from concatenated dialogue (input 1), NOT template
        '-c:v', 'h264_nvenc',
        // NVENC bitrate-based configuration tuned for low-res preview
        '-b:v', PREVIEW_BITRATE,
        '-maxrate', '750k',
        '-bufsize', '1500k',
        '-preset', 'p4', // Balanced quality/speed preset
        '-vf', `scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=increase,crop=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}`,
        '-c:a', 'aac',
        '-b:a', '64k', // Low audio bitrate
        '-ac', '2',
        '-ar', '22050', // Lower sample rate
        '-shortest', // End when shortest input ends
        '-y' // Overwrite
      ]);
    command.output(outputPath);

    // Track progress
    command.on('progress', (progress: any) => {
      if (progress.percent) {
        const percent = Math.min(95, 60 + (progress.percent / 100) * 35);
        onProgress?.(percent, `Encoding: ${Math.round(progress.percent)}%`);
      }
    });

    command.on('start', () => {});
    command.on('stderr', () => {});
    await new Promise<void>((resolve, reject) => {
      command
        .on('end', () => {
          try {
            fs.unlinkSync(audioListPath);
            fs.unlinkSync(concatenatedAudioPath);
          } catch (_) {}
          resolve();
        })
        .on('error', (err: Error) => reject(err))
        .run();
    });

    onProgress?.(100, 'Preview ready!');

    return { success: true, outputPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

function formatAssTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centisecs = Math.floor((seconds % 1) * 100);
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
}

/**
 * Enrich subtitle clips with word-level timestamps (for karaoke) when missing.
 * Fetches WhisperX alignment per dialogue, matching backend videoGenerator behavior.
 * Exported for use by timelineCompiler export.
 */
export async function enrichSubtitleClipsWithWords(
  session: { dialogues: Array<{ id: string; text: string; character?: string; audioFile?: { filePath: string } | null }> },
  subtitleClips: SubtitleClip[]
): Promise<SubtitleClip[]> {
  const { getWhisperXAlignment, getWhisperXCleanAlignment } = await import('./videoGenerator');
  const enriched = subtitleClips.map((c) => ({ ...c, words: c.words ? [...c.words] : undefined }));
  let clipIdx = 0;

  for (const dialogue of session.dialogues) {
    if (!dialogue.audioFile?.filePath || clipIdx >= enriched.length) continue;

    try {
      const [words, alignment] = await Promise.all([
        getWhisperXAlignment(dialogue.audioFile.filePath, dialogue.text),
        getWhisperXCleanAlignment(dialogue.audioFile.filePath, dialogue.text),
      ]);

      if (alignment.success && alignment.sentences && alignment.sentences.length > 0) {
        for (let i = 0; i < alignment.sentences.length && clipIdx < enriched.length; i++) {
          const clip = enriched[clipIdx];
          if (clip.kind !== 'subtitle') {
            clipIdx++;
            i--;
            continue;
          }
          if (!clip.words || clip.words.length === 0) {
            const sentence = alignment.sentences[i];
            const sentenceWords = (words || []).filter(
              (w) => w.end > sentence.start && w.start < sentence.end
            ).map((w) => ({
              word: w.word,
              start: w.start - sentence.start,
              end: w.end - sentence.start,
            }));
            if (sentenceWords.length > 0) clip.words = sentenceWords;
          }
          clipIdx++;
        }
      } else if (words && words.length > 0 && clipIdx < enriched.length) {
        const clip = enriched[clipIdx];
        if (clip.kind === 'subtitle' && (!clip.words || clip.words.length === 0)) {
          clip.words = words.map((w) => ({ word: w.word, start: w.start, end: w.end }));
        }
        clipIdx++;
      }
    } catch (_) {
      clipIdx++;
    }
  }
  return enriched;
}

function generateAssFromTimeline(projectId: string, subtitleClips: SubtitleClip[]): string {
  const outputPath = path.join(TEMP_DIR, `preview_${projectId}_subs.ass`);
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  let assContent = `[Script Info]
Title: Mobile-Optimized Dialogue with 3-Word Rolling Display
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 360
PlayResY: 640

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Normal,Arial-Black,32,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,2,30,30,100,1
Style: Highlight,Arial-Black,32,&H0000FFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,2,30,30,100,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const clip of subtitleClips.sort((a, b) => a.start - b.start)) {
    const { words } = clip;
    const speaker = clip.speaker || (clip as { character?: string }).character || 'Speaker';

    if (words && words.length > 0) {
      for (let i = 0; i < words.length; i += 3) {
        let wordGroup = words.slice(i, Math.min(i + 3, words.length));
        const fullText = wordGroup.map(w => (w as { word: string }).word || w).join(' ');
        const isTooLong = fullText.length > 25;

        if (isTooLong && wordGroup.length > 2) {
          const firstTwoWords = wordGroup.slice(0, 2);
          const thirdWord = wordGroup[2];

          firstTwoWords.forEach((word, groupIndex) => {
            const wordStart = clip.start + (word as { start: number }).start;
            const wordEnd = groupIndex === firstTwoWords.length - 1
              ? clip.start + (thirdWord as { start: number }).start
              : clip.start + (firstTwoWords[groupIndex + 1] as { start: number }).start;

            let subtitleText = '';
            firstTwoWords.forEach((groupWord, wordIdx) => {
              const wordText = (groupWord as { word: string }).word || groupWord;
              if (wordIdx === groupIndex) {
                subtitleText += `{\\c&H0000FFFF&}${wordText}{\\c&H00FFFFFF&}`;
              } else {
                subtitleText += wordText;
              }
              if (wordIdx < firstTwoWords.length - 1) subtitleText += ' ';
            });
            subtitleText += `\\N${(thirdWord as { word: string }).word || thirdWord}`;

            assContent += `Dialogue: 0,${formatAssTime(wordStart)},${formatAssTime(wordEnd)},Normal,${speaker},0,0,0,,${subtitleText}\n`;
          });

          const thirdWordStart = clip.start + (thirdWord as { start: number }).start;
          const thirdWordEnd = i + 2 === words.length - 1
            ? clip.start + (thirdWord as { end: number }).end
            : words[i + 3] ? clip.start + (words[i + 3] as { start: number }).start
            : clip.start + (thirdWord as { end: number }).end;

          let subtitleText = '';
          firstTwoWords.forEach((groupWord, wordIdx) => {
            const wordText = (groupWord as { word: string }).word || groupWord;
            subtitleText += wordText;
            if (wordIdx < firstTwoWords.length - 1) subtitleText += ' ';
          });
          subtitleText += `\\N{\\c&H0000FFFF&}${(thirdWord as { word: string }).word || thirdWord}{\\c&H00FFFFFF&}`;

          assContent += `Dialogue: 0,${formatAssTime(thirdWordStart)},${formatAssTime(thirdWordEnd)},Normal,${speaker},0,0,0,,${subtitleText}\n`;

          continue;
        }

        wordGroup.forEach((word, groupIndex) => {
          const wordStart = clip.start + (word as { start: number }).start;
          const wordEnd = groupIndex === wordGroup.length - 1
            ? (i + groupIndex === words.length - 1 ? clip.start + (word as { end: number }).end : words[i + groupIndex + 1] ? clip.start + (words[i + groupIndex + 1] as { start: number }).start : clip.start + (word as { end: number }).end)
            : clip.start + (wordGroup[groupIndex + 1] as { start: number }).start;

          let subtitleText = '';
          wordGroup.forEach((groupWord, wordIdx) => {
            const wordText = (groupWord as { word: string }).word || groupWord;
            if (wordIdx === groupIndex) {
              subtitleText += `{\\c&H0000FFFF&}${wordText}{\\c&H00FFFFFF&}`;
            } else {
              subtitleText += wordText;
            }
            if (wordIdx < wordGroup.length - 1) subtitleText += ' ';
          });

          assContent += `Dialogue: 0,${formatAssTime(wordStart)},${formatAssTime(wordEnd)},Normal,${speaker},0,0,0,,${subtitleText}\n`;
        });
      }
    }
  }

  fs.writeFileSync(outputPath, assContent, 'utf8');
  return outputPath;
}

function resolveTemplatePath(templatePath: string): string {
  if (path.isAbsolute(templatePath) && fs.existsSync(templatePath)) return templatePath;
  if (fs.existsSync(templatePath)) return templatePath;
  const templatesDir = path.join(process.cwd(), 'storage', 'video_templates');
  const alt = path.join(templatesDir, path.basename(templatePath));
  if (fs.existsSync(alt)) return alt;
  const inCwd = path.join(process.cwd(), templatePath);
  return fs.existsSync(inCwd) ? inCwd : templatePath;
}

function resolveAudioClipPath(clipPath: string): string | null {
  if (!clipPath) return null;
  if (/^https?:\/\//i.test(clipPath)) return clipPath;
  const normalized = clipPath.replace(/\\/g, '/');
  if (fs.existsSync(clipPath)) return clipPath;
  const inCwd = path.join(process.cwd(), clipPath);
  if (fs.existsSync(inCwd)) return inCwd;
  // If clipPath already starts with audio_assets/, resolve from storage/
  if (normalized.startsWith('audio_assets/')) {
    const inStorage = path.join(process.cwd(), 'storage', normalized);
    if (fs.existsSync(inStorage)) return inStorage;
  }
  if (normalized.startsWith('storage/audio_assets/')) {
    const inStorage = path.join(process.cwd(), normalized);
    if (fs.existsSync(inStorage)) return inStorage;
  }
  const inAudioAssets = path.join(process.cwd(), 'storage', 'audio_assets', clipPath);
  if (fs.existsSync(inAudioAssets)) return inAudioAssets;
  return null;
}

type AudioInputRef = { clip: MusicClip | SfxClip; inputIndex: number; kind: 'music' | 'sfx' };

function buildAudioMixFilter(
  dialogueInputIndex: number | null,
  musicInputs: AudioInputRef[],
  sfxInputs: AudioInputRef[]
): { filter: string | null; outputLabel: string | null } {
  const filters: string[] = [];
  const labels: string[] = [];

  if (dialogueInputIndex !== null) {
    filters.push(
      `[${dialogueInputIndex}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a_dialogue]`
    );
    labels.push('[a_dialogue]');
  }

  const addClip = (clip: MusicClip | SfxClip, inputIndex: number, prefix: string, index: number) => {
    const label = `${prefix}_${index}`;
    const duration = typeof clip.duration === 'number' && clip.duration > 0 ? clip.duration : null;
    const volume = typeof clip.volume === 'number' && Number.isFinite(clip.volume) ? Math.max(0, clip.volume) : 1;
    const delayMs = Math.max(0, Math.round((clip.start || 0) * 1000));

    const chain: string[] = [];
    if (duration) chain.push(`atrim=0:${duration}`);
    chain.push('asetpts=PTS-STARTPTS');
    if (volume !== 1) chain.push(`volume=${volume}`);
    if (delayMs > 0) chain.push(`adelay=${delayMs}|${delayMs}`);
    chain.push('aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo');

    filters.push(`[${inputIndex}:a]${chain.join(',')}[${label}]`);
    labels.push(`[${label}]`);
  };

  musicInputs.forEach((input, i) => addClip(input.clip, input.inputIndex, 'a_music', i));
  sfxInputs.forEach((input, i) => addClip(input.clip, input.inputIndex, 'a_sfx', i));

  if (labels.length === 0) return { filter: null, outputLabel: null };
  if (labels.length === 1) return { filter: filters.join(';'), outputLabel: labels[0] };

  filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=longest:dropout_transition=0[a_mix]`);
  return { filter: filters.join(';'), outputLabel: '[a_mix]' };
}

function sliceAudioClipsToWindow<T extends { start: number; duration?: number }>(
  clips: T[],
  segmentStart: number,
  segmentEnd: number
): T[] {
  const result: T[] = [];
  for (const clip of clips) {
    const clipDuration = typeof clip.duration === 'number' && clip.duration > 0 ? clip.duration : null;
    const clipEnd = clipDuration ? clip.start + clipDuration : clip.start;
    const overlaps = clipDuration
      ? clipEnd > segmentStart && clip.start < segmentEnd
      : clip.start < segmentEnd;
    if (!overlaps) continue;

    const localStart = Math.max(0, clip.start - segmentStart);
    const remaining = Math.max(0.05, segmentEnd - Math.max(clip.start, segmentStart));
    const localDuration = clipDuration ? Math.max(0.05, Math.min(clipDuration, remaining)) : remaining;

    result.push({
      ...clip,
      start: localStart,
      duration: localDuration,
    });
  }
  return result;
}

/**
 * Generate timeline-aware preview with subtitles, overlay images, and character images
 */
export async function generateTimelinePreview(
  project: Project,
  onProgress?: (percent: number, message: string) => void
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const { id: projectId, template, audioSessionId, timeline } = project;

  try {
    const session = await prisma.session.findUnique({
      where: { id: audioSessionId },
      include: {
        dialogues: {
          include: { audioFile: true },
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!session) {
      return { success: false, error: `Audio session ${audioSessionId} not found` };
    }

    const audioFiles = session.dialogues
      .filter((d: any) => d.audioFile && d.audioFile.success)
      .map((d: any) => d.audioFile!.filePath);

    if (audioFiles.length === 0) {
      return { success: false, error: 'No audio files in session' };
    }

    const duration = timeline?.duration || session.totalDuration || 60;
    const templatePath = resolveTemplatePath(template.path);

    if (!fs.existsSync(templatePath)) {
      return { success: false, error: `Template not found: ${templatePath}` };
    }

    const outputPath = path.join(PREVIEW_DIR, `preview_${projectId}.mp4`);

    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    onProgress?.(10, 'Concatenating audio...');
    const audioListPath = path.join(TEMP_DIR, `preview_audio_list_${projectId}.txt`);
    const audioListContent = audioFiles.map((f: string) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(audioListPath, audioListContent);

    const concatenatedAudioPath = path.join(TEMP_DIR, `preview_audio_${projectId}.wav`);
    await new Promise<void>((resolve, reject) => {
      const concatCmd = ffmpeg()
        .input(audioListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'pcm_s16le'])
        .output(concatenatedAudioPath);
      concatCmd.on('start', () => {});
      concatCmd.on('stderr', () => {});
      concatCmd.on('end', () => resolve());
      concatCmd.on('error', (err: Error) => reject(err));
      concatCmd.run();
    });

    const planOverlayTracks = (timeline?.tracks ?? []).filter((t: any) => isPlanOverlayTrack(t));
    const characterTrack = timeline?.tracks?.find((t: any) => t.type === 'character');
    const musicTracks = (timeline?.tracks ?? []).filter((t: any) => t.type === 'music');
    const sfxTracks = (timeline?.tracks ?? []).filter((t: any) => t.type === 'sfx');
    const subtitleTrack = timeline?.tracks?.find((t: any) => t.type === 'subtitle');

    const overlayClips = planOverlayTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'overlay') || [])) as OverlayClip[];
    const characterClips = (characterTrack?.clips?.filter((c: any) => c.kind === 'character') || []) as CharacterClip[];
    let subtitleClips = (subtitleTrack?.clips?.filter((c: any) => c.kind === 'subtitle') || []) as SubtitleClip[];
    const musicClips = musicTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'music') || [])) as MusicClip[];
    const sfxClips = sfxTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'sfx') || [])) as SfxClip[];

    subtitleClips = excludeSubtitlesInRanges(subtitleClips, buildReplaceOverlayRanges(overlayClips));
    onProgress?.(15, 'Fetching word timings for karaoke...');
    if (subtitleClips.length > 0) {
      subtitleClips = await enrichSubtitleClipsWithWords(session, subtitleClips);
    }

    let assPath: string | null = null;
    if (subtitleClips.length > 0) {
      assPath = generateAssFromTimeline(projectId, subtitleClips);
    }

    const command = ffmpeg();
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(templatePath);
    const videoStart = Math.max(0, (template as { videoStart?: number }).videoStart ?? 0);

    if (isImage) {
      command.input(templatePath).inputOptions(['-loop', '1', '-t', duration.toString()]);
    } else {
      const opts = videoStart > 0 ? ['-ss', videoStart.toString(), '-stream_loop', '-1'] : ['-stream_loop', '-1'];
      command.input(templatePath).inputOptions(opts);
    }
    command.input(concatenatedAudioPath).inputOptions(['-t', duration.toString()]);

    let nextInputIndex = 2;
    const musicInputs: AudioInputRef[] = [];
    for (const clip of musicClips) {
      const resolved = resolveAudioClipPath(clip.path);
      console.log('[Preview] music clip', {
        path: clip.path,
        resolved,
        start: clip.start,
        duration: clip.duration,
        volume: (clip as any).volume,
      });
      if (!resolved) continue;
      command.input(resolved);
      musicInputs.push({ clip, inputIndex: nextInputIndex++, kind: 'music' });
    }

    const sfxInputs: AudioInputRef[] = [];
    for (const clip of sfxClips) {
      const resolved = resolveAudioClipPath(clip.path);
      console.log('[Preview] sfx clip', {
        path: clip.path,
        resolved,
        start: clip.start,
        duration: clip.duration,
        volume: (clip as any).volume,
      });
      if (!resolved) continue;
      command.input(resolved);
      sfxInputs.push({ clip, inputIndex: nextInputIndex++, kind: 'sfx' });
    }

    const overlayInputs: { clip: OverlayClip; inputIndex: number; overlayPath: string }[] = [];
    overlayClips.forEach((clip: OverlayClip) => {
      const overlayPath = resolveOverlayAssetPath(clip, audioSessionId);
      if (fs.existsSync(overlayPath)) {
        addOverlayInput(command, overlayPath, clip, duration);
        overlayInputs.push({ clip, inputIndex: nextInputIndex++, overlayPath });
      }
    });

    let nextIdx = nextInputIndex;
    const charInputs: { clip: CharacterClip; inputIndex: number }[] = [];
    for (const clip of characterClips) {
      const charPath = getCharacterImagePath(clip.character);
      if (charPath) {
        command.input(charPath);
        charInputs.push({ clip, inputIndex: nextIdx++ });
      }
    }

    let filterComplex = '';
    let lastLabel = '0:v';

    // Match backend videoGenerator: Stewie=300:1350 (lower), Peter=300:1250 (higher)
    const stewieX = Math.floor(300 * SCALE);
    const stewieY = Math.floor(1350 * SCALE);
    const peterX = Math.floor(300 * SCALE);
    const peterY = Math.floor(1250 * SCALE);
    const fontSize = Math.floor(48 * SCALE);
    const marginV = Math.floor(700 * SCALE);

    filterComplex = `[0:v]scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=increase,crop=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT},format=yuv420p[bg]`;
    lastLabel = 'bg';

    if (assPath && fs.existsSync(assPath)) {
      const assPathFixed = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const forceStyle = `Fontname=Arial-Black,FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,Bold=1,BorderStyle=1,Outline=3,Shadow=2,Alignment=2,MarginV=${marginV}`;
      filterComplex += `;[${lastLabel}]subtitles='${assPathFixed}':force_style='${forceStyle}'[with_subs]`;
      lastLabel = 'with_subs';
    }

    overlayInputs.forEach(({ clip, inputIndex, overlayPath }, index) => {
      const isReplace = isReplaceOverlayClip(clip);
      const isVideoOverlay = !isStillImageAsset(overlayPath);
      const setpts = isVideoOverlay ? `setpts=PTS+${clip.start}/TB,` : '';
      const scaledLabel = isReplace ? `ov_replace_${index}` : `ov${index}`;
      const overlayLabel = isReplace ? `vr${index}` : `vo${index}`;
      if (isReplace) {
        // Preserve full frame and fit inside vertical canvas for replace mode previews.
        filterComplex += `;[${inputIndex}:v]${setpts}scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2:0x101014[${scaledLabel}]`;
        filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})'[${overlayLabel}]`;
        lastLabel = overlayLabel;
        return;
      }

      const placement = computeOverlayPlacement(
        clip,
        PREVIEW_WIDTH,
        PREVIEW_HEIGHT,
        OVERLAY_BASE_W,
        OVERLAY_BASE_H,
        OVERLAY_LEGACY_TOP_Y
      );
      filterComplex += `;[${inputIndex}:v]${setpts}scale=${placement.width}:${placement.height}:force_original_aspect_ratio=decrease[${scaledLabel}]`;
      filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=${placement.x}:${placement.y}:enable='between(t,${clip.start},${clip.start + clip.duration})'[${overlayLabel}]`;
      lastLabel = overlayLabel;
    });

    if (charInputs.length > 0) {
      const stewieClips = charInputs.filter(c => c.clip.character === 'Stewie');
      const peterClips = charInputs.filter(c => c.clip.character === 'Peter');
      const otherClips = charInputs.filter(c => c.clip.character !== 'Stewie' && c.clip.character !== 'Peter');

      const stewieRanges: string[] = [];
      const peterRanges: string[] = [];
      const otherRanges: string[] = [];
      stewieClips.forEach(({ clip }) => {
        stewieRanges.push(`between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})`);
      });
      peterClips.forEach(({ clip }) => {
        peterRanges.push(`between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})`);
      });
      otherClips.forEach(({ clip }) => {
        otherRanges.push(`between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})`);
      });

      const stewieEnable = stewieRanges.length > 0 ? stewieRanges.join('+') : '0';
      const peterEnable = peterRanges.length > 0 ? peterRanges.join('+') : '0';
      const otherEnable = otherRanges.length > 0 ? otherRanges.join('+') : '0';

      const stewieScaleW = Math.floor(500 * SCALE);
      const stewieScaleH = Math.floor(600 * SCALE);
      const peterScaleW = Math.floor(580 * SCALE);
      const peterScaleH = Math.floor(720 * SCALE);
      const otherScaleW = Math.floor(560 * SCALE);
      const otherScaleH = Math.floor(760 * SCALE);
      const stewieInputIndex = stewieClips[0]?.inputIndex;
      const peterInputIndex = peterClips[0]?.inputIndex;
      const otherInputIndex = otherClips[0]?.inputIndex;
      const otherX = Math.floor(260 * SCALE);
      const otherY = Math.floor(1160 * SCALE);

      if (stewieInputIndex !== undefined) {
        filterComplex += `;[${stewieInputIndex}:v]scale=${stewieScaleW}:${stewieScaleH}:force_original_aspect_ratio=decrease[stewie_scaled]`;
        filterComplex += `;[${lastLabel}][stewie_scaled]overlay=${stewieX}:${stewieY}:enable='${stewieEnable}'[stewie_overlay]`;
        lastLabel = 'stewie_overlay';
      }

      if (peterInputIndex !== undefined) {
        filterComplex += `;[${peterInputIndex}:v]scale=${peterScaleW}:${peterScaleH}:force_original_aspect_ratio=decrease[peter_scaled]`;
        filterComplex += `;[${lastLabel}][peter_scaled]overlay=${peterX}:${peterY}:enable='${peterEnable}'[with_characters]`;
        lastLabel = 'with_characters';
      }

      if (otherInputIndex !== undefined) {
        filterComplex += `;[${otherInputIndex}:v]scale=${otherScaleW}:${otherScaleH}:force_original_aspect_ratio=decrease[other_scaled]`;
        filterComplex += `;[${lastLabel}][other_scaled]overlay=${otherX}:${otherY}:enable='${otherEnable}'[with_other_characters]`;
        lastLabel = 'with_other_characters';
      }
    }

    onProgress?.(50, 'Encoding preview...');

    filterComplex += `;[${lastLabel}]format=yuv420p,setsar=1[out]`;
    const needsAudioMixing = musicInputs.length > 0 || sfxInputs.length > 0;
    console.log('[Preview] audio mix', {
      musicInputs: musicInputs.length,
      sfxInputs: sfxInputs.length,
      needsAudioMixing,
    });
    const audioMix = needsAudioMixing
      ? buildAudioMixFilter(1, musicInputs, sfxInputs)
      : { filter: null, outputLabel: null };
    if (audioMix.filter) {
      filterComplex += `;${audioMix.filter}`;
    }

    // FFmpeg debug logs
    const allInputs = [
      { index: 0, type: 'Template', path: templatePath },
      { index: 1, type: 'Audio', path: concatenatedAudioPath },
      ...musicInputs.map(({ clip, inputIndex }) => ({
        index: inputIndex,
        type: 'Music',
        path: clip.path
      })),
      ...sfxInputs.map(({ clip, inputIndex }) => ({
        index: inputIndex,
        type: 'SFX',
        path: clip.path
      })),
      ...overlayInputs.map(({ clip, inputIndex }) => ({
        index: inputIndex,
        type: 'Overlay',
        path: resolveOverlayAssetPath(clip, audioSessionId)
      })),
      ...charInputs.map(({ clip, inputIndex }) => ({
        index: inputIndex,
        type: 'Character',
        path: getCharacterImagePath(clip.character)
      }))
    ];

    const timeout = setTimeout(() => {}, 60000);

    command.on('start', () => {});
    command.on('stderr', () => {});

    command
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[out]',  // Map filter output for video
        '-map', audioMix.outputLabel ?? '1:a',    // Map audio from concatenated input
        '-t', duration.toString(),
        // Use GPU encoding (h264_nvenc) for timeline-aware preview as well.
        '-c:v', 'h264_nvenc',
        '-b:v', PREVIEW_BITRATE,
        '-maxrate', '750k',
        '-bufsize', '1500k',
        '-preset', 'p4',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-ac', '2',
        '-ar', '22050',
        '-y'
      ]);
    command.output(outputPath);

    command.on('progress', (p: any) => {
      if (p.percent) onProgress?.(Math.min(95, 50 + (p.percent / 100) * 45), `Encoding: ${Math.round(p.percent)}%`);
    });

    await new Promise<void>((resolve, reject) => {
      command
        .on('end', () => {
          clearTimeout(timeout);
          try {
            fs.unlinkSync(audioListPath);
            fs.unlinkSync(concatenatedAudioPath);
          } catch (_) {}
          resolve();
        })
        .on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        })
        .run();
    });

    onProgress?.(100, 'Preview ready!');
    return { success: true, outputPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate a full-length HLS preview (3s segments) for a project timeline.
 *
 * This reuses the same compositing logic as `generateTimelinePreview` but
 * outputs an HLS playlist and TS segments instead of a single MP4 file.
 * The `version` parameter should be a filesystem-safe identifier for the
 * current timeline version (for example based on project.updatedAt).
 */
export async function generateTimelinePreviewHls(
  project: Project,
  version: string,
  onProgress?: (percent: number, message: string) => void
): Promise<{ success: boolean; playlistPath?: string; error?: string }> {
  console.log('[HLS Preview] start', { projectId: project.id, version });
  const { id: projectId, template, audioSessionId, timeline } = project;

  try {
    const session = await prisma.session.findUnique({
      where: { id: audioSessionId },
      include: {
        dialogues: {
          include: { audioFile: true },
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!session) {
      return { success: false, error: `Audio session ${audioSessionId} not found` };
    }

    const audioFiles = session.dialogues
      .filter((d: any) => d.audioFile && d.audioFile.success)
      .map((d: any) => d.audioFile!.filePath);

    if (audioFiles.length === 0) {
      return { success: false, error: 'No audio files in session' };
    }

    const duration = timeline?.duration || session.totalDuration || 60;
    const templatePath = resolveTemplatePath(template.path);

    if (!fs.existsSync(templatePath)) {
      return { success: false, error: `Template not found: ${templatePath}` };
    }

    const hlsDir = path.join(HLS_ROOT_DIR, projectId, version);
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }

    const playlistPath = path.join(hlsDir, 'index.m3u8');
    const segmentPatternRaw = path.join(hlsDir, 'seg_%03d.ts');
    // FFmpeg on Windows prefers forward slashes in filter/filename args.
    const segmentPattern = segmentPatternRaw.replace(/\\/g, '/');

    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    onProgress?.(10, 'Concatenating audio for HLS preview...');
    const audioListPath = path.join(TEMP_DIR, `preview_audio_list_${projectId}.txt`);
    const audioListContent = audioFiles.map((f: string) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(audioListPath, audioListContent);

    const concatenatedAudioPath = path.join(TEMP_DIR, `preview_audio_${projectId}.wav`);
    await new Promise<void>((resolve, reject) => {
      const concatCmd = ffmpeg()
        .input(audioListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'pcm_s16le'])
        .output(concatenatedAudioPath);
      concatCmd.on('start', () => {});
      concatCmd.on('stderr', () => {});
      concatCmd.on('end', () => resolve());
      concatCmd.on('error', (err: Error) => reject(err));
      concatCmd.run();
    });

    const planOverlayTracks = (timeline?.tracks ?? []).filter((t: any) => isPlanOverlayTrack(t));
    const characterTrack = timeline?.tracks?.find((t: any) => t.type === 'character');
    const musicTracks = (timeline?.tracks ?? []).filter((t: any) => t.type === 'music');
    const sfxTracks = (timeline?.tracks ?? []).filter((t: any) => t.type === 'sfx');
    const subtitleTrack = timeline?.tracks?.find((t: any) => t.type === 'subtitle');

    const overlayClips = planOverlayTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'overlay') || [])) as OverlayClip[];
    const characterClips = (characterTrack?.clips?.filter((c: any) => c.kind === 'character') || []) as CharacterClip[];
    let subtitleClips = (subtitleTrack?.clips?.filter((c: any) => c.kind === 'subtitle') || []) as SubtitleClip[];
    const musicClips = musicTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'music') || [])) as MusicClip[];
    const sfxClips = sfxTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'sfx') || [])) as SfxClip[];

    subtitleClips = excludeSubtitlesInRanges(subtitleClips, buildReplaceOverlayRanges(overlayClips));
    onProgress?.(15, 'Fetching word timings for HLS karaoke...');
    if (subtitleClips.length > 0) {
      subtitleClips = await enrichSubtitleClipsWithWords(session, subtitleClips);
    }

    let assPath: string | null = null;
    if (subtitleClips.length > 0) {
      assPath = generateAssFromTimeline(`${projectId}_hls`, subtitleClips);
    }

    const command = ffmpeg();
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(templatePath);
    const videoStart = Math.max(0, (template as { videoStart?: number }).videoStart ?? 0);

    if (isImage) {
      command.input(templatePath).inputOptions(['-loop', '1', '-t', duration.toString()]);
    } else {
      const opts = videoStart > 0 ? ['-ss', videoStart.toString(), '-stream_loop', '-1'] : ['-stream_loop', '-1'];
      command.input(templatePath).inputOptions(opts);
    }
    command.input(concatenatedAudioPath).inputOptions(['-t', duration.toString()]);

    let nextInputIndex = 2;
    const musicInputs: AudioInputRef[] = [];
    for (const clip of musicClips) {
      const resolved = resolveAudioClipPath(clip.path);
      console.log('[HLS Preview] music clip', {
        path: clip.path,
        resolved,
        start: clip.start,
        duration: clip.duration,
        volume: (clip as any).volume,
      });
      if (!resolved) continue;
      command.input(resolved);
      musicInputs.push({ clip, inputIndex: nextInputIndex++, kind: 'music' });
    }

    const sfxInputs: AudioInputRef[] = [];
    for (const clip of sfxClips) {
      const resolved = resolveAudioClipPath(clip.path);
      console.log('[HLS Preview] sfx clip', {
        path: clip.path,
        resolved,
        start: clip.start,
        duration: clip.duration,
        volume: (clip as any).volume,
      });
      if (!resolved) continue;
      command.input(resolved);
      sfxInputs.push({ clip, inputIndex: nextInputIndex++, kind: 'sfx' });
    }

    const overlayInputs: { clip: OverlayClip; inputIndex: number; overlayPath: string }[] = [];
    overlayClips.forEach((clip: OverlayClip) => {
      const overlayPath = resolveOverlayAssetPath(clip, audioSessionId);
      if (fs.existsSync(overlayPath)) {
        addOverlayInput(command, overlayPath, clip, duration);
        overlayInputs.push({ clip, inputIndex: nextInputIndex++, overlayPath });
      }
    });

    let nextIdx = nextInputIndex;
    const charInputs: { clip: CharacterClip; inputIndex: number }[] = [];
    for (const clip of characterClips) {
      const charPath = getCharacterImagePath(clip.character);
      if (charPath) {
        command.input(charPath);
        charInputs.push({ clip, inputIndex: nextIdx++ });
      }
    }

    let filterComplex = '';
    let lastLabel = '0:v';

    const stewieX = Math.floor(300 * SCALE);
    const stewieY = Math.floor(1350 * SCALE);
    const peterX = Math.floor(300 * SCALE);
    const peterY = Math.floor(1250 * SCALE);
    const fontSize = Math.floor(48 * SCALE);
    const marginV = Math.floor(700 * SCALE);

    filterComplex = `[0:v]scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=increase,crop=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT},format=yuv420p[bg]`;
    lastLabel = 'bg';

    if (assPath && fs.existsSync(assPath)) {
      const assPathFixed = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const forceStyle = `Fontname=Arial-Black,FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,Bold=1,BorderStyle=1,Outline=3,Shadow=2,Alignment=2,MarginV=${marginV}`;
      filterComplex += `;[${lastLabel}]subtitles='${assPathFixed}':force_style='${forceStyle}'[with_subs]`;
      lastLabel = 'with_subs';
    }

    overlayInputs.forEach(({ clip, inputIndex, overlayPath }, index) => {
      const isReplace = isReplaceOverlayClip(clip);
      const isVideoOverlay = !isStillImageAsset(overlayPath);
      const setpts = isVideoOverlay ? `setpts=PTS+${clip.start}/TB,` : '';
      const scaledLabel = isReplace ? `ov_replace_${index}` : `ov${index}`;
      const overlayLabel = isReplace ? `vr${index}` : `vo${index}`;
      if (isReplace) {
        // Preserve full frame and fit inside vertical canvas for replace mode previews.
        filterComplex += `;[${inputIndex}:v]${setpts}scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2:0x101014[${scaledLabel}]`;
        filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})'[${overlayLabel}]`;
        lastLabel = overlayLabel;
        return;
      }

      const placement = computeOverlayPlacement(
        clip,
        PREVIEW_WIDTH,
        PREVIEW_HEIGHT,
        OVERLAY_BASE_W,
        OVERLAY_BASE_H,
        OVERLAY_LEGACY_TOP_Y
      );
      filterComplex += `;[${inputIndex}:v]${setpts}scale=${placement.width}:${placement.height}:force_original_aspect_ratio=decrease[${scaledLabel}]`;
      filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=${placement.x}:${placement.y}:enable='between(t,${clip.start},${clip.start + clip.duration})'[${overlayLabel}]`;
      lastLabel = overlayLabel;
    });

    if (charInputs.length > 0) {
      const stewieClips = charInputs.filter(c => c.clip.character === 'Stewie');
      const peterClips = charInputs.filter(c => c.clip.character === 'Peter');
      const otherClips = charInputs.filter(c => c.clip.character !== 'Stewie' && c.clip.character !== 'Peter');

      const stewieRanges: string[] = [];
      const peterRanges: string[] = [];
      const otherRanges: string[] = [];
      stewieClips.forEach(({ clip }) => {
        stewieRanges.push(`between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})`);
      });
      peterClips.forEach(({ clip }) => {
        peterRanges.push(`between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})`);
      });
      otherClips.forEach(({ clip }) => {
        otherRanges.push(`between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})`);
      });

      const stewieEnable = stewieRanges.length > 0 ? stewieRanges.join('+') : '0';
      const peterEnable = peterRanges.length > 0 ? peterRanges.join('+') : '0';
      const otherEnable = otherRanges.length > 0 ? otherRanges.join('+') : '0';

      const stewieScaleW = Math.floor(500 * SCALE);
      const stewieScaleH = Math.floor(600 * SCALE);
      const peterScaleW = Math.floor(580 * SCALE);
      const peterScaleH = Math.floor(720 * SCALE);
      const otherScaleW = Math.floor(560 * SCALE);
      const otherScaleH = Math.floor(760 * SCALE);
      const stewieInputIndex = stewieClips[0]?.inputIndex;
      const peterInputIndex = peterClips[0]?.inputIndex;
      const otherInputIndex = otherClips[0]?.inputIndex;
      const otherX = Math.floor(260 * SCALE);
      const otherY = Math.floor(1160 * SCALE);

      if (stewieInputIndex !== undefined) {
        filterComplex += `;[${stewieInputIndex}:v]scale=${stewieScaleW}:${stewieScaleH}:force_original_aspect_ratio=decrease[stewie_scaled]`;
        filterComplex += `;[${lastLabel}][stewie_scaled]overlay=${stewieX}:${stewieY}:enable='${stewieEnable}'[stewie_overlay]`;
        lastLabel = 'stewie_overlay';
      }

      if (peterInputIndex !== undefined) {
        filterComplex += `;[${peterInputIndex}:v]scale=${peterScaleW}:${peterScaleH}:force_original_aspect_ratio=decrease[peter_scaled]`;
        filterComplex += `;[${lastLabel}][peter_scaled]overlay=${peterX}:${peterY}:enable='${peterEnable}'[with_characters]`;
        lastLabel = 'with_characters';
      }

      if (otherInputIndex !== undefined) {
        filterComplex += `;[${otherInputIndex}:v]scale=${otherScaleW}:${otherScaleH}:force_original_aspect_ratio=decrease[other_scaled]`;
        filterComplex += `;[${lastLabel}][other_scaled]overlay=${otherX}:${otherY}:enable='${otherEnable}'[with_other_characters]`;
        lastLabel = 'with_other_characters';
      }
    }

    onProgress?.(50, 'Encoding HLS preview...');

    filterComplex += `;[${lastLabel}]format=yuv420p,setsar=1[out]`;
    const needsAudioMixing = musicInputs.length > 0 || sfxInputs.length > 0;
    console.log('[HLS Preview] audio mix', {
      musicInputs: musicInputs.length,
      sfxInputs: sfxInputs.length,
      needsAudioMixing,
    });
    const audioMix = needsAudioMixing
      ? buildAudioMixFilter(1, musicInputs, sfxInputs)
      : { filter: null, outputLabel: null };
    if (audioMix.filter) {
      filterComplex += `;${audioMix.filter}`;
    }

    const timeout = setTimeout(() => {}, 600000);

    command.on('start', () => {});
    command.on('stderr', () => {});

    command
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[out]',
        '-map', audioMix.outputLabel ?? '1:a',
        '-t', duration.toString(),
        '-c:v', 'h264_nvenc',
        '-b:v', PREVIEW_BITRATE,
        '-maxrate', '750k',
        '-bufsize', '1500k',
        '-preset', 'p4',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-ac', '2',
        '-ar', '22050',
        '-f', 'hls',
        '-hls_time', '3',
        '-hls_playlist_type', 'vod',
        '-hls_segment_filename', segmentPattern,
        '-y',
      ]);
    command.output(playlistPath);

    command.on('progress', (p: any) => {
      if (p.percent) onProgress?.(Math.min(95, 50 + (p.percent / 100) * 45), `Encoding HLS: ${Math.round(p.percent)}%`);
    });

    await new Promise<void>((resolve, reject) => {
      command
        .on('end', () => {
          clearTimeout(timeout);
          try {
            fs.unlinkSync(audioListPath);
            fs.unlinkSync(concatenatedAudioPath);
          } catch (_) {}
          
          // Post-process playlist: rewrite segment paths to use API URLs.
          // FFmpeg writes relative paths like "seg_000.ts", but we need absolute API URLs.
          try {
            const playlistContent = fs.readFileSync(playlistPath, 'utf8');
            // Replace relative segment paths with API URLs.
            // Segment URLs should be: /api/project/:id/preview/hls/:version/:segment
            // HLS playlist format: segment filename appears on its own line after #EXTINF
            const segmentBaseUrl = `/api/project/${projectId}/preview/hls/${encodeURIComponent(version)}`;
            const rewrittenPlaylist = playlistContent.replace(
              /^(seg_\d+\.ts)$/gm,
              (match) => `${segmentBaseUrl}/${match}`
            );
            fs.writeFileSync(playlistPath, rewrittenPlaylist, 'utf8');
          } catch (rewriteErr) {
            console.warn('[HLS] Failed to rewrite playlist segment paths', rewriteErr);
            // Continue anyway - segments might still work if served from same origin
          }
          
          resolve();
        })
        .on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        })
        .run();
    });

    onProgress?.(100, 'HLS preview ready!');
    return { success: true, playlistPath };
  } catch (error) {
    console.error('[HLS Preview] generate error', {
      projectId: project.id,
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate a short timeline-aware preview segment starting at the current playhead.
 *
 * This is a lighter-weight variant of `generateTimelinePreview` that only renders
 * a small window of the full timeline (for example 5 seconds starting at
 * `centerTime`). It uses the same image plan (overlays, characters) but trims
 * and offsets clip timings so that local segment time 0 corresponds to the
 * requested playhead position.
 *
 * NOTE: To keep the implementation focused and fast, this segment preview
 * currently omits karaoke subtitles. Full previews still include subtitles via
 * `generateTimelinePreview`.
 */
export async function generateTimelineSegmentPreview(
  project: Project,
  centerTime: number,
  windowSeconds: number = 3,
  onProgress?: (percent: number, message: string) => void
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const { id: projectId, template, audioSessionId, timeline } = project;

  try {
    const session = await prisma.session.findUnique({
      where: { id: audioSessionId },
      include: {
        dialogues: {
          include: { audioFile: true },
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!session) {
      return { success: false, error: `Audio session ${audioSessionId} not found` };
    }

    const audioFiles = session.dialogues
      .filter((d: any) => d.audioFile && d.audioFile.success)
      .map((d: any) => d.audioFile!.filePath);

    if (audioFiles.length === 0) {
      return { success: false, error: 'No audio files in session' };
    }

    const fullDuration = timeline?.duration || session.totalDuration || 60;

    // Clamp centerTime and compute a forward-looking window [segmentStart, segmentEnd].
    const safeCenter = Math.max(0, Math.min(centerTime || 0, fullDuration));
    let segmentStart = safeCenter;
    let segmentEnd = Math.min(fullDuration, segmentStart + windowSeconds);
    if (segmentEnd <= segmentStart) {
      // Ensure we always have at least a small positive duration.
      segmentEnd = Math.min(fullDuration, segmentStart + 1);
    }
    const segmentDuration = Math.max(0.1, segmentEnd - segmentStart);

    const templatePath = resolveTemplatePath(template.path);

    if (!fs.existsSync(templatePath)) {
      return { success: false, error: `Template not found: ${templatePath}` };
    }

    const outputPath = path.join(PREVIEW_DIR, `preview_${projectId}.mp4`);

    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    onProgress?.(10, 'Concatenating audio (segment)...');
    const audioListPath = path.join(TEMP_DIR, `preview_audio_list_${projectId}.txt`);
    const audioListContent = audioFiles.map((f: string) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(audioListPath, audioListContent);

    const concatenatedAudioPath = path.join(TEMP_DIR, `preview_audio_${projectId}.wav`);
    await new Promise<void>((resolve, reject) => {
      const concatCmd = ffmpeg()
        .input(audioListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'pcm_s16le'])
        .output(concatenatedAudioPath);
      concatCmd.on('start', () => {});
      concatCmd.on('stderr', () => {});
      concatCmd.on('end', () => resolve());
      concatCmd.on('error', (err: Error) => reject(err));
      concatCmd.run();
    });

    const planOverlayTracks = (timeline?.tracks ?? []).filter((t: any) => isPlanOverlayTrack(t));
    const characterTrack = timeline?.tracks?.find((t: any) => t.type === 'character');
    const musicTracks = (timeline?.tracks ?? []).filter((t: any) => t.type === 'music');
    const sfxTracks = (timeline?.tracks ?? []).filter((t: any) => t.type === 'sfx');

    const sliceClipsToWindow = <T extends { start: number; duration: number }>(clips: T[]): T[] => {
      const result: T[] = [];
      for (const clip of clips) {
        const globalStart = clip.start;
        const globalEnd = clip.start + clip.duration;
        // Skip clips that don't intersect with the segment window.
        if (globalEnd <= segmentStart || globalStart >= segmentEnd) continue;

        const localStart = Math.max(0, globalStart - segmentStart);
        const localEnd = Math.min(segmentEnd, globalEnd) - segmentStart;
        const localDuration = Math.max(0.05, localEnd - localStart);

        result.push({
          ...clip,
          start: localStart,
          duration: localDuration,
        });
      }
      return result;
    };

    const overlayClips = sliceClipsToWindow(
      planOverlayTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'overlay') || [])) as OverlayClip[]
    );
    const characterClips = sliceClipsToWindow(
      (characterTrack?.clips?.filter((c: any) => c.kind === 'character') || []) as CharacterClip[]
    );
    const musicClips = sliceAudioClipsToWindow(
      musicTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'music') || [])) as MusicClip[],
      segmentStart,
      segmentEnd
    );
    const sfxClips = sliceAudioClipsToWindow(
      sfxTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'sfx') || [])) as SfxClip[],
      segmentStart,
      segmentEnd
    );

    const command = ffmpeg();
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(templatePath);
    const videoStart = Math.max(0, (template as { videoStart?: number }).videoStart ?? 0);
    const fileStart = videoStart + segmentStart;

    // Input 0: template video or image. For video, seek to (videoStart + segmentStart) and take segmentDuration.
    if (isImage) {
      command.input(templatePath).inputOptions(['-loop', '1', '-t', segmentDuration.toString()]);
    } else {
      command.input(templatePath).inputOptions(['-ss', fileStart.toString(), '-t', segmentDuration.toString()]);
    }

    // Input 1: concatenated audio, trimmed to the segment window at input level.
    command
      .input(concatenatedAudioPath)
      .inputOptions(['-ss', segmentStart.toString(), '-t', segmentDuration.toString()]);

    let nextInputIndex = 2;
    const musicInputs: AudioInputRef[] = [];
    for (const clip of musicClips) {
      const resolved = resolveAudioClipPath(clip.path);
      console.log('[Segment Preview] music clip', {
        path: clip.path,
        resolved,
        start: clip.start,
        duration: clip.duration,
        volume: (clip as any).volume,
      });
      if (!resolved) continue;
      command.input(resolved);
      musicInputs.push({ clip, inputIndex: nextInputIndex++, kind: 'music' });
    }

    const sfxInputs: AudioInputRef[] = [];
    for (const clip of sfxClips) {
      const resolved = resolveAudioClipPath(clip.path);
      console.log('[Segment Preview] sfx clip', {
        path: clip.path,
        resolved,
        start: clip.start,
        duration: clip.duration,
        volume: (clip as any).volume,
      });
      if (!resolved) continue;
      command.input(resolved);
      sfxInputs.push({ clip, inputIndex: nextInputIndex++, kind: 'sfx' });
    }

    const overlayInputs: { clip: OverlayClip; inputIndex: number; overlayPath: string }[] = [];
    overlayClips.forEach((clip: OverlayClip) => {
      const overlayPath = resolveOverlayAssetPath(clip, audioSessionId);
      if (fs.existsSync(overlayPath)) {
        addOverlayInput(command, overlayPath, clip, segmentDuration);
        overlayInputs.push({ clip, inputIndex: nextInputIndex++, overlayPath });
      }
    });

    let nextIdx = nextInputIndex;
    const charInputs: { clip: CharacterClip; inputIndex: number }[] = [];
    for (const clip of characterClips) {
      const charPath = getCharacterImagePath(clip.character);
      if (charPath) {
        command.input(charPath);
        charInputs.push({ clip, inputIndex: nextIdx++ });
      }
    }

    let filterComplex = '';
    let lastLabel = '0:v';

    // Match backend videoGenerator: Stewie=300:1350 (lower), Peter=300:1250 (higher)
    const stewieX = Math.floor(300 * SCALE);
    const stewieY = Math.floor(1350 * SCALE);
    const peterX = Math.floor(300 * SCALE);
    const peterY = Math.floor(1250 * SCALE);

    // For images, we already constrained the duration using -t on the input.
    // For videos, we already sought to fileStart and took segmentDuration; just scale/crop (no trim).
    if (isImage) {
      filterComplex =
        `[0:v]scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=increase,` +
        `crop=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT},format=yuv420p[bg]`;
    } else {
      filterComplex =
        `[0:v]setpts=PTS-STARTPTS,` +
        `scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=increase,` +
        `crop=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT},format=yuv420p[bg]`;
    }
    lastLabel = 'bg';

    // Overlays in local segment time. Video overlays use setpts so they play 0→duration in order.
    overlayInputs.forEach(({ clip, inputIndex, overlayPath }, index) => {
      const isReplace = isReplaceOverlayClip(clip);
      const isVideoOverlay = !isStillImageAsset(overlayPath);
      const setpts = isVideoOverlay ? `setpts=PTS+${clip.start}/TB,` : '';
      const scaledLabel = isReplace ? `ov_replace_${index}` : `ov${index}`;
      const overlayLabel = isReplace ? `vr${index}` : `vo${index}`;
      if (isReplace) {
        // Preserve full frame and fit inside vertical canvas for replace mode previews.
        filterComplex += `;[${inputIndex}:v]${setpts}scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2:0x101014[${scaledLabel}]`;
        filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})'[${overlayLabel}]`;
        lastLabel = overlayLabel;
        return;
      }

      const placement = computeOverlayPlacement(
        clip,
        PREVIEW_WIDTH,
        PREVIEW_HEIGHT,
        OVERLAY_BASE_W,
        OVERLAY_BASE_H,
        OVERLAY_LEGACY_TOP_Y
      );
      filterComplex += `;[${inputIndex}:v]${setpts}scale=${placement.width}:${placement.height}:force_original_aspect_ratio=decrease[${scaledLabel}]`;
      filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=${placement.x}:${placement.y}:enable='between(t,${clip.start},${clip.start + clip.duration})'[${overlayLabel}]`;
      lastLabel = overlayLabel;
    });

    // Character overlays in local segment time.
    if (charInputs.length > 0) {
      const stewieClips = charInputs.filter(c => c.clip.character === 'Stewie');
      const peterClips = charInputs.filter(c => c.clip.character === 'Peter');
      const otherClips = charInputs.filter(c => c.clip.character !== 'Stewie' && c.clip.character !== 'Peter');

      const stewieRanges: string[] = [];
      const peterRanges: string[] = [];
      const otherRanges: string[] = [];
      stewieClips.forEach(({ clip }) => {
        stewieRanges.push(`between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})`);
      });
      peterClips.forEach(({ clip }) => {
        peterRanges.push(`between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})`);
      });
      otherClips.forEach(({ clip }) => {
        otherRanges.push(`between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})`);
      });

      const stewieEnable = stewieRanges.length > 0 ? stewieRanges.join('+') : '0';
      const peterEnable = peterRanges.length > 0 ? peterRanges.join('+') : '0';
      const otherEnable = otherRanges.length > 0 ? otherRanges.join('+') : '0';

      const stewieScaleW = Math.floor(500 * SCALE);
      const stewieScaleH = Math.floor(600 * SCALE);
      const peterScaleW = Math.floor(580 * SCALE);
      const peterScaleH = Math.floor(720 * SCALE);
      const otherScaleW = Math.floor(560 * SCALE);
      const otherScaleH = Math.floor(760 * SCALE);
      const stewieInputIndex = stewieClips[0]?.inputIndex;
      const peterInputIndex = peterClips[0]?.inputIndex;
      const otherInputIndex = otherClips[0]?.inputIndex;
      const otherX = Math.floor(260 * SCALE);
      const otherY = Math.floor(1160 * SCALE);

      if (stewieInputIndex !== undefined) {
        filterComplex += `;[${stewieInputIndex}:v]scale=${stewieScaleW}:${stewieScaleH}:force_original_aspect_ratio=decrease[stewie_scaled]`;
        filterComplex += `;[${lastLabel}][stewie_scaled]overlay=${stewieX}:${stewieY}:enable='${stewieEnable}'[stewie_overlay]`;
        lastLabel = 'stewie_overlay';
      }

      if (peterInputIndex !== undefined) {
        filterComplex += `;[${peterInputIndex}:v]scale=${peterScaleW}:${peterScaleH}:force_original_aspect_ratio=decrease[peter_scaled]`;
        filterComplex += `;[${lastLabel}][peter_scaled]overlay=${peterX}:${peterY}:enable='${peterEnable}'[with_characters]`;
        lastLabel = 'with_characters';
      }

      if (otherInputIndex !== undefined) {
        filterComplex += `;[${otherInputIndex}:v]scale=${otherScaleW}:${otherScaleH}:force_original_aspect_ratio=decrease[other_scaled]`;
        filterComplex += `;[${lastLabel}][other_scaled]overlay=${otherX}:${otherY}:enable='${otherEnable}'[with_other_characters]`;
        lastLabel = 'with_other_characters';
      }
    }

    onProgress?.(50, 'Encoding segment preview...');

    filterComplex += `;[${lastLabel}]format=yuv420p,setsar=1[out]`;
    const needsAudioMixing = musicInputs.length > 0 || sfxInputs.length > 0;
    console.log('[Segment Preview] audio mix', {
      musicInputs: musicInputs.length,
      sfxInputs: sfxInputs.length,
      needsAudioMixing,
    });
    const audioMix = needsAudioMixing
      ? buildAudioMixFilter(1, musicInputs, sfxInputs)
      : { filter: null, outputLabel: null };
    if (audioMix.filter) {
      filterComplex += `;${audioMix.filter}`;
    }

    const timeout = setTimeout(() => {}, 60000);

    command.on('start', () => {});
    command.on('stderr', () => {});

    command
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[out]',  // Map filter output for video
        '-map', audioMix.outputLabel ?? '1:a',    // Map audio from concatenated input (already trimmed)
        '-t', segmentDuration.toString(),
        '-c:v', 'h264_nvenc',
        '-b:v', PREVIEW_BITRATE,
        '-maxrate', '750k',
        '-bufsize', '1500k',
        '-preset', 'p4',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-ac', '2',
        '-ar', '22050',
        '-y'
      ]);
    command.output(outputPath);

    command.on('progress', (p: any) => {
      if (p.percent) onProgress?.(Math.min(95, 50 + (p.percent / 100) * 45), `Encoding (segment): ${Math.round(p.percent)}%`);
    });

    await new Promise<void>((resolve, reject) => {
      command
        .on('end', () => {
          clearTimeout(timeout);
          try {
            fs.unlinkSync(audioListPath);
            fs.unlinkSync(concatenatedAudioPath);
          } catch (_) {}
          resolve();
        })
        .on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        })
        .run();
    });

    onProgress?.(100, 'Segment preview ready!');
    return { success: true, outputPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
