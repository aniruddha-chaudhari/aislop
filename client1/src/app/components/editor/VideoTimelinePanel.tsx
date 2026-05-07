'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ArrowLeft, Download, Play, Pause, Plus, Scissors, Settings, Trash2, Eye, EyeOff } from 'lucide-react';
import type { Clip, ClipRef, EditorProject, MusicClip, SfxClip, Track } from '../../../features/editor/types';
import { voiceDisplayName } from '../../../features/editor/voiceDisplayName';

/**
 * Sort tracks in the correct order:
 * 1. Overlay (template) - always first
 * 2. Dialogue audio - second
 * 3. Music, then SFX
 * 4. Everything else (subtitle, character, etc.) - after
 */
function sortTracks(tracks: Track[]): Track[] {
  const overlayTracks = tracks.filter(t => t.type === 'overlay');
  const audioTracks = tracks.filter(t => t.type === 'audio');
  const musicTracks = tracks.filter(t => t.type === 'music');
  const sfxTracks = tracks.filter(t => t.type === 'sfx');
  const otherTracks = tracks.filter(
    t => t.type !== 'overlay' && t.type !== 'audio' && t.type !== 'music' && t.type !== 'sfx'
  );
  
  return [...overlayTracks, ...audioTracks, ...musicTracks, ...sfxTracks, ...otherTracks];
}

type Props = {
  project: EditorProject;
  height: number;
  isPlaying: boolean;
  playheadTime: number;
  timelineZoom: number;
  projectName?: string;
  onBack?: () => void;
  onExport?: () => void;
  onSaveTimeline?: () => void;
  onGenerateSubtitlesAndChars?: () => void;
  onGenerateClipPlan?: () => void;
  onGenerateAnimationPlan?: () => void;
  onApproveAnimationPlan?: () => void;
  onGenerateSfxPlan?: () => void;
  isGeneratingDraft?: boolean;
  isGeneratingClipPlan?: boolean;
  isGeneratingAnimationPlan?: boolean;
  isApprovingAnimationPlan?: boolean;
  isGeneratingSfxPlan?: boolean;
  isExporting?: boolean;
  exportProgress?: number;
  hasSubtitlesAndChars?: boolean;
  hasClipPlan?: boolean;
  hasAnimationPlan?: boolean;
  hasDraftAnimationPlan?: boolean;
  hasApprovedAnimationPlan?: boolean;
  message?: { type: 'info' | 'error' | 'success'; text: string } | null;
  exportedVideoFilename?: string | null;
  onDownloadExported?: () => void;
  onHeightChange: (height: number) => void;
  onPlayPause: () => void;
  onPlayheadChange: (time: number) => void;
  onZoomChange: (zoom: number) => void;
  selected: ClipRef | null;
  onSelectClip: (ref: ClipRef | null) => void;
  onUpdateClip: (ref: ClipRef, patch: Partial<Clip>) => void;
  onAddTrack?: () => void;
  onDeleteTrack?: (trackId: string) => void;
  onDeleteClip?: (ref: ClipRef) => void;
  /**
   * Split at playhead. Pass a clip ref to split only that clip; pass `selected` including `null`
   * to split every clip intersecting playhead across eligible tracks when nothing selected.
   */
  onSplitClip?: (target: ClipRef | null) => void;
  onMoveClipToNewTrack?: (ref: ClipRef, start: number, onNewRef: (newRef: ClipRef) => void) => void;
  onMoveClipBackToTrack?: (
    ref: ClipRef,
    originalTrackId: string,
    start: number,
    onBackRef: (backRef: ClipRef) => void
  ) => void;
  onMoveClipToTrack?: (
    ref: ClipRef,
    targetTrackId: string,
    start: number,
    onNewRef: (newRef: ClipRef) => void
  ) => void;
  /** Whether to show subtitle track in the timeline (default: true) */
  showSubtitlesInTimeline?: boolean;
  onToggleShowSubtitlesInTimeline?: () => void;
};

const SNAP_THRESHOLD_SEC = 0.2;

/** Filter tracks for display; optionally hide subtitle track */
function filterTracksForDisplay(tracks: Track[], showSubtitlesInTimeline: boolean): Track[] {
  if (showSubtitlesInTimeline) return tracks;
  return tracks.filter(t => t.type !== 'subtitle');
}
const RULER_HEIGHT_PX = 32; // h-8
const TRACK_ROW_HEIGHT_PX = 48; // h-12

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** All time positions we can snap to: playhead, clip edges (all tracks), ruler ticks. */
function getSnapTargets(
  project: EditorProject,
  excludeClipRef: ClipRef | null,
  playheadTime: number
): number[] {
  const targets = new Set<number>();
  targets.add(playheadTime);
  const step = project.duration <= 60 ? 5 : 10;
  for (let t = 0; t <= project.duration + 0.0001; t += step) targets.add(t);
  for (const track of project.tracks) {
    for (const c of track.clips) {
      if (excludeClipRef && track.id === excludeClipRef.trackId && c.id === excludeClipRef.clipId) continue;
      targets.add(c.start);
      targets.add(c.start + c.duration);
    }
  }
  return [...targets];
}

function snapToTargets(value: number, targets: number[], threshold: number): number {
  let best = value;
  let bestDist = threshold + 1;
  for (const t of targets) {
    const d = Math.abs(value - t);
    if (d <= threshold && d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

/** Constrain start so [start, start+duration] does not overlap any of the other clips on the same track. */
function constrainStartNoOverlap(
  rawStart: number,
  duration: number,
  otherClips: Clip[],
  projectDuration: number
): number {
  let nextStart = clamp(rawStart, 0, projectDuration - Math.max(0.01, duration));
  for (let i = 0; i < 15; i++) {
    let overlapped = false;
    for (const c of otherClips) {
      const cEnd = c.start + c.duration;
      if (nextStart < cEnd && nextStart + duration > c.start) {
        overlapped = true;
        const before = c.start - duration;
        const after = cEnd;
        nextStart = nextStart <= (c.start + cEnd - duration) / 2 ? before : after;
        break;
      }
    }
    if (!overlapped) break;
  }
  return clamp(nextStart, 0, projectDuration - Math.max(0.01, duration));
}

function trackColor(type: Track['type']): string {
  switch (type) {
    case 'audio':
      return 'from-cyan-600 to-cyan-400';
    case 'music':
      return 'from-emerald-600 to-emerald-400';
    case 'sfx':
      return 'from-amber-600 to-amber-400';
    case 'subtitle':
      return 'from-fuchsia-600 to-fuchsia-400';
    case 'overlay':
      return 'from-blue-600 to-blue-400';
    case 'character':
      return 'from-zinc-600 to-zinc-400';
  }
}

function clipPathLabel(path?: string, fallback: string = 'Audio'): string {
  if (!path) return fallback;
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || fallback;
}

function clipDisplayLabel(c: Clip): string {
  if (c.kind === 'subtitle') return voiceDisplayName(c.speaker);
  if (c.kind === 'character') return voiceDisplayName(c.character);
  if (c.kind === 'overlay') return c.label;
  if (c.kind === 'music') return clipPathLabel(c.path, 'Music');
  if (c.kind === 'sfx') return clipPathLabel(c.path, 'SFX');
  return c.label;
}

export default function VideoTimelinePanel({
  project,
  height,
  isPlaying,
  playheadTime,
  timelineZoom,
  projectName,
  onBack,
  onExport,
  onSaveTimeline,
  onGenerateSubtitlesAndChars,
  onGenerateClipPlan,
  onGenerateAnimationPlan,
  onApproveAnimationPlan,
  onGenerateSfxPlan,
  isGeneratingDraft,
  isGeneratingClipPlan,
  isGeneratingAnimationPlan,
  isApprovingAnimationPlan,
  isGeneratingSfxPlan,
  isExporting,
  exportProgress,
  hasSubtitlesAndChars,
  hasClipPlan,
  hasAnimationPlan,
  hasDraftAnimationPlan,
  hasApprovedAnimationPlan,
  message,
  exportedVideoFilename,
  onDownloadExported,
  onHeightChange,
  onPlayPause,
  onPlayheadChange,
  onZoomChange,
  selected,
  onSelectClip,
  onUpdateClip,
  onAddTrack,
  onDeleteTrack,
  onDeleteClip,
  onSplitClip,
  onMoveClipToNewTrack,
  onMoveClipBackToTrack,
  onMoveClipToTrack,
  showSubtitlesInTimeline = true,
  onToggleShowSubtitlesInTimeline,
}: Props) {
  const [isResizing, setIsResizing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    ref: ClipRef;
    label: string;
  } | null>(null);
  const playheadTimeRef = useRef(playheadTime);
  playheadTimeRef.current = playheadTime;
  const movedToNewTrackThisDragRef = useRef(false);
  const originalTrackIdRef = useRef<string | null>(null);
  const dragRef = useRef<{
    ref: ClipRef;
    mode: 'move' | 'trim-left' | 'trim-right';
    startX: number;
    startStart: number;
    startDuration: number;
    /** Only set for music/sfx trim-left; captures sourceOffset at pointer-down. */
    startSourceOffset?: number;
  } | null>(null);

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      onHeightChange(Math.max(100, window.innerHeight - e.clientY));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onHeightChange]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const pxPerSecond = useMemo(() => 70 * timelineZoom, [timelineZoom]);
  const laneWidth = useMemo(() => Math.max(600, project.duration * pxPerSecond), [project.duration, pxPerSecond]);

  const timeTicks = useMemo(() => {
    const step = project.duration <= 60 ? 5 : 10;
    const out: number[] = [];
    for (let t = 0; t <= project.duration + 0.0001; t += step) out.push(t);
    return out;
  }, [project.duration]);

  const timelineContentRef = useRef<HTMLDivElement | null>(null);
  const playheadDragRef = useRef(false);

  const getTimeFromClientX = (clientX: number): number => {
    const el = timelineContentRef.current;
    if (!el) return playheadTime;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    return clamp(x / pxPerSecond, 0, project.duration);
  };

  const onRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = getTimeFromClientX(e.clientX);
    onPlayheadChange(t);
    onSelectClip(null);
  };

  const onPlayheadPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    playheadDragRef.current = true;
    onPlayheadChange(getTimeFromClientX(e.clientX));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', onPlayheadPointerMove);
    window.addEventListener('pointerup', onPlayheadPointerUp);
  };

  const onPlayheadPointerMove = (e: PointerEvent) => {
    if (!playheadDragRef.current) return;
    onPlayheadChange(getTimeFromClientX(e.clientX));
  };

  const onPlayheadPointerUp = () => {
    playheadDragRef.current = false;
    window.removeEventListener('pointermove', onPlayheadPointerMove);
    window.removeEventListener('pointerup', onPlayheadPointerUp);
  };

  const onLaneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only clear selection when clicking the lane background, not when clicking a clip (clip click bubbles)
    if (e.target !== e.currentTarget) return;
    const t = getTimeFromClientX(e.clientX);
    onPlayheadChange(t);
    onSelectClip(null);
  };

  const onPointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dt = dx / pxPerSecond;
    const track = project.tracks.find((t) => t.id === drag.ref.trackId);
    const otherClipsSameTrack = track ? track.clips.filter((c) => c.id !== drag.ref.clipId) : [];
    const snapTargets = getSnapTargets(project, drag.ref, playheadTimeRef.current);

    if (drag.mode === 'move') {
      const rawStart = clamp(
        drag.startStart + dt,
        0,
        project.duration - Math.max(0.01, drag.startDuration)
      );
      const candidateStart = snapToTargets(rawStart, snapTargets, SNAP_THRESHOLD_SEC);
      const wouldOverlap = otherClipsSameTrack.some(
        (c) =>
          candidateStart < c.start + c.duration &&
          candidateStart + drag.startDuration > c.start
      );
      if (wouldOverlap && onMoveClipToNewTrack && !movedToNewTrackThisDragRef.current) {
        originalTrackIdRef.current = drag.ref.trackId;
        onMoveClipToNewTrack(drag.ref, candidateStart, (newRef) => {
          if (dragRef.current) dragRef.current = { ...dragRef.current, ref: newRef };
          movedToNewTrackThisDragRef.current = true;
          onSelectClip(newRef);
        });
        return;
      }
      if (movedToNewTrackThisDragRef.current && originalTrackIdRef.current && onMoveClipBackToTrack) {
        const origTrack = project.tracks.find((t) => t.id === originalTrackIdRef.current);
        const otherClipsOnOriginal = origTrack
          ? origTrack.clips.filter((c) => c.id !== drag.ref.clipId)
          : [];
        const wouldOverlapOther = otherClipsOnOriginal.some(
          (c) =>
            candidateStart < c.start + c.duration &&
            candidateStart + drag.startDuration > c.start
        );
        if (!wouldOverlapOther) {
          const startOnOriginal = constrainStartNoOverlap(
            candidateStart,
            drag.startDuration,
            otherClipsOnOriginal,
            project.duration
          );
          onMoveClipBackToTrack(
            drag.ref,
            originalTrackIdRef.current,
            startOnOriginal,
            (backRef) => {
              if (dragRef.current) dragRef.current = { ...dragRef.current, ref: backRef };
              movedToNewTrackThisDragRef.current = false;
              originalTrackIdRef.current = null;
              onSelectClip(backRef);
            }
          );
          return;
        }
      }
      const nextStart = constrainStartNoOverlap(
        candidateStart,
        drag.startDuration,
        otherClipsSameTrack,
        project.duration
      );
      const sortedTracks = sortTracks(filterTracksForDisplay(project.tracks, showSubtitlesInTimeline));
      const el = timelineContentRef.current;
      let trackIndexUnderCursor: number | null = null;
      if (el && sortedTracks.length > 0) {
        const rect = el.getBoundingClientRect();
        const yRelative = e.clientY - rect.top - RULER_HEIGHT_PX;
        if (yRelative >= 0) {
          const index = Math.floor(yRelative / TRACK_ROW_HEIGHT_PX);
          if (index < sortedTracks.length) trackIndexUnderCursor = index;
        }
      }
      if (
        trackIndexUnderCursor !== null &&
        onMoveClipToTrack &&
        sortedTracks[trackIndexUnderCursor].id !== drag.ref.trackId
      ) {
        const targetTrackId = sortedTracks[trackIndexUnderCursor].id;
        const targetTrack = project.tracks.find((t) => t.id === targetTrackId);
        const clipsOnTarget = targetTrack ? targetTrack.clips : [];
        const validStart = constrainStartNoOverlap(
          nextStart,
          drag.startDuration,
          clipsOnTarget,
          project.duration
        );
        onMoveClipToTrack(drag.ref, targetTrackId, validStart, (newRef) => {
          if (dragRef.current) dragRef.current = { ...dragRef.current, ref: newRef };
          onSelectClip(newRef);
        });
        return;
      }
      onUpdateClip(drag.ref, { start: nextStart } as Partial<Clip>);
      return;
    }

    if (drag.mode === 'trim-left') {
      const originalEnd = drag.startStart + drag.startDuration;
      let newStart = clamp(drag.startStart + dt, 0, originalEnd - 0.1);
      newStart = snapToTargets(newStart, snapTargets, SNAP_THRESHOLD_SEC);
      const minStart = otherClipsSameTrack.reduce((min, c) => {
        const cEnd = c.start + c.duration;
        if (cEnd <= originalEnd && cEnd > min) return cEnd;
        return min;
      }, 0);
      newStart = clamp(newStart, minStart, originalEnd - 0.1);
      const newDuration = Math.max(0.1, originalEnd - newStart);
      const deltaStart = newStart - drag.startStart;
      if (drag.startSourceOffset !== undefined) {
        onUpdateClip(
          drag.ref,
          {
            start: newStart,
            duration: newDuration,
            sourceOffset: Math.max(0, drag.startSourceOffset + deltaStart),
          } as Partial<Clip>
        );
      } else {
        onUpdateClip(drag.ref, { start: newStart, duration: newDuration } as Partial<Clip>);
      }
      return;
    }

    if (drag.mode === 'trim-right') {
      const maxDurationByOverlap = otherClipsSameTrack.reduce((max, c) => {
        if (c.start > drag.startStart) {
          const allowed = c.start - drag.startStart;
          return allowed < max ? allowed : max;
        }
        return max;
      }, project.duration - drag.startStart);
      let newDuration = clamp(drag.startDuration + dt, 0.1, maxDurationByOverlap);
      const newEnd = drag.startStart + newDuration;
      const snappedEnd = snapToTargets(newEnd, snapTargets, SNAP_THRESHOLD_SEC);
      newDuration = snappedEnd - drag.startStart;
      const finalDuration = clamp(newDuration, 0.1, maxDurationByOverlap);
      onUpdateClip(drag.ref, { duration: finalDuration } as Partial<Clip>);
    }
  };

  const onPointerUp = () => {
    movedToNewTrackThisDragRef.current = false;
    originalTrackIdRef.current = null;
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  return (
    <div 
      style={{ height: `${height}px` }} 
      className="bg-card border-t border-border flex flex-col overflow-hidden relative"
    >
      {/* Timeline Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-muted transition"
        style={{ cursor: 'row-resize' }}
      />
      
      {/* Timeline Header */}
      <div className="h-10 bg-muted border-b border-border flex items-center justify-between px-4 mt-1">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 rounded-md hover:bg-accent transition text-foreground"
              title="Back to Projects"
            >
              ← 
            </button>
          )}
          <button
            type="button"
            onClick={onPlayPause}
            className="p-1.5 rounded hover:bg-accent transition text-foreground"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">
              {projectName ? projectName : 'Timeline'}
            </div>
          </div>
        </div>

        {/* Center: plan generation buttons */}
        <div className="flex-1 flex justify-center items-center gap-2">
          {!hasSubtitlesAndChars && onGenerateSubtitlesAndChars && (
            <button
              type="button"
              onClick={onGenerateSubtitlesAndChars}
              disabled={isGeneratingDraft}
              className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed shadow"
            >
              {isGeneratingDraft ? '⏳ Generating...' : 'Subtitles & Characters'}
            </button>
          )}
          {!hasClipPlan && onGenerateClipPlan && (
            <button
              type="button"
              onClick={onGenerateClipPlan}
              disabled={isGeneratingClipPlan}
              className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed shadow"
            >
              {isGeneratingClipPlan ? '⏳ Generating...' : 'Clip Plan'}
            </button>
          )}
          {onGenerateSfxPlan && (
            <button
              type="button"
              onClick={onGenerateSfxPlan}
              disabled={isGeneratingSfxPlan}
              className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed shadow"
            >
              {isGeneratingSfxPlan ? 'Generating...' : ' SFX Plan'}
            </button>
          )}
          {!hasAnimationPlan && onGenerateAnimationPlan && (
            <button
              type="button"
              onClick={onGenerateAnimationPlan}
              disabled={isGeneratingAnimationPlan}
              className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed shadow"
            >
              {isGeneratingAnimationPlan ? 'Generating...' : ' Animation Plan'}
            </button>
          )}
          {hasDraftAnimationPlan && onApproveAnimationPlan && (
            <button
              type="button"
              onClick={onApproveAnimationPlan}
              disabled={isApprovingAnimationPlan}
              className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-lime-600 to-emerald-600 hover:from-lime-500 hover:to-emerald-500 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed shadow"
            >
              {isApprovingAnimationPlan ? 'Approving...' : ' Approve Animation Plan'}
            </button>
          )}
          {hasApprovedAnimationPlan && (
            <span className="px-2.5 py-1 text-[11px] rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Animation Plan Approved
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {message && (
            <div className={`px-3 py-1 text-xs rounded-md ${
              message.type === 'error' ? 'bg-red-500/10 text-red-500' :
              message.type === 'success' ? 'bg-green-500/10 text-green-500' :
              'bg-blue-500/10 text-blue-500'
            }`}>
              {message.text}
            </div>
          )}
          {onSaveTimeline && (
            <button
              type="button"
              onClick={onSaveTimeline}
              className="h-7 px-2.5 rounded-md bg-muted text-xs font-medium hover:opacity-90 transition"
              title="Save timeline (keeps added tracks and edits after reload)"
            >
              Save
            </button>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onZoomChange(Math.max(0.5, timelineZoom - 0.1))}
              className="p-1 rounded hover:bg-accent transition text-xs text-foreground" 
              title="Zoom Out"
            >
              −
            </button>
            <input 
              type="range" 
              min="0.5" 
              max="2" 
              step="0.1" 
              value={timelineZoom}
              onChange={(e) => onZoomChange(Number(e.target.value))}
              className="w-20 h-1"
              style={{ accentColor: 'currentColor' }}
            />
            <button
              type="button"
              onClick={() => onZoomChange(Math.min(2, timelineZoom + 0.1))}
              className="p-1 rounded hover:bg-accent transition text-xs text-foreground" 
              title="Zoom In"
            >
              +
            </button>
          </div>
          <span className="text-xs text-muted-foreground">{(timelineZoom * 100).toFixed(0)}%</span>
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              disabled={isExporting}
              className="h-7 px-2.5 rounded-md bg-accent text-card text-xs font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              title="Export"
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? `Exporting ${exportProgress || 0}%` : 'Export'}
            </button>
          )}
          {exportedVideoFilename && onDownloadExported && (
            <button
              type="button"
              onClick={onDownloadExported}
              className="h-7 px-2.5 rounded-md bg-green-600 text-white text-xs font-medium hover:opacity-90 transition inline-flex items-center gap-1.5"
              title="Download exported video"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          )}
        </div>
      </div>

      {/* Tracks */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex min-w-0">
          {/* Fixed left labels column */}
          <div className="w-32 shrink-0 border-r border-border">
            {/* Header spacer to align with time ruler */}
            <div className="h-8 bg-muted border-b border-border" />
            {sortTracks(filterTracksForDisplay(project.tracks, showSubtitlesInTimeline)).map((t) => (
              <div key={t.id} className="h-12 bg-muted flex items-center gap-2 px-3 border-b border-border group">
                <span className="text-xs font-semibold truncate flex-1 min-w-0">{t.name}</span>
                {onDeleteTrack && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTrack(t.id);
                    }}
                    className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition opacity-0 group-hover:opacity-100 shrink-0"
                    title="Delete track"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Shared horizontal scroll area (ruler + all lanes) */}
          <div className="flex-1 min-w-0">
            <div className="relative overflow-x-auto">
              <div ref={timelineContentRef} className="relative" style={{ width: `${laneWidth}px` }}>
                {/* Draggable playhead */}
                <div
                  className="absolute top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize z-10 flex justify-center"
                  style={{ left: `${playheadTime * pxPerSecond}px` }}
                  onPointerDown={onPlayheadPointerDown}
                >
                  <div className="w-px flex-1 bg-accent pointer-events-none" />
                </div>

                {/* Time ruler - click to seek */}
                <div
                  className="h-8 border-b border-border bg-card relative cursor-pointer"
                  onClick={onRulerClick}
                >
                  {timeTicks.map((t) => (
                    <div
                      key={t}
                      className="absolute top-0 h-full flex flex-col items-center -translate-x-1/2"
                      style={{ left: `${t * pxPerSecond}px` }}
                    >
                      <div className="h-2 w-px bg-foreground/20" />
                      <div className="text-[10px] text-muted-foreground">{t}s</div>
                    </div>
                  ))}
                </div>

                {/* Tracks lanes - sorted: overlay first, then audio, then others */}
                {sortTracks(filterTracksForDisplay(project.tracks, showSubtitlesInTimeline)).map((t) => (
                  <div
                    key={t.id}
                    className="h-12 border-b border-border bg-card relative"
                    onClick={onLaneClick}
                  >
                    {t.clips.map((c) => {
                      const left = c.start * pxPerSecond;
                      const width = Math.max(10, c.duration * pxPerSecond);
                      const ref: ClipRef = { trackId: t.id, clipId: c.id };
                      const isSelected = selected?.trackId === ref.trackId && selected?.clipId === ref.clipId;
                      const gradient = trackColor(t.type);

                      return (
                        <div
                          key={c.id}
                          className={[
                            'absolute top-1/2 -translate-y-1/2 h-9 rounded cursor-pointer opacity-90 hover:opacity-100 transition',
                            'bg-gradient-to-r',
                            gradient,
                            isSelected ? 'ring-2 ring-accent' : '',
                          ].join(' ')}
                          style={{ left: `${left}px`, width: `${width}px` }}
                          onClick={(e) => e.stopPropagation()}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectClip(ref);
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              ref,
                              label: clipDisplayLabel(c),
                            });
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setContextMenu(null);
                            onSelectClip(ref);
                            const mode: 'move' | 'trim-left' | 'trim-right' =
                              (e.target as HTMLElement)?.dataset?.handle === 'l'
                                ? 'trim-left'
                                : (e.target as HTMLElement)?.dataset?.handle === 'r'
                                  ? 'trim-right'
                                  : 'move';
                            const isMusicOrSfx = c.kind === 'music' || c.kind === 'sfx';
                            dragRef.current = {
                              ref,
                              mode,
                              startX: e.clientX,
                              startStart: c.start,
                              startDuration: c.duration,
                              startSourceOffset:
                                mode === 'trim-left' && isMusicOrSfx
                                  ? ((c as MusicClip | SfxClip).sourceOffset ?? 0)
                                  : undefined,
                            };
                            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                            window.addEventListener('pointermove', onPointerMove);
                            window.addEventListener('pointerup', onPointerUp);
                          }}
                        >
                          {/* trim handles */}
                          <div
                            data-handle="l"
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/15 hover:bg-black/25"
                          />
                          <div
                            data-handle="r"
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/15 hover:bg-black/25"
                          />

                          <div className="h-full px-2 flex items-center">
                            <span className="text-[11px] font-semibold text-white truncate">
                              {clipDisplayLabel(c)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-44 rounded-md border border-border bg-card p-1 shadow-lg"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[11px] text-muted-foreground truncate">
            {contextMenu.label}
          </div>
          {onSplitClip && (
            <button
              type="button"
              onClick={() => {
                onSplitClip(contextMenu.ref);
                setContextMenu(null);
              }}
              className="w-full rounded px-2 py-1.5 text-left text-xs font-medium hover:bg-accent inline-flex items-center gap-2"
            >
              <Scissors size={14} className="opacity-70" />
              Split at playhead
              <span className="ml-auto text-[10px] text-muted-foreground shrink-0 text-right max-w-[5.5rem] leading-tight">
                Ctrl+Shift+S
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onDeleteClip?.(contextMenu.ref);
              setContextMenu(null);
            }}
            className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Delete clip
          </button>
        </div>
      )}

      {/* Timeline Footer Controls */}
      <div className="h-10 bg-muted border-t border-border flex items-center justify-between px-4 gap-3">
        <div className="flex items-center gap-2">
          <button 
            onClick={onPlayPause}
            className="p-1.5 rounded hover:bg-accent transition text-foreground" 
            title="Play"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            onClick={() => onAddTrack?.()}
            className="p-1.5 rounded hover:bg-accent transition text-foreground inline-flex items-center gap-1.5"
            title="Add Track"
          >
            <Plus size={16} />
            <span className="text-xs font-medium">Add Track</span>
          </button>
          {onSplitClip && (
            <button
              type="button"
              onClick={() => onSplitClip(selected)}
              className="p-1.5 rounded hover:bg-accent transition text-foreground inline-flex items-center gap-1.5"
              title={
                selected
                  ? 'Split selected clip at playhead (Ctrl+Shift+S)'
                  : 'Split all clips at playhead across tracks (Ctrl+Shift+S)'
              }
            >
              <Scissors size={16} />
              <span className="text-xs font-medium">{selected ? 'Split' : 'Split all'}</span>
            </button>
          )}
          {onToggleShowSubtitlesInTimeline && (
            <button
              type="button"
              onClick={onToggleShowSubtitlesInTimeline}
              className={`p-1.5 rounded hover:bg-accent transition inline-flex items-center gap-1.5 ${showSubtitlesInTimeline ? 'text-foreground' : 'text-muted-foreground'}`}
              title={showSubtitlesInTimeline ? 'Hide subtitle track in timeline' : 'Show subtitle track in timeline'}
            >
              {showSubtitlesInTimeline ? <Eye size={16} /> : <EyeOff size={16} />}
              <span className="text-xs font-medium">Timeline subs</span>
            </button>
          )}
          <button className="p-1.5 rounded hover:bg-accent transition text-foreground" title="Settings">
            <Settings size={16} />
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          {formatTime(playheadTime)} / {formatTime(project.duration)}
        </div>
      </div>
    </div>
  );
}
