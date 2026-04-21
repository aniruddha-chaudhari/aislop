'use client';

import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import type { Clip, ClipRef, EditorProject, OverlayClip } from '../../../features/editor/types';
import { voiceDisplayName } from '../../../features/editor/voiceDisplayName';
import { API_ENDPOINTS } from '../../../config/api';

export type TextPropertiesPanelHandle = {
  openFileDialog: () => void;
};

const TEMPLATE_TRACK_ID = 't_overlay_template';

/** Shown between moment content and the model prompt when combining for editing. */
const ANIMATION_PROMPT_SEPARATOR = '\n\n---\n\n';

function combineAnimationContentAndPrompt(overlay: OverlayClip): string {
  const content = (overlay.animationContent || '').trim();
  const prompt = (overlay.promptText || '').trim();
  if (overlay.promptEdited) {
    return overlay.promptText ?? '';
  }
  if (content && prompt) {
    return `${content}${ANIMATION_PROMPT_SEPARATOR}${prompt}`;
  }
  return content || prompt || '';
}

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
  onGenerateAnimationClip?: (momentId: string) => Promise<void> | void;
  generatingAnimationMomentId?: string | null;
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
  onGenerateAnimationClip,
  generatingAnimationMomentId,
}, ref) {
  const isTemplateClip = selectedRef?.trackId === TEMPLATE_TRACK_ID && selected?.kind === 'overlay';
  const selectedOverlay = selected?.kind === 'overlay' ? (selected as OverlayClip) : null;
  const isAnimationOverlayClip = Boolean(selectedOverlay?.animationMomentId);
  const planStatus = selectedOverlay?.planStatus ?? 'draft';
  const isDraftAnimationClip = isAnimationOverlayClip && planStatus === 'draft';
  const isApprovedAnimationClip = isAnimationOverlayClip && planStatus === 'approved';
  const selectedMomentId = selectedOverlay?.animationMomentId?.trim() || '';
  const isGeneratingSelectedAnimationClip = Boolean(
    selectedMomentId &&
      generatingAnimationMomentId &&
      selectedMomentId === generatingAnimationMomentId
  );
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
  const [removingImage, setRemovingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [overlayPreviewIsVideo, setOverlayPreviewIsVideo] = useState(false);
  const [copiedField, setCopiedField] = useState<'prompt' | 'context' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = async (field: 'prompt' | 'context', text: string) => {
    const value = (text || '').trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1200);
    } catch {
      // no-op
    }
  };

  const buildFullContextPayload = (): string => {
    if (!selectedOverlay) return '';
    const dialogue = (selectedOverlay.fullDialogueContext || '').trim();
    const research = (selectedOverlay.researchContext || '').trim();
    const moment = (selectedOverlay.animationContextSummary || '').trim();
    const blocks: string[] = [];
    if (dialogue) blocks.push(`DIALOGUE_CONTEXT:\n${dialogue}`);
    if (research) blocks.push(`RESEARCH_CONTEXT:\n${research}`);
    if (moment) blocks.push(`MOMENT_CONTEXT:\n${moment}`);
    return blocks.join('\n\n');
  };

  useImperativeHandle(ref, () => ({
    openFileDialog: () => {
      if (selected?.kind === 'overlay' && !isAnimationOverlayClip) fileInputRef.current?.click();
    },
  }), [selected?.kind, isAnimationOverlayClip]);

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

  // Load overlay preview URL; video vs image from saved path (export/upload writes extension).
  useEffect(() => {
    if (selected?.kind === 'overlay' && projectId && !isAnimationOverlayClip) {
      const overlay = selected as OverlayClip;
      const url = API_ENDPOINTS.serveProjectImage(projectId, overlay.assetId);
      setImagePreview(url);
      const p = overlay.path || '';
      setOverlayPreviewIsVideo(/\.(mp4|webm|mov|m4v)$/i.test(p));
    } else {
      setImagePreview(null);
      setOverlayPreviewIsVideo(false);
    }
  }, [selected?.kind, selected?.id, selectedOverlay?.assetId, selectedOverlay?.path, projectId, isAnimationOverlayClip]);

  const handleUploadImage = async (file: File) => {
    if (!selected || selected.kind !== 'overlay' || isAnimationOverlayClip) return;

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
        const isVid =
          data.assetKind === 'video' ||
          (typeof data.filename === 'string' && /\.(mp4|webm|mov|m4v)$/i.test(data.filename));
        setOverlayPreviewIsVideo(!!isVid);
        setImagePreview(`${API_ENDPOINTS.serveProjectImage(projectId, (selected as OverlayClip).assetId)}?t=${Date.now()}`);
        onProjectUpdate?.();
      }
    } catch (error) {
      alert('Failed to upload media');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    if (!selected || selected.kind !== 'overlay' || isTemplateClip || isAnimationOverlayClip) return;
    const overlay = selected as OverlayClip;
    if (!window.confirm('Remove this media from the overlay? The clip stays; you can upload a new file later.')) return;
    setRemovingImage(true);
    try {
      const response = await fetch(API_ENDPOINTS.deleteProjectImage(projectId, overlay.assetId), {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to remove media');
      onUpdateClip({ path: undefined } as Partial<Clip>);
      setImagePreview(null);
      setOverlayPreviewIsVideo(false);
      onProjectUpdate?.();
    } catch {
      setRemovingImage(false);
      window.alert('Failed to remove media. Please try again.');
      return;
    }
    setRemovingImage(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUploadImage(file);
    }
  };

  useEffect(() => {
    if (!selected || selected.kind !== 'overlay' || isTemplateClip || isAnimationOverlayClip) return;

    const handlePaste = (event: ClipboardEvent) => {
      if (uploadingImage) return;
      const items = event.clipboardData?.items;
      if (!items || items.length === 0) return;

      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) return;
          event.preventDefault();
          void handleUploadImage(file);
          return;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [selected, isTemplateClip, isAnimationOverlayClip, uploadingImage, projectId]);

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
          Click a clip in the timeline to edit it. Draft animation clips expose their animation prompt here; clip-plan overlays let you upload images or short videos here.
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

          {/* When overlay clip is selected (e.g. from timeline), show media upload. Skip for template track. */}
          {selected.kind === 'overlay' && !isTemplateClip && !isAnimationOverlayClip && (
            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold mb-3">Clip media</div>
              
              {imagePreview ? (
                <div className="space-y-2">
                  {overlayPreviewIsVideo ? (
                    <video
                      src={imagePreview}
                      className="w-full rounded border border-border bg-black"
                      controls
                      muted
                      playsInline
                      onError={() => setImagePreview(null)}
                    />
                  ) : (
                    <img 
                      src={imagePreview} 
                      alt="Overlay preview" 
                      className="w-full rounded border border-border bg-black/5"
                      onError={() => setImagePreview(null)}
                    />
                  )}
                  <div className="text-[10px] text-muted-foreground">
                    {overlayPreviewIsVideo ? 'Video uploaded' : 'Image uploaded'}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="px-3 py-2 text-xs bg-muted hover:bg-accent/10 border border-border rounded transition"
                    >
                      {uploadingImage ? 'Uploading...' : 'Replace'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      disabled={removingImage}
                      className="px-3 py-2 text-xs font-medium rounded border border-red-700/50 bg-red-600/15 text-red-700 hover:bg-red-600/25 transition disabled:opacity-50"
                    >
                      {removingImage ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-full h-32 rounded border-2 border-dashed border-border bg-muted/20 flex items-center justify-center text-muted-foreground text-xs">
                    No image or video uploaded
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="w-full px-3 py-2 text-xs bg-accent hover:bg-accent/90 text-white rounded transition disabled:opacity-50"
                  >
                    {uploadingImage ? 'Uploading...' : '📤 Upload image or video'}
                  </button>
                </div>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v"
                onChange={handleFileChange}
                className="hidden"
              />
              
              <div className="mt-3 text-[10px] text-muted-foreground">
                <div className="font-semibold mb-1">Asset ID: {selectedOverlay?.assetId}</div>
                <div>Label: {selectedOverlay?.label}</div>
                <div className="mt-2">Tip: copy an image and press Ctrl/Cmd+V to paste it directly into this clip.</div>
              </div>
            </div>
          )}

          {isAnimationOverlayClip && (
            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold">
                  {isDraftAnimationClip ? 'Draft Animation Review' : 'Animation Prompt Trace'}
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded border ${
                    isDraftAnimationClip
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {isDraftAnimationClip ? 'Draft' : 'Approved'}
                </span>
              </div>
              {isDraftAnimationClip && onGenerateAnimationClip && selectedMomentId && (
                <button
                  type="button"
                  disabled={isGeneratingSelectedAnimationClip}
                  onClick={() => void onGenerateAnimationClip(selectedMomentId)}
                  className="mt-3 w-full px-3 py-2 text-xs font-semibold rounded border border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {isGeneratingSelectedAnimationClip ? 'Generating clip...' : 'Generate this clip'}
                </button>
              )}
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs text-muted-foreground block">
                    Moment content and animation prompt
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        'prompt',
                        selectedOverlay ? combineAnimationContentAndPrompt(selectedOverlay) : ''
                      )
                    }
                    className="text-[10px] px-2 py-0.5 rounded border border-border bg-muted hover:bg-accent/10"
                  >
                    {copiedField === 'prompt' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <textarea
                  value={
                    selectedOverlay
                      ? combineAnimationContentAndPrompt(selectedOverlay)
                      : ''
                  }
                  disabled={isApprovedAnimationClip}
                  placeholder={
                    isDraftAnimationClip
                      ? 'Moment content appears above the separator (---); refine or extend the full prompt below.'
                      : undefined
                  }
                  onChange={(e) =>
                    onUpdateClip({
                      promptText: e.target.value,
                      promptEdited: true,
                    } as Partial<Clip>)
                  }
                  onBlur={() => {
                    if (!isDraftAnimationClip || !selectedOverlay || selectedOverlay.promptEdited) return;
                    const content = (selectedOverlay.animationContent || '').trim();
                    const prompt = (selectedOverlay.promptText || '').trim();
                    const combined = [content, prompt].filter(Boolean).join(ANIMATION_PROMPT_SEPARATOR);
                    if (!combined.trim()) return;
                    if (combined !== prompt) {
                      onUpdateClip({
                        promptText: combined,
                        promptEdited: true,
                      } as Partial<Clip>);
                    }
                  }}
                  className="w-full min-h-[160px] bg-muted border border-border rounded px-3 py-2 text-xs font-mono leading-relaxed"
                />
                {isDraftAnimationClip ? (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Moment <span className="text-foreground/80">content</span> and{' '}
                    <span className="text-foreground/80">prompt</span> are in one field so you can add context. A line
                    with only <code className="text-[10px]">---</code> separates the two until you edit—then the whole
                    box is saved as your prompt. Timing stays locked for this review pass.
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Prompt is read-only after approval.
                  </div>
                )}
              </div>
              <div className="mt-3 rounded border border-border bg-muted/40 p-2 space-y-1 text-[11px]">
                <div><span className="text-muted-foreground">Moment:</span> {selectedOverlay?.animationMomentId}</div>
                <div><span className="text-muted-foreground">Type:</span> {selectedOverlay?.animationType || 'n/a'}</div>
                <div><span className="text-muted-foreground">Subtitle:</span> {selectedOverlay?.animationSubtitle || 'n/a'}</div>
                <div className="flex items-start justify-between gap-2">
                  <div><span className="text-muted-foreground">Context:</span> {selectedOverlay?.animationContextSummary || 'n/a'}</div>
                  <button
                    type="button"
                    onClick={() => handleCopy('context', buildFullContextPayload())}
                    className="shrink-0 text-[10px] px-2 py-0.5 rounded border border-border bg-muted hover:bg-accent/10"
                  >
                    {copiedField === 'context' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div><span className="text-muted-foreground">Edited:</span> {selectedOverlay?.promptEdited ? 'Yes' : 'No'}</div>
              </div>
            </div>
          )}

          <div className="rounded border border-border bg-muted/30 p-3">
            <div className="text-xs font-semibold mb-2">Timing</div>
            {isAnimationOverlayClip ? (
              <div className="space-y-1 text-[11px]">
                <div><span className="text-muted-foreground">Start:</span> {selected.start.toFixed(2)}s</div>
                <div><span className="text-muted-foreground">Duration:</span> {selected.duration.toFixed(2)}s</div>
                <div className="text-muted-foreground">Timing is read-only for animation plan review.</div>
              </div>
            ) : (
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
            )}
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

          {(selected.kind === 'overlay' || selected.kind === 'character') && !isAnimationOverlayClip && (
            <div className="rounded border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold mb-2">Transform</div>
              {selected.kind === 'overlay' && (
                <div className="mb-3">
                  <label className="text-xs text-muted-foreground mb-1 block">Display mode</label>
                  <select
                    value={(selected as OverlayClip).displayMode ?? 'overlay'}
                    onChange={(e) =>
                      onUpdateClip({ displayMode: e.target.value as OverlayClip['displayMode'] } as Partial<Clip>)
                    }
                    className="w-full bg-muted border border-border rounded px-3 py-2 text-xs"
                  >
                    <option value="overlay">Overlay</option>
                    <option value="replace">Replace</option>
                  </select>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Overlay keeps the template visible behind the clip. Replace swaps the full frame for clip duration.
                  </div>
                </div>
              )}
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
                    onChange={(e) => onUpdateClip({ scale: Math.max(0.2, Number(e.target.value)) } as Partial<Clip>)}
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
              <div className="mt-1 text-xs font-semibold">{voiceDisplayName(selected.speaker)}</div>
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
