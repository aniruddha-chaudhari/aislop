import fs from 'fs';
import path from 'path';
import { Project, Timeline, Track, SubtitleClip, OverlayClip, CharacterClip } from '../schema/project';
import { publishFileUpdate } from './eventEmitter';
import { getCharacterImagePath } from '../utils/characterImages';

const VIDEO_OUTPUT_DIR = path.join(process.cwd(), 'storage', 'videos');
const TEMP_DIR = path.join(process.cwd(), 'storage', 'temp');
const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'images');

// Ensure directories exist
[VIDEO_OUTPUT_DIR, TEMP_DIR, IMAGE_UPLOAD_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Compile timeline to video using FFmpeg
 */
export async function compileTimeline(
  project: Project,
  onProgress?: (progress: number, message: string) => void
): Promise<{ success: boolean; outputPath: string; error?: string }> {
  console.log(`🎬 [COMPILER] Starting timeline compilation for project ${project.id}`);

  try {
    // 1. Load audio session files
    const audioFiles = await getAudioSessionFiles(project.audioSessionId);
    if (audioFiles.length === 0) {
      throw new Error('No audio files found for session');
    }

    // 2. Generate ASS subtitle file from timeline
    const assPath = await generateAssFromTimeline(project.timeline, project.audioSessionId);

    // 3. Concatenate audio files
    const concatenatedAudioPath = await concatenateAudioFiles(audioFiles, project.id);

    // 4. Build and execute FFmpeg command
    const outputFilename = `${project.id}_${Date.now()}.mp4`;
    const outputPath = path.join(VIDEO_OUTPUT_DIR, outputFilename);

    await executeFFmpegCommand(
      project,
      concatenatedAudioPath,
      assPath,
      outputPath,
      onProgress
    );

    console.log(`✅ [COMPILER] Timeline compiled successfully: ${outputPath}`);
    return { success: true, outputPath };

  } catch (error) {
    console.error('❌ [COMPILER] Error compiling timeline:', error);
    return { 
      success: false, 
      outputPath: '', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get audio files for a session
 */
async function getAudioSessionFiles(sessionId: string): Promise<string[]> {
  const { PrismaClient } = await import('../generated/prisma');
  const prisma = new PrismaClient();

  try {
    const session = await prisma.audioSession.findUnique({
      where: { sessionId },
      include: {
        dialogues: {
          include: { audioFile: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const audioFiles = session.dialogues
      .filter(d => d.audioFile?.path && fs.existsSync(d.audioFile.path))
      .map(d => d.audioFile!.path);

    return audioFiles;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Generate ASS subtitle file from timeline
 */
async function generateAssFromTimeline(
  timeline: Timeline,
  sessionId: string
): Promise<string> {
  const subtitleTrack = timeline.tracks.find(t => t.type === 'subtitle');
  if (!subtitleTrack) {
    throw new Error('No subtitle track found in timeline');
  }

  const outputPath = path.join(TEMP_DIR, `${sessionId}_timeline.ass`);

  // Generate ASS header
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

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Add subtitle clips
  const subtitleClips = subtitleTrack.clips
    .filter(c => c.kind === 'subtitle')
    .sort((a, b) => a.start - b.start) as SubtitleClip[];

  for (const clip of subtitleClips) {
    const startTime = formatAssTime(clip.start);
    const endTime = formatAssTime(clip.start + clip.duration);
    const speaker = clip.speaker || 'Speaker';
    const text = clip.text;

    assContent += `Dialogue: 0,${startTime},${endTime},Normal,${speaker},0,0,0,,${text}\n`;
  }

  fs.writeFileSync(outputPath, assContent, 'utf8');
  console.log(`✅ [COMPILER] Generated ASS file: ${outputPath}`);
  return outputPath;
}

/**
 * Format time for ASS (H:MM:SS.CC)
 */
function formatAssTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centisecs = Math.floor((seconds % 1) * 100);
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
}

/**
 * Concatenate audio files
 */
async function concatenateAudioFiles(
  audioFiles: string[],
  projectId: string
): Promise<string> {
  const outputPath = path.join(TEMP_DIR, `${projectId}_audio.mp3`);

  if (audioFiles.length === 1) {
    // Just copy the single file
    fs.copyFileSync(audioFiles[0], outputPath);
    return outputPath;
  }

  // Create concat file list
  const concatListPath = path.join(TEMP_DIR, `${projectId}_concat.txt`);
  const concatList = audioFiles.map(f => `file '${f}'`).join('\n');
  fs.writeFileSync(concatListPath, concatList, 'utf8');

  // Concatenate using FFmpeg
  const ffmpeg = require('fluent-ffmpeg');
  
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .output(outputPath)
      .on('end', () => {
        console.log('✅ [COMPILER] Audio files concatenated');
        resolve(outputPath);
      })
      .on('error', (err: Error) => {
        console.error('❌ [COMPILER] Error concatenating audio:', err);
        reject(err);
      })
      .run();
  });
}

/**
 * Execute FFmpeg command to generate video
 */
async function executeFFmpegCommand(
  project: Project,
  audioPath: string,
  assPath: string,
  outputPath: string,
  onProgress?: (progress: number, message: string) => void
): Promise<void> {
  const ffmpeg = require('fluent-ffmpeg');
  const { timeline, template } = project;

  // Get overlay and character clips
  const overlayTrack = timeline.tracks.find(t => t.type === 'overlay');
  const characterTrack = timeline.tracks.find(t => t.type === 'character');

  const overlayClips = overlayTrack?.clips.filter(c => c.kind === 'overlay') as OverlayClip[] || [];
  const characterClips = characterTrack?.clips.filter(c => c.kind === 'character') as CharacterClip[] || [];

  console.log(`📊 [COMPILER] Processing ${overlayClips.length} overlay clips, ${characterClips.length} character clips`);

  // Build FFmpeg command
  const command = ffmpeg();

  // 1. Add template as base
  if (template.type === 'video') {
    // Loop video to match audio duration
    command
      .input(template.path)
      .inputOptions([
        '-stream_loop', '-1', // Loop video
        '-t', timeline.duration.toString() // Limit to timeline duration
      ]);
  } else {
    // Static image - convert to video
    command
      .input(template.path)
      .inputOptions([
        '-loop', '1',
        '-t', timeline.duration.toString()
      ]);
  }

  // 2. Add audio
  command.input(audioPath);

  // 3. Add overlay images as inputs (use clip.path when set, else storage/images/{sessionId}/{assetId}.png)
  const overlayInputs: { clip: OverlayClip; inputIndex: number }[] = [];
  overlayClips.forEach((clip, index) => {
    const imagePath = clip.path ?? path.join(IMAGE_UPLOAD_DIR, project.audioSessionId, `${clip.assetId}.png`);
    if (fs.existsSync(imagePath)) {
      command.input(imagePath);
      overlayInputs.push({ clip, inputIndex: 2 + index }); // 0=template, 1=audio, 2+=overlays
    } else {
      console.warn(`⚠️ [COMPILER] Overlay image not found: ${imagePath}`);
    }
  });

  // 4. Add character images as inputs (one per clip; same file can be repeated)
  let nextInputIndex = 2 + overlayInputs.length;
  const characterInputs: { clip: CharacterClip; inputIndex: number }[] = [];
  for (const clip of characterClips) {
    const charPath = getCharacterImagePath(clip.character);
    if (!charPath) {
      console.warn(`⚠️ [COMPILER] Character image not found: ${clip.character}`);
      continue;
    }
    command.input(charPath);
    characterInputs.push({ clip, inputIndex: nextInputIndex++ });
  }
  if (characterInputs.length > 0) {
    console.log(`🧍 [COMPILER] Adding ${characterInputs.length} character overlay(s)`);
  }

  // 5. Build filter complex
  let filterComplex = '';
  let lastLabel = '0:v';

  // Add subtitles first
  filterComplex += `[${lastLabel}]ass='${assPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}'[with_subs]`;
  lastLabel = 'with_subs';

  // Add overlay images
  overlayInputs.forEach(({ clip, inputIndex }, index) => {
    const scaledLabel = `scaled_${index}`;
    const overlayLabel = `with_overlay_${index}`;
    const xPos = `(W-w)*${clip.x}`;
    const yPos = `(H-h)*${clip.y}`;
    const targetWidth = Math.floor(1080 * clip.scale);
    filterComplex += `;[${inputIndex}:v]scale=${targetWidth}:-1[${scaledLabel}]`;
    filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=${xPos}:${yPos}:enable='between(t,${clip.start},${clip.start + clip.duration})'[${overlayLabel}]`;
    lastLabel = overlayLabel;
  });

  // Add character overlays
  characterInputs.forEach(({ clip, inputIndex }, index) => {
    const scaledLabel = `char_scaled_${index}`;
    const charLabel = `with_char_${index}`;
    const xPos = `(W-w)*${clip.x}`;
    const yPos = `(H-h)*${clip.y}`;
    const targetWidth = Math.floor(1080 * clip.scale);
    filterComplex += `;[${inputIndex}:v]scale=${targetWidth}:-1[${scaledLabel}]`;
    filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=${xPos}:${yPos}:enable='between(t,${clip.start},${clip.start + clip.duration})'[${charLabel}]`;
    lastLabel = charLabel;
  });

  // Set output options
  command
    .complexFilter(filterComplex)
    .outputOptions([
      '-map', `[${lastLabel}]`, // Use final filtered video
      '-map', '1:a', // Use audio from input 1
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-shortest'
    ])
    .output(outputPath);

  // Progress tracking
  command.on('progress', (progress: any) => {
    if (progress.percent && onProgress) {
      const percent = Math.min(Math.round(progress.percent), 99);
      onProgress(percent, `Rendering video: ${percent}%`);
      
      // Emit SSE progress
      publishFileUpdate(project.id, {
        type: 'progress',
        message: `Rendering video: ${percent}%`,
        percent,
      });
    }
  });

  return new Promise((resolve, reject) => {
    command
      .on('end', () => {
        console.log('✅ [COMPILER] FFmpeg processing complete');
        if (onProgress) {
          onProgress(100, 'Video export complete');
        }
        
        // Emit SSE complete
        publishFileUpdate(project.id, {
          type: 'complete',
          message: 'Video export complete',
          videoPath: outputPath,
        });
        
        resolve();
      })
      .on('error', (err: Error) => {
        console.error('❌ [COMPILER] FFmpeg error:', err);
        
        // Emit SSE error
        publishFileUpdate(project.id, {
          type: 'error',
          message: err.message,
        });
        
        reject(err);
      })
      .run();
  });
}
