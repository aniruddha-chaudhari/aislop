'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, ClipRef, EditorProject, OverlayClip, SubtitleClip, Track, WordTimestamp } from '../../../features/editor/types';
import { useRouter } from 'next/navigation';
import EditorSidebar from './EditorSidebar';
import CanvasPreview, { type PreviewPlayerApi } from './CanvasPreview';
import TextPropertiesPanel, { type TextPropertiesPanelHandle } from './TextPropertiesPanel';
import VideoTimelinePanel from './VideoTimelinePanel';
import { API_ENDPOINTS, API_BASE_URL } from '../../../config/api';
import { editorProjectFromApi, sortEditorTracks as sortTracks } from '../../../features/editor/mapApiProject';

const TEMPLATE_OVERLAY_TRACK_ID = 't_overlay_template';
/** Smallest segment length (seconds) allowed when splitting — avoids zero-length clips */
const MIN_SPLIT_SEGMENT_SEC = 0.05;

function partitionSubtitleWordsAtRelativeTime(
  words: WordTimestamp[],
  splitRel: number
): { left: WordTimestamp[] | undefined; right: WordTimestamp[] | undefined } {
  const left: WordTimestamp[] = [];
  const right: WordTimestamp[] = [];
  for (const w of words) {
    const mid = (w.start + w.end) / 2;
    if (mid <= splitRel) left.push(w);
    else
      right.push({
        ...w,
        start: Math.max(0, w.start - splitRel),
        end: Math.max(0, w.end - splitRel),
      });
  }
  return {
    left: left.length ? left : undefined,
    right: right.length ? right : undefined,
  };
}

function newSplitClipRightId(): string {
  return `clip_${crypto.randomUUID?.() ?? Date.now()}`;
}

/** Split at absolute timeline time into [left, right] or null if playhead isn't strictly inside clip. */
function splitClipIntoPairAtAbsoluteTime(clip: Clip, tPlay: number): [Clip, Clip] | null {
  const cStart = clip.start;
  const cEnd = cStart + clip.duration;
  if (tPlay <= cStart + MIN_SPLIT_SEGMENT_SEC || tPlay >= cEnd - MIN_SPLIT_SEGMENT_SEC) return null;

  const leftDuration = tPlay - cStart;
  const rightClipId = newSplitClipRightId();
  const leftClip = JSON.parse(JSON.stringify(clip)) as Clip;
  leftClip.duration = leftDuration;
  const rightClip = JSON.parse(JSON.stringify(clip)) as Clip;
  rightClip.id = rightClipId;
  rightClip.start = tPlay;
  rightClip.duration = cEnd - tPlay;

  if (clip.kind === 'subtitle') {
    const sub = clip as SubtitleClip;
    if (sub.words?.length) {
      const splitRel = leftDuration;
      const { left: lw, right: rw } = partitionSubtitleWordsAtRelativeTime(sub.words, splitRel);
      (leftClip as SubtitleClip).words = lw;
      (rightClip as SubtitleClip).words = rw;
    }
  }
  if (clip.kind === 'music' || clip.kind === 'sfx') {
    const base = (clip as any).sourceOffset ?? 0;
    (rightClip as any).sourceOffset = base + leftDuration;
  }
  return [leftClip, rightClip];
}

function findFirstDraftAnimationClip(project: EditorProject): ClipRef | null {
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (
        clip.kind === 'overlay' &&
        (clip as any).animationMomentId &&
        (((clip as any).planStatus as string | undefined) ?? 'draft') === 'draft'
      ) {
        return { trackId: track.id, clipId: clip.id };
      }
    }
  }
  return null;
}

type Props = {
  project: EditorProject;
  /** Refetch project; if it returns the updated project, we sync draftProject so template/audio/timeline show without reload */
  onProjectUpdate?: () => void | Promise<EditorProject | void>;
};

type TemplateVideo = {
  filename: string;
  path: string;
  fileSize: number;
};

type AudioSession = {
  sessionId: string;
  name?: string;
  createdAt: string;
  stats: {
    totalDialogues: number;
    audioFilesGenerated: number;
    allSuccessful: boolean;
  };
};

type ProjectImageAsset = {
  assetId: string;
  filename: string;
  size: number;
};

type VideoLibraryAsset = {
  filename: string;
  path: string;
  fileSize: number;
};

// Match image-plan overlay defaults used by backend placement logic.
const IMAGE_PLAN_DEFAULT_X = 0.5;
const IMAGE_PLAN_DEFAULT_Y = 0.65;
const IMAGE_PLAN_DEFAULT_SCALE = 0.5;

export default function EditorLayout({ project, onProjectUpdate }: Props) {
  const router = useRouter();
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isGeneratingClipPlan, setIsGeneratingClipPlan] = useState(false);
  const [isGeneratingAnimationPlan, setIsGeneratingAnimationPlan] = useState(false);
  const [isApprovingAnimationPlan, setIsApprovingAnimationPlan] = useState(false);
  const [generatingAnimationMomentId, setGeneratingAnimationMomentId] = useState<string | null>(null);
  const [isCreatingAnimationClip, setIsCreatingAnimationClip] = useState(false);
  const [isDeletingAnimationPlan, setIsDeletingAnimationPlan] = useState(false);
  const [isGeneratingSfxPlan, setIsGeneratingSfxPlan] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedVideoFilename, setExportedVideoFilename] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [draftProject, setDraftProject] = useState<EditorProject>(project);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [volume, setVolume] = useState(75);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [timelineHeight, setTimelineHeight] = useState(260);
  const [rightPanelWidth, setRightPanelWidth] = useState(224);
  const [selected, setSelected] = useState<ClipRef | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showSubtitlesInTimeline, setShowSubtitlesInTimeline] = useState(true);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const previewPlayerRef = useRef<PreviewPlayerApi | null>(null);
  const propertiesPanelRef = useRef<TextPropertiesPanelHandle | null>(null);
  
  // Preview generation (HLS only; no 3s segment chunking)
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewVideoSrc, setPreviewVideoSrc] = useState<string | null>(null);
  const [previewSourceMode, setPreviewSourceMode] = useState<'none' | 'segment' | 'hls'>('none');
  // Track which backend preview version the current HLS playlist corresponds to.
  // If overlay media is replaced under the same assetId, the backend version can change
  // even when timeline JSON doesn't. We must not keep reusing an old playlist on Play.
  const lastHlsVersionRef = useRef<string | null>(null);
  const hlsPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const segmentPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const segmentDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const timelineDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const segmentRequestSeqRef = useRef(0);
  const lastPlayAttemptAtRef = useRef<number>(0);
  const suppressSegmentUntilRef = useRef<number>(0);
  const latestPlayheadRef = useRef<number>(0);
  const isGeneratingPreviewRef = useRef(false);
  const previewSourceModeRef = useRef<'none' | 'segment' | 'hls'>('none');
  const isDirtyRef = useRef(false);
  const isPlayingRef = useRef(false);
  const isInitialTimelineRef = useRef(true);
  // Avoid stale React closures when requesting previews while editing.
  const draftProjectRef = useRef(draftProject);
  const playClickAtRef = useRef<number | null>(null);
  const hlsRequestAtRef = useRef<number | null>(null);
  const previewReadyAtRef = useRef<number | null>(null);

  useEffect(() => {
    isGeneratingPreviewRef.current = isGeneratingPreview;
  }, [isGeneratingPreview]);

  useEffect(() => {
    previewSourceModeRef.current = previewSourceMode;
  }, [previewSourceMode]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    latestPlayheadRef.current = playheadTime;
  }, [playheadTime]);

  useEffect(() => {
    draftProjectRef.current = draftProject;
  }, [draftProject]);

  const logPreviewTelemetry = useCallback((event: string, data: Record<string, unknown> = {}) => {
    console.info('[PreviewTelemetry]', {
      event,
      projectId: project.id,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }, [project.id]);

  const handleFirstFrame = useCallback(() => {
    const now = performance.now();
    const playClickMs = playClickAtRef.current != null ? Math.round(now - playClickAtRef.current) : null;
    const previewReadyMs = previewReadyAtRef.current != null ? Math.round(now - previewReadyAtRef.current) : null;
    logPreviewTelemetry('first_frame', {
      play_click_to_first_frame_ms: playClickMs,
      preview_ready_to_first_frame_ms: previewReadyMs,
    });
  }, [logPreviewTelemetry]);

  const canGeneratePreview = Boolean(project.template?.src && project.audioSessionId && project.audioSessionId !== 'no-session');

  const toAbsolutePreviewUrl = useCallback((url: string): string => {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${API_BASE_URL}${url}`;
  }, []);

  const clearSegmentPolling = useCallback(() => {
    if (segmentPollIntervalRef.current) {
      clearInterval(segmentPollIntervalRef.current);
      segmentPollIntervalRef.current = null;
    }
  }, []);

  const requestSegmentPreview = useCallback(async (atSeconds: number, reason: 'scrub' | 'timeline_change' | 'timeline_saved') => {
    if (!canGeneratePreview) return;
    if (isGeneratingPreviewRef.current) return;
    if (isPlayingRef.current) return;
    if (Date.now() < suppressSegmentUntilRef.current) return;
    if (previewSourceModeRef.current === 'hls' && reason === 'scrub') return;
    if (reason === 'scrub' && Date.now() - lastPlayAttemptAtRef.current < 1500) return;
    const playhead = Math.max(0, Number.isFinite(atSeconds) ? atSeconds : 0);
    const windowSeconds = 3;
    const seq = ++segmentRequestSeqRef.current;
    logPreviewTelemetry('segment_requested', {
      reason,
      playheadTime: Number(playhead.toFixed(3)),
      isDirty: isDirtyRef.current,
    });

    const applyReady = (payload: Record<string, unknown> | null | undefined): boolean => {
      if (!payload || payload.success !== true || payload.state !== 'ready' || typeof payload.url !== 'string') return false;
      // Ignore stale segment completions while actively playing or just after play click.
      if (isPlayingRef.current || Date.now() - lastPlayAttemptAtRef.current < 2000) {
        return false;
      }
      if (Date.now() < suppressSegmentUntilRef.current) {
        return false;
      }
      const now = performance.now();
      const baseUrl = toAbsolutePreviewUrl(payload.url);
      const cacheBust = baseUrl.includes('?') ? '&t=' : '?t=';
      setPreviewVideoSrc(`${baseUrl}${cacheBust}${Date.now()}`);
      setPreviewSourceMode('segment');
      previewReadyAtRef.current = now;
      logPreviewTelemetry('segment_ready', {
        reason,
        play_click_to_ready_ms: playClickAtRef.current != null ? Math.round(now - playClickAtRef.current) : null,
      });
      clearSegmentPolling();
      return true;
    };

    try {
      const dp = draftProjectRef.current;
      const timelineOverride = isDirtyRef.current
        ? { duration: dp.duration, tracks: dp.tracks }
        : undefined;
      const res = await fetch(API_ENDPOINTS.generatePreviewSegment(project.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playheadTime: playhead, windowSeconds, ...(timelineOverride ? { timeline: timelineOverride } : {}) }),
      });
      const data = await res.json();
      if (seq !== segmentRequestSeqRef.current) return;
      if (applyReady(data)) return;

      const versionFromStart = typeof (data as any)?.version === 'string' ? String((data as any).version) : null;
      clearSegmentPolling();
      segmentPollIntervalRef.current = setInterval(async () => {
        try {
          if (seq !== segmentRequestSeqRef.current) {
            clearSegmentPolling();
            return;
          }
          const statusUrl = `${API_ENDPOINTS.getPreviewSegmentStatus(project.id)}?playheadTime=${encodeURIComponent(String(playhead))}&windowSeconds=${windowSeconds}${versionFromStart ? `&version=${encodeURIComponent(versionFromStart)}` : ''}`;
          const statusRes = await fetch(statusUrl);
          const statusData = await statusRes.json();
          if (seq !== segmentRequestSeqRef.current) {
            clearSegmentPolling();
            return;
          }
          if (applyReady(statusData)) return;
          if (statusData?.state === 'error') {
            clearSegmentPolling();
            logPreviewTelemetry('segment_error', {
              reason,
              error: (statusData as { error?: string })?.error || 'segment status error',
            });
          }
        } catch (_) {}
      }, 500);
    } catch (error) {
      if (seq !== segmentRequestSeqRef.current) return;
      logPreviewTelemetry('segment_request_failed', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [canGeneratePreview, clearSegmentPolling, logPreviewTelemetry, project.id, toAbsolutePreviewUrl]);

  const handlePlayToggle = async () => {
    const next = !isPlaying;
    // Segment preview URLs come back as `/api/project/:id/preview?mode=segment&...`,
    // not as raw filesystem paths. Match either form so play correctly swaps to HLS.
    const isSegmentSrc = Boolean(
      previewVideoSrc &&
      (previewVideoSrc.includes('/previews/segments/') || /[?&]mode=segment(?:&|$)/.test(previewVideoSrc))
    );
    logPreviewTelemetry('play_toggle_clicked', {
      from: isPlaying ? 'playing' : 'paused',
      to: next ? 'playing' : 'paused',
      previewSourceMode,
      isSegmentSrc,
      hasPreviewSrc: Boolean(previewVideoSrc),
    });
    let seekTo: number | undefined;
    if (next) {
      suppressSegmentUntilRef.current = Date.now() + 5000;
      // Invalidate any in-flight segment preview requests so they cannot overwrite HLS on play.
      segmentRequestSeqRef.current += 1;
      clearSegmentPolling();
      if (segmentDebounceRef.current) {
        clearTimeout(segmentDebounceRef.current);
        segmentDebounceRef.current = null;
      }
      if (timelineDebounceRef.current) {
        clearTimeout(timelineDebounceRef.current);
        timelineDebounceRef.current = null;
      }
      lastPlayAttemptAtRef.current = Date.now();
      playClickAtRef.current = performance.now();
      const atEnd = draftProject.duration > 0 && playheadTime >= draftProject.duration;
      seekTo = atEnd ? 0 : playheadTime;
      logPreviewTelemetry('play_clicked', {
        hasPreviewSrc: Boolean(previewVideoSrc),
        isDirty,
        playheadTime: Number(playheadTime.toFixed(3)),
      });
    }
    
    // If playing and we have template + audio session, use full HLS preview only
    if (next && project.template?.src && project.audioSessionId && project.audioSessionId !== 'no-session') {
      // Segment previews are short windows (for scrub feedback), not full playback sources.
      // If current source is segment, force HLS generation for timeline playback.
      // Also: if we already have an HLS playlist loaded but the backend version changed (e.g. media re-upload),
      // treat it as stale and regenerate/swap to the new version.
      let isStaleHls = false;
      if (previewVideoSrc && previewSourceMode === 'hls') {
        try {
          const statusRes = await fetch(API_ENDPOINTS.getPreviewHlsStatus(project.id), { cache: 'no-store' });
          const statusData = await statusRes.json();
          const versionNow = typeof statusData?.version === 'string' ? statusData.version : null;
          if (versionNow && lastHlsVersionRef.current && versionNow !== lastHlsVersionRef.current) {
            isStaleHls = true;
            logPreviewTelemetry('hls_stale_detected', {
              previousVersion: lastHlsVersionRef.current,
              currentVersion: versionNow,
            });
          }
        } catch (_) {}
      }

      if (!previewVideoSrc || previewSourceMode === 'segment' || isSegmentSrc || isStaleHls) {
        if (isDirty) {
          try {
            await handleSaveTimeline(true);
          } catch (e) {
            setMessage({ type: 'error', text: 'Save failed. Save timeline first.' });
            return;
          }
        }
        // Fast path: if HLS is already ready, reuse it immediately (avoid flicker/loading overlay).
        try {
          const statusRes = await fetch(API_ENDPOINTS.getPreviewHlsStatus(project.id), { cache: 'no-store' });
          const statusData = await statusRes.json();
          if (statusData?.success && statusData?.ready && statusData?.playlistUrl) {
            const absolutePlaylistUrl = `${API_BASE_URL}${statusData.playlistUrl}?t=${Date.now()}`;
            setPreviewVideoSrc(absolutePlaylistUrl);
            setPreviewSourceMode('hls');
            lastHlsVersionRef.current = typeof statusData?.version === 'string' ? statusData.version : null;
            setIsPlaying(true);
            suppressSegmentUntilRef.current = 0;
            previewReadyAtRef.current = performance.now();
            setTimeout(() => previewPlayerRef.current?.requestPlay?.(seekTo ?? playheadTime), 120);
            return;
          }
        } catch (_) {}

        setIsGeneratingPreview(true);
        setMessage({ type: 'info', text: 'Generating preview...' });
        try {
          hlsRequestAtRef.current = performance.now();
          logPreviewTelemetry('hls_requested');
          await fetch(API_ENDPOINTS.generatePreviewHls(project.id), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const pollForHls = async () => {
            try {
              const res = await fetch(API_ENDPOINTS.getPreviewHlsStatus(project.id));
              const data = await res.json();
              if (data.success && data.ready && data.playlistUrl) {
                const now = performance.now();
                const absolutePlaylistUrl = `${API_BASE_URL}${data.playlistUrl}?t=${Date.now()}`;
                setPreviewVideoSrc(absolutePlaylistUrl);
                setPreviewSourceMode('hls');
                lastHlsVersionRef.current = typeof data?.version === 'string' ? data.version : null;
                setIsGeneratingPreview(false);
                setIsPlaying(true);
                suppressSegmentUntilRef.current = 0;
                previewReadyAtRef.current = now;
                logPreviewTelemetry('hls_ready', {
                  hls_request_to_ready_ms: hlsRequestAtRef.current != null ? Math.round(now - hlsRequestAtRef.current) : null,
                  play_click_to_ready_ms: playClickAtRef.current != null ? Math.round(now - playClickAtRef.current) : null,
                });
                if (hlsPollIntervalRef.current) {
                  clearInterval(hlsPollIntervalRef.current);
                  hlsPollIntervalRef.current = null;
                }
                setTimeout(() => previewPlayerRef.current?.requestPlay?.(seekTo ?? playheadTime), 300);
                setMessage({ type: 'success', text: 'Preview ready!' });
                setTimeout(() => setMessage(null), 2000);
              }
            } catch (_) {}
          };
          hlsPollIntervalRef.current = setInterval(pollForHls, 1000);
        } catch (error) {
          const now = performance.now();
          logPreviewTelemetry('hls_error', {
            hls_request_elapsed_ms: hlsRequestAtRef.current != null ? Math.round(now - hlsRequestAtRef.current) : null,
            error: error instanceof Error ? error.message : String(error),
          });
          setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to generate preview' });
          setTimeout(() => setMessage(null), 5000);
          setIsGeneratingPreview(false);
        }
        return;
      }
    } else if (next && !project.template?.src) {
      // Block play only when no template (allow template-only play from timeline)
      setMessage({ type: 'info', text: 'Please select a template first' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    
    // Only reset to start when actually at end of timeline (duration > 0)
    if (next && draftProject.duration > 0 && playheadTime >= draftProject.duration) {
      setPlayheadTime(0);
      seekTo = 0;
    } else if (next) {
      seekTo = playheadTime;
    }
    setIsPlaying(next);
    if (next) {
      suppressSegmentUntilRef.current = 0;
      previewReadyAtRef.current = performance.now();
      logPreviewTelemetry('play_using_existing_preview');
      previewPlayerRef.current?.requestPlay?.(seekTo);
    }
    else previewPlayerRef.current?.requestPause?.();
  };
  
  // Template and audio session data/state
  const [templates, setTemplates] = useState<TemplateVideo[]>([]);
  const [audioSessions, setAudioSessions] = useState<AudioSession[]>([]);
  const [changingTemplate, setChangingTemplate] = useState(false);
  const [changingAudioSession, setChangingAudioSession] = useState(false);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  // When we navigate to a different project (id changes), reset local draft state.
  // Use project.id so adding a track (draft change) or parent re-renders don't overwrite the draft.
  useEffect(() => {
    setDraftProject(project);
    setSelected(null);
    setIsDirty(false);
    setPlayheadTime(0);
    setIsPlaying(false);
    setPreviewVideoSrc(null);
    setPreviewSourceMode('none');
    lastHlsVersionRef.current = null;
    setExportedVideoFilename(null);
    isInitialTimelineRef.current = true;

    // Clean up HLS polling interval
    if (hlsPollIntervalRef.current) {
      clearInterval(hlsPollIntervalRef.current);
      hlsPollIntervalRef.current = null;
    }
    clearSegmentPolling();
    if (segmentDebounceRef.current) {
      clearTimeout(segmentDebounceRef.current);
      segmentDebounceRef.current = null;
    }
    if (timelineDebounceRef.current) {
      clearTimeout(timelineDebounceRef.current);
      timelineDebounceRef.current = null;
    }
  }, [project.id]);

  // When timeline structure changes (tracks/duration), keep last preview visible and queue one fresh segment preview.
  useEffect(() => {
    if (isInitialTimelineRef.current) {
      isInitialTimelineRef.current = false;
      return;
    }
    if (isPlaying) return;
    setIsPlaying(false);
    if (previewSourceMode === 'hls') setPreviewSourceMode('none');
    if (hlsPollIntervalRef.current) {
      clearInterval(hlsPollIntervalRef.current);
      hlsPollIntervalRef.current = null;
    }
    if (!canGeneratePreview || isDirty) return;
    if (timelineDebounceRef.current) clearTimeout(timelineDebounceRef.current);
    timelineDebounceRef.current = setTimeout(() => {
      void requestSegmentPreview(latestPlayheadRef.current, 'timeline_change');
    }, 400);
  }, [draftProject.tracks, draftProject.duration, canGeneratePreview, isDirty, isPlaying, previewSourceMode, requestSegmentPreview]);

  // Debounced scrub preview refresh when paused.
  useEffect(() => {
    if (!canGeneratePreview || isPlaying || isGeneratingPreview) return;
    if (previewSourceMode === 'hls') return;
    if (segmentDebounceRef.current) clearTimeout(segmentDebounceRef.current);
    segmentDebounceRef.current = setTimeout(() => {
      void requestSegmentPreview(playheadTime, 'scrub');
    }, 180);
    return () => {
      if (segmentDebounceRef.current) {
        clearTimeout(segmentDebounceRef.current);
        segmentDebounceRef.current = null;
      }
    };
  }, [playheadTime, canGeneratePreview, isPlaying, isGeneratingPreview, previewSourceMode, requestSegmentPreview]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (hlsPollIntervalRef.current) {
        clearInterval(hlsPollIntervalRef.current);
      }
      clearSegmentPolling();
      if (segmentDebounceRef.current) clearTimeout(segmentDebounceRef.current);
      if (timelineDebounceRef.current) clearTimeout(timelineDebounceRef.current);
    };
  }, [clearSegmentPolling]);

  // Fetch templates and audio sessions on mount
  useEffect(() => {
    fetchTemplates();
    fetchAudioSessions();
  }, []);

  // Refetch when editor tab becomes visible (e.g. after adding template/session elsewhere)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchTemplates();
        fetchAudioSessions();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.templateVideos);
      const data = await response.json();
      const temps = data.templates || data.videos || [];
      setTemplates(temps);
    } catch (error) {
    }
  };

  const fetchAudioSessions = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.audio);
      const data = await response.json();
      const sessions = data.success ? data.sessions : data.sessions || [];
      setAudioSessions(sessions);
    } catch (error) {
    }
  };

  const buildAudioOnlyTimeline = async (sessionId: string, sessionName: string, existingTracks: Track[] = []) => {
    const sessionResponse = await fetch(API_ENDPOINTS.audioSession(sessionId));
    if (!sessionResponse.ok) {
      throw new Error(`Failed to load session ${sessionId}`);
    }

    const sessionData = await sessionResponse.json();
    const session = sessionData?.session;

    const durationsFromDialogues = (session?.dialogues || [])
      .map((d: any) => Number(d?.audioFile?.duration || 0))
      .filter((d: number) => d > 0);
    const durationsFromFiles = (session?.audioFiles || [])
      .map((f: any) => Number(f?.duration || 0))
      .filter((d: number) => d > 0);

    const sum = (arr: number[]) => arr.reduce((acc, n) => acc + n, 0);
    const totalDuration = Math.max(sum(durationsFromDialogues), sum(durationsFromFiles), 1);


    // Check if there's already a template/overlay track
    const overlayTrack = existingTracks.find(t => t.type === 'overlay');
    
    const audioTrack = {
      id: 't_audio',
      type: 'audio' as const,
      name: 'Audio',
      locked: true,
      clips: [
        {
          id: `a_${sessionId}`,
          kind: 'audio' as const,
          start: 0,
          duration: totalDuration,
          label: sessionName ? `Session ${sessionName}` : `Session ${sessionId}`,
        },
      ],
    };
    
    // Build tracks array: overlay first (if exists), then audio, then others
    const otherTracks = existingTracks.filter(t => t.type !== 'overlay' && t.type !== 'audio');
    const tracks = sortTracks([
      ...(overlayTrack ? [overlayTrack] : []),
      audioTrack,
      ...otherTracks
    ]);
    
    const timeline = {
      duration: totalDuration,
      tracks,
    };
    return timeline;
  };

  const handleChangeTemplate = async (templatePath: string, templateLabel: string) => {
    setChangingTemplate(true);
    setMessage(null);

    try {
      const response = await fetch(API_ENDPOINTS.updateProject(project.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: {
            type: 'video',
            label: templateLabel,
            path: templatePath,
            videoStart: project.template?.videoStart ?? 0,
          },
        }),
      });


      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Template changed to ${templateLabel}` });
        const updated = await onProjectUpdate?.();
        if (updated) setDraftProject(updated);

        // Get updated project data to check timeline state
        const updatedProjectResponse = await fetch(API_ENDPOINTS.getProject(project.id));
        if (updatedProjectResponse.ok) {
          const updatedData = await updatedProjectResponse.json();
          const updatedProject = updatedData.project;
          
          // Check if we need to create an overlay track for the template
          const timelineTracks = updatedProject?.timeline?.tracks || [];
          const timelineIsEmpty = timelineTracks.length === 0 || timelineTracks.every((t: any) => (t.clips || []).length === 0);
          const hasOverlayTrack = timelineTracks.some((t: any) => t.type === 'overlay');
          const templateNeedsTrack = timelineIsEmpty || !hasOverlayTrack;

          if (templateNeedsTrack) {
            try {
              // Use session/timeline duration so template is cut to audio size (never longer than session)
              const audioTrack = timelineTracks.find((t: any) => t.type === 'audio');
              const audioDuration = audioTrack?.clips?.reduce((sum: number, c: any) => sum + (c.duration || 0), 0) || updatedProject?.timeline?.duration || 30;
              const templateDuration = Math.max(1, audioDuration); // Match session length; minimum 1s to avoid zero

              // Create overlay track with template clip
              const overlayTrack = {
                id: 't_overlay_template',
                type: 'overlay',
                name: 'Template',
                locked: true,
                clips: [
                  {
                    id: `overlay_template_${Date.now()}`,
                    kind: 'overlay',
                    start: 0,
                    duration: templateDuration,
                    assetId: templatePath,
                    label: templateLabel,
                    x: 0.5, // Center
                    y: 0.5, // Center
                    scale: 1.0, // Full scale
                  },
                ],
              };

              // If timeline is empty, create new timeline with overlay track
              // Otherwise, add overlay track and sort all tracks in correct order
              let updatedTracks: any[];
              if (timelineIsEmpty) {
                updatedTracks = [overlayTrack];
              } else {
                // Remove existing overlay track if it exists, then add new one and sort
                const otherTracks = timelineTracks.filter((t: any) => t.type !== 'overlay');
                updatedTracks = sortTracks([overlayTrack, ...otherTracks] as Track[]) as any[];
              }

              const timeline = {
                duration: templateDuration,
                tracks: updatedTracks,
              };

              const saveResponse = await fetch(API_ENDPOINTS.saveTimeline(project.id), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timeline }),
              });

              if (!saveResponse.ok) {
                throw new Error(`Failed to save template timeline (status ${saveResponse.status})`);
              }

              const saveData = await saveResponse.json();
              const updatedAfterSave = await onProjectUpdate?.();
              if (updatedAfterSave) setDraftProject(updatedAfterSave);
            } catch (timelineError) {
              // Don't show error to user, template was still updated successfully
            }
          }
        }
      } else {
        throw new Error(data.error || 'Failed to change template');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to change template' });
    } finally {
      setChangingTemplate(false);
    }
  };

  const handleVideoStartChange = useCallback(async (seconds: number) => {
    const value = Math.max(0, seconds);
    try {
      const response = await fetch(API_ENDPOINTS.updateProject(project.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: {
            type: draftProject.template?.type ?? 'video',
            label: draftProject.template?.label ?? '',
            path: draftProject.template?.src ?? '',
            posterSrc: draftProject.template?.posterSrc,
            videoStart: value,
          },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.success) {
        setDraftProject((prev) => ({
          ...prev,
          template: { ...prev.template, videoStart: value },
        }));
        setPreviewVideoSrc(null);
        setPreviewSourceMode('none');
        const updated = await onProjectUpdate?.();
        if (updated) setDraftProject(updated);
      }
    } catch (e) {
    }
  }, [project.id, draftProject.template, onProjectUpdate]);

  const handleChangeAudioSession = async (audioSessionId: string, sessionName: string) => {
    setChangingAudioSession(true);
    setMessage(null);

    try {
      const response = await fetch(API_ENDPOINTS.updateProject(project.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioSessionId: audioSessionId,
        }),
      });


      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Audio session changed to ${sessionName}` });
        
        // Clear old preview since audio session changed
        setPreviewVideoSrc(null);
        setPreviewSourceMode('none');
        
        const updated = await onProjectUpdate?.();
        if (updated) setDraftProject(updated);

        // Get updated project to check for existing template track
        const updatedProjectResponse = await fetch(API_ENDPOINTS.getProject(project.id));
        const updatedProjectData = updatedProjectResponse.ok ? await updatedProjectResponse.json() : null;
        const updatedProject = updatedProjectData?.project;
        const currentTracks = updatedProject?.timeline?.tracks?.map((t: any) => ({
          id: t.id,
          type: t.type,
          name: t.name,
          clips: t.clips || [],
          locked: t.locked,
          muted: t.muted,
        })) || [];
        
        const timelineIsEmpty = currentTracks.length === 0 || currentTracks.every((t: any) => (t.clips || []).length === 0);
        const hasAudioTrackWithClips = currentTracks.some((t: any) => t.type === 'audio' && (t.clips || []).length > 0);
        const needsAudioTrack = timelineIsEmpty || !hasAudioTrackWithClips;
        if (needsAudioTrack) {
          try {
            const timeline = await buildAudioOnlyTimeline(audioSessionId, sessionName, currentTracks);
            const saveResponse = await fetch(API_ENDPOINTS.saveTimeline(project.id), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ timeline }),
            });

            if (!saveResponse.ok) {
              throw new Error(`Failed to save audio-only timeline (status ${saveResponse.status})`);
            }

            const saveData = await saveResponse.json();
            const updatedAfterSave = await onProjectUpdate?.();
            if (updatedAfterSave) setDraftProject(updatedAfterSave);
            
            // Proactively generate preview in background if we have template + audio session
            if (updatedProject?.template?.src) {
              setIsGeneratingPreview(true);
              setMessage({ type: 'info', text: 'Preparing preview...' });
              
              fetch(API_ENDPOINTS.generatePreview(project.id), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              })
                .then(res => res.json())
                .then(data => {
                  if (data.success) {
                    const previewUrl = `${API_ENDPOINTS.servePreview(project.id)}?t=${Date.now()}`;
                    setPreviewVideoSrc(previewUrl);
                    setMessage({ type: 'success', text: 'Preview ready! Click Play to watch.' });
                    setTimeout(() => setMessage(null), 3000);
                  }
                })
                .catch(() => {})
                .finally(() => {
                  setIsGeneratingPreview(false);
                });
            }
          } catch (timelineError) {
          }
        }
      } else {
        throw new Error(data.error || 'Failed to change audio session');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to change audio session' });
    } finally {
      setChangingAudioSession(false);
    }
  };

  const handleUploadTemplate = async (file: File) => {
    setUploadingTemplate(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('video', file);

      const response = await fetch(API_ENDPOINTS.uploadTemplate, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Template "${data.filename}" uploaded successfully` });
        await fetchTemplates(); // Refresh template list
        
        // Auto-select the newly uploaded template
        if (data.path && data.filename) {
          await handleChangeTemplate(data.path, data.filename);
        }
      } else {
        throw new Error(data.error || 'Failed to upload template');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to upload template' });
    } finally {
      setUploadingTemplate(false);
    }
  };

  const addSfxToTimeline = (asset: { filename: string; path: string }) => {
    const defaultDuration = 2; // seconds; user can resize on timeline
    let selectedRef: ClipRef | null = null;
    setDraftProject((p) => {
      const duration = Math.max(1, p.duration || 0);
      const existingTrack = p.tracks.find((t) => t.type === 'sfx');
      const clipId = `sfx_${Date.now()}`;
      const newClip: Clip = {
        id: clipId,
        kind: 'sfx',
        start: 0,
        duration: defaultDuration,
        path: asset.path,
        volume: 0.8,
        sourceOffset: 0,
      };

      let tracks = p.tracks.map((t) => ({ ...t, clips: [...t.clips] }));
      if (existingTrack) {
        tracks = tracks.map((t) => {
          if (t.type !== 'sfx') return t;
          selectedRef = { trackId: t.id, clipId };
          return { ...t, clips: [...t.clips, newClip] };
        });
      } else {
        const sfxTrack: Track = {
          id: 't_sfx',
          type: 'sfx',
          name: 'SFX',
          clips: [newClip],
        };
        selectedRef = { trackId: sfxTrack.id, clipId };
        tracks = [...tracks, sfxTrack];
      }

      return { ...p, tracks: sortTracks(tracks) };
    });

    setIsDirty(true);
    setMessage({ type: 'success', text: `SFX added: ${asset.filename}` });
    setTimeout(() => setMessage(null), 2000);
    if (selectedRef) queueMicrotask(() => setSelected(selectedRef));
  };

  const addBackgroundMusic = (asset: { filename: string; path: string }) => {
    console.log('[EditorLayout] addBackgroundMusic called', {
      filename: asset.filename,
      path: asset.path,
    });
    let selectedRef: ClipRef | null = null;
    setDraftProject((p) => {
      console.log('[EditorLayout] addBackgroundMusic before', {
        duration: p.duration,
        tracks: p.tracks.map((t) => ({ id: t.id, type: t.type, clips: t.clips.length })),
      });
      const duration = Math.max(1, p.duration || 0);
      const existingTrack = p.tracks.find((t) => t.type === 'music');
      const clipId = `music_${Date.now()}`;
      const newClip: Clip = {
        id: clipId,
        kind: 'music',
        start: 0,
        duration,
        path: asset.path,
        volume: 0.35,
        sourceOffset: 0,
      };

      let tracks = p.tracks.map((t) => ({ ...t, clips: [...t.clips] }));
      if (existingTrack) {
        tracks = tracks.map((t) => {
          if (t.type !== 'music') return t;
          const hasSame = t.clips.find((c) => c.kind === 'music' && (c as any).path === asset.path);
          if (hasSame) {
            selectedRef = { trackId: t.id, clipId: hasSame.id };
            console.log('[EditorLayout] addBackgroundMusic updating existing clip', {
              trackId: t.id,
              clipId: hasSame.id,
            });
            return {
              ...t,
              clips: t.clips.map((c) =>
                c.id === hasSame.id
                  ? ({ ...c, start: 0, duration, path: asset.path, sourceOffset: 0 } as Clip)
                  : c
              ),
            };
          }
          selectedRef = { trackId: t.id, clipId: clipId };
          console.log('[EditorLayout] addBackgroundMusic appending new clip', {
            trackId: t.id,
            clipId,
          });
          return { ...t, clips: [...t.clips, newClip] };
        });
      } else {
        const musicTrack: Track = {
          id: 't_music',
          type: 'music',
          name: 'Music',
          clips: [newClip],
        };
        selectedRef = { trackId: musicTrack.id, clipId: clipId };
        console.log('[EditorLayout] addBackgroundMusic created music track', {
          trackId: musicTrack.id,
          clipId,
        });
        tracks = [...tracks, musicTrack];
      }

      const next = { ...p, tracks: sortTracks(tracks) };
      console.log('[EditorLayout] addBackgroundMusic after', {
        tracks: next.tracks.map((t) => ({ id: t.id, type: t.type, clips: t.clips.length })),
      });
      return next;
    });

    setIsDirty(true);
    setMessage({ type: 'success', text: `Background music added: ${asset.filename}` });
    setTimeout(() => setMessage(null), 2000);
    if (selectedRef) {
      queueMicrotask(() => setSelected(selectedRef));
    }
  };

  const addImageAssetToTimeline = (asset: ProjectImageAsset) => {
    const start = Math.max(0, Number(playheadTime.toFixed(3)));
    const defaultDuration = 3;
    let selectedRef: ClipRef | null = null;
    setDraftProject((p) => {
      const duration = Math.max(1, p.duration || 1);
      const clipDuration = Math.max(0.2, Math.min(defaultDuration, duration - start || defaultDuration));
      const clipId = `overlay_media_img_${Date.now()}`;
      const clip: Clip = {
        id: clipId,
        kind: 'overlay',
        start,
        duration: clipDuration,
        assetId: asset.assetId,
        label: asset.filename,
        x: IMAGE_PLAN_DEFAULT_X,
        y: IMAGE_PLAN_DEFAULT_Y,
        scale: IMAGE_PLAN_DEFAULT_SCALE,
        displayMode: 'overlay',
      };

      const editableOverlayTrack = p.tracks.find((t) => t.type === 'overlay' && !t.locked && t.id !== 't_overlay_template');
      let tracks = p.tracks.map((t) => ({ ...t, clips: [...t.clips] }));
      if (editableOverlayTrack) {
        tracks = tracks.map((t) => {
          if (t.id !== editableOverlayTrack.id) return t;
          selectedRef = { trackId: t.id, clipId };
          return { ...t, clips: [...t.clips, clip] };
        });
      } else {
        const newTrackId = `t_media_overlay_${Date.now()}`;
        const mediaTrack: Track = {
          id: newTrackId,
          type: 'overlay',
          name: 'Media Overlay',
          clips: [clip],
        };
        selectedRef = { trackId: newTrackId, clipId };
        tracks = [...tracks, mediaTrack];
      }
      return { ...p, tracks: sortTracks(tracks) };
    });

    setIsDirty(true);
    setMessage({ type: 'success', text: `Added image clip: ${asset.filename}` });
    setTimeout(() => setMessage(null), 2000);
    if (selectedRef) queueMicrotask(() => setSelected(selectedRef));
  };

  const addVideoAssetToTimeline = (asset: VideoLibraryAsset) => {
    const start = Math.max(0, Number(playheadTime.toFixed(3)));
    const defaultDuration = 4;
    let selectedRef: ClipRef | null = null;
    setDraftProject((p) => {
      const duration = Math.max(1, p.duration || 1);
      const clipDuration = Math.max(0.5, Math.min(defaultDuration, duration - start || defaultDuration));
      const clipId = `overlay_media_vid_${Date.now()}`;
      const clip: Clip = {
        id: clipId,
        kind: 'overlay',
        start,
        duration: clipDuration,
        assetId: `media_video_${Date.now()}`,
        label: asset.filename,
        path: asset.path,
        x: IMAGE_PLAN_DEFAULT_X,
        y: IMAGE_PLAN_DEFAULT_Y,
        scale: IMAGE_PLAN_DEFAULT_SCALE,
        displayMode: 'overlay',
      };

      const editableOverlayTrack = p.tracks.find((t) => t.type === 'overlay' && !t.locked && t.id !== 't_overlay_template');
      let tracks = p.tracks.map((t) => ({ ...t, clips: [...t.clips] }));
      if (editableOverlayTrack) {
        tracks = tracks.map((t) => {
          if (t.id !== editableOverlayTrack.id) return t;
          selectedRef = { trackId: t.id, clipId };
          return { ...t, clips: [...t.clips, clip] };
        });
      } else {
        const newTrackId = `t_media_overlay_${Date.now()}`;
        const mediaTrack: Track = {
          id: newTrackId,
          type: 'overlay',
          name: 'Media Overlay',
          clips: [clip],
        };
        selectedRef = { trackId: newTrackId, clipId };
        tracks = [...tracks, mediaTrack];
      }
      return { ...p, tracks: sortTracks(tracks) };
    });

    setIsDirty(true);
    setMessage({ type: 'success', text: `Added video clip: ${asset.filename}` });
    setTimeout(() => setMessage(null), 2000);
    if (selectedRef) queueMicrotask(() => setSelected(selectedRef));
  };

  const selectedClip: Clip | null = useMemo(() => {
    if (!selected) return null;
    const t = draftProject.tracks.find((x) => x.id === selected.trackId);
    if (!t) return null;
    return t.clips.find((c) => c.id === selected.clipId) ?? null;
  }, [draftProject.tracks, selected]);

  const updateClip = (ref: ClipRef, patch: Partial<Clip>) => {
    setDraftProject((p) => {
      const tracks = p.tracks.map((t) => {
        if (t.id !== ref.trackId) return t;
        return {
          ...t,
          clips: t.clips.map((c) => (c.id === ref.clipId ? ({ ...c, ...patch } as Clip) : c)),
        };
      });
      return { ...p, tracks };
    });
    setIsDirty(true);
  };

  const addTrack = () => {
    setDraftProject((p) => {
      const overlayCount = p.tracks.filter((t) => t.type === 'overlay').length;
      const name = `Overlay ${overlayCount + 1}`;
      const newTrack: Track = {
        id: `track-${crypto.randomUUID?.() ?? Date.now()}`,
        type: 'overlay',
        name,
        clips: [],
      };
      return { ...p, tracks: [...p.tracks, newTrack] };
    });
    setIsDirty(true);
  };

  const deleteClip = useCallback((ref: ClipRef) => {
    setDraftProject((p) => {
      const tracks = p.tracks.map((t) => {
        if (t.id !== ref.trackId) return t;
        const nextClips = t.clips.filter((c) => c.id !== ref.clipId);
        return nextClips.length === t.clips.length ? t : { ...t, clips: nextClips };
      });
      const cleaned = tracks.filter((t) => !(t.isAutoCreated && t.clips.length === 0));
      return { ...p, tracks: cleaned };
    });
    if (selected?.trackId === ref.trackId && selected?.clipId === ref.clipId) setSelected(null);
    setIsDirty(true);
  }, [selected]);

  /**
   * Split at current playhead. With `ref` — one clip only. With `null` — every clip intersecting playhead,
   * on every unlocked non-template track (descending clip index within each track so indices stay valid).
   */
  const splitClipAtPlayhead = useCallback((ref: ClipRef | null) => {
    const tPlay = playheadTime;
    setDraftProject((p) => {
      if (ref) {
        const track = p.tracks.find((tr) => tr.id === ref.trackId);
        if (!track || track.locked || track.id === TEMPLATE_OVERLAY_TRACK_ID) return p;
        const idx = track.clips.findIndex((c) => c.id === ref.clipId);
        if (idx === -1) return p;
        const clip = track.clips[idx];
        const pair = splitClipIntoPairAtAbsoluteTime(clip, tPlay);
        if (!pair) return p;
        const [leftClip, rightClip] = pair;
        const newClips = [...track.clips.slice(0, idx), leftClip, rightClip, ...track.clips.slice(idx + 1)];
        const tracks = p.tracks.map((tr) => (tr.id !== ref.trackId ? tr : { ...tr, clips: newClips }));
        queueMicrotask(() => setSelected({ trackId: ref.trackId, clipId: rightClip.id }));
        return { ...p, tracks: sortTracks(tracks) };
      }

      let anySplit = false;
      const tracks = p.tracks.map((track) => {
        if (track.locked || track.id === TEMPLATE_OVERLAY_TRACK_ID) return track;
        const clips = [...track.clips];
        for (let i = clips.length - 1; i >= 0; i--) {
          const pair = splitClipIntoPairAtAbsoluteTime(clips[i], tPlay);
          if (pair) {
            clips.splice(i, 1, pair[0], pair[1]);
            anySplit = true;
          }
        }
        return { ...track, clips };
      });
      if (!anySplit) return p;
      queueMicrotask(() => setSelected(null));
      return { ...p, tracks: sortTracks(tracks) };
    });
    setIsDirty(true);
  }, [playheadTime]);

  const deleteTrack = (trackId: string) => {
    setDraftProject((p) => ({
      ...p,
      tracks: p.tracks.filter((t) => t.id !== trackId),
    }));
    if (selected?.trackId === trackId) setSelected(null);
    setIsDirty(true);
  };

  /** Create a new track below and move the clip there at the given start time (used when dragging over another clip). */
  const moveClipToNewTrack = (
    ref: ClipRef,
    start: number,
    onNewRef?: (newRef: ClipRef) => void
  ) => {
    setDraftProject((p) => {
      const trackIndex = p.tracks.findIndex((t) => t.id === ref.trackId);
      if (trackIndex === -1) return p;
      const track = p.tracks[trackIndex];
      const clipIndex = track.clips.findIndex((c) => c.id === ref.clipId);
      if (clipIndex === -1) return p;
      const clip = { ...track.clips[clipIndex], start } as Clip;
      const newTrackId = `track-${crypto.randomUUID?.() ?? Date.now()}`;
      const sameTypeCount = p.tracks.filter((t) => t.type === track.type).length;
      const newTrack: Track = {
        id: newTrackId,
        type: track.type,
        name: `${track.type === 'overlay' ? 'Overlay' : track.type} ${sameTypeCount + 1}`,
        clips: [clip],
        isAutoCreated: true,
      };
      const tracksWithoutClip = p.tracks.map((t) =>
        t.id !== ref.trackId
          ? t
          : { ...t, clips: t.clips.filter((c) => c.id !== ref.clipId) }
      );
      const insertIndex = trackIndex + 1;
      const newTracks = [
        ...tracksWithoutClip.slice(0, insertIndex),
        newTrack,
        ...tracksWithoutClip.slice(insertIndex),
      ];
      queueMicrotask(() => onNewRef?.({ trackId: newTrackId, clipId: ref.clipId }));
      return { ...p, tracks: newTracks };
    });
    setIsDirty(true);
  };

  /** Move clip from its current track (the temp new track) back to the original track and remove the empty track. */
  const moveClipBackToTrack = (
    ref: ClipRef,
    originalTrackId: string,
    start: number,
    onBackRef: (backRef: ClipRef) => void
  ) => {
    setDraftProject((p) => {
      const currentTrackIndex = p.tracks.findIndex((t) => t.id === ref.trackId);
      if (currentTrackIndex === -1) return p;
      const currentTrack = p.tracks[currentTrackIndex];
      const clipIndex = currentTrack.clips.findIndex((c) => c.id === ref.clipId);
      if (clipIndex === -1) return p;
      const clip = { ...currentTrack.clips[clipIndex], start } as Clip;
      const originalTrackIndex = p.tracks.findIndex((t) => t.id === originalTrackId);
      if (originalTrackIndex === -1) return p;
      const tracksWithoutClipFromCurrent = p.tracks.map((t) =>
        t.id !== ref.trackId ? t : { ...t, clips: t.clips.filter((c) => c.id !== ref.clipId) }
      );
      const tracksWithClipOnOriginal = tracksWithoutClipFromCurrent.map((t) =>
        t.id !== originalTrackId ? t : { ...t, clips: [...t.clips, clip] }
      );
      const currentTrackAfterRemove = tracksWithClipOnOriginal.find((t) => t.id === ref.trackId);
      const newTracks =
        currentTrackAfterRemove &&
        currentTrackAfterRemove.clips.length === 0 &&
        currentTrackAfterRemove.isAutoCreated
          ? tracksWithClipOnOriginal.filter((t) => t.id !== ref.trackId)
          : tracksWithClipOnOriginal;
      queueMicrotask(() => onBackRef({ trackId: originalTrackId, clipId: ref.clipId }));
      return { ...p, tracks: newTracks };
    });
    setIsDirty(true);
  };

  /** Move clip from its current track to another existing track at the given start time. */
  const moveClipToTrack = (
    ref: ClipRef,
    targetTrackId: string,
    start: number,
    onNewRef?: (newRef: ClipRef) => void
  ) => {
    if (ref.trackId === targetTrackId) {
      updateClip(ref, { start });
      queueMicrotask(() => onNewRef?.(ref));
      return;
    }
    setDraftProject((p) => {
      const currentTrackIndex = p.tracks.findIndex((t) => t.id === ref.trackId);
      if (currentTrackIndex === -1) return p;
      const currentTrack = p.tracks[currentTrackIndex];
      const clipIndex = currentTrack.clips.findIndex((c) => c.id === ref.clipId);
      if (clipIndex === -1) return p;
      const clip = { ...currentTrack.clips[clipIndex], start } as Clip;
      const targetTrackIndex = p.tracks.findIndex((t) => t.id === targetTrackId);
      if (targetTrackIndex === -1) return p;
      const tracksWithoutClipFromCurrent = p.tracks.map((t) =>
        t.id !== ref.trackId ? t : { ...t, clips: t.clips.filter((c) => c.id !== ref.clipId) }
      );
      const tracksWithClipOnTarget = tracksWithoutClipFromCurrent.map((t) =>
        t.id !== targetTrackId ? t : { ...t, clips: [...t.clips, clip] }
      );
      const currentTrackAfterRemove = tracksWithClipOnTarget.find((t) => t.id === ref.trackId);
      const newTracks =
        currentTrackAfterRemove &&
        currentTrackAfterRemove.clips.length === 0 &&
        currentTrackAfterRemove.isAutoCreated
          ? tracksWithClipOnTarget.filter((t) => t.id !== ref.trackId)
          : tracksWithClipOnTarget;
      queueMicrotask(() => onNewRef?.({ trackId: targetTrackId, clipId: ref.clipId }));
      return { ...p, tracks: newTracks };
    });
    setIsDirty(true);
  };

  // When playing, playhead is driven by the video (onTimeUpdate in CanvasPreview).
  // Do NOT run a RAF clock here — it raced with video time and caused immediate pause/AbortError.
  useEffect(() => {
    if (!isPlaying && rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    }
  }, [isPlaying, draftProject.duration]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || Boolean(el?.isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && e.shiftKey && k === 's') {
        e.preventDefault();
        splitClipAtPlayhead(selected);
        return;
      }
      if (!selected) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      e.preventDefault();
      deleteClip(selected);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, deleteClip, splitClipAtPlayhead]);

  // Subtitles & characters generated (t_subs or t_chars have clips)
  const hasSubtitlesAndChars = draftProject.tracks.some(t =>
    (t.type === 'subtitle' || t.type === 'character') && t.clips.length > 0
  );
  // Clip plan generated (overlay tracks t_imgs / t_imgs_N have clips)
  const hasClipPlan = draftProject.tracks.some(t =>
    t.type === 'overlay' && (t.id === 't_imgs' || /^t_imgs_\d+$/.test(t.id)) && t.clips.length > 0
  );
  const animationTracks = draftProject.tracks.filter(
    (t) => t.type === 'overlay' && (t.id === 't_anim' || /^t_anim_\d+$/.test(t.id))
  );
  const hasAnimationPlan = animationTracks.some((t) => t.clips.length > 0);
  const hasDraftAnimationPlan = animationTracks.some((t) =>
    t.clips.some(
      (clip) =>
        clip.kind === 'overlay' &&
        (clip as any).animationMomentId &&
        (((clip as any).planStatus as string | undefined) ?? 'draft') === 'draft'
    )
  );
  const hasApprovedAnimationPlan = animationTracks.some((t) =>
    t.clips.some(
      (clip) =>
        clip.kind === 'overlay' &&
        (clip as any).animationMomentId &&
        (clip as any).planStatus === 'approved'
    )
  );

  const handleGenerateSubtitlesAndChars = async () => {
    setIsGeneratingDraft(true);
    setMessage({ type: 'info', text: 'Generating subtitles & characters...' });

    try {
      const response = await fetch(API_ENDPOINTS.generateSubtitlesAndCharacters(project.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: project.name }),
        cache: 'no-store',
      });

      if (!response.ok) {
        console.error('[EditorLayout] /api/project/:id/subtitles-characters HTTP error', {
          projectId: project.id,
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.project) {
        setMessage({ type: 'success', text: 'Subtitles & characters generated!' });
        setDraftProject(editorProjectFromApi(data.project));
        const updated = await onProjectUpdate?.();
        if (updated) setDraftProject(updated);
        setTimeout(() => setMessage(null), 3000);
      } else {
        console.error('[EditorLayout] AI draft response indicated failure', {
          projectId: project.id,
          response: data,
        });
        throw new Error(data.error || 'Failed to generate');
      }
    } catch (error) {
      console.error('[EditorLayout] Failed to generate subtitles & characters', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to generate',
      });
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleGenerateClipPlan = async () => {
    setIsGeneratingClipPlan(true);
    setMessage({ type: 'info', text: 'Generating clip plan...' });

    try {
      const response = await fetch(API_ENDPOINTS.generateClipPlan(project.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: project.name }),
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.project) {
        setMessage({ type: 'success', text: 'Clip plan generated!' });
        setDraftProject(editorProjectFromApi(data.project));
        const updated = await onProjectUpdate?.();
        if (updated) setDraftProject(updated);
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error(data.error || 'Failed to generate clip plan');
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to generate clip plan',
      });
    } finally {
      setIsGeneratingClipPlan(false);
    }
  };

  const handleGenerateAnimationPlan = async () => {
    setIsGeneratingAnimationPlan(true);
    setMessage({ type: 'info', text: 'Creating animation draft clips in timeline...' });

    try {
      const response = await fetch(`${API_ENDPOINTS.generateAnimationPlan(project.id)}?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: project.name }),
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        const updated = await onProjectUpdate?.();
        const nextProject = updated ?? data.project ?? draftProject;
        if (updated) setDraftProject(updated);
        const firstDraftClip = findFirstDraftAnimationClip(nextProject);
        if (firstDraftClip) {
          setSelected(firstDraftClip);
        }
        setMessage({ type: 'success', text: 'Animation draft plan ready. Click draft clips to review prompt text.' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error(data.error || 'Failed to generate animation plan');
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to generate animation plan',
      });
    } finally {
      setIsGeneratingAnimationPlan(false);
    }
  };

  const handleApproveAnimationPlan = async () => {
    if (isDirty) {
      const saveResponse = await fetch(API_ENDPOINTS.saveTimeline(project.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeline: {
            duration: draftProject.duration,
            tracks: draftProject.tracks,
          },
        }),
      });
      if (!saveResponse.ok) {
        setMessage({ type: 'error', text: 'Please save timeline changes before approval.' });
        return;
      }
      const saveData = await saveResponse.json();
      if (!saveData?.success) {
        setMessage({ type: 'error', text: saveData?.error || 'Please save timeline changes before approval.' });
        return;
      }
      setIsDirty(false);
    }
    setIsApprovingAnimationPlan(true);
    setMessage({ type: 'info', text: 'Generating approved animation clips...' });

    try {
      const response = await fetch(`${API_ENDPOINTS.approveAnimationPlan(project.id)}?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: project.name }),
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.project) {
        setMessage({ type: 'success', text: 'Animation plan approved and rendered!' });
        const updated = await onProjectUpdate?.();
        if (updated) setDraftProject(updated);
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error(data.error || 'Failed to approve animation plan');
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to approve animation plan',
      });
    } finally {
      setIsApprovingAnimationPlan(false);
    }
  };

  const handleGenerateSingleAnimationClip = async (momentId: string) => {
    if (!momentId) return;
    if (isDirty) {
      const saveResponse = await fetch(API_ENDPOINTS.saveTimeline(project.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeline: {
            duration: draftProject.duration,
            tracks: draftProject.tracks,
          },
        }),
      });
      if (!saveResponse.ok) {
        setMessage({ type: 'error', text: 'Please save timeline changes before generating this clip.' });
        return;
      }
      const saveData = await saveResponse.json();
      if (!saveData?.success) {
        setMessage({ type: 'error', text: saveData?.error || 'Please save timeline changes before generating this clip.' });
        return;
      }
      setIsDirty(false);
    }

    setGeneratingAnimationMomentId(momentId);
    setMessage({ type: 'info', text: 'Generating selected animation clip...' });
    try {
      const response = await fetch(`${API_ENDPOINTS.generateAnimationClip(project.id, momentId)}?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: project.name }),
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate animation clip');
      }

      const updated = await onProjectUpdate?.();
      const fallbackProject =
        data.project && data.project.timeline ? editorProjectFromApi(data.project) : draftProject;
      const nextProject = updated ?? fallbackProject;
      if (updated) setDraftProject(updated);
      const renderedRef = (() => {
        for (const track of nextProject.tracks) {
          for (const clip of track.clips) {
            const overlay = clip.kind === 'overlay' ? (clip as OverlayClip) : null;
            if (
              overlay &&
              overlay.animationMomentId === momentId &&
              overlay.planStatus === 'approved'
            ) {
              return { trackId: track.id, clipId: clip.id } as ClipRef;
            }
          }
        }
        return null;
      })();
      if (renderedRef) {
        setSelected(renderedRef);
      }
      setMessage({ type: 'success', text: 'Selected animation clip generated.' });
      setTimeout(() => setMessage(null), 2500);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to generate selected animation clip',
      });
    } finally {
      setGeneratingAnimationMomentId(null);
    }
  };

  const handleCreateAnimationAtPlayhead = async (prompt: string, requestedDuration: number) => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || isCreatingAnimationClip) return;

    const createdAt = Date.now();
    const momentId = `custom_anim_${createdAt}`;
    const clipId = `anim_draft_${momentId}`;
    const scrubTime = Math.max(0, Number(playheadTime.toFixed(3)));
    const preRollSeconds = Math.min(0.35, scrubTime);
    const start = Math.max(0, Number((scrubTime - preRollSeconds).toFixed(3)));
    const punchTime = Number((scrubTime - start).toFixed(3));
    const duration = Math.max(1, Math.min(8, Number.isFinite(requestedDuration) ? requestedDuration : 3));
    const clipDuration = Math.max(0.5, Math.min(duration, Math.max(0.5, draftProject.duration - start)));
    const syncedPrompt = [
      `SYNC CONTRACT: The user scrubbed to ${scrubTime.toFixed(3)}s in the main timeline. This clip starts at ${start.toFixed(3)}s, so the main visual punch/hero reveal must land at ${punchTime.toFixed(3)}s inside this HyperFrames clip. Use the first ${punchTime.toFixed(3)}s only for anticipation/build-up. Do not make the important visual arrive after that punch time.`,
      cleanPrompt,
    ].join('\n\n');
    const label = cleanPrompt
      .replace(/\s+/g, ' ')
      .split(' ')
      .slice(0, 4)
      .join(' ')
      .toUpperCase();
    const selectedRef: ClipRef = { trackId: 't_anim', clipId };

    const animationClip: Clip = {
      id: clipId,
      kind: 'overlay',
      start,
      duration: clipDuration,
      assetId: clipId,
      label: label || 'CUSTOM ANIMATION',
      x: 0.5,
      y: 0.65,
      scale: 1,
      displayMode: 'overlay',
      planStatus: 'draft',
      promptText: syncedPrompt,
      promptEdited: true,
      animationMomentId: momentId,
      animationType: 'hyperframes',
      animationContent: label || cleanPrompt.slice(0, 80),
      animationSubtitle: cleanPrompt,
      animationContextSummary: cleanPrompt.slice(0, 320),
    };

    const nextTracks = (() => {
      const tracks = draftProject.tracks.map((track) => ({ ...track, clips: [...track.clips] }));
      const existingIndex = tracks.findIndex((track) => track.id === 't_anim');
      if (existingIndex >= 0) {
        tracks[existingIndex] = {
          ...tracks[existingIndex],
          clips: [...tracks[existingIndex].clips, animationClip],
        };
        return sortTracks(tracks);
      }
      const animationTrack: Track = {
        id: 't_anim',
        type: 'overlay',
        name: 'Animation',
        clips: [animationClip],
      };
      return sortTracks([...tracks, animationTrack]);
    })();

    const nextProject: EditorProject = {
      ...draftProject,
      tracks: nextTracks,
    };

    setIsCreatingAnimationClip(true);
    setDraftProject(nextProject);
    setSelected(selectedRef);
    setIsDirty(true);
    setMessage({ type: 'success', text: `Draft animation clip added at ${start.toFixed(2)}s.` });
    setTimeout(() => setMessage(null), 2200);
    setIsCreatingAnimationClip(false);
  };

  const handleDeleteAnimationPlan = async () => {
    setIsDeletingAnimationPlan(true);
    setMessage({ type: 'info', text: 'Deleting animation plan...' });

    try {
      const response = await fetch(API_ENDPOINTS.deleteAnimationPlan(project.id), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Animation plan deleted' });
        setPreviewVideoSrc(null);
        setPreviewSourceMode('none');
        setIsPlaying(false);
        const updated = await onProjectUpdate?.();
        if (updated) setDraftProject(updated);
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error(data.error || 'Failed to delete animation plan');
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to delete animation plan',
      });
    } finally {
      setIsDeletingAnimationPlan(false);
    }
  };

  const handleGenerateSfxPlan = async () => {
    setIsGeneratingSfxPlan(true);
    setMessage({ type: 'info', text: 'Generating SFX plan...' });

    try {
      const response = await fetch(`${API_ENDPOINTS.generateSfxPlan(project.id)}?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.project) {
        setMessage({ type: 'success', text: 'SFX plan generated!' });
        const updated = await onProjectUpdate?.();
        if (updated) setDraftProject(updated);
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error(data.error || 'Failed to generate SFX plan');
      }
    } catch (error) {
      console.error('Error generating SFX plan:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to generate SFX plan',
      });
    } finally {
      setIsGeneratingSfxPlan(false);
    }
  };

  const handleSaveTimeline = useCallback(async (isAutoSave = false) => {
    try {
      const response = await fetch(API_ENDPOINTS.saveTimeline(project.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          timeline: {
            duration: draftProject.duration,
            tracks: draftProject.tracks,
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setIsDirty(false);
        const updated = await onProjectUpdate?.();
        if (updated) setDraftProject(updated);
        if (canGeneratePreview) {
          void requestSegmentPreview(playheadTime, 'timeline_saved');
        }
        if (isAutoSave) {
          setMessage({ type: 'success', text: 'Saved' });
          setTimeout(() => setMessage(null), 1500);
        } else {
          setMessage({ type: 'success', text: 'Timeline saved!' });
          setTimeout(() => setMessage(null), 2000);
        }
      } else {
        throw new Error(data.error || 'Failed to save timeline');
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to save timeline' 
      });
    }
  }, [
    project.id,
    draftProject.duration,
    draftProject.tracks,
    onProjectUpdate,
    canGeneratePreview,
    playheadTime,
    requestSegmentPreview,
  ]);

  // Auto-save when dirty after 2 seconds of inactivity
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      handleSaveTimeline(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isDirty, draftProject, handleSaveTimeline]);

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setMessage({ type: 'info', text: 'Starting export...' });

    try {
      // Start export
      const response = await fetch(API_ENDPOINTS.exportProject(project.id), {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to start export');
      }

      // Connect to SSE for progress
      const streamEndpoint = data.streamEndpoint || `/api/stream/${project.id}/files`;
      const eventSource = new EventSource(`${API_BASE_URL}${streamEndpoint}`);
      let completed = false;

      eventSource.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data);
          
          if (update.type === 'progress') {
            setExportProgress(update.percent || 0);
            setMessage({ type: 'info', text: update.message || `Exporting: ${update.percent}%` });
          } else if (update.type === 'completed' || update.type === 'complete') {
            completed = true;
            setExportProgress(100);
            setMessage({ type: 'success', text: 'Export complete! Video is ready.' });
            const filename = update.videoPath ? String(update.videoPath).split(/[/\\]/).pop() : null;
            if (filename) setExportedVideoFilename(filename);
            eventSource.close();
            setIsExporting(false);
            void Promise.resolve(onProjectUpdate?.()).then((updated: EditorProject | void) => {
              if (updated) setDraftProject(updated);
            });
          } else if (update.type === 'error') {
            setMessage({ type: 'error', text: update.message || 'Export failed' });
            eventSource.close();
            setIsExporting(false);
          }
        } catch (err) {
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        if (completed) return; // Ignore: we already got success, onerror fires when closing
        setIsExporting(false);
        setMessage({ type: 'error', text: 'Lost connection to server' });
      };
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to start export' 
      });
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden flex-col">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Canvas and Properties Row */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Assets, Audio Session, Images, Chars */}
          <EditorSidebar
            project={draftProject}
            width={sidebarWidth}
            onWidthChange={setSidebarWidth}
            templates={templates}
            audioSessions={audioSessions}
            onTabFocus={(tab) => {
              if (tab === 'audioSession') fetchAudioSessions();
              if (tab === 'template') fetchTemplates();
            }}
            onAddBackgroundMusic={addBackgroundMusic}
            onAddSfx={addSfxToTimeline}
            onAddProjectImage={addImageAssetToTimeline}
            onAddProjectVideo={addVideoAssetToTimeline}
            onDeleteAnimationPlan={handleDeleteAnimationPlan}
            hasAnimationPlan={hasAnimationPlan}
            deletingAnimationPlan={isDeletingAnimationPlan}
            playheadTime={playheadTime}
            onCreateAnimationAtPlayhead={handleCreateAnimationAtPlayhead}
            creatingAnimationClip={isCreatingAnimationClip}
            onChangeAudioSession={async (sessionId) => {
              const session = audioSessions.find(s => s.sessionId === sessionId);
              await handleChangeAudioSession(sessionId, session?.name || sessionId);
            }}
            onChangeTemplate={handleChangeTemplate}
            onUploadTemplate={handleUploadTemplate}
            uploadingTemplate={uploadingTemplate}
          />

          {/* Canvas Preview */}
      <CanvasPreview
        project={draftProject}
        isPlaying={isPlaying}
            playheadTime={playheadTime}
            duration={draftProject.duration}
            volume={volume}
            onPlayPause={handlePlayToggle}
            onPlayheadChange={setPlayheadTime}
            onVolumeChange={setVolume}
            selected={selected}
            onSelectClip={setSelected}
            onUpdateClip={updateClip}
            onPreviewReady={(api) => { previewPlayerRef.current = api; }}
        previewVideoSrc={previewVideoSrc}
        previewSourceMode={previewSourceMode}
        isGeneratingPreview={isGeneratingPreview}
        onFirstFrame={handleFirstFrame}
      />

          {/* Right Properties Panel */}
          <TextPropertiesPanel
            ref={propertiesPanelRef}
            width={rightPanelWidth}
            onWidthChange={setRightPanelWidth}
            selected={selectedClip}
            selectedRef={selected}
            onUpdateClip={(patch) => {
              if (!selected) return;
              updateClip(selected, patch);
            }}
            onDeleteClip={() => {
              if (!selected) return;
              deleteClip(selected);
            }}
            projectId={project.id}
            project={draftProject}
            onVideoStartChange={handleVideoStartChange}
            onProjectUpdate={onProjectUpdate}
            onGenerateAnimationClip={handleGenerateSingleAnimationClip}
            generatingAnimationMomentId={generatingAnimationMomentId}
          />
        </div>

        {/* Timeline Section */}
          <VideoTimelinePanel
          project={draftProject}
          height={timelineHeight}
          isPlaying={isPlaying}
          playheadTime={playheadTime}
          timelineZoom={timelineZoom}
          projectName={project.name}
          onBack={() => router.back()}
          onExport={handleExport}
          onSaveTimeline={handleSaveTimeline}
            onGenerateSubtitlesAndChars={handleGenerateSubtitlesAndChars}
            onGenerateClipPlan={handleGenerateClipPlan}
            onGenerateAnimationPlan={handleGenerateAnimationPlan}
            onApproveAnimationPlan={handleApproveAnimationPlan}
            onGenerateSfxPlan={handleGenerateSfxPlan}
            isGeneratingDraft={isGeneratingDraft}
            isGeneratingClipPlan={isGeneratingClipPlan}
            isGeneratingAnimationPlan={isGeneratingAnimationPlan}
            isApprovingAnimationPlan={isApprovingAnimationPlan}
            isGeneratingSfxPlan={isGeneratingSfxPlan}
          isExporting={isExporting}
          exportProgress={exportProgress}
          hasSubtitlesAndChars={hasSubtitlesAndChars}
          hasClipPlan={hasClipPlan}
          hasAnimationPlan={hasAnimationPlan}
          hasDraftAnimationPlan={hasDraftAnimationPlan}
          hasApprovedAnimationPlan={hasApprovedAnimationPlan}
          message={message}
          exportedVideoFilename={exportedVideoFilename}
          onDownloadExported={exportedVideoFilename ? () => {
            const url = `${API_BASE_URL}/api/video/download/${encodeURIComponent(exportedVideoFilename)}`;
            window.open(url, '_blank');
          } : undefined}
          onHeightChange={setTimelineHeight}
          onPlayPause={handlePlayToggle}
          onPlayheadChange={setPlayheadTime}
          onZoomChange={setTimelineZoom}
          selected={selected}
          onSelectClip={setSelected}
          onUpdateClip={updateClip}
          onAddTrack={addTrack}
          onDeleteTrack={deleteTrack}
          onDeleteClip={deleteClip}
          onSplitClip={splitClipAtPlayhead}
          onMoveClipToNewTrack={moveClipToNewTrack}
          onMoveClipBackToTrack={moveClipBackToTrack}
          onMoveClipToTrack={moveClipToTrack}
          showSubtitlesInTimeline={showSubtitlesInTimeline}
          onToggleShowSubtitlesInTimeline={() => setShowSubtitlesInTimeline((v) => !v)}
        />
      </div>
    </div>
  );
}
