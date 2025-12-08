'use client';

import { useState, useEffect } from 'react';
import { API_ENDPOINTS, API_BASE_URL } from '../../config/api';

interface ImageRequirement {
  id: string;
  timestamp: number;
  dialogueText: string;
  dialogueAtTimestamp?: string; // Exact dialogue text being spoken at this timestamp
  character: string;
  imageType: 'character' | 'scene' | 'object' | 'concept' | 'emotion';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  uploaded: boolean;
  imagePath?: string;
}

interface ImageEmbeddingPlan {
  sessionId: string;
  totalDuration: number;
  imageRequirements: ImageRequirement[];
  summary: {
    totalImages: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
    estimatedProcessingTime: string;
  };
}

interface ImagePlanResponse {
  success: boolean;
  message?: string;
  imagePlan?: ImageEmbeddingPlan;
  formattedPlan?: string;
  nextSteps?: string[];
  error?: string;
}

interface UploadProgress {
  total: number;
  uploaded: number;
  remaining: number;
  percentage: number;
}

interface UploadedImage {
  filename: string;
  path: string;
  fileSize: number;
  uploadedAt: string;
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

interface UserProvidedImage {
  id: string;
  imagePath: string;
  label: string;
  description?: string;
  preferredTimestamp?: number;
  priority?: 'high' | 'medium' | 'low';
}

export default function ImageEmbedder() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [assFile, setAssFile] = useState<File | null>(null);
  const [topic, setTopic] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [imagePlan, setImagePlan] = useState<ImageEmbeddingPlan | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [useFreshAss, setUseFreshAss] = useState<boolean>(true); // Default to true for fresh WhisperX generation
  const [selectedRequirement, setSelectedRequirement] = useState<ImageRequirement | null>(null);
  const [userImages, setUserImages] = useState<UserProvidedImage[]>([]);
  const [userImageSuggestions, setUserImageSuggestions] = useState<UserImageSuggestion[]>([]);
  const [gettingSuggestions, setGettingSuggestions] = useState(false);
  const [approvedPlacements, setApprovedPlacements] = useState<Set<string>>(new Set());
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [uploadingUserImage, setUploadingUserImage] = useState(false);
  const [userImageLabel, setUserImageLabel] = useState('');
  const [userImageDescription, setUserImageDescription] = useState('');
  const [userImagePriority, setUserImagePriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [userImageFile, setUserImageFile] = useState<File | null>(null);

  useEffect(() => {
    fetchAudioSessions();
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
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Error fetching audio sessions:', error);
      setError('Failed to fetch audio sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleAssFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.ass')) {
        setError('Please select a valid .ass subtitle file');
        return;
      }
      setAssFile(file);
      setError('');
    }
  };

  const analyzeAssFile = async () => {
    if (!selectedSession || !topic.trim()) {
      setError('Please select a session and enter a topic');
      return;
    }

    // If not using fresh ASS, we need an uploaded ASS file
    if (!useFreshAss && !assFile) {
      setError('Please select an ASS file or choose to generate fresh ASS with WhisperX');
      return;
    }

    setAnalyzing(true);
    setError('');
    setSuccess('');

    try {
      let assFilePath: string | undefined;

      // If using uploaded ASS file, upload it first
      if (!useFreshAss && assFile) {
        const formData = new FormData();
        formData.append('sessionId', selectedSession);
        formData.append('assFile', assFile);

        // First upload the ASS file to temp directory
        const uploadResponse = await fetch(API_ENDPOINTS.uploadAss, {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload ASS file');
        }

        const uploadData = await uploadResponse.json();
        assFilePath = uploadData.filePath;
      }

      // Now analyze the ASS file (either uploaded or generate fresh)
      const analysisResponse = await fetch(API_ENDPOINTS.analyzeAss, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: selectedSession,
          assFilePath,
          topic: topic.trim(),
          forceFreshAss: useFreshAss, // Pass the flag to force fresh ASS generation
        }),
      });

      if (!analysisResponse.ok) {
        throw new Error(`HTTP error! status: ${analysisResponse.status}`);
      }

      const analysisData: ImagePlanResponse = await analysisResponse.json();

      if (analysisData.success && analysisData.imagePlan) {
        setImagePlan(analysisData.imagePlan);
        setUploadProgress({
          total: analysisData.imagePlan.summary.totalImages,
          uploaded: 0,
          remaining: analysisData.imagePlan.summary.totalImages,
          percentage: 0,
        });
        setSuccess(analysisData.message || 'Image embedding plan generated successfully!');
        fetchUploadedImages(); // Refresh uploaded images
        fetchUserImages(); // Refresh user images
      } else {
        throw new Error(analysisData.error || 'Failed to analyze ASS file');
      }
    } catch (error) {
      console.error('Error analyzing ASS file:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze ASS file');
    } finally {
      setAnalyzing(false);
    }
  };

  const fetchUploadedImages = async () => {
    if (!selectedSession) return;

    try {
      const response = await fetch(`${API_ENDPOINTS.uploadedImages}/${selectedSession}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUploadedImages(data.images);

          // Update upload progress if we have a plan
          if (imagePlan) {
            const uploadedCount = data.images.length;
            setUploadProgress({
              total: imagePlan.summary.totalImages,
              uploaded: uploadedCount,
              remaining: imagePlan.summary.totalImages - uploadedCount,
              percentage: Math.round((uploadedCount / imagePlan.summary.totalImages) * 100),
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching uploaded images:', error);
    }
  };

  const uploadImage = async (requirement: ImageRequirement, imageFile: File) => {
    setUploadingImage(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('sessionId', selectedSession);
      formData.append('imageId', requirement.id);
      formData.append('image', imageFile);

      const response = await fetch(API_ENDPOINTS.uploadImage, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setSuccess(`Image "${requirement.title}" uploaded successfully!`);
        setSelectedRequirement(null);

        // Update the image plan
        if (imagePlan) {
          const updatedRequirements = imagePlan.imageRequirements.map(req =>
            req.id === requirement.id
              ? { ...req, uploaded: true, imagePath: data.imagePath }
              : req
          );
          setImagePlan({ ...imagePlan, imageRequirements: updatedRequirements });
        }

        // Update progress
        setUploadProgress(data.progress);
        fetchUploadedImages(); // Refresh the list
      } else {
        throw new Error(data.error || 'Failed to upload image');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const deleteUploadedImage = async (filename: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.deleteImage}/${selectedSession}/${filename}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSuccess('Image deleted successfully!');
        fetchUploadedImages();

        // Update progress
        if (uploadProgress) {
          const newUploaded = uploadProgress.uploaded - 1;
          setUploadProgress({
            ...uploadProgress,
            uploaded: newUploaded,
            remaining: uploadProgress.total - newUploaded,
            percentage: Math.round((newUploaded / uploadProgress.total) * 100),
          });
        }
      } else {
        throw new Error('Failed to delete image');
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      setError('Failed to delete image');
    }
  };

  const fetchUserImages = async () => {
    if (!selectedSession) return;

    try {
      const response = await fetch(`${API_ENDPOINTS.userImages}/${selectedSession}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUserImages(data.userImages);
        }
      }
    } catch (error) {
      console.error('Error fetching user images:', error);
    }
  };

  const uploadUserImage = async () => {
    if (!selectedSession || !userImageFile || !userImageLabel.trim()) {
      setError('Please select a session, image file, and provide a label');
      return;
    }

    setUploadingUserImage(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('sessionId', selectedSession);
      formData.append('image', userImageFile);
      formData.append('label', userImageLabel.trim());
      formData.append('description', userImageDescription.trim());
      formData.append('priority', userImagePriority);

      const response = await fetch(API_ENDPOINTS.uploadUserImage, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setSuccess(`User image "${userImageLabel}" uploaded successfully!`);
        
        // Reset form
        setUserImageFile(null);
        setUserImageLabel('');
        setUserImageDescription('');
        setUserImagePriority('medium');
        
        // Refresh user images
        fetchUserImages();
      } else {
        throw new Error(data.error || 'Failed to upload user image');
      }
    } catch (error) {
      console.error('Error uploading user image:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload user image');
    } finally {
      setUploadingUserImage(false);
    }
  };

  const deleteUserImage = async (imageId: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.deleteUserImage}/${selectedSession}/${imageId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSuccess('User image deleted successfully!');
        fetchUserImages();
      } else {
        throw new Error('Failed to delete user image');
      }
    } catch (error) {
      console.error('Error deleting user image:', error);
      setError('Failed to delete user image');
    }
  };

  const getUserImageSuggestions = async () => {
    if (!selectedSession || userImages.length === 0) {
      setError('Please select a session and ensure you have user images');
      return;
    }

    setGettingSuggestions(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_ENDPOINTS.userImageSuggestions}/${selectedSession}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: topic.trim() || 'educational content'
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setUserImageSuggestions(data.suggestions);
        setSuccess(`Generated ${data.suggestions.length} placement suggestions for your user images!`);
      } else {
        throw new Error(data.error || 'Failed to get suggestions');
      }
    } catch (error) {
      console.error('Error getting user image suggestions:', error);
      setError(error instanceof Error ? error.message : 'Failed to get suggestions');
    } finally {
      setGettingSuggestions(false);
    }
  };

  const togglePlacementApproval = (suggestionId: string) => {
    const newApproved = new Set(approvedPlacements);
    if (newApproved.has(suggestionId)) {
      newApproved.delete(suggestionId);
    } else {
      newApproved.add(suggestionId);
    }
    setApprovedPlacements(newApproved);
  };

  const generateVideoWithUserImages = async () => {
    if (approvedPlacements.size === 0) {
      setError('Please approve at least one image placement before generating video');
      return;
    }

    setGeneratingVideo(true);
    setError('');
    setSuccess('');

    try {
      // Get approved suggestions
      const approvedSuggestions = userImageSuggestions.filter(suggestion =>
        approvedPlacements.has(suggestion.userImageId)
      );

      const response = await fetch(API_ENDPOINTS.generateVideo, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: selectedSession,
          approvedUserImagePlacements: approvedSuggestions
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setSuccess('Video generated successfully with your approved user images!');
        // Reset state
        setUserImageSuggestions([]);
        setApprovedPlacements(new Set());
      } else {
        throw new Error(data.error || 'Failed to generate video');
      }
    } catch (error) {
      console.error('Error generating video:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate video');
    } finally {
      setGeneratingVideo(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getImageTypeIcon = (type: string) => {
    switch (type) {
      case 'character': return '👤';
      case 'scene': return '🎬';
      case 'object': return '📦';
      case 'concept': return '💡';
      case 'emotion': return '😊';
      default: return '🖼️';
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">🎨 Image Embedding Setup</h2>

        {/* Step 1: Session and ASS File Selection */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Audio Session
              </label>
              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              >
                <option value="">Choose a session...</option>
                {sessions.map((session) => (
                  <option key={session.sessionId} value={session.sessionId}>
                    {session.sessionId} ({session.stats?.totalDialogues || 0} dialogues)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Topic Description
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Quantum Physics, Machine Learning, Space Exploration"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ASS Subtitle Source
            </label>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useFreshAss"
                  checked={useFreshAss}
                  onChange={(e) => setUseFreshAss(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useFreshAss" className="ml-2 text-sm text-gray-700">
                  🎯 Generate fresh ASS with WhisperX API (recommended)
                </label>
              </div>

              {!useFreshAss && (
                <div>
                  <label className="block text-sm text-gray-600 mb-2">
                    Or upload existing ASS file:
                  </label>
                  <input
                    type="file"
                    accept=".ass"
                    onChange={handleAssFileSelect}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {assFile && (
                    <p className="mt-2 text-sm text-gray-600">
                      Selected: {assFile.name}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={analyzeAssFile}
            disabled={analyzing || !selectedSession || !topic.trim() || (!useFreshAss && !assFile)}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analyzing ? '🔍 Analyzing...' : useFreshAss ? '🎯 Generate ASS with WhisperX & Create Image Plan' : '🎯 Analyze ASS File & Generate Image Plan'}
          </button>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-md">
            {success}
          </div>
        )}
      </div>

      {/* 📸 Additional Images (Optional) */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">📸 Upload Your Own Images (Optional)</h3>
        <p className="text-sm text-gray-600 mb-6">
          Upload educational images related to your topic. Our AI will evaluate them for relevance and may include them in the video.
        </p>

        {/* Upload Form */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-6">
          <div className="text-center">
            <div className="mb-4">
              <span className="text-4xl">📤</span>
            </div>
            <h4 className="text-lg font-medium text-gray-800 mb-2">Choose Images</h4>
            <p className="text-sm text-gray-500 mb-4">
              Max 10MB per image • PNG, JPG, GIF supported
            </p>
            
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 10 * 1024 * 1024) { // 10MB limit
                    setError('File size must be less than 10MB');
                    return;
                  }
                  setUserImageFile(file);
                  // Auto-fill label with filename (without extension)
                  const fileName = file.name.replace(/\.[^/.]+$/, '');
                  setUserImageLabel(fileName);
                  setError('');
                }
              }}
              className="hidden"
              id="userImageUpload"
            />
            <label
              htmlFor="userImageUpload"
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 cursor-pointer"
            >
              Browse Files
            </label>
            
            {userImageFile && (
              <p className="mt-2 text-sm text-green-600">
                ✅ Selected: {userImageFile.name}
              </p>
            )}
          </div>
        </div>

        {/* Image Details Form */}
        {userImageFile && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image Label (for AI evaluation)
                </label>
                <input
                  type="text"
                  value={userImageLabel}
                  onChange={(e) => setUserImageLabel(e.target.value)}
                  placeholder="e.g., Docker Architecture, Kubernetes Cluster"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <select
                  value={userImagePriority}
                  onChange={(e) => setUserImagePriority(e.target.value as 'high' | 'medium' | 'low')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="high">🔴 High - Very relevant</option>
                  <option value="medium">🟡 Medium - Moderately relevant</option>
                  <option value="low">🟢 Low - Somewhat relevant</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (optional)
              </label>
              <textarea
                value={userImageDescription}
                onChange={(e) => setUserImageDescription(e.target.value)}
                placeholder="Describe what this image shows and why it's relevant to your topic..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={uploadUserImage}
                disabled={uploadingUserImage || !userImageLabel.trim()}
                className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
              >
                {uploadingUserImage ? '📤 Uploading...' : '📤 Upload Image'}
              </button>
              
              <button
                onClick={() => {
                  setUserImageFile(null);
                  setUserImageLabel('');
                  setUserImageDescription('');
                  setUserImagePriority('medium');
                }}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
            </div>

            {/* Tip */}
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-start">
                <span className="text-blue-600 mr-2">💡</span>
                <div className="text-sm text-blue-800">
                  <strong>Tip:</strong> Upload images that are directly related to your topic. The AI will evaluate each image's relevance and educational value before deciding whether to include it in the final video.
                </div>
              </div>
            </div>
          </>
        )}

        {/* General Tip */}
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-start">
            <span className="text-blue-600 mr-2">💡</span>
            <div className="text-sm text-blue-800">
              <strong>Tip:</strong> Upload images that are directly related to your topic. The AI will evaluate each image's relevance and educational value before deciding whether to include it in the final video.
            </div>
          </div>
        </div>
      </div>

      {/* Image Plan Display */}
      {imagePlan && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-gray-800">📋 Image Embedding Plan</h3>
            {uploadProgress && (
              <div className="text-right">
                <div className="text-sm text-gray-600">Progress</div>
                <div className="text-lg font-semibold text-blue-600">
                  {uploadProgress.uploaded}/{uploadProgress.total} ({uploadProgress.percentage}%)
                </div>
              </div>
            )}
          </div>

          {/* Plan Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{imagePlan.summary.totalImages}</div>
              <div className="text-sm text-gray-600">Total Images</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{imagePlan.summary.highPriority}</div>
              <div className="text-sm text-gray-600">High Priority</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{imagePlan.summary.mediumPriority}</div>
              <div className="text-sm text-gray-600">Medium Priority</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{imagePlan.summary.lowPriority}</div>
              <div className="text-sm text-gray-600">Low Priority</div>
            </div>
          </div>

          {/* Image Requirements List */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-700">🖼️ Required Images</h4>
            {imagePlan.imageRequirements.map((requirement) => (
              <div key={requirement.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{getImageTypeIcon(requirement.imageType)}</span>
                      <h5 className="font-semibold text-gray-800">{requirement.title}</h5>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(requirement.priority)}`}>
                        {requirement.priority.toUpperCase()}
                      </span>
                      {requirement.uploaded && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium text-green-600 bg-green-100">
                          ✅ UPLOADED
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      <strong>Character:</strong> {requirement.character} |
                      <strong> Timestamp:</strong> {requirement.timestamp.toFixed(1)}s |
                      <strong> Type:</strong> {requirement.imageType}
                    </div>
                    <div className="text-sm text-gray-700 mb-2">
                      <strong>Dialogue:</strong> "{requirement.dialogueText}"
                    </div>
                    {requirement.dialogueAtTimestamp && requirement.dialogueAtTimestamp !== requirement.dialogueText && (
                      <div className="text-sm text-blue-700 mb-2">
                        <strong>Exact at {requirement.timestamp.toFixed(1)}s:</strong> "{requirement.dialogueAtTimestamp}"
                      </div>
                    )}
                    <div className="text-sm text-gray-600">
                      <strong>Description:</strong> {requirement.description}
                    </div>
                  </div>
                  {!requirement.uploaded && (
                    <button
                      onClick={() => setSelectedRequirement(requirement)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      📤 Upload Image
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image Upload Modal */}
      {selectedRequirement && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              📤 Upload Image for "{selectedRequirement.title}"
            </h3>

            <div className="mb-4">
              <div className="text-sm text-gray-600 mb-2">
                <strong>Description:</strong> {selectedRequirement.description}
              </div>
              <div className="text-sm text-gray-600">
                <strong>Priority:</strong> {selectedRequirement.priority.toUpperCase()}
              </div>
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  uploadImage(selectedRequirement, file);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              disabled={uploadingImage}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedRequirement(null)}
                className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                disabled={uploadingImage}
              >
                Cancel
              </button>
              <button
                onClick={() => setSelectedRequirement(null)}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={uploadingImage}
              >
                {uploadingImage ? '📤 Uploading...' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Uploaded Images Gallery */}
      {uploadedImages.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">🖼️ Uploaded Images</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {uploadedImages.map((image) => (
              <div key={image.filename} className="border border-gray-200 rounded-lg p-3">
                <div className="aspect-square bg-gray-100 rounded-md mb-2 flex items-center justify-center">
                  <span className="text-2xl">🖼️</span>
                </div>
                <div className="text-xs text-gray-600 truncate">{image.filename}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {(image.fileSize / 1024 / 1024).toFixed(1)} MB
                </div>
                <button
                  onClick={() => deleteUploadedImage(image.filename)}
                  className="mt-2 w-full bg-red-600 text-white text-xs py-1 px-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  🗑️ Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Images Section */}
      {userImages.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-gray-800">🖼️ Your Uploaded Images</h3>
            <button
              onClick={getUserImageSuggestions}
              disabled={gettingSuggestions}
              className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            >
              {gettingSuggestions ? '🔍 Analyzing...' : '🎯 Get Placement Suggestions'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {userImages.map((image) => (
              <div key={image.id} className="border border-gray-200 rounded-lg p-4">
                <div className="aspect-square bg-gray-100 rounded-md mb-3 flex items-center justify-center">
                  <span className="text-3xl">🖼️</span>
                </div>
                <h4 className="font-semibold text-gray-800 mb-2">{image.label}</h4>
                {image.description && (
                  <p className="text-sm text-gray-600 mb-2">{image.description}</p>
                )}
                <div className="text-xs text-gray-500">
                  Priority: <span className="capitalize">{image.priority || 'medium'}</span>
                  {image.preferredTimestamp && (
                    <span className="ml-2">• Preferred: {image.preferredTimestamp}s</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Image Suggestions */}
      {userImageSuggestions.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-gray-800">🎯 Image Placement Suggestions</h3>
            <div className="text-sm text-gray-600">
              Approved: {approvedPlacements.size} / {userImageSuggestions.length}
            </div>
          </div>

          <div className="space-y-4 mb-6">
            {userImageSuggestions.map((suggestion) => (
              <div key={suggestion.userImageId} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-gray-800">{suggestion.userImageLabel}</h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        suggestion.relevanceScore >= 8 ? 'text-green-600 bg-green-100' :
                        suggestion.relevanceScore >= 6 ? 'text-yellow-600 bg-yellow-100' :
                        'text-red-600 bg-red-100'
                      }`}>
                        Score: {suggestion.relevanceScore}/10
                      </span>
                      {approvedPlacements.has(suggestion.userImageId) && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium text-blue-600 bg-blue-100">
                          ✅ APPROVED
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-gray-600 mb-2">
                      <strong>Placement:</strong> {suggestion.suggestedTimestamp.toFixed(1)}s |
                      <strong> Duration:</strong> {suggestion.suggestedDuration}s |
                      <strong> Character:</strong> {suggestion.character}
                    </div>

                    <div className="text-sm text-gray-700 mb-2">
                      <strong>Dialogue:</strong> "{suggestion.dialogueText.substring(0, 100)}{suggestion.dialogueText.length > 100 ? '...' : ''}"
                    </div>

                    <div className="text-sm text-gray-600 mb-3">
                      <strong>AI Reasoning:</strong> {suggestion.reasoning}
                    </div>

                    {suggestion.alternativePlacements.length > 0 && (
                      <div className="text-sm text-gray-500">
                        <strong>Alternatives:</strong>
                        {suggestion.alternativePlacements.slice(0, 2).map((alt, index) => (
                          <span key={index} className="ml-2">
                            {alt.timestamp.toFixed(1)}s (Score: {alt.score})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => togglePlacementApproval(suggestion.userImageId)}
                    className={`px-4 py-2 rounded-md font-medium ${
                      approvedPlacements.has(suggestion.userImageId)
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {approvedPlacements.has(suggestion.userImageId) ? '✅ Approved' : '👆 Approve'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {approvedPlacements.size > 0 && (
            <div className="flex justify-center">
              <button
                onClick={generateVideoWithUserImages}
                disabled={generatingVideo}
                className="bg-green-600 text-white px-8 py-3 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 text-lg font-semibold"
              >
                {generatingVideo ? '🎬 Generating Video...' : `🎬 Generate Video with ${approvedPlacements.size} Approved Images`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
