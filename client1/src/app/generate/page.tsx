 'use client';

import ConversationGenerator from '../components/ConversationGenerator';

export default function GeneratePage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-[1600px] px-3 py-6 sm:px-4">
        <div className="mx-auto max-w-6xl">
          <ConversationGenerator />
        </div>
      </div>
    </div>
  );
}
