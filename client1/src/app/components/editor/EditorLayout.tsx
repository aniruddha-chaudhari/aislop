'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, ClipRef, EditorProject, Track } from '../../../features/editor/types';
import { useRouter } from 'next/navigation';
import EditorSidebar from './EditorSidebar';
import CanvasPreview, { type PreviewPlayerApi } from './CanvasPreview';
import TextPropertiesPanel, { type TextPropertiesPanelHandle } from './TextPropertiesPanel';
import VideoTimelinePanel from './VideoTimelinePanel';
import { API_ENDPOINTS, API_BASE_URL } from '../../../config/api';

/**
 * Sort tracks in the correct order:
 * 1. Overlay (template) - always first
 * 2. Audio - always second
 * 3. Everything else (subtitle, character, etc.) - after
 */
function sortTracks(tracks: Track[]): Track[] {
  const overlayTracks = tracks.filter(t => t.type === 'overlay');
  const audioTracks = tracks.filter(t => t.type === 'audio');
  const otherTracks = tracks.filter(t => t.type !== 'overlay' && t.type !== 'audio');
  
  return [...overlayTracks, ...audioTracks, ...otherTracks];
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

export default function EditorLayout({ project, onProjectUpdate }: Props) {
  const router = useRouter();
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isGeneratingImagePlan, setIsGeneratingImagePlan] = useState(false);
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
  const hlsPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialTimelineRef = useRef(true);

  const handlePlayToggle = async () => {
    const next = !isPlaying;
    let seekTo: number | undefined;
    if (next) {
      const atEnd = draftProject.duration > 0 && playheadTime >= draftProject.duration;
      seekTo = atEnd ? 0 : playheadTime;
    }
    
    // If playing and we have template + audio session, use full HLS preview only
    if (next && project.template?.src && project.audioSessionId && project.audioSessionId !== 'no-session') {
      if (!previewVideoSrc) {
        if (isDirty) {
          try {
            await handleSaveTimeline(true);
          } catch (e) {
            setMessage({ type: 'error', text: 'Save failed. Save timeline first.' });
            return;
          }
        }
        setIsGeneratingPreview(true);
        setMessage({ type: 'info', text: 'Generating preview...' });
        try {
          const statusResponse = await fetch(API_ENDPOINTS.getPreviewHlsStatus(project.id));
          const statusData = await statusResponse.json();
          if (statusData.success && statusData.ready && statusData.playlistUrl) {
            const absolutePlaylistUrl = `${API_BASE_URL}${statusData.playlistUrl}?t=${Date.now()}`;
            setPreviewVideoSrc(absolutePlaylistUrl);
            setIsGeneratingPreview(false);
            setIsPlaying(true);
            setTimeout(() => previewPlayerRef.current?.requestPlay?.(seekTo ?? playheadTime), 300);
            setMessage({ type: 'success', text: 'Preview ready!' });
            setTimeout(() => setMessage(null), 2000);
            return;
          }
          await fetch(API_ENDPOINTS.generatePreviewHls(project.id), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const pollForHls = async () => {
            try {
              const res = await fetch(API_ENDPOINTS.getPreviewHlsStatus(project.id));
              const data = await res.json();
              if (data.success && data.ready && data.playlistUrl) {
                const absolutePlaylistUrl = `${API_BASE_URL}${data.playlistUrl}?t=${Date.now()}`;
                setPreviewVideoSrc(absolutePlaylistUrl);
                setIsGeneratingPreview(false);
                setIsPlaying(true);
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
          console.error('[EditorLayout] Preview generation error:', error);
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
    if (next) previewPlayerRef.current?.requestPlay?.(seekTo);
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
    setExportedVideoFilename(null);
    isInitialTimelineRef.current = true;

    // Clean up HLS polling interval
    if (hlsPollIntervalRef.current) {
      clearInterval(hlsPollIntervalRef.current);
      hlsPollIntervalRef.current = null;
    }
  }, [project.id]);

  // When timeline changes (tracks or duration), clear preview so next play regenerates from current timeline
  useEffect(() => {
    if (isInitialTimelineRef.current) {
      isInitialTimelineRef.current = false;
      return;
    }
    setPreviewVideoSrc(null);
    setIsPlaying(false);
    if (hlsPollIntervalRef.current) {
      clearInterval(hlsPollIntervalRef.current);
      hlsPollIntervalRef.current = null;
    }
  }, [draftProject.tracks, draftProject.duration]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (hlsPollIntervalRef.current) {
        clearInterval(hlsPollIntervalRef.current);
      }
    };
  }, []);

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
      console.error('Failed to fetch templates:', error);
    }
  };

  const fetchAudioSessions = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.audio);
      const data = await response.json();
      const sessions = data.success ? data.sessions : data.sessions || [];
      setAudioSessions(sessions);
    } catch (error) {
      console.error('Failed to fetch audio sessions:', error);
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
    console.log('[EditorLayout] buildAudioOnlyTimeline returning:', {
      duration: timeline.duration,
      tracksCount: timeline.tracks.length,
      tracks: timeline.tracks.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        clipsCount: t.clips.length,
        clips: t.clips
      }))
    });
    return timeline;
  };

  const handleChangeTemplate = async (templatePath: string, templateLabel: string) => {
    console.log('[EditorLayout] handleChangeTemplate called:', {
      templatePath,
      templateLabel,
      projectId: project.id,
      currentProjectTemplate: project.template
    });
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
          },
        }),
      });


      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('[EditorLayout] Template API response:', {
        success: data.success,
        hasProject: !!data.project,
        projectData: data.project,
        error: data.error
      });
      if (data.success) {
        setMessage({ type: 'success', text: `Template changed to ${templateLabel}` });
        console.log('[EditorLayout] Calling onProjectUpdate after template change, hasCallback:', !!onProjectUpdate);
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
          
          console.log('[EditorLayout] Checking if template needs track:', {
            timelineIsEmpty,
            hasOverlayTrack,
            templateNeedsTrack,
            tracksCount: timelineTracks.length,
            currentDuration: updatedProject?.timeline?.duration
          });

          if (templateNeedsTrack) {
            console.log('[EditorLayout] Creating overlay track for template');
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

              console.log('[EditorLayout] Saving timeline with template overlay track:', {
                duration: timeline.duration,
                tracksCount: timeline.tracks.length,
                tracks: timeline.tracks.map((t: any) => ({
                  id: t.id,
                  name: t.name,
                  type: t.type,
                  clipsCount: t.clips.length
                }))
              });

              const saveResponse = await fetch(API_ENDPOINTS.saveTimeline(project.id), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timeline }),
              });

              console.log('[EditorLayout] Save timeline response:', {
                status: saveResponse.status,
                ok: saveResponse.ok
              });

              if (!saveResponse.ok) {
                throw new Error(`Failed to save template timeline (status ${saveResponse.status})`);
              }

              const saveData = await saveResponse.json();
              console.log('[EditorLayout] Save timeline response data:', saveData);
              console.log('[EditorLayout] Calling onProjectUpdate after saving template timeline');
              const updatedAfterSave = await onProjectUpdate?.();
              if (updatedAfterSave) setDraftProject(updatedAfterSave);
            } catch (timelineError) {
              console.error('[EditorLayout] Template timeline build/save failed:', timelineError);
              // Don't show error to user, template was still updated successfully
            }
          }
        }
      } else {
        throw new Error(data.error || 'Failed to change template');
      }
    } catch (error) {
      console.error('Error changing template:', error);
      setMessage({ type: 'error', text: 'Failed to change template' });
    } finally {
      setChangingTemplate(false);
    }
  };

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
      console.log('[EditorLayout] Audio session API response:', {
        success: data.success,
        hasProject: !!data.project,
        projectData: data.project,
        error: data.error
      });
      if (data.success) {
        setMessage({ type: 'success', text: `Audio session changed to ${sessionName}` });
        console.log('[EditorLayout] Calling onProjectUpdate after audio session change, hasCallback:', !!onProjectUpdate);
        
        // Clear old preview since audio session changed
        setPreviewVideoSrc(null);
        
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
        console.log('[EditorLayout] Checking timeline after audio session change:', {
          timelineIsEmpty,
          hasAudioTrackWithClips,
          needsAudioTrack,
          tracksCount: currentTracks.length,
          clipsCount: currentTracks.reduce((sum: number, t: any) => sum + (t.clips || []).length, 0),
          tracks: currentTracks.map((t: any) => ({ id: t.id, name: t.name, type: t.type, clipsCount: (t.clips || []).length }))
        });
        if (needsAudioTrack) {
          try {
            console.log('[EditorLayout] Building audio-only timeline for session:', audioSessionId);
            const timeline = await buildAudioOnlyTimeline(audioSessionId, sessionName, currentTracks);
            console.log('[EditorLayout] Built audio-only timeline:', {
              duration: timeline.duration,
              tracksCount: timeline.tracks.length,
              tracks: timeline.tracks.map(t => ({ id: t.id, name: t.name, clipsCount: t.clips.length, clips: t.clips }))
            });
            const saveResponse = await fetch(API_ENDPOINTS.saveTimeline(project.id), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ timeline }),
            });

            console.log('[EditorLayout] Save timeline response:', {
              status: saveResponse.status,
              ok: saveResponse.ok
            });

            if (!saveResponse.ok) {
              throw new Error(`Failed to save audio-only timeline (status ${saveResponse.status})`);
            }

            const saveData = await saveResponse.json();
            console.log('[EditorLayout] Save timeline response data:', saveData);
            console.log('[EditorLayout] Calling onProjectUpdate after saving timeline');
            const updatedAfterSave = await onProjectUpdate?.();
            if (updatedAfterSave) setDraftProject(updatedAfterSave);
            
            // Proactively generate preview in background if we have template + audio session
            if (updatedProject?.template?.src) {
              console.log('[EditorLayout] Auto-generating preview in background...');
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
                .catch(err => {
                  console.error('[EditorLayout] Background preview generation failed:', err);
                })
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
      console.error('Error changing audio session:', error);
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
      console.error('Error uploading template:', error);
      setMessage({ type: 'error', text: 'Failed to upload template' });
    } finally {
      setUploadingTemplate(false);
    }
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

  // Subtitles & characters generated (t_subs or t_chars have clips)
  const hasSubtitlesAndChars = draftProject.tracks.some(t =>
    (t.type === 'subtitle' || t.type === 'character') && t.clips.length > 0
  );
  // Image plan generated (any image overlay track t_imgs / t_imgs_N has clips)
  const hasImagePlan = draftProject.tracks.some(t =>
    t.type === 'overlay' && (t.id === 't_imgs' || /^t_imgs_\d+$/.test(t.id)) && t.clips.length > 0
  );

  const handleGenerateSubtitlesAndChars = async () => {
    setIsGeneratingDraft(true);
    setMessage({ type: 'info', text: 'Generating subtitles & characters...' });

    try {
      const response = await fetch(API_ENDPOINTS.generateAiDraft(project.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: project.name }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.project) {
        setMessage({ type: 'success', text: 'Subtitles & characters generated!' });
        const updated = await onProjectUpdate?.();
        if (updated) setDraftProject(updated);
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error(data.error || 'Failed to generate');
      }
    } catch (error) {
      console.error('Error generating subtitles & characters:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to generate',
      });
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleGenerateImagePlan = async () => {
    setIsGeneratingImagePlan(true);
    setMessage({ type: 'info', text: 'Generating image plan...' });

    try {
      const response = await fetch(API_ENDPOINTS.generateImagePlan(project.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: project.name }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.project) {
        setMessage({ type: 'success', text: 'Image plan generated!' });
        const updated = await onProjectUpdate?.();
        if (updated) setDraftProject(updated);
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error(data.error || 'Failed to generate image plan');
      }
    } catch (error) {
      console.error('Error generating image plan:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to generate image plan',
      });
    } finally {
      setIsGeneratingImagePlan(false);
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
      console.error('Error saving timeline:', error);
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to save timeline' 
      });
    }
  }, [project.id, draftProject.duration, draftProject.tracks, onProjectUpdate]);

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
          console.error('Error parsing SSE message:', err);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        if (completed) return; // Ignore: we already got success, onerror fires when closing
        console.error('SSE connection error');
        setIsExporting(false);
        setMessage({ type: 'error', text: 'Lost connection to server' });
      };
    } catch (error) {
      console.error('Error starting export:', error);
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
            isGeneratingPreview={isGeneratingPreview}
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
            projectId={project.id}
            onProjectUpdate={onProjectUpdate}
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
          onGenerateImagePlan={handleGenerateImagePlan}
          isGeneratingDraft={isGeneratingDraft}
          isGeneratingImagePlan={isGeneratingImagePlan}
          isExporting={isExporting}
          exportProgress={exportProgress}
          hasSubtitlesAndChars={hasSubtitlesAndChars}
          hasImagePlan={hasImagePlan}
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
