'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';
import type { CharacterClip, Clip, ClipRef, EditorProject, OverlayClip, SubtitleClip } from '../../../features/editor/types';

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
};

export default function CanvasPreview({
  project,
  isPlaying,
  playheadTime,
  duration,
  volume,
  onPlayPause,
  onVolumeChange,
  selected,
  onSelectClip,
  onUpdateClip,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    ref: ClipRef;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

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

  const resolveOverlaySrc = (assetId: string): string => {
    // No real assets wired yet; map to built-in public svgs so <img> exists.
    if (assetId.includes('02')) return '/globe.svg';
    if (assetId.includes('01')) return '/file.svg';
    return '/window.svg';
  };

  const resolveCharacterSrc = (character: CharacterClip['character']): string => {
    return character === 'Stewie' ? '/vercel.svg' : '/next.svg';
  };

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

  // Keep <video> in sync with playhead and playback state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, Math.min(1, volume / 100));
  }, [volume]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Avoid thrashing currentTime.
    if (Number.isFinite(playheadTime) && Math.abs(v.currentTime - playheadTime) > 0.05) {
      try {
        v.currentTime = playheadTime;
      } catch {
        // ignore for unsupported states
      }
    }
  }, [playheadTime]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      // If there's no src, play() may reject; that's fine.
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying]);

  return (
    <div className="flex-1 bg-black flex flex-col items-center justify-center relative overflow-hidden min-h-0">
      {/* Preview area: same height as panel; 9:16 frame centered, pillarboxed */}
      <div className="w-full h-full flex items-center justify-center relative">
        {/* 9:16 video frame — height fills panel, width = height * 9/16 */}
        <div
          ref={frameRef}
          className="h-full w-auto aspect-[9/16] max-w-full flex items-center justify-center relative shrink-0 bg-[var(--card)]"
          style={{ minWidth: 0 }}
          onPointerDown={() => {
            // click empty space clears selection
            onSelectClip(null);
          }}
        >
          {/* Template background (Phase 2) */}
          <div className="absolute inset-0">
            {project.template.type === 'video' ? (
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                src={project.template.src}
                poster={project.template.posterSrc}
                muted
                playsInline
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="absolute inset-0 h-full w-full object-cover"
                src={project.template.src ?? '/next.svg'}
                alt={project.template.label}
              />
            )}

            {/* Fallback visual if no template src */}
            {!project.template.src && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-[80%] aspect-square max-w-[min(60%,80vw)] flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-500 via-yellow-400 to-blue-500 opacity-80 blur-2xl" />
                  <div className="relative w-full aspect-square rounded-full bg-gradient-to-br from-blue-600 via-cyan-500 to-orange-600 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Overlays (Phase 2) */}
          <div className="absolute inset-0 z-10">
            {activeOverlays.map(({ ref, clip: o }) => {
              const isSelected = selected?.trackId === ref.trackId && selected?.clipId === ref.clipId;
              return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={o.id}
                src={resolveOverlaySrc(o.assetId)}
                alt={o.label}
                className={[
                  'absolute select-none drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)]',
                  isSelected ? 'ring-2 ring-accent rounded' : '',
                ].join(' ')}
                style={{
                  left: `${o.x * 100}%`,
                  top: `${o.y * 100}%`,
                  transform: `translate(-50%, -50%) scale(${o.scale})`,
                  transformOrigin: 'center',
                  width: '40%',
                  maxWidth: 260,
                  height: 'auto',
                  opacity: 0.95,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectClip(ref);
                  // drag only when selected (after selecting), so first click selects, second drags
                  if (!isSelected) return;
                  (e.currentTarget as HTMLImageElement).setPointerCapture(e.pointerId);
                  dragRef.current = {
                    ref,
                    startX: e.clientX,
                    startY: e.clientY,
                    originX: o.x,
                    originY: o.y,
                  };
                  window.addEventListener('pointermove', onPointerMove);
                  window.addEventListener('pointerup', onPointerUp);
                }}
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

          {/* 9:16 badge */}
          <div className="absolute bottom-2 left-2 text-xs text-accent bg-black/50 px-2 py-1 rounded">
            9:16
          </div>

          {/* Playhead time display */}
          <div className="absolute bottom-2 right-2 text-xs text-accent font-mono bg-black/50 px-2 py-1 rounded">
            {formatTime(playheadTime)} / {formatTime(duration)}
          </div>

          {/* Play button overlay */}
          <button
            onClick={onPlayPause}
            className="absolute bottom-10 right-1/2 translate-x-1/2 w-12 h-12 rounded-full bg-accent text-card flex items-center justify-center hover:scale-110 transition z-20"
          >
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
          </button>

          {/* Volume */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 bg-black/50 px-2 py-3 rounded-lg z-20">
            <Volume2 size={14} className="text-accent" />
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="w-1 h-16 accent-accent rotate-180 cursor-pointer"
            />
            <span className="text-[10px] text-muted-foreground">{volume}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
