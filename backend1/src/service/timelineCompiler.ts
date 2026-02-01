import fs from 'fs';
import path from 'path';
import { Project, Timeline, Track, SubtitleClip, OverlayClip, CharacterClip } from '../schema/project';
import { publishFileUpdate } from './eventEmitter';
import { getCharacterImagePath } from '../utils/characterImages';
import { getSessionDuration } from './sessionDuration';

const VIDEO_OUTPUT_DIR = path.join(process.cwd(), 'storage', 'videos');
const TEMP_DIR = path.join(process.cwd(), 'storage', 'temp');
const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'images');

const ffmpeg = require('fluent-ffmpeg');

// Ensure directories exist
[VIDEO_OUTPUT_DIR, TEMP_DIR, IMAGE_UPLOAD_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Subtitle styling configuration (same as backend videoGenerator)
const SUBTITLE_STYLES = {
  fontName: 'Arial-Black',
  fontSize: 48,
  primaryColor: '&H00FFFFFF',
  secondaryColor: '&H000000FF',
  outlineColor: '&H00000000',
  backColor: '&H80000000',
  bold: 1,
  italic: 0,
  borderStyle: 1,
  outline: 3,
  shadow: 2,
  alignment: 2,
  marginV: 700
};

/**
 * Compile timeline to video using FFmpeg
 */
export async function compileTimeline(
  project: Project,
  options?: {
    quality?: 'preview' | 'final';
    outputDir?: string;
    outputFilename?: string;
    onProgress?: (progress: number, message: string) => void;
  }
): Promise<{ success: boolean; outputPath: string; error?: string }> {
  const quality = options?.quality || 'final';
  const outputDir = options?.outputDir || VIDEO_OUTPUT_DIR;
  const outputFilename = options?.outputFilename || `${project.id}_${Date.now()}.mp4`;
  const onProgress = options?.onProgress;

  const outputPath = path.join(outputDir, outputFilename);

  try {
    const { preset, crf, scale } = getQualitySettings(quality);

    let command = ffmpeg();

    let duration = 60;
    if (project.timeline && project.timeline.duration > 0) {
      duration = project.timeline.duration;
    } else if (project.audioSessionId && project.audioSessionId !== 'no-session') {
      const sessionDur = await getSessionDuration(project.audioSessionId);
      if (sessionDur > 0) duration = sessionDur;
    }

    const overlayClips: OverlayClip[] = [];
    const characterClips: CharacterClip[] = [];

    if (project.timeline && project.timeline.tracks.length > 0) {
      const overlayTrack = project.timeline.tracks.find(t => t.type === 'overlay');
      const characterTrack = project.timeline.tracks.find(t => t.type === 'character');

      overlayClips.push(...(overlayTrack?.clips.filter(c => c.kind === 'overlay') as OverlayClip[] || []));
      characterClips.push(...(characterTrack?.clips.filter(c => c.kind === 'character') as CharacterClip[] || []));
    }

    let assPath: string | null = null;
    const subtitleTrack = project.timeline?.tracks.find(t => t.type === 'subtitle');
    const subtitleClips = subtitleTrack?.clips.filter(c => c.kind === 'subtitle') as SubtitleClip[] || [];

    if (subtitleClips.length > 0) {
      assPath = await generateKaraokeAssSubtitles(subtitleClips, project.id);
    }

    if (project.template.type === 'video') {
      command
        .input(project.template.path)
        .inputOptions([
          '-stream_loop', '-1',
          '-t', duration.toString()
        ]);
    } else {
      command
        .input(project.template.path)
        .inputOptions([
          '-loop', '1',
          '-t', duration.toString()
        ]);
    }

    const audioPath = await getAudioPath(project);
    if (audioPath) {
      command.input(audioPath);
    }

    const overlayInputs: { clip: OverlayClip; inputIndex: number }[] = [];
    overlayClips.forEach((clip, index) => {
      const imagePath = clip.path ?? path.join(IMAGE_UPLOAD_DIR, project.audioSessionId, `${clip.assetId}.png`);
      if (fs.existsSync(imagePath)) {
        command.input(imagePath);
        overlayInputs.push({ clip, inputIndex: 2 + index });
      }
    });

    let nextInputIndex = 2 + overlayInputs.length;
    const characterInputs: { clip: CharacterClip; inputIndex: number }[] = [];
    const prescaledCharacterCache: Map<string, string> = new Map();

    for (const clip of characterClips) {
      const charPath = getCharacterImagePath(clip.character);
      if (!charPath) continue;

      const prescaledPath = await getOrCreatePrescaledCharacterImage(
        charPath,
        500,
        600,
        project.id
      );

      if (prescaledPath) {
        command.input(prescaledPath);
        characterInputs.push({ clip, inputIndex: nextInputIndex++ });
      }
    }

    let filterComplex = `[0:v]setpts=1.0,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[bg]`;
    let lastLabel = 'bg';

    if (assPath && fs.existsSync(assPath)) {
      const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const forceStyleOptions = [
        `Fontname=${SUBTITLE_STYLES.fontName}`,
        `FontSize=${SUBTITLE_STYLES.fontSize}`,
        `PrimaryColour=${SUBTITLE_STYLES.primaryColor}`,
        `OutlineColour=${SUBTITLE_STYLES.outlineColor}`,
        `BackColour=${SUBTITLE_STYLES.backColor}`,
        `Bold=${SUBTITLE_STYLES.bold}`,
        `BorderStyle=${SUBTITLE_STYLES.borderStyle}`,
        `Outline=${SUBTITLE_STYLES.outline}`,
        `Shadow=${SUBTITLE_STYLES.shadow}`,
        `Alignment=${SUBTITLE_STYLES.alignment}`,
        `MarginV=${SUBTITLE_STYLES.marginV}`
      ].join(',');

      filterComplex += `;[${lastLabel}]subtitles='${escapedAssPath}':force_style='${forceStyleOptions}'[with_subs]`;
      lastLabel = 'with_subs';
    }

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

    if (characterInputs.length > 0) {
      const stewieClips = characterInputs.filter(c => c.clip.character === 'Stewie');
      const peterClips = characterInputs.filter(c => c.clip.character === 'Peter');

      const stewieRanges: string[] = [];
      const peterRanges: string[] = [];

      stewieClips.forEach(({ clip }) => {
        const start = clip.start.toFixed(3);
        const end = (clip.start + clip.duration).toFixed(3);
        stewieRanges.push(`between(t,${start},${end})`);
      });

      peterClips.forEach(({ clip }) => {
        const start = clip.start.toFixed(3);
        const end = (clip.start + clip.duration).toFixed(3);
        peterRanges.push(`between(t,${start},${end})`);
      });

      const stewieEnable = stewieRanges.length > 0 ? stewieRanges.join('+') : '0';
      const peterEnable = peterRanges.length > 0 ? peterRanges.join('+') : '0';

      const stewieInputIndex = stewieClips[0]?.inputIndex;
      const peterInputIndex = peterClips[0]?.inputIndex;

      if (stewieInputIndex !== undefined) {
        filterComplex += `;[${lastLabel}][${stewieInputIndex}:v]overlay=300:1350:enable='${stewieEnable}'[stewie_overlay]`;
        lastLabel = 'stewie_overlay';
      }

      if (peterInputIndex !== undefined) {
        filterComplex += `;[${lastLabel}][${peterInputIndex}:v]overlay=300:1250:enable='${peterEnable}'[with_characters]`;
        lastLabel = 'with_characters';
      }
    }

    filterComplex += `;[${lastLabel}]format=yuv420p,setsar=1[final]`;

    command.complexFilter(filterComplex);

    command.outputOptions([
      '-map', '[final]',
      '-map', '1:a:0',
      '-c:v', 'libx264',
      '-preset', preset,
      '-crf', crf,
      '-s', scale,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', quality === 'preview' ? '128k' : '192k',
      '-ar', '44100',
      '-shortest'
    ]);

    command.output(outputPath);

    console.log('[FFMPEG] Inputs: template=0, audio=1, overlays=', overlayInputs.length, ', chars=', characterInputs.length);
    console.log('[FFMPEG] Filter:', filterComplex);
    console.log('[FFMPEG] Output:', outputPath);
    command.on('start', (cmd: string) => console.log('[FFMPEG] Command:', cmd));
    command.on('stderr', (line: string) => console.log('[FFMPEG] stderr:', line));
    command.on('progress', (progress: any) => {
      if (progress.percent && onProgress) {
        const percent = Math.min(Math.round(progress.percent), 99);
        onProgress(percent, `Rendering video: ${percent}%`);

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
          console.log('[FFMPEG] Done');
          if (onProgress) {
            onProgress(100, 'Video export complete');
          }

          publishFileUpdate(project.id, {
            type: 'complete',
            message: 'Video export complete',
            videoPath: outputPath,
          });

          resolve();
        })
        .on('error', (err: Error, _s?: string, stderr?: string) => {
          console.error('[FFMPEG] Error:', err.message);
          if (stderr) console.error('[FFMPEG] stderr:', stderr);

          publishFileUpdate(project.id, {
            type: 'error',
            message: err.message,
          });

          reject(err);
        })
        .run();
    });

  } catch (error) {
    return {
      success: false,
      outputPath: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function getOrCreatePrescaledCharacterImage(
  originalPath: string,
  width: number,
  height: number,
  projectId: string
): Promise<string | null> {
  const cacheDir = path.join(IMAGE_UPLOAD_DIR, 'prescaled');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const filename = path.basename(originalPath);
  const prescaledFilename = `${filename}_${width}x${height}.png`;
  const prescaledPath = path.join(cacheDir, prescaledFilename);

  if (fs.existsSync(prescaledPath)) {
    return prescaledPath;
  }

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(originalPath)
      .outputOptions(['-vf', `scale=${width}:${height}:flags=lanczos,format=yuva420p`, '-y'])
      .output(prescaledPath);
    cmd.on('start', (c: string) => console.log('[FFMPEG] Prescale char:', c));
    cmd.on('stderr', (l: string) => console.log('[FFMPEG] stderr:', l));
    cmd.on('end', () => resolve(prescaledPath));
    cmd.on('error', (err: Error, _s?: string, stderr?: string) => {
      console.error('[FFMPEG] Prescale error:', err.message);
      if (stderr) console.error('[FFMPEG] stderr:', stderr);
      reject(err);
    });
    cmd.run();
  });
}

async function generateKaraokeAssSubtitles(
  subtitleClips: SubtitleClip[],
  projectId: string
): Promise<string> {
  const outputPath = path.join(TEMP_DIR, `${projectId}_karaoke.ass`);

  let assContent = `[Script Info]
Title: Karaoke Subtitles
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

  for (const clip of subtitleClips) {
    const startTime = formatAssTime(clip.start);
    const endTime = formatAssTime(clip.start + clip.duration);
    const text = clip.text;

    assContent += `Dialogue: 0,${startTime},${endTime},Normal,${clip.speaker || 'Speaker'},0,0,0,,${text}\n`;
  }

  fs.writeFileSync(outputPath, assContent, 'utf8');
  return outputPath;
}

function formatAssTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centisecs = Math.floor((seconds % 1) * 100);
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
}

async function getAudioPath(project: Project): Promise<string | null> {
  try {
    const { PrismaClient } = await import('../generated/prisma');
    const prisma = new PrismaClient();

    const session = await prisma.audioSession.findUnique({
      where: { sessionId: project.audioSessionId },
      include: {
        dialogues: {
          include: { audioFile: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!session || session.dialogues.length === 0) {
      return null;
    }

    const audioFiles = session.dialogues
      .filter(d => d.audioFile?.path && fs.existsSync(d.audioFile.path))
      .map(d => d.audioFile!.path);

    await prisma.$disconnect();

    if (audioFiles.length === 0) {
      return null;
    }

    if (audioFiles.length === 1) {
      return audioFiles[0];
    }

    const concatListPath = path.join(TEMP_DIR, `${project.id}_concat.txt`);
    const concatList = audioFiles.map(f => `file '${f}'`).join('\n');
    fs.writeFileSync(concatListPath, concatList, 'utf8');

    const outputPath = path.join(TEMP_DIR, `${project.id}_audio.mp3`);

    return new Promise((resolve, reject) => {
      const cmd = ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .output(outputPath);
      cmd.on('start', (c: string) => console.log('[FFMPEG] Audio concat:', c));
      cmd.on('stderr', (l: string) => console.log('[FFMPEG] stderr:', l));
      cmd.on('end', () => resolve(outputPath));
      cmd.on('error', (err: Error, _s?: string, stderr?: string) => {
        console.error('[FFMPEG] Audio concat error:', err.message);
        if (stderr) console.error('[FFMPEG] stderr:', stderr);
        reject(err);
      });
      cmd.run();
    });
  } catch (error) {
    return null;
  }
}

function getQualitySettings(quality: 'preview' | 'final'): { preset: string; crf: number; scale: string } {
  if (quality === 'preview') {
    return {
      preset: 'ultrafast',
      crf: 28,
      scale: '854:1520'
    };
  }
  return {
    preset: 'medium',
    crf: 23,
    scale: '1080:1920'
  };
}
