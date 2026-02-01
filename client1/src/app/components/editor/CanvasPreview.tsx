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

  /** Resolve overlay image URL: use project image API when we have a project, else placeholder SVGs for mock data. */
  const resolveOverlaySrc = (assetId: string): string => {
    if (project.id) {
      return API_ENDPOINTS.serveProjectImage(project.id, assetId);
    }
    if (assetId.includes('02')) return '/globe.svg';
    if (assetId.includes('01')) return '/file.svg';
    return '/window.svg';
  };

  const isPlaceholderOverlaySrc = (src: string) => PLACEHOLDER_OVERLAY_SRCS.includes(src);
  const [overlayLoadErrors, setOverlayLoadErrors] = useState<Set<string>>(new Set());
  const onOverlayError = useCallback((clipId: string) => {
    setOverlayLoadErrors((prev) => new Set(prev).add(clipId));
  }, []);
  const onOverlayLoad = useCallback((clipId: string) => {
    setOverlayLoadErrors((prev) => {
      const next = new Set(prev);
      next.delete(clipId);
      return next;
    });
  }, []);

  // Clear overlay load errors when project updates (e.g. after image upload) so we retry loading
  useEffect(() => {
    setOverlayLoadErrors(new Set());
  }, [project.id, project.tracks]);

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
  const isSyncingFromTimelineRef = useRef(false);
  const lastIntendedPlayheadRef = useRef(0);
  const isBufferingToSeekRef = useRef(false);

  useEffect(() => {
    videoReadyRef.current = false;
    setMutedForPolicy(true);
  }, [videoSrc]);

  // Expose play/pause so parent can call play() in same stack as user click (required for autoplay policy).
  useEffect(() => {
    if (!onPreviewReady) return;
    const api: PreviewPlayerApi = {
      requestPlay: (seekToSeconds) => {
        const video = getVideoElement();
        if (!video) return;
        const t = seekToSeconds ?? playheadTime;
        
        console.log('[CanvasPreview] requestPlay', {
          seekToSeconds,
          playheadTime,
          used: t,
          videoCurrentTimeBefore: video.currentTime,
          readyState: video.readyState,
          duration: video.duration,
        });
        
        // Update intended position
        lastIntendedPlayheadRef.current = t;
        isSyncingFromTimelineRef.current = true;

        const doPlay = () => {
          video.play().catch((err) => console.warn('[CanvasPreview] requestPlay play() failed', err));
        };

        // Seek is async: wait for 'seeked' before play() so we don't start from 0.
        const needSeek = Number.isFinite(t) && video.readyState >= 1 && Number.isFinite(video.duration) && Math.abs(video.currentTime - t) > 0.05;
        if (needSeek) {
          try {
            video.currentTime = t;
            console.log('[CanvasPreview] requestPlay set currentTime to', t, 'waiting for seeked...');
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              clearTimeout(timeoutId);
              isSyncingFromTimelineRef.current = false;
              console.log('[CanvasPreview] requestPlay seeked, now playing from', video.currentTime);
              doPlay();
            };
            const timeoutId = setTimeout(() => {
              video.removeEventListener('seeked', onSeeked);
              isSyncingFromTimelineRef.current = false;
              console.warn('[CanvasPreview] requestPlay seeked timeout, playing anyway from', video.currentTime);
              doPlay();
            }, 2000);
            video.addEventListener('seeked', onSeeked, { once: true });
          } catch (err) {
            console.warn('[CanvasPreview] requestPlay set currentTime threw', err);
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
        if (!video) return;
        video.pause();
      },
    };
    onPreviewReady(api);
    return () => onPreviewReady(null);
  }, [onPreviewReady, playheadTime]);

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
      
      console.log('[CanvasPreview] applyPlay', {
        videoCurrentTime: video.currentTime,
        targetTime,
        playheadTime,
        readyState: video.readyState,
        willSeek: Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.05,
      });
      
      const needSeek = Number.isFinite(targetTime) &&
        Math.abs(video.currentTime - targetTime) > 0.05 &&
        video.readyState >= 1 &&
        Number.isFinite(video.duration);

      if (needSeek) {
        isSyncingFromTimelineRef.current = true;
        try {
          video.currentTime = targetTime;
          console.log('[CanvasPreview] applyPlay set currentTime to', targetTime, 'waiting for seeked...');
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            clearTimeout(timeoutId);
            isSyncingFromTimelineRef.current = false;
            console.log('[CanvasPreview] applyPlay seeked, now playing from', video.currentTime);
            video.play().catch((err) => console.warn('[CanvasPreview] applyPlay play() failed', err));
          };
          const timeoutId = setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            isSyncingFromTimelineRef.current = false;
            console.warn('[CanvasPreview] applyPlay seeked timeout, playing from', video.currentTime);
            video.play().catch(() => {});
          }, 2000);
          video.addEventListener('seeked', onSeeked, { once: true });
        } catch (err) {
          console.warn('[CanvasPreview] applyPlay set currentTime threw', err);
          isSyncingFromTimelineRef.current = false;
          video.play().catch(() => {});
        }
      } else {
        isSyncingFromTimelineRef.current = false;
        video.play().catch((err) => console.warn('[CanvasPreview] applyPlay play() failed', err));
      }
    };
    
    if (video.readyState >= 2) {
      applyPlay();
    } else {
      video.addEventListener('canplay', applyPlay, { once: true });
      return () => video.removeEventListener('canplay', applyPlay);
    }
  }, [isPlaying, hasVideoSrc]);

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

    const diff = Math.abs(video.currentTime - playheadTime);
    if (diff < 0.1) return;

    // Check if video is ready for seeking
    if (video.readyState < 1 || !Number.isFinite(video.duration)) {
      console.log('[CanvasPreview] Sync timeline→video video not ready', { 
        readyState: video.readyState, 
        duration: video.duration 
      });
      return;
    }

    console.log('[CanvasPreview] Sync timeline→video', {
      videoTime: video.currentTime,
      targetTime: playheadTime,
      diff,
      readyState: video.readyState,
    });

    // Check if target is buffered
    const isBuffered = video.buffered.length > 0 && 
      video.buffered.start(0) <= playheadTime && 
      video.buffered.end(video.buffered.length - 1) >= playheadTime;

    if (isBuffered) {
      // Target is buffered, do seek immediately
      isSyncingFromTimelineRef.current = true;
      try {
        video.currentTime = playheadTime;
        console.log('[CanvasPreview] Sync timeline→video set currentTime to', playheadTime, 'actual:', video.currentTime);
      } catch (err) {
        console.warn('[CanvasPreview] Sync timeline→video seek failed:', err);
      }
    } else {
      // Target not buffered - need to play first so video can buffer to that position
      console.log('[CanvasPreview] Target not buffered, playing to buffer...');
      isBufferingToSeekRef.current = true;
      isSyncingFromTimelineRef.current = true;
      
      // Play and seek to target, then pause when we reach it
      try {
        video.currentTime = playheadTime;
      } catch (err) {
        console.warn('[CanvasPreview] Initial seek failed:', err);
      }
      
      video.play().catch(() => {
        console.warn('[CanvasPreview] Play failed during buffering seek');
      });

      // Listen for timeupdate to pause when we reach target
      const onTimeUpdate = () => {
        const distToTarget = Math.abs(video.currentTime - playheadTime);
        
        if (distToTarget < 0.1) {
          console.log('[CanvasPreview] Reached buffered target, pausing');
          video.removeEventListener('timeupdate', onTimeUpdate);
          video.pause();
          isBufferingToSeekRef.current = false;
          isSyncingFromTimelineRef.current = false;
        }
      };

      video.addEventListener('timeupdate', onTimeUpdate);
      return () => video.removeEventListener('timeupdate', onTimeUpdate);
    }
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
                onLoadedMetadata={handleReady}
                onSeeking={() => {
                  isSeekingRef.current = true;
                  const v = getVideoElement();
                  console.log('[CanvasPreview] onSeeking', {
                    videoCurrentTime: v?.currentTime,
                    intended: lastIntendedPlayheadRef.current,
                    readyState: v?.readyState,
                  });
                }}
                onSeeked={() => {
                  const wasSyncingFromTimeline = isSyncingFromTimelineRef.current;
                  isSeekingRef.current = false;
                  isSyncingFromTimelineRef.current = false;
                  isBufferingToSeekRef.current = false;

                  const video = getVideoElement();
                  if (!video || !Number.isFinite(video.currentTime)) return;

                  const diffFromIntended = Math.abs(video.currentTime - lastIntendedPlayheadRef.current);
                  console.log('[CanvasPreview] onSeeked', {
                    videoCurrentTime: video.currentTime,
                    intended: lastIntendedPlayheadRef.current,
                    diffFromIntended,
                    wasSyncingFromTimeline,
                    readyState: video.readyState,
                  });

                  // Don't sync timeline to video if this was a programmatic seek
                  if (wasSyncingFromTimeline) {
                    console.log('[CanvasPreview] Ignoring seeked - was programmatic sync');
                    return;
                  }

                  // If video position is very different from intended, it might be a user-initiated
                  // seek on the video element itself - sync timeline to match
                  if (diffFromIntended > 0.5) {
                    console.log('[CanvasPreview] Video seeked independently, syncing timeline');
                    lastIntendedPlayheadRef.current = video.currentTime;
                    onPlayheadChange(video.currentTime);
                  }
                }}
                onTimeUpdate={() => {
                  if (isSeekingRef.current || isSyncingFromTimelineRef.current || isBufferingToSeekRef.current) return;
                  const video = getVideoElement();
                  if (!video || !Number.isFinite(video.currentTime)) return;
                  lastSeekedRef.current = video.currentTime;
                  // Only sync video → timeline when playing. When paused, timeline is source of truth.
                  if (isPlaying) onPlayheadChange(video.currentTime);
                }}
                onPlay={() => setMutedForPolicy(false)}
                onEnded={() => { if (isPlaying) onPlayPause(); }}
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
              const showPlaceholder = isPlaceholderOverlaySrc(overlaySrc) || overlayLoadErrors.has(o.id);
              const isSelected = selected?.trackId === ref.trackId && selected?.clipId === ref.clipId;
              const overlayStyle = {
                left: `${o.x * 100}%`,
                top: `${o.y * 100}%`,
                transform: `translate(-50%, -50%) scale(${o.scale})`,
                transformOrigin: 'center' as const,
                width: '40%',
                maxWidth: 260,
                opacity: 0.95,
              };
              const pointerHandlers = {
                onPointerDown: (e: React.PointerEvent) => {
                  e.stopPropagation();
                  onSelectClip(ref);
                  if (!isSelected) return;
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  dragRef.current = {
                    ref,
                    startX: e.clientX,
                    startY: e.clientY,
                    originX: o.x,
                    originY: o.y,
                  };
                  window.addEventListener('pointermove', onPointerMove);
                  window.addEventListener('pointerup', onPointerUp);
                },
              };
              if (showPlaceholder) {
                return (
                  <div
                    key={o.id}
                    className={[
                      'absolute select-none pointer-events-auto flex items-center justify-center rounded border border-dashed border-white/40 bg-black/30 text-white/70 text-xs p-2 text-center',
                      isSelected ? 'ring-2 ring-accent' : '',
                    ].join(' ')}
                    style={{ ...overlayStyle, height: 120 }}
                    {...pointerHandlers}
                  >
                    {o.label || 'Upload image'}
                  </div>
                );
              }
              return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={o.id}
                src={overlaySrc}
                alt={o.label}
                className={[
                  'absolute select-none pointer-events-auto drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)]',
                  isSelected ? 'ring-2 ring-accent rounded' : '',
                ].join(' ')}
                style={{
                  ...overlayStyle,
                  height: 'auto',
                }}
                onLoad={() => onOverlayLoad(o.id)}
                onError={() => onOverlayError(o.id)}
                {...pointerHandlers}
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