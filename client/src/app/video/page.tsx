'use client';

import VideoGenerator from '../components/VideoGenerator';
import VideoBrowser from '../components/VideoBrowser';

export default function VideoPage() {
  return (
    <div className="min-h-screen bg-[#2F3438]">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Video Generator */}
          <VideoGenerator />

          {/* Video Browser */}
          <VideoBrowser />
        </div>
      </div>
    </div>
  );
}
