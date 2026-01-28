'use client';

import Link from 'next/link';
import { useMemo } from 'react';

type MockProject = {
  id: string;
  name: string;
  durationSec: number;
  updatedAtLabel: string;
  templateLabel: string;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ProjectsPage() {
  const projects = useMemo<MockProject[]>(
    () => [
      { id: 'demo-001', name: 'FamilyGuy_TechChat_Edit', durationSec: 154, updatedAtLabel: '2 min ago', templateLabel: 'Minecraft (9:16)' },
      { id: 'demo-002', name: 'AI_Startup_Pitch', durationSec: 92, updatedAtLabel: '1 hr ago', templateLabel: 'SubwaySurfers (9:16)' },
      { id: 'demo-003', name: 'React_Hooks_Explained', durationSec: 188, updatedAtLabel: 'Yesterday', templateLabel: 'Abstract Gradient (image)' },
    ],
    []
  );

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-6 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Projects</div>
          <div className="mt-1 text-xs text-[var(--editor-muted)]">
            UI prototype. Next: template picker + audio session selection.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="studio-button-accent rounded-xl px-3 py-2 text-xs font-semibold shadow-[0_14px_32px_var(--shadow)]">
            New Project
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/editor/${p.id}`}
            className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-[0_18px_40px_var(--shadow)] transition hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] hover:bg-[color-mix(in_srgb,var(--card)_85%,black)]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium tracking-tight truncate">{p.name}</div>
              <div className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                {formatDuration(p.durationSec)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

