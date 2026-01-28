'use client';

import type { EditorProject } from '../../../features/editor/types';

type Props = {
  project: EditorProject;
};

// Minimal stub – replace with your new preview UI.
export default function PreviewPanel({ project }: Props) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-card text-xs text-muted-foreground">
      PreviewPanel WIP for template: {project.template.label}
    </div>
  );
}

