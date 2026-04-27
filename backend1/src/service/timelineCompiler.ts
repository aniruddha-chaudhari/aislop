import fs from 'fs';
import path from 'path';
import { Project, Timeline, Track, SubtitleClip, OverlayClip, CharacterClip, MusicClip, SfxClip } from '../schema/project';
import { publishFileUpdate } from './eventEmitter';
import { getCharacterClipImagePath } from '../utils/characterImages';
import { appendCharacterClipsToFilterComplex, expandCharacterClipsExcludingReplaceRanges } from './characterOverlayFilters';
import { enrichSubtitleClipsWithWords } from './previewGenerator';
import {
  fixSubtitleClipsTimelineNonOverlap,
  clampAssEventToClip,
  getSubtitleWordText,
} from './subtitleClipNormalize';
import { getSessionDuration } from './sessionDuration';
import { computeOverlayPlacement } from './overlayTransform';
import { resolveSessionOverlayPath } from '../utils/overlayAssets';

const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const customFfmpegPath = process.env.CUSTOM_FFMPEG_PATH;
const ffmpegPath = customFfmpegPath || ffmpegInstaller.path;
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const VIDEO_OUTPUT_DIR = path.join(process.cwd(), 'storage', 'videos');
const TEMP_DIR = path.join(process.cwd(), 'storage', 'temp');
const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'images');
const AUDIO_TAIL_BUFFER_SEC = 1.2;

/**
 * Gap between karaoke tokens. Plain spaces can collapse next to {\\c...} in libass/ffmpeg.
 * En space (U+2002) is narrower than em space but still a stable separator.
 */
const ASS_INTER_WORD_GAP = '\u2002';

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

function getTopRegionHeight(frameHeight: number): number {
  const subtitleSafeBottomMargin = Math.floor((700 / 1920) * frameHeight);
  return Math.max(1, frameHeight - subtitleSafeBottomMargin);
}

function buildReplaceOverlayRanges(clips: OverlayClip[]): TimeRange[] {
  return clips
    .filter(isReplaceOverlayClip)
    .map((clip) => ({
      start: clip.start,
      end: clip.start + clip.duration,
    }));
}

function buildCharacterHiddenOverlayRanges(clips: OverlayClip[]): TimeRange[] {
  return clips
    .filter((clip) => isReplaceOverlayClip(clip) || (isHyperframesAnimationOverlayClip(clip) && clip.planStatus !== 'draft'))
    .map((clip) => ({
      start: clip.start,
      end: clip.start + clip.duration,
    }));
}

function excludeSubtitlesInRanges(subtitleClips: SubtitleClip[], _excludedRanges: TimeRange[]): SubtitleClip[] {
  // Keep subtitle timeline untouched even during replace overlays.
  // Dropping subtitle clips before enrichment can shift later word timings.
  return subtitleClips;
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

// Ensure directories exist
[VIDEO_OUTPUT_DIR, TEMP_DIR, IMAGE_UPLOAD_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Compile timeline to video using FFmpeg
 */
/** Export steps: 1=template+audio, 2=+subtitles, 3=+overlays, 4=+characters (full) */
export type ExportStep = 1 | 2 | 3 | 4;

export async function compileTimeline(
  project: Project,
  options?: {
    quality?: 'preview' | 'final';
    outputDir?: string;
    outputFilename?: string;
    onProgress?: (progress: number, message: string) => void;
    /** Build filter chain incrementally. 1=template+audio only, 2=+subtitles, 3=+overlays, 4=+characters */
    exportStep?: ExportStep;
  }
): Promise<{ success: boolean; outputPath: string; error?: string }> {
  const quality = options?.quality || 'final';
  const outputDir = options?.outputDir || VIDEO_OUTPUT_DIR;
  const outputFilename = options?.outputFilename || `${project.id}_${Date.now()}.mp4`;
  const onProgress = options?.onProgress;
  const exportStep = options?.exportStep ?? 4;

  const outputPath = path.join(outputDir, outputFilename);

  console.log('[EXPORT] compileTimeline started', { projectId: project.id, outputPath, exportStep, quality });

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
    const musicClips: MusicClip[] = [];
    const sfxClips: SfxClip[] = [];

    if (project.timeline && project.timeline.tracks.length > 0) {
      // Get overlay clips from ALL overlay tracks except t_overlay_template (template is already input 0)
      const overlayTracks = project.timeline.tracks.filter(t => t.type === 'overlay' && t.id !== 't_overlay_template');
      overlayTracks.forEach(t => {
        overlayClips.push(...(t.clips.filter(c => c.kind === 'overlay') as OverlayClip[]));
      });
      const characterTrack = project.timeline.tracks.find(t => t.type === 'character');
      characterClips.push(...(characterTrack?.clips.filter(c => c.kind === 'character') as CharacterClip[] || []));
      const musicTracks = project.timeline.tracks.filter(t => t.type === 'music');
      musicTracks.forEach(t => {
        musicClips.push(...(t.clips.filter(c => c.kind === 'music') as MusicClip[]));
      });
      const sfxTracks = project.timeline.tracks.filter(t => t.type === 'sfx');
      sfxTracks.forEach(t => {
        sfxClips.push(...(t.clips.filter(c => c.kind === 'sfx') as SfxClip[]));
      });
    }

    const replaceRangesForCharacterHide = buildCharacterHiddenOverlayRanges(overlayClips);
    const characterClipsForExport = expandCharacterClipsExcludingReplaceRanges(
      characterClips,
      replaceRangesForCharacterHide
    );

    let assPath: string | null = null;
    const subtitleTrack = project.timeline?.tracks.find(t => t.type === 'subtitle');
    let subtitleClips = (subtitleTrack?.clips.filter(c => c.kind === 'subtitle') as SubtitleClip[] || []).map(c => ({ ...c }));

    if (subtitleClips.length > 0 && exportStep >= 2) {
      const replaceOverlayRanges = buildReplaceOverlayRanges(overlayClips);
      subtitleClips = excludeSubtitlesInRanges(subtitleClips, replaceOverlayRanges);
      const session = await loadSessionForExport(project.audioSessionId);
      if (session && subtitleClips.length > 0) {
        subtitleClips = await enrichSubtitleClipsWithWords(session, subtitleClips);
      }
      if (subtitleClips.length > 0) {
        assPath = await generateKaraokeAssSubtitles(subtitleClips, project.id);
      }
    }

    const templatePath = resolveTemplatePath(project.template.path);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath} (original: ${project.template.path})`);
    }
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(templatePath);
    const videoStart = Math.max(0, project.template.videoStart ?? 0);
    if (isImage) {
      command.input(templatePath).inputOptions(['-loop', '1', '-t', duration.toString()]);
    } else {
      // -ss before -i = input seek (start background video at videoStart seconds); then loop/trim to duration
      const opts = videoStart > 0 ? ['-ss', videoStart.toString(), '-stream_loop', '-1', '-t', duration.toString()] : ['-stream_loop', '-1', '-t', duration.toString()];
      command.input(templatePath).inputOptions(opts);
    }

    const audioPath = await getAudioPath(project);
    let nextInputIndex = 1; // 0 = template
    const dialogueInputIndex = audioPath ? nextInputIndex : null;
    if (audioPath) {
      const actualAudioDuration = await probeMediaDurationSeconds(audioPath);
      if (actualAudioDuration > 0) {
        duration = Math.max(duration, actualAudioDuration + AUDIO_TAIL_BUFFER_SEC);
      }
      // Do not trim dialogue input at input level; keep full tail and trim only at output level.
      command.input(audioPath);
      nextInputIndex++;
    }

    const musicInputs: AudioInputRef[] = [];
    for (const clip of musicClips) {
      const resolved = resolveAudioClipPath(clip.path);
      console.log('[Export] music clip', {
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
      console.log('[Export] sfx clip', {
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

    // Overlay media (images/videos) for image and animation plans.
    const overlayInputs: { clip: OverlayClip; inputIndex: number; overlayPath: string }[] = [];
    if (exportStep >= 3) {
      overlayClips.forEach((clip) => {
        if (clip.planStatus === 'draft') return;
        const overlayPath = resolveSessionOverlayPath(IMAGE_UPLOAD_DIR, project.audioSessionId, clip.path, clip.assetId, project.id);
        if (fs.existsSync(overlayPath)) {
          addOverlayInput(command, overlayPath, clip, duration);
          overlayInputs.push({ clip, inputIndex: nextInputIndex++, overlayPath });
        }
      });
    }

    // Character images (step 4): -loop 1 so overlay filter gets frames at any timestamp
    const characterInputs: { clip: CharacterClip; inputIndex: number }[] = [];
    if (exportStep >= 4) {
      for (const clip of characterClipsForExport) {
        const charPath = getCharacterClipImagePath(clip);
        if (charPath) {
          command.input(charPath).inputOptions(['-loop', '1']);
          characterInputs.push({ clip, inputIndex: nextInputIndex++ });
        }
      }
    }

    // Step 1: template + audio only, use simple -vf (no filter_complex)
    const needsAudioMixing = musicInputs.length > 0 || sfxInputs.length > 0;
    console.log('[Export] audio mix', {
      musicInputs: musicInputs.length,
      sfxInputs: sfxInputs.length,
      needsAudioMixing,
    });
    const useSimpleVf = exportStep === 1 && !needsAudioMixing;
    const scaleVf = 'setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p';

    let filterComplex = `[0:v]${scaleVf}[bg]`;
    let lastLabel = 'bg';

    if (exportStep >= 2 && assPath && fs.existsSync(assPath)) {
      // Escape for FFmpeg subtitles filter (match previewGenerator)
      const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const forceStyle = 'Fontname=Arial-Black,FontSize=48,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,Bold=1,BorderStyle=1,Outline=3,Shadow=2,Alignment=2,MarginV=700';
      filterComplex += `;[${lastLabel}]subtitles='${escapedAssPath}':force_style='${forceStyle}'[with_subs]`;
      lastLabel = 'with_subs';
    }

    // Overlay base size (legacy default scale=0.5) and legacy top offset.
    const OVERLAY_BASE_W = 960;
    const OVERLAY_BASE_H = 720;
    const OVERLAY_LEGACY_TOP_Y = 40;
    if (exportStep >= 3) {
      overlayInputs.forEach(({ clip, inputIndex, overlayPath }, index) => {
        const isReplace = isReplaceOverlayClip(clip);
        const isVideoOverlay = !isStillImageAsset(overlayPath);
        const setpts = `setpts=PTS-STARTPTS+${clip.start}/TB,${isVideoOverlay ? 'fps=30,' : ''}`;
        const scaledLabel = isReplace ? `replace_scaled_${index}` : `scaled_${index}`;
        const overlayLabel = isReplace ? `with_replace_${index}` : `with_overlay_${index}`;

        if (isReplace) {
          // Preserve full overlay frame (no destructive crop) and letterbox/pillarbox into 9:16.
          filterComplex += `;[${inputIndex}:v]${setpts}scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(1080-iw)/2:(1920-ih)/2:0x101014[${scaledLabel}]`;
          filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
          lastLabel = overlayLabel;
          return;
        }

        if (isVideoOverlay) {
          if (isHyperframesAnimationOverlayClip(clip)) {
            filterComplex += `;[${inputIndex}:v]${setpts}scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(1080-iw)/2:(1920-ih)/2:0x00000000[${scaledLabel}]`;
            filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
            lastLabel = overlayLabel;
            return;
          }

          const topRegionH = getTopRegionHeight(1920);
          filterComplex += `;[${inputIndex}:v]${setpts}scale=1080:${topRegionH}:force_original_aspect_ratio=decrease,pad=1080:${topRegionH}:(1080-iw)/2:0:0x00000000[${scaledLabel}]`;
          filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
          lastLabel = overlayLabel;
          return;
        }

        const placement = computeOverlayPlacement(
          clip,
          1080,
          1920,
          OVERLAY_BASE_W,
          OVERLAY_BASE_H,
          OVERLAY_LEGACY_TOP_Y
        );
        filterComplex += `;[${inputIndex}:v]${setpts}scale=${placement.width}:${placement.height}:force_original_aspect_ratio=decrease[${scaledLabel}]`;
        filterComplex += `;[${lastLabel}][${scaledLabel}]overlay=${placement.x}:${placement.y}:enable='between(t,${clip.start},${clip.start + clip.duration})':eof_action=pass:repeatlast=0[${overlayLabel}]`;
        lastLabel = overlayLabel;
      });
    }

    if (exportStep >= 4 && characterInputs.length > 0) {
      const stewieScaleW = 500;
      const stewieScaleH = 600;
      const peterScaleW = 580;
      const peterScaleH = 720;
      const otherScaleW = 560;
      const otherScaleH = 760;
      const stewieX = 300;
      const stewieY = 1350;
      const peterX = 300;
      const peterY = 1250;
      const otherX = 260;
      const otherY = 1160;
      const { extraFilter, lastLabel: afterChars } = appendCharacterClipsToFilterComplex({
        charInputs: characterInputs,
        lastLabel,
        labelPrefix: 'export',
        geom: {
          stewie: { x: stewieX, y: stewieY, w: stewieScaleW, h: stewieScaleH },
          peter: { x: peterX, y: peterY, w: peterScaleW, h: peterScaleH },
          other: { x: otherX, y: otherY, w: otherScaleW, h: otherScaleH },
        },
      });
      filterComplex += extraFilter;
      lastLabel = afterChars;
    }

    filterComplex += `;[${lastLabel}]format=yuv420p,setsar=1[final]`;

    const audioMix = needsAudioMixing
      ? buildAudioMixFilter(dialogueInputIndex, musicInputs, sfxInputs)
      : { filter: null, outputLabel: null };
    if (audioMix.filter) {
      filterComplex += `;${audioMix.filter}`;
    }

    if (useSimpleVf) {
      // Step 1: no filter_complex, use -vf for template scaling only
      command.outputOptions(['-vf', scaleVf]);
    } else {
      command.complexFilter(filterComplex);
    }

    // When audioPath exists: input 0=template, 1=audio. When not: input 1 is first overlay (no audio).
    const audioStream = audioMix.outputLabel ?? (audioPath ? '1:a:0' : '0:a:0?');
    const inputOrder = [
      '0: template',
      audioPath ? '1: audio' : '1: (first extra input, no dialogue audio)',
      ...musicInputs.map((m, i) => `${m.inputIndex}: music_${i}`),
      ...sfxInputs.map((s, i) => `${s.inputIndex}: sfx_${i}`),
      ...overlayInputs.map((o, i) => `${o.inputIndex}: overlay_${i}`),
      ...characterInputs.map((c, i) => `${c.inputIndex}: char_${i}`),
    ];
    const allInputPaths = [
      { index: 0, type: 'template', path: templatePath, exists: fs.existsSync(templatePath) },
      ...(audioPath ? [{ index: 1, type: 'audio', path: audioPath, exists: fs.existsSync(audioPath) }] : []),
      ...musicInputs.map(({ clip, inputIndex }) => ({
        index: inputIndex,
        type: 'music',
        path: clip.path,
        exists: !!resolveAudioClipPath(clip.path),
      })),
      ...sfxInputs.map(({ clip, inputIndex }) => ({
        index: inputIndex,
        type: 'sfx',
        path: clip.path,
        exists: !!resolveAudioClipPath(clip.path),
      })),
      ...overlayInputs.map(({ clip, inputIndex }) => {
        const p = resolveSessionOverlayPath(IMAGE_UPLOAD_DIR, project.audioSessionId, clip.path, clip.assetId, project.id);
        return { index: inputIndex, type: 'overlay', path: p, exists: fs.existsSync(p) };
      }),
      ...characterInputs.map(({ clip, inputIndex }) => {
        const p = getCharacterClipImagePath(clip);
        return { index: inputIndex, type: 'character', path: p ?? '(none)', exists: !!p && fs.existsSync(p) };
      })
    ];
    // Step 1: -map 0:v -map 1:a; Step 2+: -map [final] -map 1:a
    const outputOpts: string[] = useSimpleVf
      ? ['-map', '0:v', '-map', audioStream]
      : ['-map', '[final]', '-map', audioStream];

    // Use GPU encoding (h264_nvenc) for faster export when available.
    // We use bitrate-based configuration instead of CRF for NVENC.
    const videoBitrate = quality === 'preview' ? '3000k' : '6000k';
    const maxrate = quality === 'preview' ? '4000k' : '8000k';
    const bufsize = quality === 'preview' ? '8000k' : '12000k';
    const nvencPreset = quality === 'preview' ? 'p4' : 'p5';

    outputOpts.push(
      '-c:v', 'h264_nvenc',
      '-b:v', videoBitrate,
      '-maxrate', maxrate,
      '-bufsize', bufsize,
      '-preset', nvencPreset,
      '-s', scale,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', quality === 'preview' ? '128k' : '192k',
      '-ar', '44100',
      '-t', duration.toString(),
      '-y'
    );
    console.log('[EXPORT] FFmpeg running', { projectId: project.id, outputPath, duration });
    command.outputOptions(outputOpts);

    command.output(outputPath);
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
          console.log('[EXPORT] FFmpeg finished', { projectId: project.id, outputPath });
          if (onProgress) {
            onProgress(100, 'Video export complete');
          }

          publishFileUpdate(project.id, {
            type: 'completed',
            message: 'Video export complete',
            videoPath: outputPath,
          });

          resolve({ success: true, outputPath });
        })
        .on('error', (err: Error, _s?: string, stderr?: string) => {
          const stderrTail = (stderr ?? '').slice(-1500);
          console.error('[EXPORT] FFmpeg error', { projectId: project.id, message: err.message });
          console.error('[EXPORT] FFmpeg stderr (last 1500 chars)', stderrTail);
          publishFileUpdate(project.id, {
            type: 'error',
            message: err.message,
          });

          reject(err);
        })
        .run();
    });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EXPORT] compileTimeline setup error', { projectId: project.id, error: errMsg });
    return Promise.resolve({
      success: false,
      outputPath: '',
      error: errMsg
    });
  }
}

async function loadSessionForExport(audioSessionId: string | undefined): Promise<{ dialogues: Array<{ id: string; text: string; character?: string; audioFile?: { filePath: string } | null }> } | null> {
  if (!audioSessionId || audioSessionId === 'no-session') return null;
  try {
    const { PrismaClient } = await import('../generated/prisma');
    const prisma = new PrismaClient();
    const session = await prisma.session.findUnique({
      where: { id: audioSessionId },
      include: {
        dialogues: {
          include: { audioFile: true },
          orderBy: { order: 'asc' as const },
        },
      },
    });
    await prisma.$disconnect();
    return session;
  } catch {
    return null;
  }
}

async function generateKaraokeAssSubtitles(
  subtitleClips: SubtitleClip[],
  projectId: string
): Promise<string> {
  const outputPath = path.join(TEMP_DIR, `${projectId}_karaoke.ass`);
  const clips = fixSubtitleClipsTimelineNonOverlap(subtitleClips);

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

  for (const clip of clips.sort((a, b) => a.start - b.start)) {
    const speaker = clip.speaker || (clip as { character?: string }).character || 'Speaker';

    if (clip.words && clip.words.length > 0) {
      const clipWords = clip.words ?? [];
      for (let i = 0; i < clipWords.length; i += 3) {
        const wordGroup = clipWords.slice(i, Math.min(i + 3, clipWords.length));
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
              subtitleText += wordIdx === groupIndex ? `{\\c&H0000FFFF&}${wordText}{\\c&H00FFFFFF&}` : wordText;
              if (wordIdx < firstTwoWords.length - 1) subtitleText += ASS_INTER_WORD_GAP;
            });
            subtitleText += `\\N${getSubtitleWordText(thirdWord)}`;
            assContent += `Dialogue: 0,${formatAssTime(wordStart)},${formatAssTime(wordEnd)},Normal,${speaker},0,0,0,,${subtitleText}\n`;
          });

          let thirdWordStart = clip.start + (thirdWord as { start: number }).start;
          let thirdWordEnd = i + 2 === clip.words.length - 1
            ? clip.start + (thirdWord as { end: number }).end
            : clip.words[i + 3] ? clip.start + (clip.words[i + 3] as { start: number }).start
            : clip.start + (thirdWord as { end: number }).end;
          ({ start: thirdWordStart, end: thirdWordEnd } = clampAssEventToClip(
            thirdWordStart,
            thirdWordEnd,
            clip.start,
            clip.duration
          ));
          let subtitleText = '';
          firstTwoWords.forEach((groupWord, wordIdx) => {
            subtitleText += getSubtitleWordText(groupWord);
            if (wordIdx < firstTwoWords.length - 1) subtitleText += ASS_INTER_WORD_GAP;
          });
          subtitleText += `\\N{\\c&H0000FFFF&}${getSubtitleWordText(thirdWord)}{\\c&H00FFFFFF&}`;
          assContent += `Dialogue: 0,${formatAssTime(thirdWordStart)},${formatAssTime(thirdWordEnd)},Normal,${speaker},0,0,0,,${subtitleText}\n`;
          continue;
        }

        wordGroup.forEach((word, groupIndex) => {
          let wordStart = clip.start + (word as { start: number }).start;
          let wordEnd = groupIndex === wordGroup.length - 1
            ? (i + groupIndex === clipWords.length - 1
              ? clip.start + (word as { end: number }).end
              : clipWords[i + groupIndex + 1]
                ? clip.start + (clipWords[i + groupIndex + 1] as { start: number }).start
                : clip.start + (word as { end: number }).end)
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
            subtitleText += wordIdx === groupIndex ? `{\\c&H0000FFFF&}${wordText}{\\c&H00FFFFFF&}` : wordText;
            if (wordIdx < wordGroup.length - 1) subtitleText += ASS_INTER_WORD_GAP;
          });
          assContent += `Dialogue: 0,${formatAssTime(wordStart)},${formatAssTime(wordEnd)},Normal,${speaker},0,0,0,,${subtitleText}\n`;
        });
      }
    } else {
      const startTime = formatAssTime(clip.start);
      const endTime = formatAssTime(clip.start + clip.duration);
      assContent += `Dialogue: 0,${startTime},${endTime},Normal,${speaker},0,0,0,,${clip.text}\n`;
    }
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

async function getAudioPath(project: Project): Promise<string | null> {
  try {
    const { PrismaClient } = await import('../generated/prisma');
    const prisma = new PrismaClient();

    // Prisma model is Session (id), not AudioSession. AudioFile uses filePath.
    const session = await prisma.session.findUnique({
      where: { id: project.audioSessionId },
      include: {
        dialogues: {
          include: { audioFile: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!session) {
      return null;
    }
    if (session.dialogues.length === 0) {
      return null;
    }

    const audioFiles = session.dialogues
      .filter(d => d.audioFile?.filePath && d.audioFile?.success !== false && fs.existsSync(d.audioFile.filePath))
      .map(d => d.audioFile!.filePath);

    await prisma.$disconnect();

    if (audioFiles.length === 0) {
      return null;
    }

    if (audioFiles.length === 1) {
      return audioFiles[0];
    }

    const concatListPath = path.join(TEMP_DIR, `${project.id}_concat.txt`);
    // Escape single quotes and use forward slashes for FFmpeg concat (like previewGenerator)
    const concatList = audioFiles
      .map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(concatListPath, concatList, 'utf8');

    const outputPath = path.join(TEMP_DIR, `${project.id}_audio.wav`);

    return new Promise((resolve, reject) => {
      const cmd = ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:a', 'pcm_s16le', '-y'])
        .output(outputPath);
      cmd.on('start', () => {});
      cmd.on('stderr', () => {});
      cmd.on('end', () => resolve(outputPath));
      cmd.on('error', (err: Error) => reject(err));
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
    preset: 'veryfast', // faster than 'medium' to avoid long hangs, still good quality
    crf: 23,
    scale: '1080:1920'
  };
}
