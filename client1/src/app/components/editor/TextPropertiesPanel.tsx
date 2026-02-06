'use client';

import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import type { Clip, ClipRef, EditorProject, OverlayClip } from '../../../features/editor/types';
import { API_ENDPOINTS } from '../../../config/api';

export type TextPropertiesPanelHandle = {
  openFileDialog: () => void;
};

const TEMPLATE_TRACK_ID = 't_overlay_template';

type Props = {
  width: number;
  onWidthChange: (width: number) => void;
  selected: Clip | null;
  selectedRef: ClipRef | null;
  onUpdateClip: (patch: Partial<Clip>) => void;
  onDeleteClip?: () => void;
  projectId: string;
  /** Current project (for template video start when template clip is selected) */
  project?: EditorProject | null;
  /** Change background video start (seconds). Only used when template clip is selected. */
  onVideoStartChange?: (seconds: number) => void;
  /** Called after overlay image upload so parent can refetch project and refresh preview */
  onProjectUpdate?: () => void;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

const TextPropertiesPanel = forwardRef<TextPropertiesPanelHandle, Props>(function TextPropertiesPanel({
  width,
  onWidthChange,
  selected,
  selectedRef,
  onUpdateClip,
  onDeleteClip,
  projectId,
  project,
  onVideoStartChange,
  onProjectUpdate,
}, ref) {
  const isTemplateClip = selectedRef?.trackId === TEMPLATE_TRACK_ID && selected?.kind === 'overlay';
  const isTemplateVideo = project?.template?.type === 'video' && project?.template?.src;
  const showVideoStart = isTemplateClip && isTemplateVideo;

  const templateVideoStart = project?.template?.videoStart ?? 0;
  const [videoStartInput, setVideoStartInput] = useState<string>(() => String(templateVideoStart));
  // Sync from project only when template clip is (re)selected, so user can clear the field while typing
  useEffect(() => {
    if (showVideoStart) setVideoStartInput(String(project?.template?.videoStart ?? 0));
  }, [showVideoStart, selectedRef?.trackId, selectedRef?.clipId]);
  const [isResizing, setIsResizing] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    openFileDialog: () => {
      if (selected?.kind === 'overlay') fileInputRef.current?.click();
    },
  }), [selected?.kind]);

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

  // Load image preview when overlay clip is selected (use API URL so img src works in browser)
  useEffect(() => {
    if (selected?.kind === 'overlay' && projectId) {
      const overlay = selected as OverlayClip;
      const url = API_ENDPOINTS.serveProjectImage(projectId, overlay.assetId);
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
  }, [selected?.kind, selected?.id, (selected as OverlayClip)?.assetId, projectId]);

  const handleUploadImage = async (file: File) => {
    if (!selected || selected.kind !== 'overlay') return;

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('assetId', (selected as OverlayClip).assetId);

      const response = await fetch(API_ENDPOINTS.uploadProjectImage(projectId), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        onUpdateClip({ path: data.imagePath } as Partial<Clip>);
        // Use API URL for preview (cache-bust so new image shows)
        setImagePreview(`${API_ENDPOINTS.serveProjectImage(projectId, (selected as OverlayClip).assetId)}?t=${Date.now()}`);
        onProjectUpdate?.();
      }
    } catch (error) {
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUploadImage(file);
    }
  };

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
          Click a clip in the timeline (or an overlay in the preview) to edit. For image overlays, click the image clip in the Images track to upload or replace the image.
        </div>
      ) : (
        <div className="space-y-4">
          {/* When template (background) video clip is selected, show Video start control */}
          {showVideoStart && (
            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold mb-2">Background video</div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Start the background video this many seconds in. Audio length stays the same.
              </p>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Video start (s)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={videoStartInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setVideoStartInput(raw);
                    if (raw === '' || raw === '-') {
                      onVideoStartChange?.(0);
                      return;
                    }
                    const v = parseFloat(raw);
                    if (!Number.isNaN(v) && v >= 0) onVideoStartChange?.(v);
                  }}
                  onBlur={() => {
                    const v = parseFloat(videoStartInput);
                    if (videoStartInput === '' || Number.isNaN(v) || v < 0) {
                      setVideoStartInput('0');
                      onVideoStartChange?.(0);
                    } else {
                      setVideoStartInput(String(Math.max(0, v)));
                      onVideoStartChange?.(Math.max(0, v));
                    }
                  }}
                  className="w-full bg-muted border border-border rounded px-3 py-2 text-xs"
                />
              </div>
            </div>
          )}

          {/* When overlay clip is selected (e.g. from timeline), show Image Asset / upload first. Skip for template track. */}
          {selected.kind === 'overlay' && !isTemplateClip && (
            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold mb-3">Image Asset</div>
              
              {imagePreview ? (
                <div className="space-y-2">
                  <img 
                    src={imagePreview} 
                    alt="Overlay preview" 
                    className="w-full rounded border border-border bg-black/5"
                    onError={() => setImagePreview(null)}
                  />
                  <div className="text-[10px] text-muted-foreground">Image uploaded</div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="w-full px-3 py-2 text-xs bg-muted hover:bg-accent/10 border border-border rounded transition"
                  >
                    {uploadingImage ? 'Uploading...' : 'Replace Image'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-full h-32 rounded border-2 border-dashed border-border bg-muted/20 flex items-center justify-center text-muted-foreground text-xs">
                    No image uploaded
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="w-full px-3 py-2 text-xs bg-accent hover:bg-accent/90 text-white rounded transition disabled:opacity-50"
                  >
                    {uploadingImage ? 'Uploading...' : '📤 Upload Image'}
                  </button>
                </div>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              
              <div className="mt-3 text-[10px] text-muted-foreground">
                <div className="font-semibold mb-1">Asset ID: {(selected as OverlayClip).assetId}</div>
                <div>Label: {(selected as OverlayClip).label}</div>
              </div>
            </div>
          )}

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

          {(selected.kind === 'music' || selected.kind === 'sfx') && (
            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold mb-2">
                {selected.kind === 'music' ? 'Music' : 'SFX'}
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Audio file path</label>
                  <input
                    type="text"
                    value={selected.path || ''}
                    onChange={(e) => onUpdateClip({ path: e.target.value } as Partial<Clip>)}
                    className="w-full bg-muted border border-border rounded px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Volume (0 - 1)</label>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={selected.volume ?? 1}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const next = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
                      onUpdateClip({ volume: next } as Partial<Clip>);
                    }}
                    className="w-full bg-muted border border-border rounded px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

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
                Tip: use X/Y/Scale here to reposition and resize image overlays.
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

          {onDeleteClip && (
            <button
              type="button"
              onClick={() => {
                if (!selected || !selectedRef) return;
                if (window.confirm('Delete this clip from the timeline?')) {
                  onDeleteClip();
                }
              }}
              className="w-full px-3 py-2 text-xs font-semibold rounded border border-red-700 bg-red-600 text-white hover:bg-red-700 transition shadow-sm"
            >
              Delete clip
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default TextPropertiesPanel;
