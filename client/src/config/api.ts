// API configuration for the frontend
// Dynamically determine the backend URL based on the frontend URL
const getApiBaseUrl = () => {
  // Prefer explicit env
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;

  // If we're in the browser
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const port = '5000'; // Backend port

    if (hostname === '0.0.0.0' || hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://localhost:${port}`;
    }
    return `http://${hostname}:${port}`;
  }

  // Server-side rendering fallback
  return 'http://localhost:5000';
};

export const API_BASE_URL = getApiBaseUrl();

export const API_ENDPOINTS = {
  // Assistant / conversation endpoints
  conversation: `${API_BASE_URL}/api/assistant/script`,
  script: `${API_BASE_URL}/api/assistant/script`,

  // Audio endpoints
  audio: `${API_BASE_URL}/api/audio/files`,
  audioFromScript: `${API_BASE_URL}/api/audio/generate-audio`,
  generateScript: `${API_BASE_URL}/api/audio/generate-script`,
  regenerateAudio: (sessionId: string, filename: string) =>
    `${API_BASE_URL}/api/audio/regenerate/${sessionId}/${filename}`,
  audioSession: (sessionId: string) => `${API_BASE_URL}/api/audio/session/${sessionId}`,
  deleteAudioFile: (filename: string) => `${API_BASE_URL}/api/audio/files/${filename}`,
  deleteAudioSession: (sessionId: string) => `${API_BASE_URL}/api/audio/session/${sessionId}`,
  downloadAudio: (filename: string) => `${API_BASE_URL}/api/audio/download/${filename}`,
  testTTSConnection: `${API_BASE_URL}/api/audio/test-connection`,
  cleanupAudio: `${API_BASE_URL}/api/audio/cleanup`,

  // Video endpoints
  generateVideo: `${API_BASE_URL}/api/video/generate`,
  videoList: `${API_BASE_URL}/api/video/list`,
  downloadVideo: `${API_BASE_URL}/api/video/download`,
  deleteVideo: `${API_BASE_URL}/api/video/delete`,
  cleanupVideos: `${API_BASE_URL}/api/video/cleanup`,
  templateVideos: `${API_BASE_URL}/api/video/templates`,
  uploadTemplateVideo: `${API_BASE_URL}/api/video/upload-template`,
  uploadAss: `${API_BASE_URL}/api/video/upload-ass`,
  analyzeAss: `${API_BASE_URL}/api/video/analyze-ass`,
  generateImagePlan: `${API_BASE_URL}/api/video/generate-image-plan`,
  imagePlanStatus: (sessionId: string) => `${API_BASE_URL}/api/video/image-plan/${sessionId}`,
  uploadImage: `${API_BASE_URL}/api/video/upload-image`,
  uploadedImages: (sessionId: string) => `${API_BASE_URL}/api/video/uploaded-images/${sessionId}`,
  deleteUploadedImage: (sessionId: string, filename: string) =>
    `${API_BASE_URL}/api/video/uploaded-images/${sessionId}/${filename}`,
  uploadUserImage: `${API_BASE_URL}/api/video/upload-user-image`,
  userImages: (sessionId: string) => `${API_BASE_URL}/api/video/user-images/${sessionId}`,
  deleteUserImage: (sessionId: string, imageId: string) =>
    `${API_BASE_URL}/api/video/delete-user-image/${sessionId}/${imageId}`,
  updateUserImage: (sessionId: string, filename: string) =>
    `${API_BASE_URL}/api/video/user-images/${sessionId}/${filename}`,
  userImageSuggestions: (sessionId: string) =>
    `${API_BASE_URL}/api/video/user-image-suggestions/${sessionId}`,
  analyzeUserImages: `${API_BASE_URL}/api/video/analyze-user-images`,
  imageAnalysis: (sessionId: string) => `${API_BASE_URL}/api/video/image-analysis/${sessionId}`,
  cleanupAssCache: `${API_BASE_URL}/api/video/cleanup-ass-cache`,
  getAssContent: `${API_BASE_URL}/api/video/ass-content`,
  uploadCustomSuggestions: `${API_BASE_URL}/api/video/upload-custom-suggestions`,

  // Image generation endpoint
  generateImage: `${API_BASE_URL}/api/image/generate`,
} as const;
