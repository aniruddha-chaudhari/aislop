'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import type { Clip, ClipRef, EditorProject } from '../../../features/editor/types';
import { API_ENDPOINTS } from '../../../config/api';
import { CanvasCompositor } from '../../../lib/canvasCompositor';
import { AudioEngine } from '../../../lib/audioEngine';

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
  const localPlaybackActiveRef = useRef(false);
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
    compositor.renderFrame(projectRef.current, lastIntendedPlayheadRef.current, { drawTemplate: false }).catch(console.warn);

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

  // Static scrub rendering when paused
  useEffect(() => {
    if (isPlaying || !compositorRef.current || !localCanvasReady) return;
    compositorRef.current.renderFrame(project, playheadTime, { drawTemplate: false }).catch(console.warn);
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
          compositorRef.current!.renderFrame(projectRef.current, currentTime, { drawTemplate: false }).catch((err) => console.warn('[CanvasPreview] renderFrame error', err));
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

        if (localCanvasReady) {
          // Local GPU playback: start audio engine and let rAF loop handle rendering
          if (audioEngineRef.current && projectRef.current) {
            try {
              audioEngineRef.current.play(projectRef.current, t);
              localPlaybackActiveRef.current = true;
            } catch (e) {
              console.warn('[CanvasPreview] audioEngine.play threw', e);
            }
          }
        }

        // Fallback: HTML video element playback
        const video = getVideoElement();
        if (!video) return;
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
        audioEngineRef.current?.stop();
        localPlaybackActiveRef.current = false;
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

          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{
              zIndex: 30,
              display: localCanvasReady ? 'block' : 'none',
              objectFit: 'contain',
            }}
          />

          {/* Overlays and characters are not drawn in the editor preview — view them in the timeline and properties panel. The backend preview/export bakes them in. */}

        </div>
      </div>
    </div>
  );
}
