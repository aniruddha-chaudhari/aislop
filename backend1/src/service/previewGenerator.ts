import * as fs from 'fs';
import * as path from 'path';
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

// Preview configuration - scaled 1/3 from 1080x1920 (matches timelineCompiler full export)
const PREVIEW_DIR = path.join(process.cwd(), 'storage', 'previews');
const PREVIEW_WIDTH = 360;
const PREVIEW_HEIGHT = 640;
const SCALE = PREVIEW_HEIGHT / 1920; // Same proportion as timelineCompiler 1080x1920
const PREVIEW_BITRATE = '500k'; // Low bitrate for fast generation

// Overlay placement: match imageEmbedder (backend) - center horizontally, fixed from top
const OVERLAY_SCALE_W = Math.floor(960 * (PREVIEW_WIDTH / 1080)); // 320 at 360px width
const OVERLAY_SCALE_H = Math.floor(720 * (PREVIEW_HEIGHT / 1920)); // 240 at 640px height
const OVERLAY_Y_TOP = Math.floor(40 * (PREVIEW_HEIGHT / 1920)); // 13 at 640px height (~40px at 1920)

// Ensure preview directory exists
if (!fs.existsSync(PREVIEW_DIR)) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
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

    const overlayTrack = timeline?.tracks?.find((t: any) => t.type === 'overlay' && t.id === 't_imgs');
    const characterTrack = timeline?.tracks?.find((t: any) => t.type === 'character');
    const subtitleTrack = timeline?.tracks?.find((t: any) => t.type === 'subtitle');

    const overlayClips = (overlayTrack?.clips?.filter((c: any) => c.kind === 'overlay') || []) as OverlayClip[];
    const characterClips = (characterTrack?.clips?.filter((c: any) => c.kind === 'character') || []) as CharacterClip[];
    let subtitleClips = (subtitleTrack?.clips?.filter((c: any) => c.kind === 'subtitle') || []) as SubtitleClip[];

    console.log('[IMAGE PLAN] Preview using image plan (overlay track)', {
      projectId,
      trackId: overlayTrack?.id ?? 'none',
      totalOverlayClips: overlayClips.length,
      duration,
    });
    overlayClips.forEach((clip: OverlayClip, i: number) => {
      const imagePath = clip.path ?? path.join(IMAGE_UPLOAD_DIR, audioSessionId, `${clip.assetId}.png`);
      const exists = fs.existsSync(imagePath);
      console.log(`[IMAGE PLAN]   overlay #${i + 1} id=${clip.id} assetId=${clip.assetId} label="${clip.label}" start=${clip.start.toFixed(1)}s duration=${clip.duration.toFixed(1)}s path=${exists ? imagePath : 'MISSING'}`);
    });

    onProgress?.(15, 'Fetching word timings for karaoke...');
    subtitleClips = await enrichSubtitleClipsWithWords(session, subtitleClips);

    let assPath: string | null = null;
    if (subtitleClips.length > 0) {
      assPath = generateAssFromTimeline(projectId, subtitleClips);
    }

    const command = ffmpeg();
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(templatePath);

    if (isImage) {
      command.input(templatePath).inputOptions(['-loop', '1', '-t', duration.toString()]);
    } else {
      command.input(templatePath).inputOptions(['-stream_loop', '-1']);
    }
    command.input(concatenatedAudioPath).inputOptions(['-t', duration.toString()]);

    const overlayInputs: { clip: OverlayClip; inputIndex: number }[] = [];
    overlayClips.forEach((clip: OverlayClip) => {
      const imagePath = clip.path ?? path.join(IMAGE_UPLOAD_DIR, audioSessionId, `${clip.assetId}.png`);
      if (fs.existsSync(imagePath)) {
        command.input(imagePath);
        // Use actual FFmpeg input order: 0=template, 1=audio, 2+=overlays (so first overlay = 2, second = 3, ...)
        overlayInputs.push({ clip, inputIndex: 2 + overlayInputs.length });
      }
    });

    console.log('[IMAGE PLAN] Preview overlay inputs (images actually used)', {
      totalInPlan: overlayClips.length,
      withImageFile: overlayInputs.length,
      skipped: overlayClips.length - overlayInputs.length,
      inputs: overlayInputs.map(({ clip, inputIndex }) => ({ id: clip.id, assetId: clip.assetId, inputIndex })),
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

    overlayInputs.forEach(({ clip, inputIndex }, index) => {
      // Match imageEmbedder placement: scale to fixed size, center x, fixed y from top
      filterComplex += `;[${inputIndex}:v]scale=${OVERLAY_SCALE_W}:${OVERLAY_SCALE_H}:force_original_aspect_ratio=decrease[ov${index}]`;
      filterComplex += `;[${lastLabel}][ov${index}]overlay=(W-w)/2:${OVERLAY_Y_TOP}:enable='between(t,${clip.start},${clip.start + clip.duration})'[vo${index}]`;
      lastLabel = `vo${index}`;
    });

    if (charInputs.length > 0) {
      const stewieClips = charInputs.filter(c => c.clip.character === 'Stewie');
      const peterClips = charInputs.filter(c => c.clip.character === 'Peter');

      const stewieRanges: string[] = [];
      const peterRanges: string[] = [];
      stewieClips.forEach(({ clip }) => {
        stewieRanges.push(`between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})`);
      });
      peterClips.forEach(({ clip }) => {
        peterRanges.push(`between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})`);
      });

      const stewieEnable = stewieRanges.length > 0 ? stewieRanges.join('+') : '0';
      const peterEnable = peterRanges.length > 0 ? peterRanges.join('+') : '0';

      const stewieScaleW = Math.floor(500 * SCALE);
      const stewieScaleH = Math.floor(600 * SCALE);
      const peterScaleW = Math.floor(580 * SCALE);
      const peterScaleH = Math.floor(720 * SCALE);
      const stewieInputIndex = stewieClips[0]?.inputIndex;
      const peterInputIndex = peterClips[0]?.inputIndex;

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
    }

    onProgress?.(50, 'Encoding preview...');

    filterComplex += `;[${lastLabel}]format=yuv420p,setsar=1[out]`;

    // FFmpeg debug logs
    const allInputs = [
      { index: 0, type: 'Template', path: templatePath },
      { index: 1, type: 'Audio', path: concatenatedAudioPath },
      ...overlayInputs.map(({ clip, inputIndex }) => ({
        index: inputIndex,
        type: 'Overlay',
        path: clip.path ?? path.join(IMAGE_UPLOAD_DIR, audioSessionId, `${clip.assetId}.png`)
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
        '-map', '1:a',    // Map audio from concatenated input
        '-t', duration.toString(),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-ac', '2',
        '-ar', '22050',
        '-y'
      ])
      .output(outputPath);

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
    console.log('[IMAGE PLAN] Preview generated successfully', { projectId, outputPath, overlayCount: overlayInputs.length });
    return { success: true, outputPath };
  } catch (error) {
    console.log('[IMAGE PLAN] Preview generation failed', { projectId, error: error instanceof Error ? error.message : String(error) });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

