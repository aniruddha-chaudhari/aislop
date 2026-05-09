import * as fs from 'fs';
import * as path from 'path';
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
import { PrismaClient } from '../generated/prisma';
import type { Project, SubtitleClip, OverlayClip, CharacterClip, MusicClip, SfxClip } from '../schema/project';
import { getCharacterClipImagePath } from '../utils/characterImages';
import { appendCharacterClipsToFilterComplex, expandCharacterClipsExcludingReplaceRanges } from './characterOverlayFilters';
import { computeOverlayPlacement } from './overlayTransform';
import {
  fixSubtitleClipsTimelineNonOverlap,
  clampSubtitleClipsToTimelineDuration,
  MIN_SUBTITLE_CLIP_DURATION,
  excludeSubtitleClipsInRanges,
  clampAssEventToClip,
  getSubtitleWordText,
} from './subtitleClipNormalize';
import { resolveSessionOverlayPath } from '../utils/overlayAssets';

const prisma = new PrismaClient();
const TEMP_DIR = path.join(process.cwd(), 'storage', 'temp');
const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'images');

/**
 * Gap between karaoke tokens. Plain spaces can collapse next to {\\c...} in libass/ffmpeg.
 * En space (U+2002) is narrower than em space but still a stable separator.
 */
const ASS_INTER_WORD_GAP = '\u2002';

// Set ffmpeg path
const customFfmpegPath = process.env.CUSTOM_FFMPEG_PATH;
const ffmpegPath = customFfmpegPath || ffmpegInstaller.path;
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Preview configuration - scaled 1/3 from 1080x1920 (matches timelineCompiler full export)
const PREVIEW_DIR = path.join(process.cwd(), 'storage', 'previews');
const HLS_ROOT_DIR = path.join(PREVIEW_DIR, 'hls');
const TIMELINE_ROOT_DIR = path.join(PREVIEW_DIR, 'timeline');
const SEGMENT_ROOT_DIR = path.join(PREVIEW_DIR, 'segments');
const PREVIEW_WIDTH = 360;
const PREVIEW_HEIGHT = 640;
const SCALE = PREVIEW_HEIGHT / 1920; // Same proportion as timelineCompiler 1080x1920
/** Scale template to preview canvas; fps is applied once at the end of the filter graph. */
const PREVIEW_TEMPLATE_TO_BG = `setpts=PTS-STARTPTS,scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=increase,crop=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT},format=yuv420p`;
const PREVIEW_BITRATE = '500k'; // Low bitrate for fast generation
const AUDIO_TAIL_BUFFER_SEC = 1.2;
const PREVIEW_DEBUG = process.env.PREVIEW_DEBUG === '1';

function previewDebug(message: string, data?: Record<string, unknown>): void {
  if (!PREVIEW_DEBUG) return;
  if (data) console.debug(message, data);
  else console.debug(message);
}

// Overlay base size (legacy default scale=0.5) and legacy top offset.
const OVERLAY_BASE_W = Math.floor(960 * (PREVIEW_WIDTH / 1080)); // 320 at 360px width
const OVERLAY_BASE_H = Math.floor(720 * (PREVIEW_HEIGHT / 1920)); // 240 at 640px height
const OVERLAY_LEGACY_TOP_Y = Math.floor(40 * (PREVIEW_HEIGHT / 1920)); // 13 at 640px height (~40px at 1920)

function sanitizePreviewVersion(versionTag?: string): string {
  const raw = (versionTag || 'latest').trim();
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  return safe || 'latest';
}

export function buildTimelinePreviewOutputPath(projectId: string, versionTag?: string): string {
  const version = sanitizePreviewVersion(versionTag);
  return path.join(TIMELINE_ROOT_DIR, projectId, version, 'preview.mp4');
}

export function buildSegmentPreviewOutputPath(
  projectId: string,
  segmentStartSeconds: number,
  segmentDurationSeconds: number,
  versionTag?: string
): string {
  const version = sanitizePreviewVersion(versionTag);
  const startMs = Math.max(0, Math.round(segmentStartSeconds * 1000));
  const durMs = Math.max(50, Math.round(segmentDurationSeconds * 1000));
  return path.join(SEGMENT_ROOT_DIR, projectId, version, `seg_${startMs}_${durMs}.mp4`);
}

function logPreviewServiceTelemetry(event: string, data: Record<string, unknown> = {}): void {
  console.info('[PreviewServiceTelemetry]', {
    event,
    timestamp: new Date().toISOString(),
    ...data,
  });
}

function summarizeFfmpegError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  return { message: String(err) };
}

function createPreviewAudioTempPaths(projectId: string, purpose: string): { audioListPath: string; concatenatedAudioPath: string } {
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safePurpose = purpose.replace(/[^a-zA-Z0-9_-]/g, '_');
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const baseName = `${safePurpose}_${safeProjectId}_${runId}`;
  return {
    audioListPath: path.join(TEMP_DIR, `${baseName}_audio_list.txt`),
    concatenatedAudioPath: path.join(TEMP_DIR, `${baseName}_audio.wav`),
  };
}

function cleanupPreviewTempFiles(...filePaths: string[]): void {
  for (const filePath of filePaths) {
    if (!filePath) continue;
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_) {}
  }
}

function getPreviewVideoCodecOptions(opts?: { gopFrames?: number }): string[] {
  const useNvenc = process.env.FFMPEG_USE_NVENC === '1';
  // Stable GOP keeps playback/seek fast in HTML video element and HLS players.
  const gop = Math.max(2, Math.floor(opts?.gopFrames ?? 60));
  if (useNvenc) {
    return [
      '-c:v', 'h264_nvenc',
      '-preset', 'p4',
      '-rc:v', 'vbr',
      '-bf', '0',
      '-spatial_aq', '1',
      '-g', String(gop),
      '-pix_fmt', 'yuv420p',
    ];
  }
  return [
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'fastdecode',
    '-profile:v', 'main',
    '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-g', String(gop),
    '-keyint_min', String(gop),
    '-sc_threshold', '0',
  ];
}

const PREVIEW_AUDIO_CODEC_OPTIONS: string[] = [
  '-c:a', 'aac',
  '-b:a', '96k',
  '-ac', '2',
  '-ar', '32000',
];

const PREVIEW_MP4_MUX_OPTIONS: string[] = [
  '-movflags', '+faststart',
];

const PREVIEW_HLS_MUX_OPTIONS: string[] = [
  '-f', 'hls',
  '-hls_time', '3',
  '-hls_playlist_type', 'vod',
  '-hls_list_size', '0',
  '-hls_flags', 'independent_segments+temp_file',
  '-force_key_frames', 'expr:gte(t,n_forced*3)',
];

function isPlanOverlayTrack(track: { type?: string; id?: string }): boolean {
  if (track.type !== 'overlay') return false;
  if (!track.id || track.id === 't_overlay_template') return false;
  // Include any non-template overlay track so manually imported media-library clips
  // render in preview/export, not only AI image/animation plan tracks.
  return true;
}

function resolveOverlayAssetPath(clip: OverlayClip, audioSessionId: string, projectId: string): string {
  return resolveSessionOverlayPath(IMAGE_UPLOAD_DIR, audioSessionId, clip.path, clip.assetId, projectId);
}

function isStillImageAsset(filePath: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(filePath);
}

/**
 * Add an overlay as an input. For still images: loop for full timeline.
 * For video (e.g. animation moment): trim to clip.duration only so overlay plays 0→duration in order;
 * the filter chain applies setpts=PTS-STARTPTS+clip.start/TB so every overlay lines up with timeline
 * without carrying source timestamps that can push the visual later.
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
  return clip.displayMode === 'replace' && clip.planStatus !== 'draft';
}

function isHyperframesAnimationOverlayClip(clip: OverlayClip): boolean {
  return Boolean(clip.animationMomentId);
}

function toEvenDim(value: number, min: number = 2): number {
  const safe = Math.max(min, Math.floor(value));
  return safe % 2 === 0 ? safe : safe - 1;
}

function getTopRegionHeight(frameHeight: number): number {
  // Reserve the same subtitle-safe area proportion used by 1080x1920 export.
  const subtitleSafeBottomMargin = Math.floor((700 / 1920) * frameHeight);
  // Always return an even number: libx264/h264_nvenc require even dimensions,
  // and pad targets must be >= scale output (which ffmpeg rounds to even).
  return toEvenDim(frameHeight - subtitleSafeBottomMargin);
}

function buildReplaceOverlayRanges(clips: OverlayClip[]): TimeRange[] {
  return clips
    .filter(isReplaceOverlayClip)
    .map((clip) => ({ start: clip.start, end: clip.start + clip.duration }));
}

function buildSubtitleMuteRanges(clips: OverlayClip[]): TimeRange[] {
  return clips
    .filter((clip) => {
      if ((clip.planStatus ?? 'approved') === 'draft') return false;
      if (isReplaceOverlayClip(clip)) return true;
      // Animation overlays (Hyperframes moments) should hide subtitles while they play.
      if (isHyperframesAnimationOverlayClip(clip)) return true;
      return false;
    })
    .map((clip) => ({ start: clip.start, end: clip.start + clip.duration }));
}

function buildCharacterHiddenOverlayRanges(clips: OverlayClip[]): TimeRange[] {
  return clips
    .filter((clip) => isReplaceOverlayClip(clip) || (isHyperframesAnimationOverlayClip(clip) && clip.planStatus !== 'draft'))
    .map((clip) => ({ start: clip.start, end: clip.start + clip.duration }));
}

// Ensure preview directory exists
if (!fs.existsSync(PREVIEW_DIR)) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}
if (!fs.existsSync(HLS_ROOT_DIR)) {
  fs.mkdirSync(HLS_ROOT_DIR, { recursive: true });
}
if (!fs.existsSync(TIMELINE_ROOT_DIR)) {
  fs.mkdirSync(TIMELINE_ROOT_DIR, { recursive: true });
}
if (!fs.existsSync(SEGMENT_ROOT_DIR)) {
  fs.mkdirSync(SEGMENT_ROOT_DIR, { recursive: true });
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
  const startedAt = Date.now();
  logPreviewServiceTelemetry('generate_preview_start', { projectId, audioSessionId });
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
    const outputPathFfmpeg = outputPath.replace(/\\/g, '/');

    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    onProgress?.(10, 'Concatenating audio files...');

    const { audioListPath, concatenatedAudioPath } = createPreviewAudioTempPaths(projectId, 'preview');
    const audioListContent = audioFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(audioListPath, audioListContent);

    await new Promise<void>((resolve, reject) => {
      const concatCmd = ffmpeg()
        .input(audioListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'pcm_s16le'])
        .output(concatenatedAudioPath);
      concatCmd.on('start', () => {});
      concatCmd.on('stderr', () => {});
      concatCmd.on('end', () => resolve());
      concatCmd.on('error', (err: Error) => {
        cleanupPreviewTempFiles(audioListPath, concatenatedAudioPath);
        reject(err);
      });
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
    command.output(outputPathFfmpeg);

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
          cleanupPreviewTempFiles(audioListPath, concatenatedAudioPath);
          resolve();
        })
        .on('error', (err: Error) => {
          cleanupPreviewTempFiles(audioListPath, concatenatedAudioPath);
          reject(err);
        })
        .run();
    });

    onProgress?.(100, 'Preview ready!');
    logPreviewServiceTelemetry('generate_preview_success', {
      projectId,
      duration_ms: Date.now() - startedAt,
      outputPath,
    });

    return { success: true, outputPath };
  } catch (error) {
    logPreviewServiceTelemetry('generate_preview_error', {
      projectId,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
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

function probeMediaDurationSeconds(filePath: string): Promise<number> {
  return new Promise<number>((resolve) => {
    if (!filePath || !fs.existsSync(filePath)) {
      resolve(0);
      return;
    }
    ffmpeg.ffprobe(filePath, (err: Error | null, metadata: any) => {
      if (err) {
        resolve(0);
        return;
      }
      const d = Number(metadata?.format?.duration || 0);
      resolve(Number.isFinite(d) && d > 0 ? d : 0);
    });
  });
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
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const outputPath = path.join(TEMP_DIR, `preview_${safeProjectId}_${runId}_subs.ass`);
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  const clips = fixSubtitleClipsTimelineNonOverlap(subtitleClips);

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

  for (const clip of clips.sort((a, b) => a.start - b.start)) {
    const { words } = clip;
    const speaker = clip.speaker || (clip as { character?: string }).character || 'Speaker';

    if (words && words.length > 0) {
      for (let i = 0; i < words.length; i += 3) {
        let wordGroup = words.slice(i, Math.min(i + 3, words.length));
        const fullText = wordGroup.map((w) => getSubtitleWordText(w)).join(' ');
        const isTooLong = fullText.length > 25;

        if (isTooLong && wordGroup.length > 2) {
          const firstTwoWords = wordGroup.slice(0, 2);
          const thirdWord = wordGroup[2];

          firstTwoWords.forEach((word, groupIndex) => {
            let wordStart = clip.start + (word as { start: number }).start;
            let wordEnd = groupIndex === firstTwoWords.length - 1
              ? clip.start + (thirdWord as { start: number }).start
              : clip.start + (firstTwoWords[groupIndex + 1] as { start: number }).start;
            ({ start: wordStart, end: wordEnd } = clampAssEventToClip(
              wordStart,
              wordEnd,
              clip.start,
              clip.duration
            ));

            let subtitleText = '';
            firstTwoWords.forEach((groupWord, wordIdx) => {
              const wordText = getSubtitleWordText(groupWord);
              if (wordIdx === groupIndex) {
                subtitleText += `{\\c&H0000FFFF&}${wordText}{\\c&H00FFFFFF&}`;
              } else {
                subtitleText += wordText;
              }
              if (wordIdx < firstTwoWords.length - 1) subtitleText += ASS_INTER_WORD_GAP;
            });
            subtitleText += `\\N${getSubtitleWordText(thirdWord)}`;

            assContent += `Dialogue: 0,${formatAssTime(wordStart)},${formatAssTime(wordEnd)},Normal,${speaker},0,0,0,,${subtitleText}\n`;
          });

          let thirdWordStart = clip.start + (thirdWord as { start: number }).start;
          let thirdWordEnd = i + 2 === words.length - 1
            ? clip.start + (thirdWord as { end: number }).end
            : words[i + 3] ? clip.start + (words[i + 3] as { start: number }).start
            : clip.start + (thirdWord as { end: number }).end;
          ({ start: thirdWordStart, end: thirdWordEnd } = clampAssEventToClip(
            thirdWordStart,
            thirdWordEnd,
            clip.start,
            clip.duration
          ));

          let subtitleText = '';
          firstTwoWords.forEach((groupWord, wordIdx) => {
            const wordText = getSubtitleWordText(groupWord);
            subtitleText += wordText;
            if (wordIdx < firstTwoWords.length - 1) subtitleText += ASS_INTER_WORD_GAP;
          });
          subtitleText += `\\N{\\c&H0000FFFF&}${getSubtitleWordText(thirdWord)}{\\c&H00FFFFFF&}`;

          assContent += `Dialogue: 0,${formatAssTime(thirdWordStart)},${formatAssTime(thirdWordEnd)},Normal,${speaker},0,0,0,,${subtitleText}\n`;

          continue;
        }

        wordGroup.forEach((word, groupIndex) => {
          let wordStart = clip.start + (word as { start: number }).start;
          let wordEnd = groupIndex === wordGroup.length - 1
            ? (i + groupIndex === words.length - 1 ? clip.start + (word as { end: number }).end : words[i + groupIndex + 1] ? clip.start + (words[i + groupIndex + 1] as { start: number }).start : clip.start + (word as { end: number }).end)
            : clip.start + (wordGroup[groupIndex + 1] as { start: number }).start;
          ({ start: wordStart, end: wordEnd } = clampAssEventToClip(
            wordStart,
            wordEnd,
            clip.start,
            clip.duration
          ));

          let subtitleText = '';
          wordGroup.forEach((groupWord, wordIdx) => {
            const wordText = getSubtitleWordText(groupWord);
            if (wordIdx === groupIndex) {
              subtitleText += `{\\c&H0000FFFF&}${wordText}{\\c&H00FFFFFF&}`;
            } else {
              subtitleText += wordText;
            }
            if (wordIdx < wordGroup.length - 1) subtitleText += ASS_INTER_WORD_GAP;
          });

          assContent += `Dialogue: 0,${formatAssTime(wordStart)},${formatAssTime(wordEnd)},Normal,${speaker},0,0,0,,${subtitleText}\n`;
        });
      }
    } else {
      // Fallback: if word timings are missing, still render the subtitle clip text.
      const startTime = formatAssTime(clip.start);
      const endTime = formatAssTime(clip.start + clip.duration);
      assContent += `Dialogue: 0,${startTime},${endTime},Normal,${speaker},0,0,0,,${clip.text}\n`;
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
    const sourceOffset =
      typeof clip.sourceOffset === 'number' && Number.isFinite(clip.sourceOffset) ? Math.max(0, clip.sourceOffset) : 0;

    const chain: string[] = [];
    if (duration != null) {
      if (sourceOffset > 0) chain.push(`atrim=start=${sourceOffset}:duration=${duration}`);
      else chain.push(`atrim=0:${duration}`);
    } else if (sourceOffset > 0) {
      chain.push(`atrim=start=${sourceOffset}`);
    }
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

function sliceAudioClipsToWindow<T extends { start: number; duration?: number; sourceOffset?: number }>(
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
    const trimLeftTimeline = Math.max(0, segmentStart - clip.start);
    const baseOffset = typeof clip.sourceOffset === 'number' && Number.isFinite(clip.sourceOffset) ? clip.sourceOffset : 0;

    result.push({
      ...clip,
      start: localStart,
      duration: localDuration,
      sourceOffset: baseOffset + trimLeftTimeline,
    });
  }
  return result;
}

/**
 * Generate timeline-aware preview with subtitles, overlay images, and character images
 */
export async function generateTimelinePreview(
  project: Project,
  onProgress?: (percent: number, message: string) => void,
  options?: { versionTag?: string }
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const startedAt = Date.now();
  logPreviewServiceTelemetry('generate_timeline_preview_start', { projectId: project.id });
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

    let duration = timeline?.duration || session.totalDuration || 60;
    const templatePath = resolveTemplatePath(template.path);

    if (!fs.existsSync(templatePath)) {
      return { success: false, error: `Template not found: ${templatePath}` };
    }

    const outputPath = buildTimelinePreviewOutputPath(projectId, options?.versionTag);
    const outputPathFfmpeg = outputPath.replace(/\\/g, '/');
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    onProgress?.(10, 'Concatenating audio...');
    const { audioListPath, concatenatedAudioPath } = createPreviewAudioTempPaths(projectId, 'timeline_preview');
    const audioListContent = audioFiles.map((f: string) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(audioListPath, audioListContent);

    await new Promise<void>((resolve, reject) => {
      const concatCmd = ffmpeg()
        .input(audioListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'pcm_s16le'])
        .output(concatenatedAudioPath);
      concatCmd.on('start', () => {});
      concatCmd.on('stderr', () => {});
      concatCmd.on('end', () => resolve());
      concatCmd.on('error', (err: Error) => {
        cleanupPreviewTempFiles(audioListPath, concatenatedAudioPath);
        reject(err);
      });
      concatCmd.run();
    });
    // Prevent tail clipping when stored timeline/session duration is slightly shorter than actual audio.
    const concatenatedDuration = await probeMediaDurationSeconds(concatenatedAudioPath);
    if (concatenatedDuration > 0) {
      duration = Math.max(duration, concatenatedDuration + AUDIO_TAIL_BUFFER_SEC);
    }

    const planOverlayTracks = (timeline?.tracks ?? []).filter((t: any) => isPlanOverlayTrack(t));
    const characterTrack = timeline?.tracks?.find((t: any) => t.type === 'character');
    const musicTracks = (timeline?.tracks ?? []).filter((t: any) => t.type === 'music');
    const sfxTracks = (timeline?.tracks ?? []).filter((t: any) => t.type === 'sfx');
    const subtitleTrack = timeline?.tracks?.find((t: any) => t.type === 'subtitle');

    const overlayClips = planOverlayTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'overlay') || [])) as OverlayClip[];
    let characterClips = (characterTrack?.clips?.filter((c: any) => c.kind === 'character') || []) as CharacterClip[];
    characterClips = expandCharacterClipsExcludingReplaceRanges(
      characterClips,
      buildCharacterHiddenOverlayRanges(overlayClips)
    );
    let subtitleClips = (subtitleTrack?.clips?.filter((c: any) => c.kind === 'subtitle') || []) as SubtitleClip[];
    const musicClips = musicTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'music') || [])) as MusicClip[];
    const sfxClips = sfxTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'sfx') || [])) as SfxClip[];

    subtitleClips = excludeSubtitleClipsInRanges(subtitleClips, buildSubtitleMuteRanges(overlayClips));
    onProgress?.(15, 'Fetching word timings for karaoke...');
    if (subtitleClips.length > 0) {
      subtitleClips = await enrichSubtitleClipsWithWords(session, subtitleClips);
    }
    subtitleClips = clampSubtitleClipsToTimelineDuration(subtitleClips, duration);

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
    // Do not trim dialogue input at input level; keep full tail and trim only at output level.
    command.input(concatenatedAudioPath);

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
      if (clip.planStatus === 'draft') return;
      const overlayPath = resolveOverlayAssetPath(clip, audioSessionId, projectId);
      if (fs.existsSync(overlayPath)) {
        addOverlayInput(command, overlayPath, clip, duration);
        overlayInputs.push({ clip, inputIndex: nextInputIndex++, overlayPath });
      }
    });

    let nextIdx = nextInputIndex;
    const charInputs: { clip: CharacterClip; inputIndex: number }[] = [];
    for (const clip of characterClips) {
      const charPath = getCharacterClipImagePath(clip);
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

    filterComplex = `[0:v]${PREVIEW_TEMPLATE_TO_BG}[bg]`;
    lastLabel = 'bg';

    overlayInputs.forEach(({ clip, inputIndex, overlayPath }, index) => {
      const isReplace = isReplaceOverlayClip(clip);
      const isVideoOverlay = !isStillImageAsset(overlayPath);
      const setpts = isVideoOverlay
        ? `setpts=PTS-STARTPTS,tpad=start_duration=${clip.start}:start_mode=add:color=0x00000000@0,`
        : '';
      const scaledLabel = isReplace ? `ov_replace_${index}` : `ov${index}`;
      const overlayLabel = isReplace ? `vr${index}` : `vo${index}`;
      if (isReplace) {
        // Preserve full frame and fit inside vertical canvas for replace mode previews.
        filterComplex += `;[${inputIndex}:v]${setpts}scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2:0x101014[${scaledLabel}]`;
        filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
        lastLabel = overlayLabel;
        return;
      }

      if (isVideoOverlay) {
        if (isHyperframesAnimationOverlayClip(clip)) {
          filterComplex += `;[${inputIndex}:v]${setpts}scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2:0x00000000[${scaledLabel}]`;
          filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
          lastLabel = overlayLabel;
          return;
        }

        const topRegionH = getTopRegionHeight(PREVIEW_HEIGHT);
        filterComplex += `;[${inputIndex}:v]${setpts}scale=${PREVIEW_WIDTH}:${topRegionH}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${PREVIEW_WIDTH}:${topRegionH}:(ow-iw)/2:0:0x00000000[${scaledLabel}]`;
        filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
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
      filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=${placement.x}:${placement.y}:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
      lastLabel = overlayLabel;
    });

    if (charInputs.length > 0) {
      const stewieScaleW = Math.floor(500 * SCALE);
      const stewieScaleH = Math.floor(600 * SCALE);
      const peterScaleW = Math.floor(580 * SCALE);
      const peterScaleH = Math.floor(720 * SCALE);
      const otherScaleW = Math.floor(560 * SCALE);
      const otherScaleH = Math.floor(760 * SCALE);
      const otherX = Math.floor(260 * SCALE);
      const otherY = Math.floor(1160 * SCALE);
      const { extraFilter, lastLabel: afterChars } = appendCharacterClipsToFilterComplex({
        charInputs,
        lastLabel,
        labelPrefix: 'prev',
        geom: {
          stewie: { x: stewieX, y: stewieY, w: stewieScaleW, h: stewieScaleH },
          peter: { x: peterX, y: peterY, w: peterScaleW, h: peterScaleH },
          other: { x: otherX, y: otherY, w: otherScaleW, h: otherScaleH },
        },
      });
      filterComplex += extraFilter;
      lastLabel = afterChars;
    }

    if (assPath && fs.existsSync(assPath)) {
      const assPathFixed = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const forceStyle = `Fontname=Arial-Black,FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,Bold=1,BorderStyle=1,Outline=3,Shadow=2,Alignment=2,MarginV=${marginV}`;
      filterComplex += `;[${lastLabel}]subtitles='${assPathFixed}':force_style='${forceStyle}'[with_subs]`;
      lastLabel = 'with_subs';
    }

    onProgress?.(50, 'Encoding preview...');

    filterComplex += `;[${lastLabel}]fps=30,format=yuv420p,setsar=1[out]`;
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
        path: resolveOverlayAssetPath(clip, audioSessionId, projectId)
      })),
      ...charInputs.map(({ clip, inputIndex }) => ({
        index: inputIndex,
        type: 'Character',
        path: getCharacterClipImagePath(clip)
      }))
    ];

    const timeout = setTimeout(() => {}, 60000);

    command.on('start', () => {});
    command.on('stderr', () => {});

    const videoCodecOpts = getPreviewVideoCodecOptions({ gopFrames: 60 });

    command
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[out]',
        '-map', audioMix.outputLabel ?? '1:a',
        '-t', duration.toString(),
        ...videoCodecOpts,
        '-b:v', PREVIEW_BITRATE,
        '-maxrate', '750k',
        '-bufsize', '1500k',
        ...PREVIEW_AUDIO_CODEC_OPTIONS,
        ...PREVIEW_MP4_MUX_OPTIONS,
        '-y'
      ]);
    command.output(outputPathFfmpeg);

    command.on('progress', (p: any) => {
      if (p.percent) onProgress?.(Math.min(95, 50 + (p.percent / 100) * 45), `Encoding: ${Math.round(p.percent)}%`);
    });

    await new Promise<void>((resolve, reject) => {
      command
        .on('end', () => {
          clearTimeout(timeout);
          cleanupPreviewTempFiles(audioListPath, concatenatedAudioPath, assPath ?? '');
          resolve();
        })
        .on('error', (err: Error) => {
          clearTimeout(timeout);
          cleanupPreviewTempFiles(audioListPath, concatenatedAudioPath, assPath ?? '');
          reject(err);
        })
        .run();
    });

    onProgress?.(100, 'Preview ready!');
    logPreviewServiceTelemetry('generate_timeline_preview_success', {
      projectId,
      duration_ms: Date.now() - startedAt,
      outputPath,
    });
    return { success: true, outputPath };
  } catch (error) {
    logPreviewServiceTelemetry('generate_timeline_preview_error', {
      projectId,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
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
  const startedAt = Date.now();
  logPreviewServiceTelemetry('generate_hls_preview_start', { projectId: project.id, version });
  previewDebug('[HLS Preview] start', { projectId: project.id, version });
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

    let duration = timeline?.duration || session.totalDuration || 60;
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
    const { audioListPath, concatenatedAudioPath } = createPreviewAudioTempPaths(projectId, 'hls_preview');
    const audioListContent = audioFiles.map((f: string) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(audioListPath, audioListContent);

    await new Promise<void>((resolve, reject) => {
      const concatCmd = ffmpeg()
        .input(audioListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'pcm_s16le'])
        .output(concatenatedAudioPath);
      concatCmd.on('start', () => {});
      concatCmd.on('stderr', () => {});
      concatCmd.on('end', () => resolve());
      concatCmd.on('error', (err: Error) => {
        cleanupPreviewTempFiles(audioListPath, concatenatedAudioPath);
        reject(err);
      });
      concatCmd.run();
    });
    // Prevent tail clipping when stored timeline/session duration is slightly shorter than actual audio.
    const concatenatedDuration = await probeMediaDurationSeconds(concatenatedAudioPath);
    if (concatenatedDuration > 0) {
      duration = Math.max(duration, concatenatedDuration + AUDIO_TAIL_BUFFER_SEC);
    }

    const planOverlayTracks = (timeline?.tracks ?? []).filter((t: any) => isPlanOverlayTrack(t));
    const characterTrack = timeline?.tracks?.find((t: any) => t.type === 'character');
    const musicTracks = (timeline?.tracks ?? []).filter((t: any) => t.type === 'music');
    const sfxTracks = (timeline?.tracks ?? []).filter((t: any) => t.type === 'sfx');
    const subtitleTrack = timeline?.tracks?.find((t: any) => t.type === 'subtitle');

    const overlayClips = planOverlayTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'overlay') || [])) as OverlayClip[];
    let characterClips = (characterTrack?.clips?.filter((c: any) => c.kind === 'character') || []) as CharacterClip[];
    characterClips = expandCharacterClipsExcludingReplaceRanges(
      characterClips,
      buildCharacterHiddenOverlayRanges(overlayClips)
    );
    let subtitleClips = (subtitleTrack?.clips?.filter((c: any) => c.kind === 'subtitle') || []) as SubtitleClip[];
    const musicClips = musicTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'music') || [])) as MusicClip[];
    const sfxClips = sfxTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'sfx') || [])) as SfxClip[];

    subtitleClips = excludeSubtitleClipsInRanges(subtitleClips, buildSubtitleMuteRanges(overlayClips));
    onProgress?.(15, 'Fetching word timings for HLS karaoke...');
    if (subtitleClips.length > 0) {
      subtitleClips = await enrichSubtitleClipsWithWords(session, subtitleClips);
    }
    subtitleClips = clampSubtitleClipsToTimelineDuration(subtitleClips, duration);

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
    // Do not trim dialogue input at input level; keep full tail and trim only at output level.
    command.input(concatenatedAudioPath);

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
      if (clip.planStatus === 'draft') return;
      const overlayPath = resolveOverlayAssetPath(clip, audioSessionId, projectId);
      if (fs.existsSync(overlayPath)) {
        addOverlayInput(command, overlayPath, clip, duration);
        overlayInputs.push({ clip, inputIndex: nextInputIndex++, overlayPath });
      }
    });

    let nextIdx = nextInputIndex;
    const charInputs: { clip: CharacterClip; inputIndex: number }[] = [];
    for (const clip of characterClips) {
      const charPath = getCharacterClipImagePath(clip);
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

    filterComplex = `[0:v]${PREVIEW_TEMPLATE_TO_BG}[bg]`;
    lastLabel = 'bg';

    overlayInputs.forEach(({ clip, inputIndex, overlayPath }, index) => {
      const isReplace = isReplaceOverlayClip(clip);
      const isVideoOverlay = !isStillImageAsset(overlayPath);
      const setpts = isVideoOverlay
        ? `setpts=PTS-STARTPTS,tpad=start_duration=${clip.start}:start_mode=add:color=0x00000000@0,`
        : '';
      const scaledLabel = isReplace ? `ov_replace_${index}` : `ov${index}`;
      const overlayLabel = isReplace ? `vr${index}` : `vo${index}`;
      if (isReplace) {
        // Preserve full frame and fit inside vertical canvas for replace mode previews.
        filterComplex += `;[${inputIndex}:v]${setpts}scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2:0x101014[${scaledLabel}]`;
        filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
        lastLabel = overlayLabel;
        return;
      }

      if (isVideoOverlay) {
        if (isHyperframesAnimationOverlayClip(clip)) {
          filterComplex += `;[${inputIndex}:v]${setpts}scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2:0x00000000[${scaledLabel}]`;
          filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
          lastLabel = overlayLabel;
          return;
        }

        const topRegionH = getTopRegionHeight(PREVIEW_HEIGHT);
        filterComplex += `;[${inputIndex}:v]${setpts}scale=${PREVIEW_WIDTH}:${topRegionH}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${PREVIEW_WIDTH}:${topRegionH}:(ow-iw)/2:0:0x00000000[${scaledLabel}]`;
        filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
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
      filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=${placement.x}:${placement.y}:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
      lastLabel = overlayLabel;
    });

    if (charInputs.length > 0) {
      const stewieScaleW = Math.floor(500 * SCALE);
      const stewieScaleH = Math.floor(600 * SCALE);
      const peterScaleW = Math.floor(580 * SCALE);
      const peterScaleH = Math.floor(720 * SCALE);
      const otherScaleW = Math.floor(560 * SCALE);
      const otherScaleH = Math.floor(760 * SCALE);
      const otherX = Math.floor(260 * SCALE);
      const otherY = Math.floor(1160 * SCALE);
      const { extraFilter, lastLabel: afterChars } = appendCharacterClipsToFilterComplex({
        charInputs,
        lastLabel,
        labelPrefix: 'hls',
        geom: {
          stewie: { x: stewieX, y: stewieY, w: stewieScaleW, h: stewieScaleH },
          peter: { x: peterX, y: peterY, w: peterScaleW, h: peterScaleH },
          other: { x: otherX, y: otherY, w: otherScaleW, h: otherScaleH },
        },
      });
      filterComplex += extraFilter;
      lastLabel = afterChars;
    }

    if (assPath && fs.existsSync(assPath)) {
      const assPathFixed = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const forceStyle = `Fontname=Arial-Black,FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,Bold=1,BorderStyle=1,Outline=3,Shadow=2,Alignment=2,MarginV=${marginV}`;
      filterComplex += `;[${lastLabel}]subtitles='${assPathFixed}':force_style='${forceStyle}'[with_subs]`;
      lastLabel = 'with_subs';
    }

    onProgress?.(50, 'Encoding HLS preview...');

    filterComplex += `;[${lastLabel}]fps=30,format=yuv420p,setsar=1[out]`;
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

    command.on('start', (cmdLine: string) => {
      previewDebug('[HLS Preview] ffmpeg start', { cmdLine });
    });
    command.on('stderr', (line: string) => {
      // Extremely noisy; keep only when PREVIEW_DEBUG=1.
      previewDebug('[HLS Preview] ffmpeg stderr', { line });
    });

    // GOP=fps*hls_time so each HLS segment starts on a keyframe → fast scrubbing.
    const videoCodecOpts = getPreviewVideoCodecOptions({ gopFrames: 90 });

    command
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[out]',
        '-map', audioMix.outputLabel ?? '1:a',
        '-t', duration.toString(),
        ...videoCodecOpts,
        '-b:v', PREVIEW_BITRATE,
        '-maxrate', '750k',
        '-bufsize', '1500k',
        ...PREVIEW_AUDIO_CODEC_OPTIONS,
        ...PREVIEW_HLS_MUX_OPTIONS,
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
          cleanupPreviewTempFiles(audioListPath, concatenatedAudioPath, assPath ?? '');
          
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
          cleanupPreviewTempFiles(audioListPath, concatenatedAudioPath, assPath ?? '');
          reject(err);
        })
        .run();
    });

    onProgress?.(100, 'HLS preview ready!');
    logPreviewServiceTelemetry('generate_hls_preview_success', {
      projectId,
      version,
      duration_ms: Date.now() - startedAt,
      playlistPath,
    });
    return { success: true, playlistPath };
  } catch (error) {
    logPreviewServiceTelemetry('generate_hls_preview_error', {
      projectId: project.id,
      version,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('[HLS Preview] generate error', { projectId: project.id, ...summarizeFfmpegError(error) });
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
 * Segment preview now includes karaoke subtitles in the local segment window
 * so paused/scrub preview better matches full preview/export behavior.
 */
export async function generateTimelineSegmentPreview(
  project: Project,
  centerTime: number,
  windowSeconds: number = 3,
  onProgress?: (percent: number, message: string) => void,
  options?: { versionTag?: string }
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const startedAt = Date.now();
  logPreviewServiceTelemetry('generate_segment_preview_start', {
    projectId: project.id,
    centerTime,
    windowSeconds,
  });
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

    const outputPath = buildSegmentPreviewOutputPath(
      projectId,
      segmentStart,
      segmentDuration,
      options?.versionTag
    );
    const outputPathFfmpeg = outputPath.replace(/\\/g, '/');
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    // High-signal telemetry for debugging "Error opening output file ... No such file or directory".
    logPreviewServiceTelemetry('generate_segment_preview_output_path', {
      projectId,
      centerTime,
      windowSeconds,
      segmentStart,
      segmentDuration,
      versionTag: sanitizePreviewVersion(options?.versionTag),
      outputPath,
      outputDir,
      outputDirExists: fs.existsSync(outputDir),
    });

    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    onProgress?.(10, 'Concatenating audio (segment)...');
    const { audioListPath, concatenatedAudioPath } = createPreviewAudioTempPaths(projectId, 'segment_preview');
    const audioListContent = audioFiles.map((f: string) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(audioListPath, audioListContent);

    await new Promise<void>((resolve, reject) => {
      const concatCmd = ffmpeg()
        .input(audioListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'pcm_s16le'])
        .output(concatenatedAudioPath);
      concatCmd.on('start', () => {});
      concatCmd.on('stderr', () => {});
      concatCmd.on('end', () => resolve());
      concatCmd.on('error', (err: Error) => {
        cleanupPreviewTempFiles(audioListPath, concatenatedAudioPath);
        reject(err);
      });
      concatCmd.run();
    });

    const planOverlayTracks = (timeline?.tracks ?? []).filter((t: any) => isPlanOverlayTrack(t));
    const characterTrack = timeline?.tracks?.find((t: any) => t.type === 'character');
    const musicTracks = (timeline?.tracks ?? []).filter((t: any) => t.type === 'music');
    const sfxTracks = (timeline?.tracks ?? []).filter((t: any) => t.type === 'sfx');
    const subtitleTrack = timeline?.tracks?.find((t: any) => t.type === 'subtitle');

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

    const sliceSubtitleClipsToWindow = (clips: SubtitleClip[]): SubtitleClip[] => {
      const result: SubtitleClip[] = [];
      for (const clip of clips) {
        const globalStart = clip.start;
        const globalEnd = clip.start + clip.duration;
        if (globalEnd <= segmentStart || globalStart >= segmentEnd) continue;

        const localStart = Math.max(0, globalStart - segmentStart);
        const localEnd = Math.min(segmentEnd, globalEnd) - segmentStart;
        const overlap = localEnd - localStart;
        // If a subtitle only overlaps the segment by a tiny sliver (common when scrubbing across a clip boundary),
        // rendering it as a 0.05s forced-min event looks like a "skipped" caption and destabilizes perceived sync.
        // Instead, drop sliver overlaps and let the next (real) clip render.
        if (overlap < Math.max(MIN_SUBTITLE_CLIP_DURATION, 0.12)) continue;
        const localDuration = Math.max(MIN_SUBTITLE_CLIP_DURATION, overlap);

        let words = clip.words;
        if (words && words.length > 0) {
          const clippedWords = words
            .map((w) => ({
              word: w.word,
              absStart: clip.start + w.start,
              absEnd: clip.start + w.end,
            }))
            .filter((w) => w.absEnd > segmentStart && w.absStart < segmentEnd)
            .map((w) => {
              const localAbsStart = Math.max(0, w.absStart - segmentStart);
              const localAbsEnd = Math.max(localAbsStart + 0.01, w.absEnd - segmentStart);
              return {
                word: w.word,
                start: Math.max(0, localAbsStart - localStart),
                end: Math.max(0.01, localAbsEnd - localStart),
              };
            });
          words = clippedWords.length > 0 ? clippedWords : undefined;
        }

        result.push({
          ...clip,
          start: localStart,
          duration: localDuration,
          words,
        });
      }
      return result;
    };

    const overlayClips = sliceClipsToWindow(
      planOverlayTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'overlay') || [])) as OverlayClip[]
    );
    let characterClips = sliceClipsToWindow(
      (characterTrack?.clips?.filter((c: any) => c.kind === 'character') || []) as CharacterClip[]
    );
    characterClips = expandCharacterClipsExcludingReplaceRanges(
      characterClips,
      buildCharacterHiddenOverlayRanges(overlayClips)
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
    let subtitleClips = (subtitleTrack?.clips?.filter((c: any) => c.kind === 'subtitle') || []) as SubtitleClip[];
    const subtitleClipsBeforeFilter = subtitleClips.length;
    subtitleClips = excludeSubtitleClipsInRanges(
      subtitleClips,
      buildSubtitleMuteRanges(
        planOverlayTracks.flatMap((t: any) => (t.clips?.filter((c: any) => c.kind === 'overlay') || [])) as OverlayClip[]
      )
    );
    const subtitleClipsAfterFilter = subtitleClips.length;
    if (subtitleClips.length > 0) {
      subtitleClips = await enrichSubtitleClipsWithWords(session, subtitleClips);
      // Safety: ensure subtitles never exceed the known full timeline duration before slicing.
      subtitleClips = clampSubtitleClipsToTimelineDuration(subtitleClips, fullDuration);
      subtitleClips = sliceSubtitleClipsToWindow(subtitleClips);
      subtitleClips = excludeSubtitleClipsInRanges(subtitleClips, buildSubtitleMuteRanges(overlayClips));
    }
    const subtitleClipsInWindow = subtitleClips.length;
    const subtitleWordsInWindow = subtitleClips.reduce((sum, c) => sum + (c.words?.length || 0), 0);
    const subtitleClipsMissingWordsInWindow = subtitleClips.reduce((sum, c) => sum + ((c.words?.length || 0) === 0 ? 1 : 0), 0);
    const subtitleClipDebug = subtitleClips.slice(0, 6).map((c) => ({
      id: c.id,
      start: c.start,
      duration: c.duration,
      textLen: (c.text || '').length,
      words: c.words?.length || 0,
      textPreview: (c.text || '').slice(0, 40),
    }));

    let assPath: string | null = null;
    if (subtitleClips.length > 0) {
      assPath = generateAssFromTimeline(`${projectId}_seg_${Math.round(segmentStart * 1000)}`, subtitleClips);
    }
    logPreviewServiceTelemetry('generate_segment_preview_subtitle_state', {
      projectId,
      centerTime,
      windowSeconds,
      segmentStart,
      segmentEnd,
      subtitleClipsBeforeFilter,
      subtitleClipsAfterFilter,
      subtitleClipsInWindow,
      subtitleWordsInWindow,
      subtitleClipsMissingWordsInWindow,
      assGenerated: Boolean(assPath),
      subtitleClipDebug,
    });

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
      if (clip.planStatus === 'draft') return;
      const overlayPath = resolveOverlayAssetPath(clip, audioSessionId, projectId);
      if (fs.existsSync(overlayPath)) {
        addOverlayInput(command, overlayPath, clip, segmentDuration);
        overlayInputs.push({ clip, inputIndex: nextInputIndex++, overlayPath });
      }
    });

    let nextIdx = nextInputIndex;
    const charInputs: { clip: CharacterClip; inputIndex: number }[] = [];
    for (const clip of characterClips) {
      const charPath = getCharacterClipImagePath(clip);
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
    filterComplex = `[0:v]${PREVIEW_TEMPLATE_TO_BG}[bg]`;
    lastLabel = 'bg';

    // Overlays in local segment time. Video overlays use setpts so they play 0→duration in order.
    overlayInputs.forEach(({ clip, inputIndex, overlayPath }, index) => {
      const isReplace = isReplaceOverlayClip(clip);
      const isVideoOverlay = !isStillImageAsset(overlayPath);
      const setpts = isVideoOverlay
        ? `setpts=PTS-STARTPTS,tpad=start_duration=${clip.start}:start_mode=add:color=0x00000000@0,`
        : '';
      const scaledLabel = isReplace ? `ov_replace_${index}` : `ov${index}`;
      const overlayLabel = isReplace ? `vr${index}` : `vo${index}`;
      if (isReplace) {
        // Preserve full frame and fit inside vertical canvas for replace mode previews.
        filterComplex += `;[${inputIndex}:v]${setpts}scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2:0x101014[${scaledLabel}]`;
        filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
        lastLabel = overlayLabel;
        return;
      }

      if (isVideoOverlay) {
        if (isHyperframesAnimationOverlayClip(clip)) {
          filterComplex += `;[${inputIndex}:v]${setpts}scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:(ow-iw)/2:(oh-ih)/2:0x00000000[${scaledLabel}]`;
          filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
          lastLabel = overlayLabel;
          return;
        }

        const topRegionH = getTopRegionHeight(PREVIEW_HEIGHT);
        filterComplex += `;[${inputIndex}:v]${setpts}scale=${PREVIEW_WIDTH}:${topRegionH}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${PREVIEW_WIDTH}:${topRegionH}:(ow-iw)/2:0:0x00000000[${scaledLabel}]`;
        filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
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
      filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=${placement.x}:${placement.y}:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
      lastLabel = overlayLabel;
    });

    if (charInputs.length > 0) {
      const stewieScaleW = Math.floor(500 * SCALE);
      const stewieScaleH = Math.floor(600 * SCALE);
      const peterScaleW = Math.floor(580 * SCALE);
      const peterScaleH = Math.floor(720 * SCALE);
      const otherScaleW = Math.floor(560 * SCALE);
      const otherScaleH = Math.floor(760 * SCALE);
      const otherX = Math.floor(260 * SCALE);
      const otherY = Math.floor(1160 * SCALE);
      const { extraFilter, lastLabel: afterChars } = appendCharacterClipsToFilterComplex({
        charInputs,
        lastLabel,
        labelPrefix: 'seg',
        geom: {
          stewie: { x: stewieX, y: stewieY, w: stewieScaleW, h: stewieScaleH },
          peter: { x: peterX, y: peterY, w: peterScaleW, h: peterScaleH },
          other: { x: otherX, y: otherY, w: otherScaleW, h: otherScaleH },
        },
      });
      filterComplex += extraFilter;
      lastLabel = afterChars;
    }

    if (assPath && fs.existsSync(assPath)) {
      const fontSize = Math.floor(48 * SCALE);
      const marginV = Math.floor(700 * SCALE);
      const assPathFixed = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const forceStyle = `Fontname=Arial-Black,FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,Bold=1,BorderStyle=1,Outline=3,Shadow=2,Alignment=2,MarginV=${marginV}`;
      filterComplex += `;[${lastLabel}]subtitles='${assPathFixed}':force_style='${forceStyle}'[with_subs]`;
      lastLabel = 'with_subs';
    }

    onProgress?.(50, 'Encoding segment preview...');

    filterComplex += `;[${lastLabel}]fps=30,format=yuv420p,setsar=1[out]`;
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

    command.on('start', (cmdLine: string) => {
      previewDebug('[Segment Preview] ffmpeg start', {
        projectId,
        outputPath,
        outputDir,
        outputDirExists: fs.existsSync(outputDir),
        cmdLine,
      });
    });
    command.on('stderr', (line: string) => {
      // Quiet by default; enable with PREVIEW_DEBUG=1.
      previewDebug('[Segment Preview] ffmpeg stderr', { line });
    });

    // Short segment: smaller GOP so the player can show the very first frame fast.
    const videoCodecOpts = getPreviewVideoCodecOptions({ gopFrames: 30 });

    command
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[out]',
        '-map', audioMix.outputLabel ?? '1:a',
        '-t', segmentDuration.toString(),
        ...videoCodecOpts,
        '-b:v', PREVIEW_BITRATE,
        '-maxrate', '750k',
        '-bufsize', '1500k',
        ...PREVIEW_AUDIO_CODEC_OPTIONS,
        ...PREVIEW_MP4_MUX_OPTIONS,
        '-y'
      ]);
    command.output(outputPathFfmpeg);

    command.on('progress', (p: any) => {
      if (p.percent) onProgress?.(Math.min(95, 50 + (p.percent / 100) * 45), `Encoding (segment): ${Math.round(p.percent)}%`);
    });

    await new Promise<void>((resolve, reject) => {
      command
        .on('end', () => {
          clearTimeout(timeout);
          cleanupPreviewTempFiles(audioListPath, concatenatedAudioPath, assPath ?? '');
          resolve();
        })
        .on('error', (err: Error) => {
          clearTimeout(timeout);
          cleanupPreviewTempFiles(audioListPath, concatenatedAudioPath, assPath ?? '');
          logPreviewServiceTelemetry('generate_segment_preview_ffmpeg_error', {
            projectId,
            centerTime,
            windowSeconds,
            segmentStart,
            segmentDuration,
            outputPath,
            outputDir,
            outputDirExists: fs.existsSync(outputDir),
            ...summarizeFfmpegError(err),
          });
          reject(err);
        })
        .run();
    });

    onProgress?.(100, 'Segment preview ready!');
    logPreviewServiceTelemetry('generate_segment_preview_success', {
      projectId,
      duration_ms: Date.now() - startedAt,
      centerTime,
      windowSeconds,
      outputPath,
    });
    return { success: true, outputPath };
  } catch (error) {
    logPreviewServiceTelemetry('generate_segment_preview_error', {
      projectId: project.id,
      duration_ms: Date.now() - startedAt,
      centerTime,
      windowSeconds,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
