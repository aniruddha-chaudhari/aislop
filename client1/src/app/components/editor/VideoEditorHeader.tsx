'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  projectName: string;
  onExport?: () => void;
  onGenerateAiDraft?: () => void;
  onSave?: () => void;
  onBack?: () => void;
  backHref?: string;
  hasTimeline?: boolean;
  isGenerating?: boolean;
  isExporting?: boolean;
};

export default function VideoEditorHeader({
  projectName,
  onExport,
  onGenerateAiDraft,
  onSave,
  onBack,
  backHref = '/projects',
  hasTimeline = false,
  isGenerating = false,
  isExporting = false,
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
        {!hasTimeline && onGenerateAiDraft && (
          <button
            onClick={onGenerateAiDraft}
            disabled={isGenerating}
            className="h-8 px-3 rounded-md bg-blue-600 text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Generate AI Draft'}
          </button>
        )}
        {hasTimeline && onSave && (
          <button
            onClick={onSave}
            className="h-8 px-3 rounded-md bg-muted text-sm font-medium hover:opacity-90 transition"
          >
            Save
          </button>
        )}
        {hasTimeline && onExport && (
          <button
            onClick={onExport}
            disabled={isExporting}
            className="h-8 px-3 rounded-md bg-accent text-card text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        )}
      </div>
    </div>
  );
}
