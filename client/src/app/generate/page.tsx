'use client';

import ConversationGenerator from '../components/ConversationGenerator';

export default function GeneratePage() {
  return (
    <div className="min-h-screen bg-[#2F3438]">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="max-w-6xl mx-auto">
          <ConversationGenerator />
        </div>
      </div>
    </div>
  );
}
