'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Hls from 'hls.js';
import type { CharacterClip, Clip, ClipRef, EditorProject, OverlayClip, SubtitleClip, WordTimestamp } from '../../../features/editor/types';
import { API_BASE_URL, API_ENDPOINTS } from '../../../config/api';
import { CanvasCompositor } from '../../../lib/canvasCompositor';
import { AudioEngine } from '../../../lib/audioEngine';
import { voiceDisplayName } from '../../../features/editor/voiceDisplayName';
import { resolveCharacterClipEmotion } from '../../../features/editor/characterClipEmotion';
import { isOverlayClipVideo, probeOverlayUrlIsVideo } from '../../../features/editor/overlayMedia';
import { computeOverlayPlacement } from '../../../features/editor/overlayTransform';

export type PreviewPlayerApi = {
  /** Optional: seek to this time (seconds) before playing. Use current playhead so video starts from timeline position. */
  requestPlay: (seekToSeconds?: number) => void;
  requestPause: () => void;
};

type Props = {
  project: EditorProject;
  isPlaying: boolean;
  playheadTime: number;
  duration: number;
  volume: number;
  onPlayPause: () => void;
  onPlayheadChange: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  selected: ClipRef | null;
  onSelectClip: (ref: ClipRef | null) => void;
  onUpdateClip: (ref: ClipRef, patch: Partial<Clip>) => void;
  /** Called with play/pause API so parent can call play() in same stack as user click (required for autoplay policy). */
  onPreviewReady?: (api: PreviewPlayerApi | null) => void;
  /** Called once with the AudioEngine instance so parent can start audio on play. */
  onAudioEngineReady?: (engine: AudioEngine | null) => void;
  /** Optional: Preview video source (FFmpeg composite) to use instead of template */
  previewVideoSrc?: string | null;
  previewSourceMode?: 'none' | 'segment' | 'hls';
  isGeneratingPreview?: boolean;
  /** Telemetry hook: fired once when first frame is observed after playback starts. */
  onFirstFrame?: () => void;
};

const FRAME_W = 1080;
const FRAME_H = 1920;
const SUBTITLE_SAFE_BOTTOM = 700;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Still-image overlays: legacy placement (centered X, ~40px top inset at 1080×1920). */
function overlayImageDomStyle(clip: OverlayClip): CSSProperties {
  const placement = computeOverlayPlacement(clip, FRAME_W, FRAME_H);
  return {
    position: 'absolute',
    left: `${(placement.x / FRAME_W) * 100}%`,
    top: `${(placement.y / FRAME_H) * 100}%`,
    width: `${(placement.width / FRAME_W) * 100}%`,
    height: `${(placement.height / FRAME_H) * 100}%`,
    objectFit: 'contain',
    zIndex: 26,
    pointerEvents: 'none',
  };
}

/** Video B-roll above the subtitle band (matches backend top-region pad). */
function overlayTopRegionVideoStyle(): CSSProperties {
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: `${((FRAME_H - SUBTITLE_SAFE_BOTTOM) / FRAME_H) * 100}%`,
    objectFit: 'contain',
    objectPosition: 'top center',
    zIndex: 26,
    pointerEvents: 'none',
  };
}

function isHyperframesOverlay(clip: OverlayClip): boolean {
  return clip.animationType === 'hyperframes' || Boolean(clip.animationMomentId);
}

function isReplaceOverlay(clip: OverlayClip): boolean {
  return clip.displayMode === 'replace' && clip.planStatus !== 'draft';
}

function hidesSubtitles(clip: OverlayClip): boolean {
  if (clip.planStatus === 'draft') return false;
  return isReplaceOverlay(clip) || isHyperframesOverlay(clip);
}

function hidesCharacters(clip: OverlayClip): boolean {
  return isReplaceOverlay(clip) || (isHyperframesOverlay(clip) && clip.planStatus !== 'draft');
}

function isTimeInsideClip(time: number, clip: { start: number; duration: number }): boolean {
  return time >= clip.start && time < clip.start + clip.duration;
}

type CharacterBucket = 'stewie' | 'peter' | 'other';

const CHARACTER_GEOM: Record<CharacterBucket, { x: number; y: number; w: number; h: number }> = {
  stewie: { x: 300, y: 1350, w: 500, h: 600 },
  peter: { x: 300, y: 1250, w: 580, h: 720 },
  other: { x: 260, y: 1160, w: 560, h: 760 },
};

function characterBucket(character: string): CharacterBucket {
  if (character === 'Stewie') return 'stewie';
  if (character === 'Peter' || character === 'Narrator') return 'peter';
  return 'other';
}

function characterStyle(clip: CharacterClip): CSSProperties {
  const geom = CHARACTER_GEOM[characterBucket(clip.character)];
  return {
    position: 'absolute',
    left: `${(geom.x / FRAME_W) * 100}%`,
    top: `${(geom.y / FRAME_H) * 100}%`,
    width: `${(geom.w / FRAME_W) * 100}%`,
    height: `${(geom.h / FRAME_H) * 100}%`,
    objectFit: 'contain',
  };
}

function wordsForSubtitle(clip: SubtitleClip): WordTimestamp[] {
  if (clip.words?.length) return clip.words;
  const rawWords = clip.text ? clip.text.split(/\s+/).filter(Boolean) : [];
  if (!rawWords.length) return [];
  const wordDuration = Math.max(0.1, clip.duration / rawWords.length);
  return rawWords.map((word, i) => ({ word, start: i * wordDuration, end: (i + 1) * wordDuration }));
}

/**
 * Mirrors backend ASS karaoke layout from `generateAssFromTimeline`:
 * - 3-word rolling group based on the active word.
 * - When the joined group text exceeds 25 chars and the group has >2 words,
 *   first two words go on line 1 and the third word on line 2 (matches `\N` split).
 * - Active word is highlighted yellow, others white.
 */
type SubtitleAssLayout = {
  line1: { word: string; absoluteIndex: number }[];
  line2: { word: string; absoluteIndex: number }[];
  activeAbsoluteIndex: number;
};

const ASS_INTER_WORD_GAP = '\u2002';

function subtitleAssLayoutAtTime(clip: SubtitleClip, playheadTime: number): SubtitleAssLayout | null {
  const words = wordsForSubtitle(clip);
  if (!words.length) return clip.text ? { line1: [{ word: clip.text, absoluteIndex: -1 }], line2: [], activeAbsoluteIndex: -1 } : null;

  const relTime = playheadTime - clip.start;
  const liveActive = words.findIndex((word) => relTime >= word.start && relTime < word.end);
  const safeActive = liveActive >= 0 ? liveActive : Math.max(0, words.length - 1);
  const groupStart = Math.floor(safeActive / 3) * 3;
  const wordGroup = words.slice(groupStart, Math.min(groupStart + 3, words.length));

  const fullText = wordGroup.map((w) => w.word).join(' ');
  const isTooLong = fullText.length > 25 && wordGroup.length > 2;

  const decorate = (slice: WordTimestamp[], absStart: number) =>
    slice.map((w, idx) => ({ word: w.word, absoluteIndex: absStart + idx }));

  if (isTooLong) {
    return {
      line1: decorate(wordGroup.slice(0, 2), groupStart),
      line2: decorate(wordGroup.slice(2, 3), groupStart + 2),
      activeAbsoluteIndex: liveActive,
    };
  }
  return {
    line1: decorate(wordGroup, groupStart),
    line2: [],
    activeAbsoluteIndex: liveActive,
  };
}

function SubtitlePreview({
  layout,
}: {
  layout: SubtitleAssLayout;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const updateScale = () => {
      const rect = el.getBoundingClientRect();
      setScale(rect.height > 0 ? rect.height / FRAME_H : 1);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ASS Style: Normal,Arial-Black,48,&H00FFFFFF,...,1,3,2,2,30,30,800,1
  // PlayResY=1920 reference; ScaledBorderAndShadow=yes → outline/shadow scale with frame height.
  const fontSize = 48 * scale;
  const marginBottom = 800 * scale;
  const sideMargin = 30 * scale;
  const outline = 3 * scale;
  const shadow = 2 * scale;
  const ACTIVE = '#FFFF00';
  const INACTIVE = '#FFFFFF';

  const renderLine = (line: SubtitleAssLayout['line1'], keyPrefix: string) => (
    <div key={keyPrefix} style={{ whiteSpace: 'nowrap' }}>
      {line.map((token, idx) => (
        <span key={`${keyPrefix}_${idx}`}>
          {idx > 0 ? ASS_INTER_WORD_GAP : ''}
          <span style={{ color: token.absoluteIndex === layout.activeAbsoluteIndex ? ACTIVE : INACTIVE }}>
            {token.word}
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <div ref={frameRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 32 }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `${marginBottom}px`,
          paddingLeft: `${sideMargin}px`,
          paddingRight: `${sideMargin}px`,
          textAlign: 'center',
          fontFamily: '"Arial Black", "Arial-Black", Arial, sans-serif',
          fontSize: `${fontSize}px`,
          fontWeight: 900,
          lineHeight: 1,
          color: INACTIVE,
          // BorderStyle=1 + Outline=3 black + Shadow=2 + BackColour=&H80000000 (50% black).
          WebkitTextStroke: `${outline}px #000000`,
          paintOrder: 'stroke fill',
          textShadow: `${shadow}px ${shadow}px 0 rgba(0,0,0,0.5)`,
        }}
      >
        {renderLine(layout.line1, 'l1')}
        {layout.line2.length > 0 && renderLine(layout.line2, 'l2')}
      </div>
    </div>
  );
}

function OverlayVideo({
  clip,
  src,
  style,
  isPlaying,
  playheadTime,
}: {
  clip: OverlayClip;
  src: string;
  style: CSSProperties;
  isPlaying: boolean;
  playheadTime: number;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const relativeTime = clamp(playheadTime - clip.start, 0, clip.duration);
    if (Number.isFinite(relativeTime) && Math.abs(video.currentTime - relativeTime) > 0.15) {
      try {
        video.currentTime = relativeTime;
      } catch {
        // Some browsers reject seeking before metadata; loadedmetadata below will retry.
      }
    }
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [clip.duration, clip.start, isPlaying, playheadTime]);

  return (
    <video
      ref={ref}
      src={src}
      className="block"
      style={style}
      muted
      playsInline
      preload="auto"
      onLoadedMetadata={() => {
        const video = ref.current;
        if (!video) return;
        const relativeTime = clamp(playheadTime - clip.start, 0, clip.duration);
        try {
          video.currentTime = relativeTime;
        } catch {}
      }}
    />
  );
}


export default function CanvasPreview({
  project,
  isPlaying,
  playheadTime,
  duration,
  volume,
  onPlayPause,
  onPlayheadChange,
  onVolumeChange,
  selected,
  onSelectClip,
  onUpdateClip,
  onPreviewReady,
  onAudioEngineReady,
  previewVideoSrc,
  previewSourceMode = 'none',
  isGeneratingPreview = false,
  onFirstFrame,
}: Props) {
  const projectRef = useRef<EditorProject>(project);
  useEffect(() => { projectRef.current = project; }, [project]);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement | null>(null);
  
  const setPlayerRef = useCallback((node: HTMLVideoElement | null) => {
    playerRef.current = node;
  }, []);
  
  // Get the video element
  const getVideoElement = (): HTMLVideoElement | null => {
    return playerRef.current;
  };
  
  const isSeekingRef = useRef(false);
  const [mutedForPolicy, setMutedForPolicy] = useState(true);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const compositorRef = useRef<CanvasCompositor | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const [localCanvasReady, setLocalCanvasReady] = useState(false);
  const onPlayheadChangeRef = useRef(onPlayheadChange);
  const onPlayPauseRef = useRef(onPlayPause);
  const onFirstFrameRef = useRef(onFirstFrame);

  useEffect(() => { onPlayheadChangeRef.current = onPlayheadChange; }, [onPlayheadChange]);
  useEffect(() => { onPlayPauseRef.current = onPlayPause; }, [onPlayPause]);
  useEffect(() => { onFirstFrameRef.current = onFirstFrame; }, [onFirstFrame]);
  // Convert template path to API URL if it's a file system path
  const getTemplateUrl = (templateSrc: string | undefined): string | undefined => {
    if (!templateSrc) return undefined;
    
    // If it's already a URL (http/https), return as-is
    if (templateSrc.startsWith('http://') || templateSrc.startsWith('https://')) {
      return templateSrc;
    }
    
    // If it's a file:// URL, extract the filename
    if (templateSrc.startsWith('file://')) {
      const url = new URL(templateSrc);
      const filename = url.pathname.split('/').pop() || url.pathname.split('\\').pop();
      if (filename) {
        return API_ENDPOINTS.serveTemplateVideo(filename);
      }
    }
    
    // If it's a file system path (contains backslashes or forward slashes with drive letter)
    if (templateSrc.includes('\\') || templateSrc.includes('/')) {
      // Extract filename from path
      const parts = templateSrc.split(/[/\\]/);
      const filename = parts[parts.length - 1];
      if (filename) {
        return API_ENDPOINTS.serveTemplateVideo(filename);
      }
    }
    
    // If it's just a filename, use it directly
    return API_ENDPOINTS.serveTemplateVideo(templateSrc);
  };

  const videoSrc = useMemo(
    () => previewVideoSrc || getTemplateUrl(project.template.src),
    [previewVideoSrc, project.template.src]
  );
  const hasVideoSrc = Boolean(videoSrc);
  const templateMediaKind = useMemo<'image' | 'video'>(() => {
    if (previewVideoSrc) return 'video';
    const src = project.template.src ?? '';
    const cleanSrc = src.split(/[?#]/)[0]?.toLowerCase() ?? '';
    if (/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(cleanSrc)) return 'image';
    if (project.template.type === 'image') return 'image';
    return 'video';
  }, [previewVideoSrc, project.template.src, project.template.type]);
  const isHlsSrc = useMemo(() => {
    if (!previewVideoSrc) return false;
    // Support cache-busted playlist URLs like ".../index.m3u8?t=123".
    return /\.m3u8(?:$|[?#])/i.test(previewVideoSrc);
  }, [previewVideoSrc]);

  /** Fingerprint timeline audio clips so WebAudio preload runs when music/SFX/session change. */
  const audioTimelineKey = useMemo(
    () => `${project.audioSessionId ?? ''}\0${JSON.stringify(project.tracks)}`,
    [project.audioSessionId, project.tracks]
  );

  const activeOverlayClips = useMemo(() => {
    const clips: OverlayClip[] = [];
    for (const track of project.tracks) {
      if (track.type !== 'overlay' || track.id === 't_overlay_template') continue;
      for (const clip of track.clips) {
        if (clip.kind !== 'overlay') continue;
        const overlay = clip as OverlayClip;
        if (overlay.planStatus === 'draft') continue;
        if (playheadTime < overlay.start || playheadTime > overlay.start + overlay.duration) continue;
        clips.push(overlay);
      }
    }
    return clips;
  }, [project.tracks, playheadTime]);
  const activeOverlayHideState = useMemo(() => {
    let hideSubtitles = false;
    let hideCharacters = false;
    for (const track of project.tracks) {
      if (track.type !== 'overlay' || track.id === 't_overlay_template') continue;
      for (const clip of track.clips) {
        if (clip.kind !== 'overlay') continue;
        const overlay = clip as OverlayClip;
        if (!isTimeInsideClip(playheadTime, overlay)) continue;
        hideSubtitles = hideSubtitles || hidesSubtitles(overlay);
        hideCharacters = hideCharacters || hidesCharacters(overlay);
      }
    }
    return { hideSubtitles, hideCharacters };
  }, [project.tracks, playheadTime]);
  /**
   * One active clip per character slot (stewie / peter / other). Mirrors how FFmpeg
   * stacks character overlays per bucket and lets React reuse a stable `<img>` per slot.
   * Use `<` end (exclusive) so two clips sharing a boundary don't both render the same frame.
   */
  const activeCharacterClipsBySlot = useMemo(() => {
    const out: Record<CharacterBucket, CharacterClip | null> = {
      stewie: null,
      peter: null,
      other: null,
    };
    if (activeOverlayHideState.hideCharacters) return out;
    for (const track of project.tracks) {
      if (track.type !== 'character') continue;
      for (const clip of track.clips) {
        if (clip.kind !== 'character') continue;
        const character = clip as CharacterClip;
        if (playheadTime < character.start || playheadTime >= character.start + character.duration) continue;
        const slot = characterBucket(character.character);
        if (out[slot] == null) out[slot] = character;
      }
    }
    return out;
  }, [activeOverlayHideState.hideCharacters, project.tracks, playheadTime]);
  const activeSubtitle = useMemo(() => {
    if (activeOverlayHideState.hideSubtitles) return null;
    for (const track of project.tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        if (clip.kind !== 'subtitle') continue;
        const subtitle = clip as SubtitleClip;
        if (playheadTime >= subtitle.start && playheadTime < subtitle.start + subtitle.duration) {
          return subtitle;
        }
      }
    }
    return null;
  }, [activeOverlayHideState.hideSubtitles, project.tracks, playheadTime]);
  const activeSubtitleLayout = useMemo(
    () => (activeSubtitle ? subtitleAssLayoutAtTime(activeSubtitle, playheadTime) : null),
    [activeSubtitle, playheadTime]
  );

  const getOverlayUrl = useCallback((clip: OverlayClip): string => {
    if (clip.path && (clip.path.startsWith('http://') || clip.path.startsWith('https://'))) return clip.path;
    return API_ENDPOINTS.serveProjectImage(project.id, clip.assetId);
  }, [project.id]);

  const [probedVideoAssetIds, setProbedVideoAssetIds] = useState<Set<string>>(() => new Set());

  const characterImageUrl = useCallback((clip: CharacterClip): string => {
    const name = encodeURIComponent(voiceDisplayName(clip.character));
    const emotion = encodeURIComponent(resolveCharacterClipEmotion(project, clip));
    return `${API_BASE_URL}/api/character-image/${name}/${emotion}`;
  }, [project]);

  /** Baked FFmpeg preview (segment/HLS) already composites overlays, characters, subtitles — hide DOM duplicates. */
  const showDomTimelineComposite = !previewVideoSrc;

  useEffect(() => {
    if (!showDomTimelineComposite) {
      setProbedVideoAssetIds(new Set());
      return;
    }
    let cancelled = false;
    const clips = activeOverlayClips.filter((clip) => !isOverlayClipVideo(clip));
    if (clips.length === 0) {
      setProbedVideoAssetIds(new Set());
      return;
    }
    void Promise.all(
      clips.map(async (clip) => {
        const isVideo = await probeOverlayUrlIsVideo(getOverlayUrl(clip));
        return [clip.assetId, isVideo] as const;
      }),
    ).then((results) => {
      if (cancelled) return;
      const next = new Set<string>();
      for (const [assetId, isVideo] of results) {
        if (isVideo) next.add(assetId);
      }
      setProbedVideoAssetIds(next);
    });
    return () => {
      cancelled = true;
    };
  }, [activeOverlayClips, getOverlayUrl, showDomTimelineComposite]);

  // Warm the browser image cache with every resolved sprite URL (same resolution as FFmpeg's per-clip inputs).
  useEffect(() => {
    const seen = new Set<string>();
    for (const track of project.tracks) {
      if (track.type !== 'character') continue;
      for (const clip of track.clips) {
        if (clip.kind !== 'character') continue;
        const cc = clip as CharacterClip;
        const url = characterImageUrl(cc);
        if (seen.has(url)) continue;
        seen.add(url);
        const img = new Image();
        img.src = url;
      }
    }
  }, [project.tracks, characterImageUrl]);

  const lastSeekedRef = useRef<number>(0);
  const videoReadyRef = useRef(false);
  const isSyncingFromTimelineRef = useRef(false);
  const lastIntendedPlayheadRef = useRef(0);
  const isBufferingToSeekRef = useRef(false);
  const firstFrameReportedRef = useRef(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const compositor = new CanvasCompositor(canvasRef.current);
    compositorRef.current = compositor;
    setLocalCanvasReady(true);
    compositor.preloadImages(project);
    compositor.renderFrame(projectRef.current, lastIntendedPlayheadRef.current, {
      drawTemplate: false,
      drawOverlays: false,
      drawCharacters: false,
      drawSubtitles: false,
      drawSubtitleBackground: false,
    }).catch(console.warn);

    // Initialise AudioEngine and pre-fetch audio assets
    if (!audioEngineRef.current) {
      audioEngineRef.current = new AudioEngine();
      onAudioEngineReady?.(audioEngineRef.current);
    }
    audioEngineRef.current.preload(project).catch(console.warn);

    return () => {
      setLocalCanvasReady(false);
      compositor.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.template.src, project.id, templateMediaKind]);

  useEffect(() => {
    if (!localCanvasReady || !audioEngineRef.current) return;
    void audioEngineRef.current.preload(project);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localCanvasReady, audioTimelineKey, project]);

  // Static scrub rendering when paused
  useEffect(() => {
    if (isPlaying || !compositorRef.current || !localCanvasReady) return;
    compositorRef.current.renderFrame(project, playheadTime, {
      drawTemplate: false,
      drawOverlays: false,
      drawCharacters: false,
      drawSubtitles: false,
      drawSubtitleBackground: false,
    }).catch(console.warn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playheadTime, isPlaying, localCanvasReady]);

  // Drive canvas rendering loop during local playback
  useEffect(() => {
    if (!isPlaying || !localCanvasReady || !compositorRef.current || !audioEngineRef.current) return;

    let lastFrameTime = 0;
    const render = () => {
      const now = performance.now();
      // Render at ~60fps max
      if (now - lastFrameTime >= 16) {
        try {
          const currentTime = Math.min(duration, audioEngineRef.current!.getCurrentTime());
          compositorRef.current!.renderFrame(projectRef.current, currentTime, {
            drawTemplate: false,
            drawOverlays: false,
            drawCharacters: false,
            drawSubtitles: false,
            drawSubtitleBackground: false,
          }).catch((err) => console.warn('[CanvasPreview] renderFrame error', err));
          onPlayheadChangeRef.current(currentTime);
          if (!firstFrameReportedRef.current) {
            firstFrameReportedRef.current = true;
            onFirstFrameRef.current?.();
          }
          if (currentTime >= duration) {
            onPlayPauseRef.current();
            return;
          }
        } catch (err) {
          console.warn('[CanvasPreview] render loop error', err);
        }
        lastFrameTime = now;
      }
      rafIdRef.current = requestAnimationFrame(render);
    };

    rafIdRef.current = requestAnimationFrame(render);
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, localCanvasReady, duration]);

  useEffect(() => {
    videoReadyRef.current = false;
    setMutedForPolicy(true);
    firstFrameReportedRef.current = false;
  }, [videoSrc]);

  useEffect(() => {
    if (!isPlaying) {
      firstFrameReportedRef.current = false;
    }
  }, [isPlaying]);

  // Attach HLS.js when previewVideoSrc is an HLS playlist.
  useEffect(() => {
    const video = getVideoElement();
    if (!video || !previewVideoSrc || !isHlsSrc) return;

    // Use hls.js where supported
    if (Hls.isSupported()) {
      const hls = new Hls({
        debug: false,
        enableWorker: true,
      });
      
      hls.loadSource(previewVideoSrc);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {});

      return () => {
        hls.destroy();
      };
    }

    // Fallback for Safari / native HLS
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = previewVideoSrc;
    }
  }, [previewVideoSrc, isHlsSrc]);

  // Expose play/pause so parent can call play() in same stack as user click (required for autoplay policy).
  useEffect(() => {
    if (!onPreviewReady) return;
    const api: PreviewPlayerApi = {
      requestPlay: (seekToSeconds) => {
        const t = seekToSeconds ?? playheadTime;
        lastIntendedPlayheadRef.current = t;

        // AudioEngine.play runs in EditorLayout (user gesture). Here: drive <video> only.
        const video = getVideoElement();
        if (!video) return;
        // Baked preview (HLS/MP4): keep video audio. Template-only: mute — timeline audio is WebAudio.
        video.muted = !previewVideoSrc;

        isSyncingFromTimelineRef.current = true;
        const doPlay = () => { video.play().catch(() => {}); };
        const needSeek = Number.isFinite(t) && video.readyState >= 1 && Number.isFinite(video.duration) && Math.abs(video.currentTime - t) > 0.05;
        if (needSeek) {
          try {
            video.currentTime = t;
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              clearTimeout(timeoutId);
              isSyncingFromTimelineRef.current = false;
              doPlay();
            };
            const timeoutId = setTimeout(() => {
              video.removeEventListener('seeked', onSeeked);
              isSyncingFromTimelineRef.current = false;
              doPlay();
            }, 2000);
            video.addEventListener('seeked', onSeeked, { once: true });
          } catch {
            isSyncingFromTimelineRef.current = false;
            doPlay();
          }
        } else {
          isSyncingFromTimelineRef.current = false;
          doPlay();
        }
      },
      requestPause: () => {
        const video = getVideoElement();
        video?.pause();
      },
    };
    onPreviewReady(api);
    return () => onPreviewReady(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPreviewReady, localCanvasReady, playheadTime]);

  const handleReady = () => {
    videoReadyRef.current = true;
  };

  // Drive play/pause from timeline: keep video in sync with isPlaying.
  useEffect(() => {
    const video = getVideoElement();
    if (!video || !hasVideoSrc) return;

    if (!isPlaying) {
      video.pause();
      return;
    }
    
    const applyPlay = () => {
      const targetTime = lastIntendedPlayheadRef.current;

      const needSeek = Number.isFinite(targetTime) &&
        Math.abs(video.currentTime - targetTime) > 0.05 &&
        video.readyState >= 1 &&
        Number.isFinite(video.duration);

      if (needSeek) {
        isSyncingFromTimelineRef.current = true;
        try {
          video.currentTime = targetTime;
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            clearTimeout(timeoutId);
            isSyncingFromTimelineRef.current = false;
            video.play().catch(() => {});
          };
          const timeoutId = setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            isSyncingFromTimelineRef.current = false;
            video.play().catch(() => {});
          }, 2000);
          video.addEventListener('seeked', onSeeked, { once: true });
        } catch (err) {
          isSyncingFromTimelineRef.current = false;
          video.play().catch(() => {});
        }
      } else {
        isSyncingFromTimelineRef.current = false;
        video.play().catch(() => {});
      }
    };
    
    if (video.readyState >= 2) {
      applyPlay();
    } else {
      video.addEventListener('canplay', applyPlay, { once: true });
      return () => video.removeEventListener('canplay', applyPlay);
    }
  }, [isPlaying, hasVideoSrc, localCanvasReady]);

  // Sync volume from timeline.
  useEffect(() => {
    const video = getVideoElement();
    if (!video || typeof video.volume !== 'number') return;
    video.volume = Math.max(0, Math.min(1, volume / 100));
  }, [volume]);

  // Sync timeline → video: when user clicks ruler/lane or drags playhead (only when PAUSED).
  useEffect(() => {
    if (isPlaying) return;
    if (!hasVideoSrc || !Number.isFinite(playheadTime)) return;

    const video = getVideoElement();
    if (!video || typeof video.currentTime !== 'number') return;

    // Track the intended playhead time - this is what the user scrubbed to
    lastIntendedPlayheadRef.current = playheadTime;

    // Segment previews are short windows (e.g. 3s) whose local time 0 corresponds to the
    // current global playhead. Seeking to the global playhead time would land past the end
    // of the clip and show an empty/blank frame. Let the video element show its natural
    // first frame (which already represents the playhead position).
    if (previewSourceMode === 'segment') {
      isSyncingFromTimelineRef.current = false;
      isBufferingToSeekRef.current = false;
      return;
    }

    const diff = Math.abs(video.currentTime - playheadTime);
    if (diff < 0.1) return;

    // Check if video is ready for seeking
    if (video.readyState < 1 || !Number.isFinite(video.duration)) {
      return;
    }

    // Don't try to seek past the end of the loaded video (e.g. when the video is shorter
    // than the timeline). This avoids the player getting stuck on a blank end-frame.
    if (playheadTime > video.duration - 0.05) {
      return;
    }

    // Check if target is buffered
    const isBuffered = video.buffered.length > 0 && 
      video.buffered.start(0) <= playheadTime && 
      video.buffered.end(video.buffered.length - 1) >= playheadTime;

    if (isBuffered) {
      // Target is buffered, do seek immediately
      isSyncingFromTimelineRef.current = true;
      try {
        video.currentTime = playheadTime;
      } catch (err) {
      }
    } else {
      // Target not buffered - need to play first so video can buffer to that position
      isBufferingToSeekRef.current = true;
      isSyncingFromTimelineRef.current = true;

      // Play and seek to target, then pause when we reach it
      try {
        video.currentTime = playheadTime;
      } catch (err) {
      }

      video.play().catch(() => {});

      // Listen for timeupdate to pause when we reach target
      const onTimeUpdate = () => {
        const distToTarget = Math.abs(video.currentTime - playheadTime);

        if (distToTarget < 0.1) {
          video.removeEventListener('timeupdate', onTimeUpdate);
          video.pause();
          isBufferingToSeekRef.current = false;
          isSyncingFromTimelineRef.current = false;
        }
      };

      video.addEventListener('timeupdate', onTimeUpdate);
      return () => video.removeEventListener('timeupdate', onTimeUpdate);
    }
  }, [playheadTime, hasVideoSrc, isPlaying, previewSourceMode]);

  return (
    <div className="flex-1 bg-black flex flex-col items-center justify-center relative overflow-hidden min-h-0">
      {/* Preview area: same height as panel; 9:16 frame centered, pillarboxed */}
      <div className="w-full h-full flex items-center justify-center relative">
        {/* 9:16 video frame — height fills panel, width = height * 9/16 */}
        <div
          ref={frameRef}
          className="h-full w-auto aspect-[9/16] max-w-full flex items-center justify-center relative shrink-0 bg-[var(--card)]"
          style={{ minWidth: 0 }}
          onPointerDown={(e) => {
            // only clear selection when clicking empty space (not on video/controls)
            if (e.target === frameRef.current) onSelectClip(null);
          }}
        >
          {/* Template: container with ref to find video element */}
          <div ref={playerWrapperRef} className="absolute inset-0 z-[20] pointer-events-none">
            {templateMediaKind === 'video' && hasVideoSrc ? (
              <video
                ref={setPlayerRef}
                // For HLS sources, the src will be managed by hls.js; keep it empty here.
                src={isHlsSrc ? '' : videoSrc}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'auto' }}
                playsInline
                preload="auto"
                onLoadedMetadata={handleReady}
                onSeeking={() => {
                  isSeekingRef.current = true;
                }}
                onSeeked={() => {
                  const wasSyncingFromTimeline = isSyncingFromTimelineRef.current;
                  isSeekingRef.current = false;
                  isSyncingFromTimelineRef.current = false;
                  isBufferingToSeekRef.current = false;

                  const video = getVideoElement();
                  if (!video || !Number.isFinite(video.currentTime)) return;

                  const diffFromIntended = Math.abs(video.currentTime - lastIntendedPlayheadRef.current);

                  // Don't sync timeline to video if this was a programmatic seek
                  if (wasSyncingFromTimeline) {
                    return;
                  }

                  // If video position is very different from intended, it might be a user-initiated
                  // seek on the video element itself - sync timeline to match
                  if (diffFromIntended > 0.5) {
                    lastIntendedPlayheadRef.current = video.currentTime;
                    onPlayheadChange(video.currentTime);
                  }
                }}
                onTimeUpdate={() => {
                  if (isSeekingRef.current || isSyncingFromTimelineRef.current || isBufferingToSeekRef.current) return;
                  const video = getVideoElement();
                  if (!video || !Number.isFinite(video.currentTime)) return;
                  if (isPlaying && !firstFrameReportedRef.current) {
                    firstFrameReportedRef.current = true;
                    onFirstFrame?.();
                  }
                  lastSeekedRef.current = video.currentTime;
                  if (previewSourceMode === 'segment') return;
                  // Only sync video to timeline when playing. When paused, timeline is source of truth.
                  if (isPlaying) onPlayheadChange(video.currentTime);
                }}
                onPlay={() => setMutedForPolicy(false)}
                onEnded={() => {
                  if (!isPlaying) return;
                  const video = getVideoElement();
                  if (!video) return;
                  // Guard against spurious ended events during source swaps / initial buffering.
                  if (!Number.isFinite(video.duration) || video.duration < 0.5) return;
                  if (video.currentTime < video.duration - 0.05) return;
                  onPlayPause();
                }}
                onError={() => {}}
              />
            ) : templateMediaKind === 'image' && hasVideoSrc && !previewVideoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={videoSrc}
                className="absolute inset-0 h-full w-full object-cover"
                src={videoSrc ?? '/next.svg'}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
            ) : null}

            {/* Fallback visual if no template src or video failed to load */}
            {!hasVideoSrc && !isGeneratingPreview && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-[80%] aspect-square max-w-[min(60%,80vw)] flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-500 via-yellow-400 to-blue-500 opacity-80 blur-2xl" />
                  <div className="relative w-full aspect-square rounded-full bg-gradient-to-br from-blue-600 via-cyan-500 to-orange-600 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
                  </div>
                </div>
              </div>
            )}
            
            {/* Loading indicator during preview generation */}
            {isGeneratingPreview && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4" />
                <div className="text-white text-sm font-medium">Generating preview...</div>
              </div>
            )}
          </div>

          {showDomTimelineComposite && activeOverlayClips.map((clip) => {
            const url = getOverlayUrl(clip);
            const isVideo = isOverlayClipVideo(clip) || probedVideoAssetIds.has(clip.assetId);
            const isReplace = clip.displayMode === 'replace';
            const isFullFrameVideo = isVideo && (isReplace || isHyperframesOverlay(clip));
            // Mirrors backend: replace = full frame letterboxed; hyperframes = full frame transparent;
            // still images = legacy placement; video B-roll = top region above subtitles.
            const style: CSSProperties = isReplace
              ? {
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  background: '#101014',
                  zIndex: 24,
                  pointerEvents: 'none',
                }
              : isFullFrameVideo
                ? {
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    zIndex: 26,
                    pointerEvents: 'none',
                  }
                : isVideo
                  ? overlayTopRegionVideoStyle()
                  : overlayImageDomStyle(clip);

            if (isVideo) {
              return (
              <OverlayVideo
                key={clip.id}
                clip={clip}
                src={url}
                style={style}
                isPlaying={isPlaying}
                playheadTime={playheadTime}
              />
              );
            }

            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={clip.id}
                src={url}
                alt=""
                className="block"
                style={style}
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
            );
          })}

          {showDomTimelineComposite &&
            (Object.entries(activeCharacterClipsBySlot) as Array<[CharacterBucket, CharacterClip | null]>)
              .filter(([, clip]) => clip != null)
              .map(([slot, clip]) => {
                const c = clip as CharacterClip;
                return (
                  // Stable key per slot → same <img> element across clip transitions, so the
                  // browser re-uses the cached bitmap (no flicker / "cycling" through all sprites).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`character_slot_${slot}`}
                    src={characterImageUrl(c)}
                    alt=""
                    className="block pointer-events-none"
                    style={{ ...characterStyle(c), zIndex: 28 }}
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                );
              })}

          {showDomTimelineComposite && activeSubtitleLayout && (
            <SubtitlePreview layout={activeSubtitleLayout} />
          )}

          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{
              zIndex: 30,
              display: localCanvasReady ? 'block' : 'none',
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
          />

          {/* Template-only mode: DOM composites timeline clips. When previewVideoSrc is set, FFmpeg preview already bakes the same stack (see showDomTimelineComposite). */}

        </div>
      </div>
    </div>
  );
}
