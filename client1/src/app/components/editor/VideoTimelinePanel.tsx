'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { ArrowLeft, Download, Play, Pause, Plus, Settings } from 'lucide-react';
import type { Clip, ClipRef, EditorProject, Track } from '../../../features/editor/types';

type Props = {
  project: EditorProject;
  height: number;
  isPlaying: boolean;
  playheadTime: number;
  timelineZoom: number;
  projectName?: string;
  onBack?: () => void;
  onExport?: () => void;
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

  const onLaneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = clamp(x / pxPerSecond, 0, project.duration);
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
          <button
            onClick={onBack}
            disabled={!onBack}
            className="p-1.5 rounded hover:bg-accent transition text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">
              {projectName ? projectName : 'Timeline'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
            disabled={!onExport}
            className="h-7 px-2.5 rounded-md bg-accent text-card text-xs font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            title="Export"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Tracks */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex min-w-0">
          {/* Fixed left labels column */}
          <div className="w-32 shrink-0 border-r border-border">
            <div className="h-8 bg-muted border-b border-border" />
            {project.tracks.map((t) => (
              <div key={t.id} className="h-12 bg-muted flex items-center px-3 border-b border-border">
                <span className="text-xs font-semibold truncate">{t.name}</span>
              </div>
            ))}
          </div>

          {/* Shared horizontal scroll area (ruler + all lanes) */}
          <div className="flex-1 min-w-0">
            <div className="relative overflow-x-auto">
              <div className="relative" style={{ width: `${laneWidth}px` }}>
                {/* Shared playhead line across ruler + tracks */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-accent pointer-events-none"
                  style={{ left: `${playheadTime * pxPerSecond}px` }}
                />

                {/* Time ruler */}
                <div className="h-8 border-b border-border bg-card relative">
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

                {/* Tracks lanes */}
                {project.tracks.map((t) => (
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
