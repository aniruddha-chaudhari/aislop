'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterClip, Clip, ClipRef, EditorProject, OverlayClip, SubtitleClip } from '../../../features/editor/types';
import { API_ENDPOINTS } from '../../../config/api';

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
  /** Optional: Preview video source (FFmpeg composite) to use instead of template */
  previewVideoSrc?: string | null;
  isGeneratingPreview?: boolean;
};

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
  previewVideoSrc,
  isGeneratingPreview = false,
}: Props) {
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement | null>(null);
  
  const setPlayerRef = useCallback((node: HTMLVideoElement | null) => {
    console.log('[CanvasPreview] setPlayerRef called', { node, tagName: node?.tagName });
    playerRef.current = node;
  }, []);
  
  // Get the video element
  const getVideoElement = (): HTMLVideoElement | null => {
    return playerRef.current;
  };
  
  const isSeekingRef = useRef(false);
  const [mutedForPolicy, setMutedForPolicy] = useState(true);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    ref: ClipRef;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const { activeSubtitle, activeOverlays, activeCharacters } = useMemo(() => {
    const now = playheadTime;

    const isActive = (c: Clip) => now >= c.start && now <= c.start + c.duration;

    const subs: SubtitleClip[] = [];
    const overlays: Array<{ ref: ClipRef; clip: OverlayClip }> = [];
    const chars: Array<{ ref: ClipRef; clip: CharacterClip }> = [];

    for (const t of project.tracks) {
      for (const c of t.clips) {
        if (!isActive(c)) continue;
        if (c.kind === 'subtitle') subs.push(c);
        if (c.kind === 'overlay') overlays.push({ ref: { trackId: t.id, clipId: c.id }, clip: c });
        if (c.kind === 'character') chars.push({ ref: { trackId: t.id, clipId: c.id }, clip: c });
      }
    }

    // choose latest-starting subtitle if multiple overlap
    subs.sort((a, b) => b.start - a.start);

    return {
      activeSubtitle: subs[0] ?? null,
      activeOverlays: overlays,
      activeCharacters: chars,
    };
  }, [playheadTime, project.tracks]);

  const PLACEHOLDER_OVERLAY_SRCS = ['/window.svg', '/file.svg', '/globe.svg'];

  const resolveOverlaySrc = (assetId: string): string => {
    // No real assets wired yet; map to built-in public svgs so <img> exists.
    if (assetId.includes('02')) return '/globe.svg';
    if (assetId.includes('01')) return '/file.svg';
    return '/window.svg';
  };

  const isPlaceholderOverlaySrc = (src: string) => PLACEHOLDER_OVERLAY_SRCS.includes(src);

  const resolveCharacterSrc = (character: CharacterClip['character']): string => {
    return character === 'Stewie' ? '/vercel.svg' : '/next.svg';
  };

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

  const pointerToNormalized = (clientX: number, clientY: number) => {
    const el = frameRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const onPointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pos = pointerToNormalized(e.clientX, e.clientY);
    if (!pos) return;
    onUpdateClip(drag.ref, { x: pos.x, y: pos.y } as Partial<Clip>);
  };

  const onPointerUp = () => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  const lastSeekedRef = useRef<number>(0);
  const videoReadyRef = useRef(false);

  useEffect(() => {
    videoReadyRef.current = false;
    setMutedForPolicy(true);
  }, [videoSrc]);

  const tryApplyPlayback = () => {
    const video = getVideoElement();
    if (!video || typeof video.play !== 'function') {
      console.warn('[CanvasPreview] video element not ready for playback');
      return;
    }
    console.log('[CanvasPreview] tryApplyPlayback', { isPlaying, playheadTime, videoCurrent: video.currentTime });
    if (isPlaying) {
      try {
        if (Number.isFinite(playheadTime)) video.currentTime = playheadTime;
      } catch {
        // ignore
      }
      video.play().catch((err) => {
        console.warn('[CanvasPreview] play() failed:', err);
      });
    } else {
      video.pause();
    }
  };

  // Expose play/pause so parent can call play() in same stack as user click (required for autoplay policy).
  useEffect(() => {
    if (!onPreviewReady) return;
    const api: PreviewPlayerApi = {
      requestPlay: (seekToSeconds) => {
        const video = getVideoElement();
        if (!video) {
          console.warn('[CanvasPreview] requestPlay called but video is null');
          return;
        }
        
        console.log('[CanvasPreview] requestPlay - full video state', { 
          seekToSeconds, 
          playheadTime, 
          currentTime: video.currentTime,
          duration: video.duration,
          readyState: video.readyState,
          networkState: video.networkState,
          paused: video.paused,
          ended: video.ended,
          seeking: video.seeking,
          seekable: video.seekable?.length,
          buffered: video.buffered?.length
        });
        
        const t = seekToSeconds ?? playheadTime;
        
        // If already at the target time, just play
        if (Math.abs(video.currentTime - t) < 0.1) {
          console.log('[CanvasPreview] already at target time, playing directly');
          video.play().catch((err) => {
            console.warn('[CanvasPreview] play() failed:', err);
          });
          return;
        }
        
        // Check if seekable
        if (video.seekable && video.seekable.length > 0) {
          const seekableStart = video.seekable.start(0);
          const seekableEnd = video.seekable.end(0);
          console.log('[CanvasPreview] video seekable range:', { seekableStart, seekableEnd, targetTime: t });
          
          if (t < seekableStart || t > seekableEnd) {
            console.warn('[CanvasPreview] target time outside seekable range!');
          }
        } else {
          console.warn('[CanvasPreview] video not seekable yet!');
        }
        
        // Try seeking multiple times as a workaround
        let attemptCount = 0;
        const maxAttempts = 5;
        
        const attemptSeek = () => {
          attemptCount++;
          console.log('[CanvasPreview] seek attempt', attemptCount, 'setting currentTime to', t);
          video.currentTime = t;
          console.log('[CanvasPreview] currentTime is now', video.currentTime);
          
          if (Math.abs(video.currentTime - t) < 0.1) {
            console.log('[CanvasPreview] seek successful!');
            // Wait for seeked event then play
            const onSeeked = () => {
              console.log('[CanvasPreview] seek completed, now playing from', video.currentTime);
              video.removeEventListener('seeked', onSeeked);
              video.play().catch((err) => {
                console.warn('[CanvasPreview] play() after seek failed:', err);
              });
            };
            video.addEventListener('seeked', onSeeked, { once: true });
          } else if (attemptCount < maxAttempts) {
            console.warn('[CanvasPreview] seek failed, retrying in 50ms...');
            setTimeout(attemptSeek, 50);
          } else {
            console.error('[CanvasPreview] seek failed after', maxAttempts, 'attempts, playing from current position');
            video.play().catch((err) => {
              console.warn('[CanvasPreview] play() failed:', err);
            });
          }
        };
        
        attemptSeek();
      },
      requestPause: () => {
        const video = getVideoElement();
        if (!video) {
          console.warn('[CanvasPreview] requestPause called but video ref is null');
          return;
        }
        video.pause();
      },
    };
    onPreviewReady(api);
    return () => onPreviewReady(null);
  }, [onPreviewReady, playheadTime]);

  // When the player signals ready, apply initial state if needed
  const handleReady = () => {
    videoReadyRef.current = true;
    console.log('[CanvasPreview] onReady', { src: videoSrc, mutedForPolicy });
    // Don't auto-play on ready - wait for user to click play
  };

  // Drive play/pause from timeline whenever isPlaying changes.
  // Don't use tryApplyPlayback here - let requestPlay/requestPause handle it
  // useEffect(() => {
  //   console.log('[CanvasPreview] isPlaying changed', { 
  //     isPlaying, 
  //     videoReady: videoReadyRef.current,
  //     playheadTime,
  //     duration 
  //   });
  //   if (!videoReadyRef.current) return;
  //   tryApplyPlayback();
  // }, [isPlaying]);

  // Sync volume from timeline.
  useEffect(() => {
    const video = getVideoElement();
    if (!video || typeof video.volume !== 'number') return;
    video.volume = Math.max(0, Math.min(1, volume / 100));
  }, [volume]);

  // Sync timeline → video: when user clicks ruler/lane or drags playhead (only when PAUSED).
  useEffect(() => {
    console.log('[CanvasPreview] Sync timeline→video effect', { 
      isPlaying, 
      playheadTime, 
      hasVideoSrc, 
      isSeekingRef: isSeekingRef.current 
    });
    
    if (isPlaying) {
      console.log('[CanvasPreview] Skipping sync - video is playing');
      return;
    }
    if (!hasVideoSrc || !Number.isFinite(playheadTime)) {
      console.log('[CanvasPreview] Skipping sync - no video or invalid playhead');
      return;
    }
    if (isSeekingRef.current) {
      console.log('[CanvasPreview] Skipping sync - user is seeking');
      return;
    }

    const video = getVideoElement();
    if (!video || typeof video.currentTime !== 'number') {
      console.log('[CanvasPreview] Skipping sync - no video element');
      return;
    }

    // Only seek if significantly different (avoid micro-adjustments)
    const diff = Math.abs(video.currentTime - playheadTime);
    console.log('[CanvasPreview] Sync check', { 
      videoCurrent: video.currentTime, 
      playheadTime, 
      diff 
    });
    
    if (diff < 0.1) {
      console.log('[CanvasPreview] Skipping sync - already close enough');
      return;
    }

    lastSeekedRef.current = playheadTime;
    console.log('[CanvasPreview] Syncing video to timeline', { 
      from: video.currentTime, 
      to: playheadTime 
    });
    
    video.currentTime = playheadTime;
    console.log('[CanvasPreview] After sync, video.currentTime is', video.currentTime);
  }, [playheadTime, hasVideoSrc, isPlaying]);

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
            {project.template.type === 'video' && hasVideoSrc ? (
              <video
                ref={setPlayerRef}
                src={videoSrc}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'auto' }}
                playsInline
                preload="auto"
                onLoadStart={() => {
                  console.log('[CanvasPreview] onLoadStart', { src: videoSrc });
                }}
                onLoadedMetadata={handleReady}
                onSeeking={() => { 
                  console.log('[CanvasPreview] onSeeking fired');
                  isSeekingRef.current = true; 
                }}
                onSeeked={() => { 
                  const video = getVideoElement();
                  console.log('[CanvasPreview] onSeeked fired', { 
                    currentTime: video?.currentTime 
                  });
                  isSeekingRef.current = false; 
                }}
                onTimeUpdate={() => {
                  if (isSeekingRef.current) {
                    console.log('[CanvasPreview] onTimeUpdate skipped - seeking');
                    return;
                  }
                  const video = getVideoElement();
                  if (!video || !Number.isFinite(video.currentTime)) {
                    console.log('[CanvasPreview] onTimeUpdate skipped - no video');
                    return;
                  }
                  console.log('[CanvasPreview] onTimeUpdate', { 
                    currentTime: video.currentTime,
                    lastSeek: lastSeekedRef.current 
                  });
                  lastSeekedRef.current = video.currentTime;
                  onPlayheadChange(video.currentTime);
                }}
                onPlay={() => {
                  const video = getVideoElement();
                  console.log('[CanvasPreview] onPlay fired', { 
                    currentTime: video?.currentTime,
                    duration: video?.duration,
                    paused: video?.paused
                  });
                  setMutedForPolicy(false);
                }}
                onPause={() => {
                  const video = getVideoElement();
                  console.log('[CanvasPreview] onPause fired', { 
                    currentTime: video?.currentTime 
                  });
                }}
                onEnded={() => {
                  console.log('[CanvasPreview] onEnded fired', { isPlaying, playheadTime, duration });
                  if (isPlaying) onPlayPause();
                }}
                onError={(err) => {
                  console.warn('[CanvasPreview] Video failed to load:', videoSrc, err);
                }}
              />
            ) : project.template.type === 'image' && hasVideoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={videoSrc}
                className="absolute inset-0 h-full w-full object-cover"
                src={videoSrc ?? '/next.svg'}
                alt={project.template.label}
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

          {/* Overlays (Phase 2) — drawn on top (z-30) but pointer-events-none so video controls stay usable */}
          {/* Only show overlays if NOT using preview video (preview has overlays baked in) */}
          {!previewVideoSrc && (
          <div className="absolute inset-0 z-[30] pointer-events-none">
            {activeOverlays.map(({ ref, clip: o }) => {
              const overlaySrc = resolveOverlaySrc(o.assetId);
              if (isPlaceholderOverlaySrc(overlaySrc)) return null;
              const isSelected = selected?.trackId === ref.trackId && selected?.clipId === ref.clipId;
              return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={o.id}
                src={overlaySrc}
                alt={o.label}
                className={[
                  'absolute select-none drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)]',
                  isSelected ? 'ring-2 ring-accent rounded' : '',
                ].join(' ')}
                style={{
                  left: `${o.x * 100}%`,
                  top: `${o.y * 100}%`,
                  transform: `translate(-50%, -50%) scale(${o.scale})`,
                  transformOrigin: 'center',
                  width: '40%',
                  maxWidth: 260,
                  height: 'auto',
                  opacity: 0.95,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectClip(ref);
                  // drag only when selected (after selecting), so first click selects, second drags
                  if (!isSelected) return;
                  (e.currentTarget as HTMLImageElement).setPointerCapture(e.pointerId);
                  dragRef.current = {
                    ref,
                    startX: e.clientX,
                    startY: e.clientY,
                    originX: o.x,
                    originY: o.y,
                  };
                  window.addEventListener('pointermove', onPointerMove);
                  window.addEventListener('pointerup', onPointerUp);
                }}
              />
              );
            })}

            {activeCharacters.map(({ ref, clip: c }) => {
              const isSelected = selected?.trackId === ref.trackId && selected?.clipId === ref.clipId;
              return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={c.id}
                src={resolveCharacterSrc(c.character)}
                alt={c.character}
                className={[
                  'absolute select-none drop-shadow-[0_10px_30px_rgba(0,0,0,0.55)]',
                  isSelected ? 'ring-2 ring-accent rounded' : '',
                ].join(' ')}
                style={{
                  left: `${c.x * 100}%`,
                  top: `${c.y * 100}%`,
                  transform: `translate(-50%, -50%) scale(${c.scale})`,
                  transformOrigin: 'center',
                  width: '30%',
                  maxWidth: 200,
                  height: 'auto',
                  opacity: 0.98,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectClip(ref);
                  if (!isSelected) return;
                  (e.currentTarget as HTMLImageElement).setPointerCapture(e.pointerId);
                  dragRef.current = {
                    ref,
                    startX: e.clientX,
                    startY: e.clientY,
                    originX: c.x,
                    originY: c.y,
                  };
                  window.addEventListener('pointermove', onPointerMove);
                  window.addEventListener('pointerup', onPointerUp);
                }}
              />
              );
            })}

            {activeSubtitle && (
              <div className="absolute bottom-12 left-1/2 w-[92%] -translate-x-1/2 text-center">
                <div className="mx-auto inline-block rounded-lg bg-black/65 px-3 py-2">
                  <div className="text-[10px] font-semibold tracking-wide text-accent">
                    {activeSubtitle.speaker}
                  </div>
                  <div className="text-sm font-semibold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]">
                    {activeSubtitle.text}
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

        </div>
      </div>
    </div>
  );
}
