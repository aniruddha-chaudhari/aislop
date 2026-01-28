'use client';

import { useState, useEffect } from 'react';
import type { Clip, ClipRef } from '../../../features/editor/types';

type Props = {
  width: number;
  onWidthChange: (width: number) => void;
  selected: Clip | null;
  selectedRef: ClipRef | null;
  onUpdateClip: (patch: Partial<Clip>) => void;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export default function TextPropertiesPanel({
  width,
  onWidthChange,
  selected,
  selectedRef,
  onUpdateClip,
}: Props) {
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      onWidthChange(Math.max(150, window.innerWidth - e.clientX));
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
  }, [isResizing, onWidthChange]);

  return (
    <div 
      style={{ width: `${width}px` }} 
      className="bg-card border-l border-border flex flex-col p-4 overflow-y-auto relative"
    >
      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-muted transition"
        style={{ cursor: 'col-resize' }}
      />
      
      <h3 className="text-sm font-semibold mb-4">Properties</h3>

      {!selected || !selectedRef ? (
        <div className="text-xs text-muted-foreground">
          Select a clip in the timeline (or an overlay in the preview) to edit its properties.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded border border-border bg-muted/30 p-3">
            <div className="text-xs font-semibold mb-2">Timing</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Start (s)</label>
                <input
                  type="number"
                  step="0.1"
                  value={selected.start}
                  onChange={(e) => onUpdateClip({ start: Math.max(0, Number(e.target.value)) })}
                  className="w-full bg-muted border border-border rounded px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Duration (s)</label>
                <input
                  type="number"
                  step="0.1"
                  value={selected.duration}
                  onChange={(e) => onUpdateClip({ duration: Math.max(0.1, Number(e.target.value)) })}
                  className="w-full bg-muted border border-border rounded px-3 py-2 text-xs"
                />
              </div>
            </div>
          </div>

          {(selected.kind === 'overlay' || selected.kind === 'character') && (
            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold mb-2">Transform</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">X (0-1)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selected.x}
                    onChange={(e) => onUpdateClip({ x: clamp01(Number(e.target.value)) } as Partial<Clip>)}
                    className="w-full bg-muted border border-border rounded px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Y (0-1)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selected.y}
                    onChange={(e) => onUpdateClip({ y: clamp01(Number(e.target.value)) } as Partial<Clip>)}
                    className="w-full bg-muted border border-border rounded px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Scale</label>
                  <input
                    type="number"
                    step="0.01"
                    value={selected.scale}
                    onChange={(e) => onUpdateClip({ scale: Math.max(0.05, Number(e.target.value)) } as Partial<Clip>)}
                    className="w-full bg-muted border border-border rounded px-3 py-2 text-xs"
                  />
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Tip: drag the overlay in the preview to change X/Y.
              </div>
            </div>
          )}

          {selected.kind === 'subtitle' && (
            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold mb-2">Subtitle</div>
              <div className="text-xs text-muted-foreground">Speaker</div>
              <div className="mt-1 text-xs font-semibold">{selected.speaker}</div>
              <div className="mt-2 text-xs text-muted-foreground">Text</div>
              <textarea
                value={selected.text}
                onChange={(e) => onUpdateClip({ text: e.target.value } as Partial<Clip>)}
                className="mt-1 w-full min-h-[88px] bg-muted border border-border rounded px-3 py-2 text-xs"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
