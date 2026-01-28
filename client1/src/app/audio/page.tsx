'use client';

import AudioBrowser from '../components/AudioBrowser';

export default function AudioPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-[1600px] px-3 py-6 sm:px-4">
        <div className="max-w-6xl mx-auto">
          <AudioBrowser />
        </div>
      </div>
    </div>
  );
}
