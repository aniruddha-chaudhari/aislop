'use client';

import { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../../config/api';

interface GeneratedVideo {
  filename: string;
  path: string;
  fileSize: number;
  createdAt: string;
  sessionId: string;
}

interface VideoListResponse {
  success: boolean;
  videos: GeneratedVideo[];
  error?: string;
}

export default function VideoBrowser() {
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(API_ENDPOINTS.videoList);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: VideoListResponse = await response.json();

      if (data.success) {
        setVideos(data.videos);
      } else {
        setError(data.error || 'Failed to fetch videos');
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
      setError('Failed to connect to server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const downloadVideo = (filename: string) => {
    const link = document.createElement('a');
    link.href = `${API_ENDPOINTS.downloadVideo}/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deleteVideo = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_ENDPOINTS.deleteVideo}/${filename}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setVideos(videos.filter(video => video.filename !== filename));
        setSuccess(`"${filename}" deleted successfully`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        throw new Error(data.error || 'Failed to delete video');
      }
    } catch (error) {
      console.error('Error deleting video:', error);
      setError('Failed to delete video. Please try again.');
    }
  };

  const cleanupOldVideos = async () => {
    if (!confirm('Are you sure you want to delete all videos older than 24 hours? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.cleanupVideos, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setSuccess(`Cleaned up ${data.deletedCount} old video files`);
        fetchVideos(); // Refresh the list
        setTimeout(() => setSuccess(''), 5000);
      } else {
        throw new Error(data.error || 'Failed to cleanup videos');
      }
    } catch (error) {
      console.error('Error cleaning up videos:', error);
      setError('Failed to cleanup videos. Please try again.');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="bg-[#2F3438] border border-[#787774]/20 rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#337EA9] border-t-transparent"></div>
          <span className="ml-3 text-[#F1F1EF]">Loading videos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#2F3438] border border-[#787774]/20 rounded-lg shadow-lg p-3 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h2 className="text-lg sm:text-2xl font-bold text-[#F1F1EF]">
          <span className="sm:hidden">🎥 Videos</span>
          <span className="hidden sm:inline">🎥 Generated Videos</span>
        </h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={cleanupOldVideos}
            className="px-3 py-2 bg-[#D9730D] hover:bg-[#D9730D]/80 text-[#F1F1EF] rounded-md transition-colors text-xs sm:text-sm"
            title="Delete videos older than 24 hours"
          >
            <span className="sm:hidden">🧹 Cleanup</span>
            <span className="hidden sm:inline">🧹 Cleanup Old</span>
          </button>
          <button
            onClick={fetchVideos}
            className="px-3 py-2 bg-[#337EA9] hover:bg-[#337EA9]/80 text-[#F1F1EF] rounded-md transition-colors text-xs sm:text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-[#FDEBEC] border border-[#D44C47]/20 rounded-md">
          <p className="text-[#D44C47]">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-[#EDF3EC] border border-[#448361]/20 rounded-md">
          <p className="text-[#448361]">{success}</p>
        </div>
      )}

      {videos.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-[#787774] text-6xl mb-4">🎬</div>
          <h3 className="text-lg font-semibold text-[#F1F1EF] mb-2">
            No videos found
          </h3>
          <p className="text-[#787774] mb-4">
            Generate some videos with subtitles to see them here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[#787774] mb-4">
            Found {videos.length} generated video{videos.length !== 1 ? 's' : ''}
          </p>

          {videos.map((video) => (
            <div
              key={video.filename}
              className="border border-[#787774]/30 bg-[#2F3438] rounded-lg p-3 sm:p-4 hover:bg-[#3F4448] transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start space-x-3 mb-2">
                    <span className="text-xl sm:text-2xl flex-shrink-0">🎬</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-[#F1F1EF] text-sm sm:text-base truncate">
                        {video.filename.length > 30 ? `${video.filename.substring(0, 30)}...` : video.filename}
                      </h3>
                      <div className="text-xs sm:text-sm text-[#787774] space-y-1">
                        <p>Size: {formatFileSize(video.fileSize)}</p>
                        <p>Created: {formatDate(video.createdAt)}</p>
                        <p className="truncate">Session: {video.sessionId}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                  <button
                    onClick={() => downloadVideo(video.filename)}
                    className="px-3 py-2 bg-[#337EA9] hover:bg-[#337EA9]/80 text-[#F1F1EF] rounded-md transition-colors flex items-center justify-center text-xs sm:text-sm"
                    title="Download video"
                  >
                    <span className="sm:hidden">⬇️</span>
                    <span className="hidden sm:inline">⬇️ Download</span>
                  </button>
                  <button
                    onClick={() => deleteVideo(video.filename)}
                    className="px-3 py-2 bg-[#D44C47] hover:bg-[#D44C47]/80 text-[#F1F1EF] rounded-md transition-colors flex items-center justify-center text-xs sm:text-sm"
                    title="Delete video"
                  >
                    <span className="sm:hidden">🗑️</span>
                    <span className="hidden sm:inline">🗑️ Delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
