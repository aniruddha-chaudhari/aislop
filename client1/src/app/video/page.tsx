'use client';

import VideoGenerator from '../components/VideoGenerator';
import VideoBrowser from '../components/VideoBrowser';

export default function VideoPage() {
  return (
    <div className="min-h-screen bg-[#2F3438]">
      <div className="w-full px-2 py-2">
        <div className="w-full mx-auto space-y-4">
          {/* Video Generator */}
          <VideoGenerator />

          {/* Video Browser */}
          <VideoBrowser />
        </div>
      </div>
    </div>
  );
}
