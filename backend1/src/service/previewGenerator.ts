import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
import { PrismaClient } from '../generated/prisma';
import type { Project, SubtitleClip, OverlayClip, CharacterClip } from '../schema/project';
import { getCharacterImagePath } from '../utils/characterImages';

const prisma = new PrismaClient();
const TEMP_DIR = path.join(process.cwd(), 'storage', 'temp');
const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'images');

// Set ffmpeg path
const customFfmpegPath = process.env.CUSTOM_FFMPEG_PATH;
const ffmpegPath = customFfmpegPath || ffmpegInstaller.path;
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Preview configuration
const PREVIEW_DIR = path.join(process.cwd(), 'storage', 'previews');
const PREVIEW_WIDTH = 360; // Low-res for fast preview
const PREVIEW_HEIGHT = 640; // 9:16 aspect ratio
const PREVIEW_BITRATE = '500k'; // Low bitrate for fast generation

// Ensure preview directory exists
if (!fs.existsSync(PREVIEW_DIR)) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  console.log(`📁 [PREVIEW] Created preview directory: ${PREVIEW_DIR}`);
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
  console.log(`🎬 [PREVIEW] Generating preview for project ${projectId}`);
  
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

    // Generate cache key based on template + audio session
    const cacheKey = crypto
      .createHash('md5')
      .update(`${templatePath}:${audioSessionId}`)
      .digest('hex');
    
    const outputFilename = `preview_${cacheKey}.mp4`;
    const outputPath = path.join(PREVIEW_DIR, outputFilename);

    // Always regenerate preview (no caching) to ensure changes are reflected
    console.log(`🎬 [PREVIEW] Generating fresh preview (no cache): ${outputPath}`);

    onProgress?.(10, 'Concatenating audio files...');

    // Create concat file for audio
    const audioListPath = path.join(PREVIEW_DIR, `audio_list_${cacheKey}.txt`);
    const audioListContent = audioFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(audioListPath, audioListContent);

    // Concatenate audio files
    const concatenatedAudioPath = path.join(PREVIEW_DIR, `audio_${cacheKey}.wav`);
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(audioListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'pcm_s16le'])
        .output(concatenatedAudioPath)
        .on('end', () => {
          console.log(`✅ [PREVIEW] Audio concatenated: ${concatenatedAudioPath}`);
          resolve();
        })
        .on('error', reject)
        .run();
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
    command
      .outputOptions([
        '-map', '0:v', // Video from template (input 0)
        '-map', '1:a', // Audio from concatenated dialogue (input 1), NOT template
        '-c:v', 'libx264',
        '-preset', 'ultrafast', // Fast encode
        '-crf', '28', // Lower quality for smaller file
        '-vf', `scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=increase,crop=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}`,
        '-c:a', 'aac',
        '-b:a', '64k', // Low audio bitrate
        '-ac', '2',
        '-ar', '22050', // Lower sample rate
        '-shortest', // End when shortest input ends
        '-y' // Overwrite
      ])
      .output(outputPath);

    // Track progress
    command.on('progress', (progress: any) => {
      if (progress.percent) {
        const percent = Math.min(95, 60 + (progress.percent / 100) * 35);
        onProgress?.(percent, `Encoding: ${Math.round(progress.percent)}%`);
      }
    });

    await new Promise<void>((resolve, reject) => {
      command
        .on('end', () => {
          console.log(`✅ [PREVIEW] Preview generated: ${outputPath}`);
          // Cleanup temp files
          try {
            fs.unlinkSync(audioListPath);
            fs.unlinkSync(concatenatedAudioPath);
          } catch (e) {
            console.warn('[PREVIEW] Failed to cleanup temp files:', e);
          }
          resolve();
        })
        .on('error', (err: Error) => {
          console.error(`❌ [PREVIEW] FFmpeg error:`, err);
          reject(err);
        })
        .run();
    });

    onProgress?.(100, 'Preview ready!');

    return { success: true, outputPath };
  } catch (error) {
    console.error('[PREVIEW] Error generating preview:', error);
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

function generateAssFromTimeline(projectId: string, subtitleClips: SubtitleClip[]): string {
  const outputPath = path.join(TEMP_DIR, `preview_${projectId}_subs.ass`);
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  let assContent = `[Script Info]
Title: Timeline Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Normal,Arial-Black,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,2,30,30,800,1
Style: Highlight,Arial-Black,48,&H0000FFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,2,30,30,800,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const clip of subtitleClips.sort((a, b) => a.start - b.start)) {
    const speaker = clip.speaker || 'Speaker';

    if (clip.words && clip.words.length > 0) {
      // Karaoke: groups of 3 words, highlight current word (yellow)
      const words = clip.words;
      for (let i = 0; i < words.length; i += 3) {
        const wordGroup = words.slice(i, Math.min(i + 3, words.length));
        wordGroup.forEach((word, groupIndex) => {
          const wordStart = clip.start + word.start;
          const wordEnd = groupIndex === wordGroup.length - 1
            ? (i + groupIndex === words.length - 1 ? clip.start + word.end : clip.start + (words[i + groupIndex + 1]?.start ?? word.end))
            : clip.start + wordGroup[groupIndex + 1].start;

          let subtitleText = '';
          wordGroup.forEach((gw, wordIdx) => {
            const w = (gw as { word: string }).word || '';
            if (wordIdx === groupIndex) {
              subtitleText += `{\\c&H0000FFFF&}${w}{\\c&H00FFFFFF&}`;
            } else {
              subtitleText += w;
            }
            if (wordIdx < wordGroup.length - 1) subtitleText += ' ';
          });

          assContent += `Dialogue: 0,${formatAssTime(wordStart)},${formatAssTime(wordEnd)},Normal,${speaker},0,0,0,,${subtitleText}\n`;
        });
      }
    } else {
      // Simple: no karaoke
      const startTime = formatAssTime(clip.start);
      const endTime = formatAssTime(clip.start + clip.duration);
      const text = (clip.text || '').replace(/\n/g, '\\N');
      assContent += `Dialogue: 0,${startTime},${endTime},Normal,${speaker},0,0,0,,${text}\n`;
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

    const cacheKey = crypto.createHash('md5').update(`${templatePath}:${audioSessionId}`).digest('hex');
    const outputPath = path.join(PREVIEW_DIR, `preview_${cacheKey}.mp4`);

    onProgress?.(10, 'Concatenating audio...');
    const audioListPath = path.join(PREVIEW_DIR, `audio_list_${cacheKey}.txt`);
    const audioListContent = audioFiles.map((f: string) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(audioListPath, audioListContent);

    const concatenatedAudioPath = path.join(PREVIEW_DIR, `audio_${cacheKey}.wav`);
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(audioListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'pcm_s16le'])
        .output(concatenatedAudioPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });

    const overlayTrack = timeline?.tracks?.find((t: any) => t.type === 'overlay' && t.id === 't_imgs');
    const characterTrack = timeline?.tracks?.find((t: any) => t.type === 'character');
    const subtitleTrack = timeline?.tracks?.find((t: any) => t.type === 'subtitle');

    const overlayClips = (overlayTrack?.clips?.filter((c: any) => c.kind === 'overlay') || []) as OverlayClip[];
    const characterClips = (characterTrack?.clips?.filter((c: any) => c.kind === 'character') || []) as CharacterClip[];
    const subtitleClips = (subtitleTrack?.clips?.filter((c: any) => c.kind === 'subtitle') || []) as SubtitleClip[];

    let assPath: string | null = null;
    if (subtitleClips.length > 0) {
      assPath = generateAssFromTimeline(projectId, subtitleClips);
    }

    const command = ffmpeg();
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(templatePath);

    if (isImage) {
      command.input(templatePath).inputOptions(['-loop', '1', '-t', duration.toString()]);
    } else {
      command.input(templatePath).inputOptions(['-stream_loop', '-1', '-t', duration.toString()]);
    }
    command.input(concatenatedAudioPath);

    const overlayInputs: { clip: OverlayClip; inputIndex: number }[] = [];
    overlayClips.forEach((clip: OverlayClip, index: number) => {
      const imagePath = clip.path ?? path.join(IMAGE_UPLOAD_DIR, audioSessionId, `${clip.assetId}.png`);
      if (fs.existsSync(imagePath)) {
        command.input(imagePath);
        overlayInputs.push({ clip, inputIndex: 2 + index });
      }
    });

    let nextIdx = 2 + overlayInputs.length;
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

    if (assPath && fs.existsSync(assPath)) {
      filterComplex += `[${lastLabel}]ass='${assPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}'[with_subs]`;
      lastLabel = 'with_subs';
    }

    overlayInputs.forEach(({ clip, inputIndex }, index) => {
      const sw = Math.floor(PREVIEW_WIDTH * clip.scale);
      const xPos = `(W-w)*${clip.x}`;
      const yPos = `(H-h)*${clip.y}`;
      filterComplex += `;[${inputIndex}:v]scale=${sw}:-1[ov${index}]`;
      filterComplex += `;[${lastLabel}][ov${index}]overlay=${xPos}:${yPos}:enable='between(t,${clip.start},${clip.start + clip.duration})'[vo${index}]`;
      lastLabel = `vo${index}`;
    });

    charInputs.forEach(({ clip, inputIndex }, index) => {
      const sw = Math.floor(PREVIEW_WIDTH * clip.scale);
      const xPos = `(W-w)*${clip.x}`;
      const yPos = `(H-h)*${clip.y}`;
      filterComplex += `;[${inputIndex}:v]scale=${sw}:-1[c${index}]`;
      filterComplex += `;[${lastLabel}][c${index}]overlay=${xPos}:${yPos}:enable='between(t,${clip.start},${clip.start + clip.duration})'[vc${index}]`;
      lastLabel = `vc${index}`;
    });

    onProgress?.(50, 'Encoding preview...');

    const scaleFilter = `scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=increase,crop=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}`;

    if (filterComplex) {
      filterComplex += `;[${lastLabel}]${scaleFilter}[out]`;
      command
        .complexFilter(filterComplex)
        .outputOptions([
          '-map', '[out]',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-c:a', 'aac',
          '-b:a', '64k',
          '-ac', '2',
          '-ar', '22050',
          '-shortest',
          '-y'
        ])
        .output(outputPath);
    } else {
      command
        .outputOptions([
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-vf', `scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}:force_original_aspect_ratio=increase,crop=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}`,
          '-c:a', 'aac',
          '-b:a', '64k',
          '-ac', '2',
          '-ar', '22050',
          '-shortest',
          '-y'
        ])
        .output(outputPath);
    }

    command.on('progress', (p: any) => {
      if (p.percent) onProgress?.(Math.min(95, 50 + (p.percent / 100) * 45), `Encoding: ${Math.round(p.percent)}%`);
    });

    await new Promise<void>((resolve, reject) => {
      command
        .on('end', () => {
          try {
            fs.unlinkSync(audioListPath);
            fs.unlinkSync(concatenatedAudioPath);
          } catch (_) {}
          resolve();
        })
        .on('error', reject)
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
 * Get preview video path if it exists in cache
 */
export function getPreviewPath(projectId: string, templatePath: string, audioSessionId: string): string | null {
  const cacheKey = crypto
    .createHash('md5')
    .update(`${templatePath}:${audioSessionId}`)
    .digest('hex');
  
  const outputPath = path.join(PREVIEW_DIR, `preview_${cacheKey}.mp4`);
  
  if (fs.existsSync(outputPath)) {
    return outputPath;
  }
  
  return null;
}

/**
 * Clean up old preview files (older than 24 hours)
 */
export function cleanupOldPreviews(): void {
  try {
    if (!fs.existsSync(PREVIEW_DIR)) return;
    
    const files = fs.readdirSync(PREVIEW_DIR);
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(PREVIEW_DIR, file);
      const stats = fs.statSync(filePath);
      const ageMs = now - stats.mtimeMs;
      
      // Delete files older than 24 hours
      if (ageMs > 86400000) {
        fs.unlinkSync(filePath);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 [PREVIEW] Cleaned up ${cleanedCount} old preview files`);
    }
  } catch (error) {
    console.warn('[PREVIEW] Error cleaning up previews:', error);
  }
}
