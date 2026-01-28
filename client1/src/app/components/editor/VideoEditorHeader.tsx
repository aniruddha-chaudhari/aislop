'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  projectName: string;
  onExport?: () => void;
  onBack?: () => void;
  backHref?: string;
};

export default function VideoEditorHeader({
  projectName,
  onExport,
  onBack,
  backHref = '/projects',
}: Props) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) return onBack();
    if (backHref) return router.push(backHref);
    router.back();
  };

  return (
    <div className="h-12 bg-card border-b border-border flex items-center justify-between px-3 sm:px-4 gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={handleBack}
          className="p-1.5 rounded-md hover:bg-muted transition"
          aria-label="Back to Projects"
          title="Back to Projects"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{projectName}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onExport}
          disabled={!onExport}
          className="h-8 px-3 rounded-md bg-accent text-card text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Export
        </button>
      </div>
    </div>
  );
}
