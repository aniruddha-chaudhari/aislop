'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ArrowLeft, Download, Play, Pause, Plus, Settings } from 'lucide-react';
import type { Clip, ClipRef, EditorProject, Track } from '../../../features/editor/types';

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
  height: number;
  isPlaying: boolean;
  playheadTime: number;
  timelineZoom: number;
  projectName?: string;
  onBack?: () => void;
  onExport?: () => void;
  onSaveTimeline?: () => void;
  onGenerateSubtitlesAndChars?: () => void;
  onGenerateImagePlan?: () => void;
  isGeneratingDraft?: boolean;
  isGeneratingImagePlan?: boolean;
  isExporting?: boolean;
  exportProgress?: number;
  hasSubtitlesAndChars?: boolean;
  hasImagePlan?: boolean;
  message?: { type: 'info' | 'error' | 'success'; text: string } | null;
  onHeightChange: (height: number) => void;
  onPlayPause: () => void;
  onPlayheadChange: (time: number) => void;
  onZoomChange: (zoom: number) => void;
  selected: ClipRef | null;
  onSelectClip: (ref: ClipRef | null) => void;
  onUpdateClip: (ref: ClipRef, patch: Partial<Clip>) => void;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function trackColor(type: Track['type']): string {
  switch (type) {
    case 'audio':
      return 'from-cyan-600 to-cyan-400';
    case 'subtitle':
      return 'from-fuchsia-600 to-fuchsia-400';
    case 'overlay':
      return 'from-blue-600 to-blue-400';
    case 'character':
      return 'from-zinc-600 to-zinc-400';
  }
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
  onGenerateImagePlan,
  isGeneratingDraft,
  isGeneratingImagePlan,
  isExporting,
  exportProgress,
  hasSubtitlesAndChars,
  hasImagePlan,
  message,
  onHeightChange,
  onPlayPause,
  onPlayheadChange,
  onZoomChange,
  selected,
  onSelectClip,
  onUpdateClip,
}: Props) {
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{
    ref: ClipRef;
    mode: 'move' | 'trim-left' | 'trim-right';
    startX: number;
    startStart: number;
    startDuration: number;
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
    const t = getTimeFromClientX(e.clientX);
    onPlayheadChange(t);
    onSelectClip(null);
  };

  const onPointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dt = dx / pxPerSecond;

    if (drag.mode === 'move') {
      const nextStart = clamp(drag.startStart + dt, 0, project.duration - Math.max(0.01, drag.startDuration));
      onUpdateClip(drag.ref, { start: nextStart } as Partial<Clip>);
      return;
    }

    if (drag.mode === 'trim-left') {
      const newStart = clamp(drag.startStart + dt, 0, drag.startStart + drag.startDuration - 0.1);
      const newEnd = drag.startStart + drag.startDuration;
      const newDuration = Math.max(0.1, newEnd - newStart);
      onUpdateClip(drag.ref, { start: newStart, duration: newDuration } as Partial<Clip>);
      return;
    }

    if (drag.mode === 'trim-right') {
      const newDuration = clamp(drag.startDuration + dt, 0.1, project.duration - drag.startStart);
      onUpdateClip(drag.ref, { duration: newDuration } as Partial<Clip>);
    }
  };

  const onPointerUp = () => {
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
              onClick={onBack}
              className="p-1.5 rounded-md hover:bg-accent transition text-foreground"
              title="Back to Projects"
            >
              ← 
            </button>
          )}
          <button
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

        {/* Center: Subtitles & Characters + Image Plan buttons */}
        <div className="flex-1 flex justify-center items-center gap-2">
          {!hasSubtitlesAndChars && onGenerateSubtitlesAndChars && (
            <button
              onClick={onGenerateSubtitlesAndChars}
              disabled={isGeneratingDraft}
              className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed shadow"
            >
              {isGeneratingDraft ? '⏳ Generating...' : 'Subtitles & Characters'}
            </button>
          )}
          {!hasImagePlan && onGenerateImagePlan && (
            <button
              onClick={onGenerateImagePlan}
              disabled={isGeneratingImagePlan}
              className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed shadow"
            >
              {isGeneratingImagePlan ? '⏳ Generating...' : ' Image Plan'}
            </button>
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
          {(hasSubtitlesAndChars || hasImagePlan) && onSaveTimeline && (
            <button
              onClick={onSaveTimeline}
              className="h-7 px-2.5 rounded-md bg-muted text-xs font-medium hover:opacity-90 transition"
            >
              Save
            </button>
          )}
          <div className="flex items-center gap-1">
            <button 
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
              onClick={() => onZoomChange(Math.min(2, timelineZoom + 0.1))}
              className="p-1 rounded hover:bg-accent transition text-xs text-foreground" 
              title="Zoom In"
            >
              +
            </button>
          </div>
          <span className="text-xs text-muted-foreground">{(timelineZoom * 100).toFixed(0)}%</span>
          <button
            onClick={onExport}
            disabled={!onExport || isExporting}
            className="h-7 px-2.5 rounded-md bg-accent text-card text-xs font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            title="Export"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? `Exporting ${exportProgress || 0}%` : 'Export'}
          </button>
        </div>
      </div>

      {/* Tracks */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex min-w-0">
          {/* Fixed left labels column */}
          <div className="w-32 shrink-0 border-r border-border">
            {/* Header spacer to align with time ruler */}
            <div className="h-8 bg-muted border-b border-border" />
            {sortTracks(project.tracks).map((t) => (
              <div key={t.id} className="h-12 bg-muted flex items-center px-3 border-b border-border">
                <span className="text-xs font-semibold truncate">{t.name}</span>
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
                {sortTracks(project.tracks).map((t) => (
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
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            onSelectClip(ref);
                            const mode: 'move' | 'trim-left' | 'trim-right' =
                              (e.target as HTMLElement)?.dataset?.handle === 'l'
                                ? 'trim-left'
                                : (e.target as HTMLElement)?.dataset?.handle === 'r'
                                  ? 'trim-right'
                                  : 'move';
                            dragRef.current = {
                              ref,
                              mode,
                              startX: e.clientX,
                              startStart: c.start,
                              startDuration: c.duration,
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
                              {c.kind === 'subtitle'
                                ? `${c.speaker}`
                                : c.kind === 'character'
                                  ? c.character
                                  : c.kind === 'overlay'
                                    ? c.label
                                    : c.label}
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
          <button className="p-1.5 rounded hover:bg-accent transition text-foreground" title="Add Track">
            <Plus size={16} />
          </button>
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
