'use client';

import { useMemo, useRef } from 'react';
import type { Clip, EditorProject, Track } from '../../../features/editor/types';

type Props = {
  project: EditorProject;
  tracks: Track[];
  playhead: number;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  onPlayheadChange: (t: number) => void;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function trackIcon(type: Track['type']): string {
  switch (type) {
    case 'audio':
      return '🎵';
    case 'subtitle':
      return '📝';
    case 'overlay':
      return '🖼️';
    case 'character':
      return '🧍';
    default:
      return '•';
  }
}

function clipLabel(c: Clip): string {
  if (c.kind === 'subtitle') return c.speaker;
  if (c.kind === 'overlay') return c.label;
  if (c.kind === 'character') return c.character;
  return c.label;
}

function clipBackground(kind: Clip['kind']): string {
  // Flat timeline color language:
  // video/overlay→blue, audio→teal, subtitles→purple, characters→gray.
  switch (kind) {
    case 'audio':
      return 'var(--studio-teal)';
    case 'subtitle':
      return 'oklch(0.6 0 0)'; // mid gray for text lanes
    case 'overlay':
      return 'var(--studio-blue)';
    case 'character':
      return 'oklch(0.5 0 0)'; // slightly lighter gray
  }
  return 'oklch(0.5 0 0)';
}

export default function TimelinePanel({
  project,
  tracks,
  playhead,
  selectedClipId,
  onSelectClip,
  onPlayheadChange,
}: Props) {
  const railRef = useRef<HTMLDivElement | null>(null);

  const ticks = useMemo(() => {
    const total = project.duration;
    const step = total <= 60 ? 5 : 10;
    const out: number[] = [];
    for (let t = 0; t <= total + 0.0001; t += step) out.push(t);
    return out;
  }, [project.duration]);

  const onClickRail = (e: React.MouseEvent) => {
    const el = railRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    onPlayheadChange(ratio * project.duration);
  };

  const playheadLeft = (playhead / project.duration) * 100;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-strong)_68%,transparent)] p-3 shadow-[0_20px_50px_var(--shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold tracking-tight">Timeline</div>
          <div className="text-xs text-[var(--editor-muted)]">
            {fmt(playhead)} / {fmt(project.duration)} · click to move playhead
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_6%,transparent)] px-3 py-2 text-xs font-medium hover:bg-[color-mix(in_srgb,var(--editor-fg)_10%,transparent)]">
            Play
          </button>
          <button className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_6%,transparent)] px-3 py-2 text-xs font-medium hover:bg-[color-mix(in_srgb,var(--editor-fg)_10%,transparent)]">
            Split
          </button>
          <button className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_6%,transparent)] px-3 py-2 text-xs font-medium hover:bg-[color-mix(in_srgb,var(--editor-fg)_10%,transparent)]">
            Delete
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--editor-muted)]">
          <span>00:00</span>
          <span>00:{Math.round(project.duration)}</span>
        </div>

        <div
          ref={railRef}
          className="relative rounded-2xl border border-[var(--border)] bg-black/20 p-3"
          onClick={onClickRail}
        >
          {/* ticks */}
          <div className="relative h-6">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${(t / project.duration) * 100}%` }}
              >
                <div className="h-3 w-px bg-white/15" />
                <div className="mt-1 text-[10px] text-white/45">{t}</div>
              </div>
            ))}
          </div>

          {/* playhead */}
          <div
            className="absolute top-0 z-10 h-full w-px bg-[var(--accent-2)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-2)_16%,transparent)]"
            style={{ left: `${playheadLeft}%` }}
          />

          <div className="mt-3 grid gap-2">
            {tracks.map((t) => (
              <div key={t.id} className="grid grid-cols-[140px_1fr] gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_5%,transparent)] px-3 py-2">
                  <span className="text-sm">{trackIcon(t.type)}</span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">{t.name}</div>
                    <div className="truncate text-[10px] text-[var(--editor-muted)]">
                      {t.locked ? 'locked' : 'editable'}
                    </div>
                  </div>
                </div>

                <div className="relative h-12 rounded-xl border border-[var(--border)] bg-black/15">
                  {t.clips.map((c) => {
                    const left = (c.start / project.duration) * 100;
                    const width = (c.duration / project.duration) * 100;
                    const selected = selectedClipId === c.id;
                    const bg = clipBackground(c.kind);

                    return (
                      <button
                        key={c.id}
                        className={[
                          'absolute top-1/2 -translate-y-1/2 truncate rounded-lg border px-2 py-1 text-[10px] font-semibold text-white/85 shadow-[0_12px_35px_var(--shadow)]',
                          'hover:opacity-95',
                          selected
                            ? 'border-[color-mix(in_srgb,var(--accent-2)_60%,transparent)] ring-2 ring-[color-mix(in_srgb,var(--accent-2)_22%,transparent)]'
                            : 'border-[var(--border)]',
                        ].join(' ')}
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(width, 2)}%`,
                          background: bg,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectClip(c.id);
                        }}
                        title={`${clipLabel(c)} • start ${c.start}s • dur ${c.duration}s`}
                      >
                        <span className="pointer-events-none">
                          {clipLabel(c)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

