export default function LibraryPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-3 py-6 sm:px-4">
      <div className="mb-4">
        <div className="text-sm font-semibold">Audio Library</div>
        <div className="text-xs text-[var(--editor-muted)]">
          Placeholder for now (UI-only). We’ll port the existing Audio Browser here next.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-strong)_78%,transparent)] p-4 shadow-[0_20px_50px_var(--shadow)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Session #{100 + i}</div>
                <div className="mt-1 text-xs text-[var(--editor-muted)]">Duration: 02:{10 + i}</div>
              </div>
              <span className="rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_6%,transparent)] px-2 py-1 text-[10px] text-[var(--editor-muted)]">
                mock
              </span>
            </div>
            <div className="mt-3 h-10 rounded-xl bg-[var(--secondary)]" />
            <div className="mt-3 flex items-center justify-between text-xs">
              <button className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--editor-fg)_6%,transparent)] px-3 py-2 text-[var(--editor-fg)] hover:bg-[color-mix(in_srgb,var(--editor-fg)_10%,transparent)]">
                Open
              </button>
              <div className="text-[var(--editor-muted)]">Updated just now</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

