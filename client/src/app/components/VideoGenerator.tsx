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
  const [currentStep, setCurrentStep] = useState<'select' | 'generate-plan' | 'upload-required' | 'upload-extra' | 'review-analysis' | 'generating-video'>('select');
  const [userImages, setUserImages] = useState<UserProvidedImage[]>([]);
  const [approvedUserImagePlacements, setApprovedUserImagePlacements] = useState<UserImageSuggestion[]>([]);
  const [topic, setTopic] = useState<string>('');
  const [imagePlan, setImagePlan] = useState<any>(null);
  const [planProgress, setPlanProgress] = useState<any>(null);
  const [uploadingRequiredImages, setUploadingRequiredImages] = useState<{[key: string]: boolean}>({});
  const [requiredImageErrors, setRequiredImageErrors] = useState<{[key: string]: string}>({});

  // Normalize audio sessions coming from either the Node backend ({ success, sessions })
  // or the Python backend ({ sessions, files } without a success flag).
  const normalizeSessions = (rawData: any): AudioSession[] => {
    if (!rawData) return [];
    if (rawData.success && Array.isArray(rawData.sessions)) return rawData.sessions;
    if (Array.isArray(rawData.sessions)) return rawData.sessions;
    // Python flat array fallback (unlikely here but keep parity with AudioBrowser)
    if (Array.isArray(rawData)) return rawData;
    return [];
  };

  // Normalize template videos from either backend:
  // - Node: { success: true, videos: [...] }
  // - Python: { templates: [...] }
  const normalizeTemplateVideos = (rawData: any): TemplateVideo[] => {
    const items = rawData?.templates || rawData?.videos || [];
    if (!Array.isArray(items)) return [];

    return items.map((item: any) => ({
      filename: item.filename || item.name || '',
      path: item.path || item.filePath || '',
      fileSize: item.fileSize ?? item.size ?? 0,
      createdAt: item.createdAt || item.modifiedAt || new Date().toISOString(),
      modifiedAt: item.modifiedAt || item.createdAt || new Date().toISOString(),
    }));
  };

  useEffect(() => {
    fetchAudioSessions();
    fetchTemplateVideos();
    
    // Check for session ID in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const urlSessionId = urlParams.get('sessionId');
    
    // Load session data from sessionStorage if available
    const savedSessionData = sessionStorage.getItem('videoGenerator_sessionData');
    if (savedSessionData) {
      try {
        const parsedData = JSON.parse(savedSessionData);
        setSelectedSession(parsedData.selectedSession || '');
        setTopic(parsedData.topic || '');
        setBackgroundVideoPath(parsedData.backgroundVideoPath || '');
        setCurrentStep(parsedData.currentStep || 'select');
        setImagePlan(parsedData.imagePlan || null);
        setPlanProgress(parsedData.planProgress || null);
        setUserImages(parsedData.userImages || []);
        setApprovedUserImagePlacements(parsedData.approvedUserImagePlacements || []);
        
        // If there's a session ID in URL that's different, update it
        if (urlSessionId && urlSessionId !== parsedData.selectedSession) {
          setSelectedSession(urlSessionId);
        } else if (parsedData.selectedSession && parsedData.currentStep !== 'select') {
          // Show a brief success message that data was restored
          setSuccess('Previous session data restored. You can continue where you left off.');
          setTimeout(() => setSuccess(''), 3000);
        }
      } catch (error) {
        console.error('Error loading session data from sessionStorage:', error);
      }
    } else if (urlSessionId) {
      // If no saved data but URL has session ID, set it
      setSelectedSession(urlSessionId);
    }
  }, []);

  // Save session data to sessionStorage
  const saveSessionData = () => {
    const sessionData = {
      selectedSession,
      topic,
      backgroundVideoPath,
      currentStep,
      imagePlan,
      planProgress,
      userImages,
      approvedUserImagePlacements,
      lastSaved: Date.now()
    };
    
    try {
      sessionStorage.setItem('videoGenerator_sessionData', JSON.stringify(sessionData));
    } catch (error) {
      console.error('Error saving session data to sessionStorage:', error);
    }
  };

  // Auto-save session data when important state changes
  useEffect(() => {
    if (selectedSession || topic || backgroundVideoPath || imagePlan || userImages.length > 0) {
      saveSessionData();
      
      // Update URL with session ID
      if (selectedSession) {
        const url = new URL(window.location.href);
        url.searchParams.set('sessionId', selectedSession);
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [selectedSession, topic, backgroundVideoPath, currentStep, imagePlan, planProgress, userImages, approvedUserImagePlacements]);

  const fetchAudioSessions = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(API_ENDPOINTS.audio);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const normalizedSessions = normalizeSessions(data);
      setSessions(normalizedSessions);

      // Auto-select session if we have a saved selectedSession
      const urlParams = new URLSearchParams(window.location.search);
      const urlSessionId = urlParams.get('sessionId');
      const savedSessionData = sessionStorage.getItem('videoGenerator_sessionData');
      
      let targetSessionId = '';
      if (savedSessionData) {
        try {
          const parsedData = JSON.parse(savedSessionData);
          targetSessionId = parsedData.selectedSession;
        } catch (error) {
          console.error('Error parsing saved session data:', error);
        }
      }
      
      // URL parameter takes precedence
      if (urlSessionId) {
        targetSessionId = urlSessionId;
      }
      
      // Auto-select and set topic if session exists
      if (targetSessionId && normalizedSessions.some((s: any) => s.sessionId === targetSessionId)) {
        setSelectedSession(targetSessionId);
        const selectedSessionData = normalizedSessions.find((s: any) => s.sessionId === targetSessionId);
        if (selectedSessionData && !topic) {
          setTopic(selectedSessionData.name || `Session ${targetSessionId}`);
        }
        
        // Try to restore existing image plan for this session
        setTimeout(() => {
          fetchImagePlanStatus();
        }, 100);
      }
    } catch (error) {
      console.error('Error fetching audio sessions:', error);
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
      setTemplateVideos(normalizeTemplateVideos(data));
    } catch (error) {
      console.error('Error fetching template videos:', error);
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
      console.error('Error uploading template video:', error);
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
      console.error('Error downloading video:', error);
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
    setImagePlan(null);
    setPlanProgress(null);
    
    // Clear session data from sessionStorage
    sessionStorage.removeItem('videoGenerator_sessionData');
    
    // Clear URL parameters
    const url = new URL(window.location.href);
    url.searchParams.delete('sessionId');
    window.history.replaceState({}, '', url.toString());
  };

  // Soft reset - keeps session/topic but resets workflow state  
  const softResetWorkflow = () => {
    setCurrentStep('select');
    setError('');
    setSuccess('');
    setProgress('');
    setGeneratedVideo(null);
    // Keep selectedSession, topic, backgroundVideoPath, but clear workflow data
    setUserImages([]);
    setApprovedUserImagePlacements([]);
    setImagePlan(null);
    setPlanProgress(null);
  };

  const generateImagePlan = async () => {
    if (!selectedSession || !backgroundVideoPath) {
      setError('Please complete all required fields');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    
    // Clear previous workflow data when generating new plan
    setUserImages([]);
    setApprovedUserImagePlacements([]);
    setImagePlan(null);
    setPlanProgress(null);

    try {
      console.log('[VideoGenerator] generateImagePlan payload', {
        sessionId: selectedSession,
        topic: topic.trim(),
        forceFreshAss: true,
      });
      const response = await fetch(API_ENDPOINTS.generateImagePlan, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: selectedSession,
          topic: topic.trim(),
          forceFreshAss: true // Always use fresh WhisperX
        }),
      });

      console.log('[VideoGenerator] generateImagePlan response status', response.status);

      if (!response.ok) {
        try {
          const errData = await response.json();
          console.log('[VideoGenerator] generateImagePlan error body', errData);
        } catch (e) {
          console.log('[VideoGenerator] generateImagePlan error body not JSON');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.imagePlan) {
        setImagePlan(data.imagePlan);
        setPlanProgress({
          total: data.imagePlan.summary.totalImages,
          uploaded: 0,
          remaining: data.imagePlan.summary.totalImages,
          percentage: 0,
        });
        setSuccess('Image plan generated! Review the required images below.');
        setCurrentStep('upload-required');
      } else {
        throw new Error(data.error || 'Failed to generate image plan');
      }
    } catch (error) {
      console.error('Error generating image plan:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate image plan');
    } finally {
      setLoading(false);
    }
  };

  const handleRequiredImagesComplete = () => {
    if (!imagePlan) {
      setError('No image plan available');
      return;
    }

    const uploadedCount = imagePlan.imageRequirements.filter((req: any) => req.uploaded).length;
    const totalCount = imagePlan.imageRequirements.length;

    setCurrentStep('upload-extra');
    setSuccess(`Proceeding with ${uploadedCount}/${totalCount} uploaded images. You can still add extra images.`);
    setError('');
  };

  const handleUploadRequiredImage = async (requirementId: string, file: File) => {
    if (!selectedSession) {
      setError('No session selected');
      return;
    }

    setUploadingRequiredImages(prev => ({ ...prev, [requirementId]: true }));
    setRequiredImageErrors(prev => ({ ...prev, [requirementId]: '' }));

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('sessionId', selectedSession);
      formData.append('imageId', requirementId);

      const response = await fetch(API_ENDPOINTS.uploadImage, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload image');
      }

      const data = await response.json();

      // Fetch updated image plan status
      await fetchImagePlanStatus();

      setSuccess(`Successfully uploaded image for "${data.imageId}"`);

      // Check if all images are uploaded
      if (data.isComplete) {
        setSuccess('All required images uploaded! You can now proceed to the next step.');
      }

    } catch (error) {
      console.error('Error uploading required image:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload image';
      setRequiredImageErrors(prev => ({ ...prev, [requirementId]: errorMessage }));
    } finally {
      setUploadingRequiredImages(prev => ({ ...prev, [requirementId]: false }));
    }
  };

  const fetchImagePlanStatus = async () => {
    if (!selectedSession) return;

    try {
      const response = await fetch(`${API_ENDPOINTS.imagePlan}/${selectedSession}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.imagePlan) {
          setImagePlan(data.imagePlan);
          setPlanProgress(data.progress);
          
          // Update current step based on image plan status
          if (data.imagePlan.imageRequirements && data.imagePlan.imageRequirements.length > 0) {
            const hasAnyUploaded = data.imagePlan.imageRequirements.some((req: any) => req.uploaded);
            const allUploaded = data.imagePlan.imageRequirements.every((req: any) => req.uploaded);
            
            if (allUploaded) {
              setCurrentStep('upload-extra');
            } else if (hasAnyUploaded || currentStep === 'select') {
              setCurrentStep('upload-required');
            }
          }
        }
      }
      // If response is not ok (404, etc.), it just means no plan exists yet, which is fine
    } catch (error) {
      console.error('Error fetching image plan status:', error);
      // Don't show error to user as this is just a background restoration attempt
    }
  };

  const handleAnalyzeImages = () => {
    if (userImages.length === 0) {
      // Skip to video generation if no extra images
      setCurrentStep('generating-video');
      generateVideoWithApprovedImages([]);
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
      // Prepare request body
      const requestBody: any = {
        sessionId: selectedSession,
        backgroundVideoPath: backgroundVideoPath,
        userImages: userImages,
        approvedUserImagePlacements: approvedPlacements
      };

      // Include imagePlan if it exists and has uploaded images
      if (imagePlan && imagePlan.imageRequirements) {
        const hasUploadedImages = imagePlan.imageRequirements.some((req: any) => req.uploaded);
        if (hasUploadedImages) {
          requestBody.imagePlan = imagePlan;
          setProgress('Generating video with uploaded AI images and approved placements...');
        }
      }

      const response = await fetch(API_ENDPOINTS.generateVideo, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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
      console.error('Error generating video:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate video');
      setProgress('');
    } finally {
      setGenerating(false);
    }
  };

  const handleBackToUpload = () => {
    setCurrentStep('upload-extra');
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
      <div className="bg-[#2F3438] rounded-lg shadow-lg p-4 border border-[#787774]/20">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#337EA9] border-t-transparent"></div>
          <span className="ml-3 text-[#F1F1EF]">Loading audio sessions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#2F3438] rounded-lg shadow-lg p-3 sm:p-4 border border-[#787774]/20 overflow-visible">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold text-[#F1F1EF]">
 Video Generator with Image Analysis
        </h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={fetchAudioSessions}
            className="px-4 py-2 bg-[#337EA9] hover:bg-[#337EA9]/80 text-[#F1F1EF] rounded-md transition-colors"
            disabled={generating}
          >
            Refresh Sessions
          </button>
          {currentStep !== 'select' && (
            <button
              onClick={resetWorkflow}
              className="px-4 py-2 bg-[#787774] hover:bg-[#787774]/80 text-[#F1F1EF] rounded-md transition-colors"
              disabled={generating}
            >
 Reset
            </button>
          )}
        </div>
      </div>

      {/* Workflow Progress Indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-[#F1F1EF]">Workflow Progress</span>
          <span className="text-sm text-[#787774]">
            Step {currentStep === 'select' ? '1' : 
                   currentStep === 'generate-plan' ? '2' : 
                   currentStep === 'upload-required' ? '3' :
                   currentStep === 'upload-extra' ? '4' :
                   currentStep === 'review-analysis' ? '5' : '6'} of 6
          </span>
        </div>
        <div className="w-full bg-[#787774]/20 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-[#9065B0] to-[#C14C8A] h-2 rounded-full transition-all duration-300"
            style={{
              width: currentStep === 'select' ? '16%' :
                     currentStep === 'generate-plan' ? '32%' :
                     currentStep === 'upload-required' ? '48%' :
                     currentStep === 'upload-extra' ? '64%' :
                     currentStep === 'review-analysis' ? '80%' : '100%'
            }}
          ></div>
        </div>
        <div className="flex justify-between mt-2 text-xs text-[#787774]">
          <span className={currentStep === 'select' ? 'text-[#9065B0] font-medium' : ''}>Setup</span>
          <span className={currentStep === 'generate-plan' ? 'text-[#9065B0] font-medium' : ''}>Plan</span>
          <span className={currentStep === 'upload-required' ? 'text-[#9065B0] font-medium' : ''}>Required</span>
          <span className={currentStep === 'upload-extra' ? 'text-[#9065B0] font-medium' : ''}>Extra Images</span>
          <span className={currentStep === 'review-analysis' ? 'text-[#9065B0] font-medium' : ''}>Review</span>
          <span className={currentStep === 'generating-video' ? 'text-[#9065B0] font-medium' : ''}>Generate</span>
        </div>
      </div>

      {/* Error and Success Messages */}
      {error && (
        <div className="mb-6 p-4 bg-[#FDEBEC] border border-[#D44C47]/20 rounded-md">
          <p className="text-[#D44C47]"> {error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-[#EDF3EC] border border-[#448361]/20 rounded-md">
          <p className="text-[#448361]"> {success}</p>
        </div>
      )}

      {/* Progress Indicator */}
      {generating && progress && (
        <div className="mb-6 p-4 bg-[#E7F3F8] border border-[#337EA9]/20 rounded-md">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#337EA9] border-t-transparent mr-3"></div>
            <p className="text-[#337EA9]">{progress}</p>
          </div>
        </div>
      )}

      {/* Step 1: Session and Video Selection */}
      {currentStep === 'select' && (
        <>
          {/* Session Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[#F1F1EF] mb-2">
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
              className="w-full px-3 py-2 text-base border border-[#787774]/30 bg-[#2F3438] text-[#F1F1EF] rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#337EA9] focus:border-[#337EA9] appearance-none"
              style={{ 
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23F1F1EF' stroke-width='2'%3e%3cpolyline points='6,9 12,15 18,9'/%3e%3c/svg%3e")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.7rem center',
                backgroundSize: '1.2em',
                paddingRight: '2.5rem'
              }}
              disabled={generating}
            >
              <option value="">Choose a session...</option>
              {sessions.map((session) => {
                const sessionName = session.name || `Session ${session.sessionId}`;
                // Truncate long session names for mobile
                const displayName = sessionName.length > 30 ? `${sessionName.substring(0, 30)}...` : sessionName;
                
                return (
                  <option key={session.sessionId} value={session.sessionId}>
                    {displayName} - {session.stats.audioFilesGenerated} files
                  </option>
                );
              })}
            </select>
            {sessions.length === 0 && (
              <p className="text-sm text-[#787774] mt-1">
                No audio sessions found. Generate some conversations with audio first.
              </p>
            )}
          </div>

          {/* Background Video Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[#F1F1EF] mb-2">
              Background Video
            </label>

            {/* Template Videos Selection */}
            <div className="mb-4">
              <label className="block text-sm text-[#787774] mb-2">
                Select from Template Videos
              </label>
              {templateVideos.length > 0 ? (
                <select
                  value={templateVideos.some(v => v.path === backgroundVideoPath) ? backgroundVideoPath : ''}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="w-full px-3 py-2 text-base border border-[#787774]/30 bg-[#2F3438] text-[#F1F1EF] rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#337EA9] focus:border-[#337EA9] appearance-none"
                  style={{ 
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23F1F1EF' stroke-width='2'%3e%3cpolyline points='6,9 12,15 18,9'/%3e%3c/svg%3e")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.7rem center',
                    backgroundSize: '1.2em',
                    paddingRight: '2.5rem'
                  }}
                >
                  <option value="">Choose a template video...</option>
                  {templateVideos.map((video) => (
                    <option key={video.filename} value={video.path}>
                      {video.filename} ({formatFileSize(video.fileSize)})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-[#787774]">
                  No template videos found. Upload one below or use the file path option.
                </p>
              )}
            </div>

            {/* Upload New Template */}
            <div className="mb-4">
              <label className="block text-sm text-[#787774] mb-2">
                Or Upload New Template Video
              </label>
              <FileUploader
                onFileSelect={(file) => file && uploadTemplateVideo(file)}
                accept="video/*"
                disabled={uploadingTemplate}
                placeholder="Upload Video Template"
              />
            </div>

            {/* File Path Option */}
            <div className="mb-4">
              <label className="block text-sm text-[#787774] mb-2">
                Or Enter Custom File Path (Advanced)
              </label>
              <input
                type="text"
                value={backgroundVideoPath}
                onChange={handlePathInput}
                placeholder="e.g., F:\path\to\background.mp4"
                className="w-full px-3 py-2 border border-[#787774]/30 bg-[#2F3438] text-[#F1F1EF] rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#337EA9] focus:border-[#337EA9] placeholder-[#787774]"
                disabled={generating}
              />
              <p className="text-xs text-[#787774] mt-1">
                Use this if your video file is already on the server
              </p>
            </div>
          </div>

{/* Next Step Button */}
          <div className="flex justify-end">
            <button
              onClick={() => setCurrentStep('generate-plan')}
              disabled={!selectedSession || !backgroundVideoPath}
              className="px-6 py-3 bg-[#337EA9] hover:bg-[#337EA9]/80 disabled:bg-[#787774]/50 text-[#F1F1EF] font-medium rounded-md transition-colors"
            >
              Next: Generate Image Plan →
            </button>
          </div>
        </>
      )}

      {/* Step 2: Generate Image Plan */}
      {currentStep === 'generate-plan' && (
        <div className="space-y-6">
          <div className="bg-[#E7F3F8] border border-[#337EA9]/20 rounded-md p-4">
            <h3 className="text-lg font-semibold text-[#337EA9] mb-2">
 Generate AI Image Plan
            </h3>
            <p className="text-[#37352F] text-sm">
              Our AI will analyze your dialogue content and create a strategic plan for where images should be placed for maximum educational impact.
            </p>
          </div>

          <div className="text-center py-8">
            <button
              onClick={generateImagePlan}
              disabled={loading}
              className="px-8 py-4 bg-[#448361] hover:bg-[#448361]/80 disabled:bg-[#787774]/50 text-[#F1F1EF] font-semibold rounded-md transition-colors text-lg"
            >
              {loading ? ' Analyzing Dialogue & Creating Plan...' : ' Generate Image Plan with AI'}
            </button>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep('select')}
              className="px-4 py-2 bg-[#787774] hover:bg-[#787774]/80 text-[#F1F1EF] rounded-md transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Upload Required Images */}
      {currentStep === 'upload-required' && imagePlan && (
        <div className="space-y-6">
          <div className="bg-[#EDF3EC] border border-[#448361]/20 rounded-md p-4">
            <h3 className="text-lg font-semibold text-[#448361] mb-2">
              📋 Required Images Plan
            </h3>
            <p className="text-[#37352F] text-sm">
              Based on your dialogue analysis, upload images for the following strategic placements:
            </p>
          </div>

          {/* Plan Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-[#E7F3F8] p-3 rounded-lg border border-[#337EA9]/20">
              <div className="text-lg font-bold text-[#337EA9]">{imagePlan.summary.totalImages}</div>
              <div className="text-xs text-[#37352F]">Total Required</div>
            </div>
            <div className="bg-[#FDEBEC] p-3 rounded-lg border border-[#D44C47]/20">
              <div className="text-lg font-bold text-[#D44C47]">{imagePlan.summary.highPriority}</div>
              <div className="text-xs text-[#37352F]">High Priority</div>
            </div>
            <div className="bg-[#FBF3DB] p-3 rounded-lg border border-[#CB912F]/20">
              <div className="text-lg font-bold text-[#CB912F]">{imagePlan.summary.mediumPriority}</div>
              <div className="text-xs text-[#37352F]">Medium Priority</div>
            </div>
            <div className="bg-[#EDF3EC] p-3 rounded-lg border border-[#448361]/20">
              <div className="text-lg font-bold text-[#448361]">{planProgress?.uploaded || 0}</div>
              <div className="text-xs text-[#37352F]">Uploaded</div>
            </div>
          </div>

          {/* Required Images List */}
          <div className="space-y-4">
            <h4 className="text-base font-semibold text-[#F1F1EF]">🖼️ Upload Required Images</h4>
            {imagePlan.imageRequirements.map((requirement: any, index: number) => (
              <div key={requirement.id} className="border border-[#787774]/30 bg-[#2F3438] rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg"></span>
                      <h5 className="font-semibold text-[#F1F1EF]">{requirement.title}</h5>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        requirement.priority === 'high' ? 'text-[#D44C47] bg-[#FDEBEC]' :
                        requirement.priority === 'medium' ? 'text-[#CB912F] bg-[#FBF3DB]' :
                        'text-[#448361] bg-[#EDF3EC]'
                      }`}>
                        {requirement.priority.toUpperCase()}
                      </span>
                      {requirement.uploaded && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium text-[#448361] bg-[#EDF3EC]">
 UPLOADED
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-[#787774] mb-2">
                      <strong>Show at:</strong> {requirement.timestamp.toFixed(1)}s |
                      <strong> Character:</strong> {requirement.character} |
                      <strong> Type:</strong> {requirement.imageType}
                    </div>
                    <div className="text-sm text-[#F1F1EF] mb-2">
                      <strong>Dialogue:</strong> "{requirement.dialogueText}"
                    </div>
                    {requirement.dialogueAtTimestamp && requirement.dialogueAtTimestamp !== requirement.dialogueText && (
                      <div className="text-sm text-[#337EA9] mb-2">
                        <strong>Exact at {requirement.timestamp.toFixed(1)}s:</strong> "{requirement.dialogueAtTimestamp}"
                      </div>
                    )}
                    <div className="text-xs text-[#787774] bg-[#F1F1EF] p-2 rounded mt-2">
                      <strong>Full Context:</strong> {requirement.fullDialogue || requirement.dialogueText}
                    </div>
                    <div className="text-sm text-[#787774]">
                      <strong>What to upload:</strong> {requirement.description}
                    </div>
                  </div>
                  {!requirement.uploaded && (
                    <div className="ml-4">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleUploadRequiredImage(requirement.id, file);
                          }
                        }}
                        className="hidden"
                        id={`upload-${requirement.id}`}
                      />
                      <label
                        htmlFor={`upload-${requirement.id}`}
                        className={`px-4 py-2 rounded-md cursor-pointer inline-block transition-colors ${
                          uploadingRequiredImages[requirement.id]
                            ? 'bg-[#787774]/50 text-[#787774] cursor-not-allowed'
                            : requirement.uploaded
                            ? 'bg-[#448361] text-[#F1F1EF] hover:bg-[#448361]/80'
                            : 'bg-[#337EA9] text-[#F1F1EF] hover:bg-[#337EA9]/80'
                        }`}
                      >
                        {uploadingRequiredImages[requirement.id] ? ' Uploading...' : requirement.uploaded ? ' Uploaded' : ' Upload'}
                      </label>
                      {requiredImageErrors[requirement.id] && (
                        <div className="mt-2 text-sm text-[#D44C47] bg-[#FDEBEC] p-2 rounded">
 {requiredImageErrors[requirement.id]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep('generate-plan')}
              className="px-4 py-2 bg-[#787774] hover:bg-[#787774]/80 text-[#F1F1EF] rounded-md transition-colors"
            >
              ← Back
            </button>
            
            <button
              onClick={handleRequiredImagesComplete}
              className="px-6 py-3 bg-[#448361] hover:bg-[#448361]/80 text-[#F1F1EF] font-medium rounded-md transition-colors"
            >
              Continue to Extra Images →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Upload Extra Images */}
      {currentStep === 'upload-extra' && (
        <div className="space-y-6">
          <ImageUpload
            onImagesChange={setUserImages}
            userImages={userImages}
            disabled={generating}
            sessionId={selectedSession}
          />

          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep('upload-required')}
              className="px-4 py-2 bg-[#787774] hover:bg-[#787774]/80 text-[#F1F1EF] rounded-md transition-colors"
            >
              ← Back
            </button>
            
            <button
              onClick={handleAnalyzeImages}
              className="px-6 py-3 bg-[#9065B0] hover:bg-[#9065B0]/80 text-[#F1F1EF] font-medium rounded-md transition-colors"
            >
              {userImages.length === 0 ? 'Skip Extra Images →' : 'Analyze Extra Images →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Review Analysis */}
      {currentStep === 'review-analysis' && (
        <ImageAnalysisReview
          sessionId={selectedSession}
          topic={topic}
          userImages={userImages}
          onApprovalComplete={handleApprovalComplete}
          onBack={() => setCurrentStep('upload-extra')}
        />
      )}

      {/* Step 6: Video Generation Progress */}
      {currentStep === 'generating-video' && generating && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#337EA9] border-t-transparent mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-[#F1F1EF] mb-2">
 Generating Your Video
          </h3>
          <p className="text-[#787774]">
            Creating video with required images + {approvedUserImagePlacements.length} approved extra images...
          </p>
          {progress && (
            <p className="text-[#337EA9] mt-2">{progress}</p>
          )}
        </div>
      )}

      {/* Generated Video Result */}
      {generatedVideo && (
        <div className="mt-6 p-4 bg-[#EDF3EC] border border-[#448361]/20 rounded-md">
          <h3 className="text-lg font-semibold text-[#448361] mb-3">
 Video Generated Successfully!
          </h3>
          <div className="text-[#37352F] text-sm mb-4">
            <p><strong>Filename:</strong> {generatedVideo.filename}</p>
            <p><strong>Size:</strong> {formatFileSize(generatedVideo.fileSize)}</p>
            <p><strong>Session ID:</strong> {generatedVideo.sessionId}</p>
          </div>
          <button
            onClick={() => downloadVideo(generatedVideo.filename)}
            className="mt-4 px-4 py-2 bg-[#448361] hover:bg-[#448361]/80 text-[#F1F1EF] rounded-md transition-colors flex items-center"
          >
            ⬇️ Download Video
          </button>
        </div>
      )}

    </div>
  );
}
