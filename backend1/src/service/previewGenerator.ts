import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

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

    // Return cached preview if it exists and is recent
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const ageMs = Date.now() - stats.mtimeMs;
      // Cache for 1 hour
      if (ageMs < 3600000) {
        console.log(`✅ [PREVIEW] Using cached preview: ${outputPath}`);
        return { success: true, outputPath };
      }
    }

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
    command
      .outputOptions([
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
