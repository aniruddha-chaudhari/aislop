'use client';

import { useState, useEffect } from 'react';
import { API_ENDPOINTS, API_BASE_URL } from '../../config/api';
import FileUploader from './FileUploader';
import ImageUpload from './ImageUpload';
import ImageAnalysisReview from './ImageAnalysisReview';

interface AudioSession {
  sessionId: string;
  name?: string;
  createdAt: string;
  stats: {
    totalDialogues: number;
    audioFilesGenerated: number;
    allSuccessful: boolean;
  };
  dialogues: Array<{
    id: string;
    text: string;
    character: string;
    order: number;
    audioFile: {
      id: string;
      filename: string;
      path: string;
      fileSize: number;
      generatedAt: string;
    } | null;
  }>;
}

interface VideoGenerationResponse {
  success: boolean;
  message?: string;
  videoPath?: string;
  videoFile?: {
    filename: string;
    path: string;
    fileSize: number;
    sessionId: string;
  };
  stats?: {
    totalDialogues: number;
    videoDuration: string;
    aspectRatio: string;
  };
  error?: string;
}

interface TemplateVideo {
  filename: string;
  path: string;
  fileSize: number;
  createdAt: string;
  modifiedAt: string;
}

interface UserProvidedImage {
  id: string;
  imagePath: string;
  label: string;
  description?: string;
  preferredTimestamp?: number;
  priority?: 'high' | 'medium' | 'low';
}

interface UserImageSuggestion {
  userImageId: string;
  userImageLabel: string;
  suggestedTimestamp: number;
  dialogueIndex: number;
  dialogueText: string;
  character: string;
  reasoning: string;
  relevanceScore: number;
  suggestedDuration: number;
  alternativePlacements: Array<{
    timestamp: number;
    dialogueIndex: number;
    reasoning: string;
    score: number;
  }>;
}

export default function VideoGenerator() {
  const [sessions, setSessions] = useState<AudioSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [backgroundVideo, setBackgroundVideo] = useState<File | null>(null);
  const [backgroundVideoPath, setBackgroundVideoPath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [generatedVideo, setGeneratedVideo] = useState<VideoGenerationResponse['videoFile'] | null>(null);
  const [templateVideos, setTemplateVideos] = useState<TemplateVideo[]>([]);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  // New workflow states
  const [currentStep, setCurrentStep] = useState<'select' | 'upload-images' | 'review-analysis' | 'generating-video'>('select');
  const [userImages, setUserImages] = useState<UserProvidedImage[]>([]);
  const [approvedUserImagePlacements, setApprovedUserImagePlacements] = useState<UserImageSuggestion[]>([]);
  const [topic, setTopic] = useState<string>('');

  useEffect(() => {
    fetchAudioSessions();
    fetchTemplateVideos();
  }, []);

  const fetchAudioSessions = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(API_ENDPOINTS.audio);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setSessions(data.sessions);
      }
    } catch (error) {
      setError('Failed to fetch audio sessions');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplateVideos = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.templateVideos);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        setTemplateVideos(data.videos);
      }
    } catch (error) {
    }
  };

  const handlePathInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const path = event.target.value;
    setBackgroundVideoPath(path);
    setBackgroundVideo(null);
    setError('');
  };

  const handleTemplateSelect = (templatePath: string) => {
    setBackgroundVideoPath(templatePath);
    setBackgroundVideo(null);
    setError('');
  };

  const uploadTemplateVideo = async (file: File) => {
    setUploadingTemplate(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('video', file);

      const response = await fetch(API_ENDPOINTS.uploadTemplateVideo, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setSuccess('Template video uploaded successfully!');
        fetchTemplateVideos();
        setBackgroundVideoPath(data.video.path);
        setBackgroundVideo(null);
      } else {
        throw new Error(data.error || 'Failed to upload video');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to upload video');
    } finally {
      setUploadingTemplate(false);
    }
  };

  const downloadVideo = async (filename: string) => {
    try {
      const link = document.createElement('a');
      link.href = `${API_BASE_URL}/api/video/download/${filename}`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      setError('Failed to download video');
    }
  };

  const resetWorkflow = () => {
    setCurrentStep('select');
    setError('');
    setSuccess('');
    setProgress('');
    setGeneratedVideo(null);
    setUserImages([]);
    setApprovedUserImagePlacements([]);
    setSelectedSession('');
    setTopic('');
  };

  const handleAnalyzeImages = () => {
    if (userImages.length === 0) {
      setError('Please upload images first before analyzing');
      return;
    }
    setCurrentStep('review-analysis');
  };

  const handleApprovalComplete = (approvedPlacements: UserImageSuggestion[]) => {
    setApprovedUserImagePlacements(approvedPlacements);
    setCurrentStep('generating-video');
    generateVideoWithApprovedImages(approvedPlacements);
  };

  const generateVideoWithApprovedImages = async (approvedPlacements: UserImageSuggestion[]) => {
    if (!selectedSession || !backgroundVideoPath) {
      setError('Please select a session and background video');
      return;
    }

    setGenerating(true);
    setError('');
    setProgress('Generating video with approved image placements...');

    try {
      const response = await fetch(API_ENDPOINTS.generateVideo, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: selectedSession,
          backgroundVideoPath: backgroundVideoPath,
          userImages: userImages,
          approvedUserImagePlacements: approvedPlacements
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate video');
      }

      const data: VideoGenerationResponse = await response.json();

      if (data.success) {
        setGeneratedVideo(data.videoFile || null);
        setSuccess(`Video generated successfully! ${approvedPlacements.length} images included.`);
        setProgress('');
      } else {
        throw new Error(data.error || 'Video generation failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to generate video');
      setProgress('');
    } finally {
      setGenerating(false);
    }
  };

  const handleBackToUpload = () => {
    setCurrentStep('upload-images');
    setApprovedUserImagePlacements([]);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading audio sessions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          🎬 Video Generator with Image Analysis
        </h2>
        <div className="flex gap-2">
          <button
            onClick={fetchAudioSessions}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
            disabled={generating}
          >
            Refresh Sessions
          </button>
          {currentStep !== 'select' && (
            <button
              onClick={resetWorkflow}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors"
              disabled={generating}
            >
              🔄 Reset
            </button>
          )}
        </div>
      </div>

      {/* Workflow Progress Indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Workflow Progress</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Step {currentStep === 'select' ? '1' : 
                   currentStep === 'upload-images' ? '2' : 
                   currentStep === 'review-analysis' ? '3' : '4'} of 4
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
            style={{
              width: currentStep === 'select' ? '25%' :
                     currentStep === 'upload-images' ? '50%' :
                     currentStep === 'review-analysis' ? '75%' : '100%'
            }}
          ></div>
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span className={currentStep === 'select' ? 'text-purple-600 font-medium' : ''}>Select Session</span>
          <span className={currentStep === 'upload-images' ? 'text-purple-600 font-medium' : ''}>Upload Images</span>
          <span className={currentStep === 'review-analysis' ? 'text-purple-600 font-medium' : ''}>Review & Approve</span>
          <span className={currentStep === 'generating-video' ? 'text-purple-600 font-medium' : ''}>Generate Video</span>
        </div>
      </div>

      {/* Error and Success Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-red-600 dark:text-red-400">❌ {error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
          <p className="text-green-600 dark:text-green-400">✅ {success}</p>
        </div>
      )}

      {/* Progress Indicator */}
      {generating && progress && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent mr-3"></div>
            <p className="text-blue-600 dark:text-blue-400">{progress}</p>
          </div>
        </div>
      )}

      {/* Step 1: Session and Video Selection */}
      {currentStep === 'select' && (
        <>
          {/* Session Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Audio Session
            </label>
            <select
              value={selectedSession}
              onChange={(e) => {
                const sessionId = e.target.value;
                setSelectedSession(sessionId);
                if (sessionId) {
                  const selectedSessionData = sessions.find(s => s.sessionId === sessionId);
                  if (selectedSessionData) {
                    setTopic(selectedSessionData.name || `Session ${sessionId}`);
                  }
                } else {
                  setTopic('');
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              disabled={generating}
            >
              <option value="">Choose a session...</option>
              {sessions.map((session) => (
                <option key={session.sessionId} value={session.sessionId}>
                  {session.name || `Session ${session.sessionId}`} - {session.stats.audioFilesGenerated} files
                </option>
              ))}
            </select>
            {sessions.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                No audio sessions found. Generate some conversations with audio first.
              </p>
            )}
          </div>

          {/* Background Video Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Background Video
            </label>

            {/* Template Videos Selection */}
            <div className="mb-4">
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                Select from Template Videos
              </label>
              {templateVideos.length > 0 ? (
                <select
                  value={templateVideos.some(v => v.path === backgroundVideoPath) ? backgroundVideoPath : ''}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">Choose a template video...</option>
                  {templateVideos.map((video) => (
                    <option key={video.filename} value={video.path}>
                      {video.filename} ({formatFileSize(video.fileSize)})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No template videos found. Upload one below or use the file path option.
                </p>
              )}
            </div>

            {/* Upload New Template */}
            <div className="mb-4">
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                Or Upload New Template Video
              </label>
              <FileUploader
                onFileSelect={(file) => {
                  if (file) {
                    uploadTemplateVideo(file);
                  }
                }}
                accept="video/*"
                placeholder="Upload Video Template"
                disabled={uploadingTemplate}
              />
            </div>

            {/* File Path Option */}
            <div className="mb-4">
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                Or Enter Custom File Path (Advanced)
              </label>
              <input
                type="text"
                value={backgroundVideoPath}
                onChange={handlePathInput}
                placeholder="e.g., F:\path\to\background.mp4"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                disabled={generating}
              />
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Use this if your video file is already on the server
              </p>
            </div>
          </div>

          {/* Next Step Button */}
          <div className="flex justify-end">
            <button
              onClick={() => setCurrentStep('upload-images')}
              disabled={!selectedSession || !backgroundVideoPath}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
            >
              Next: Upload Images →
            </button>
          </div>
        </>
      )}

      {/* Step 2: Image Upload */}
      {currentStep === 'upload-images' && (
        <div className="space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
            <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">
              📸 Upload Your Images
            </h3>
            <p className="text-blue-700 dark:text-blue-300 text-sm">
              Upload educational images related to "{topic}". Our AI will analyze each image for relevance to your dialogue and suggest optimal placements.
            </p>
          </div>

          <ImageUpload
            onImagesChange={setUserImages}
            userImages={userImages}
            disabled={generating}
            sessionId={selectedSession}
          />

          {userImages.length > 0 && (
            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep('select')}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors"
              >
                ← Back
              </button>
              
              <button
                onClick={handleAnalyzeImages}
                disabled={userImages.length === 0}
                className="px-6 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
              >
                Analyze Images & Continue →
              </button>
            </div>
          )}

          {userImages.length === 0 && (
            <div className="flex justify-center">
              <button
                onClick={() => setCurrentStep('select')}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors"
              >
                ← Back to Session Selection
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Image Analysis Review */}
      {currentStep === 'review-analysis' && (
        <ImageAnalysisReview
          sessionId={selectedSession}
          topic={topic}
          userImages={userImages}
          onApprovalComplete={handleApprovalComplete}
          onBack={handleBackToUpload}
        />
      )}

      {/* Step 4: Video Generation Progress */}
      {currentStep === 'generating-video' && generating && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
            🎬 Generating Your Video
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Creating video with {approvedUserImagePlacements.length} approved images...
          </p>
          {progress && (
            <p className="text-blue-600 dark:text-blue-400 mt-2">{progress}</p>
          )}
        </div>
      )}

      {/* Generated Video Result */}
      {generatedVideo && (
        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-3">
            ✅ Video Generated Successfully!
          </h3>
          <div className="text-green-700 dark:text-green-300 text-sm mb-4">
            <p><strong>Filename:</strong> {generatedVideo.filename}</p>
            <p><strong>Size:</strong> {formatFileSize(generatedVideo.fileSize)}</p>
            <p><strong>Session ID:</strong> {generatedVideo.sessionId}</p>
          </div>
          <button
            onClick={() => downloadVideo(generatedVideo.filename)}
            className="mt-4 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors flex items-center"
          >
            ⬇️ Download Video
          </button>
        </div>
      )}

    </div>
  );
}
