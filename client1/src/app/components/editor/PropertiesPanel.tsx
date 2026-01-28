'use client';

import type { Clip, EditorProject, OverlayClip } from '../../../features/editor/types';

type Props = {
  selected: Clip | null;
};

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : String(n);
}

export default function PropertiesPanel({ selected }: Props) {
  return (
    <aside className="h-fit rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-strong)_68%,transparent)] p-3 shadow-[0_20px_50px_var(--shadow)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold tracking-tight">Properties</div>
          <div className="text-xs text-[var(--editor-muted)]">
            {selected ? 'Selected item' : 'Select something in timeline/preview'}
          </div>
        </div>
        {selected && (
          <span className="rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_6%,transparent)] px-2 py-1 text-[10px] text-[var(--editor-muted)]">
            {selected.kind}
          </span>
        )}
      </div>

      {!selected ? (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-black/20 p-3 text-xs text-[var(--editor-muted)]">
          Tip: click an overlay in Preview or a clip in Timeline.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-[var(--border)] bg-black/20 p-3">
            <div className="text-[11px] font-semibold text-[var(--editor-muted)]">Timing</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Start (s)" value={fmt(selected.start)} />
              <Field label="Duration (s)" value={fmt(selected.duration)} />
            </div>
          </div>

          {selected.kind === 'subtitle' && (
            <div className="rounded-xl border border-[var(--border)] bg-black/20 p-3">
              <div className="text-[11px] font-semibold text-[var(--editor-muted)]">Subtitle</div>
              <div className="mt-2 text-xs">
                <div className="text-[var(--editor-muted)]">Speaker</div>
                <div className="mt-1 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_5%,transparent)] px-3 py-2 font-medium">
                  {selected.speaker}
                </div>
                <div className="mt-3 text-[var(--editor-muted)]">Text</div>
                <div className="mt-1 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_5%,transparent)] px-3 py-2">
                  {selected.text}
                </div>
              </div>
            </div>
          )}

          {selected.kind === 'overlay' && <OverlayProps overlay={selected} />}

          {selected.kind === 'character' && (
            <div className="rounded-xl border border-[var(--border)] bg-black/20 p-3">
              <div className="text-[11px] font-semibold text-[var(--editor-muted)]">Character</div>
              <div className="mt-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_5%,transparent)] px-3 py-2 text-xs font-semibold">
                {selected.character}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Field label="X" value={fmt(selected.x)} />
                <Field label="Y" value={fmt(selected.y)} />
                <Field label="Scale" value={fmt(selected.scale)} />
              </div>
            </div>
          )}

          {selected.kind === 'audio' && (
            <div className="rounded-xl border border-[var(--border)] bg-black/20 p-3">
              <div className="text-[11px] font-semibold text-[var(--editor-muted)]">Audio</div>
              <div className="mt-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_5%,transparent)] px-3 py-2 text-xs font-semibold">
                {selected.label}
              </div>
              <div className="mt-3 text-xs text-[var(--editor-muted)]">
                Audio FX + background music will live here later.
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button className="flex-1 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_6%,transparent)] px-3 py-2 text-xs font-medium hover:bg-[color-mix(in_srgb,var(--editor-fg)_10%,transparent)]">
              Duplicate
            </button>
            <button className="flex-1 rounded-xl border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] px-3 py-2 text-xs font-semibold text-[color-mix(in_srgb,var(--danger)_85%,white)] hover:bg-[color-mix(in_srgb,var(--danger)_18%,transparent)]">
              Delete
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_5%,transparent)] px-3 py-2">
      <div className="text-[10px] font-semibold text-[var(--editor-muted)]">{label}</div>
      <div className="mt-1 text-xs font-semibold">{value}</div>
    </div>
  );
}

function OverlayProps({ overlay }: { overlay: OverlayClip }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-black/20 p-3">
      <div className="text-[11px] font-semibold text-[var(--editor-muted)]">Overlay</div>
      <div className="mt-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_5%,transparent)] px-3 py-2 text-xs font-semibold">
        {overlay.label}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Field label="X" value={fmt(overlay.x)} />
        <Field label="Y" value={fmt(overlay.y)} />
        <Field label="Scale" value={fmt(overlay.scale)} />
      </div>
      <div className="mt-3 text-xs text-[var(--editor-muted)]">
        Drag the overlay in Preview to update X/Y quickly.
      </div>
    </div>
  );
}

