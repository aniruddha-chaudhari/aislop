// API configuration for the frontend
// Dynamically determine the backend URL based on the frontend URL
const getApiBaseUrl = () => {
  // Prefer explicit env
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;

  // If we're in the browser
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const port = '5000'; // Switch to a safe port; browser blocks 0.0.0.0:6000

    if (hostname === '0.0.0.0' || hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://localhost:${port}`;
    }
    return `http://${hostname}:${port}`;
  }

  // Server-side rendering fallback
  return 'http://localhost:7000';
};

export const API_BASE_URL = getApiBaseUrl();

export const API_ENDPOINTS = {
  // Assistant / conversation
  conversation: `${API_BASE_URL}/api/assistant/script`,
  script: `${API_BASE_URL}/api/assistant/script`,
  audioFromScript: `${API_BASE_URL}/api/audio/generate`,
  regenerateAudio: `${API_BASE_URL}/api/audio/generate`,
  audio: `${API_BASE_URL}/api/audio/files`,
  deleteSession: `${API_BASE_URL}/api/audio/session`,
  testTTS: `${API_BASE_URL}/health`,
  // Video endpoints
  generateVideo: `${API_BASE_URL}/api/video/generate`,
  videoList: `${API_BASE_URL}/api/video/list`,
  downloadVideo: `${API_BASE_URL}/api/video/download`,
  deleteVideo: `${API_BASE_URL}/api/video/delete`,
  cleanupVideos: `${API_BASE_URL}/api/video/cleanup`,
  templateVideos: `${API_BASE_URL}/api/video/templates`,
  uploadTemplateVideo: `${API_BASE_URL}/api/video/upload-template`,
  // Image embedding endpoints (Python backend parity)
  analyzeAss: `${API_BASE_URL}/api/images/plan`,
  generateImagePlan: `${API_BASE_URL}/api/images/plan`,
  imagePlan: `${API_BASE_URL}/api/images/plan`,
  uploadImage: `${API_BASE_URL}/api/images/upload`,
  uploadedImages: `${API_BASE_URL}/api/images/plan`,
  uploadUserImage: `${API_BASE_URL}/api/images/upload`,
  userImages: `${API_BASE_URL}/api/images/plan`,
  userImageSuggestions: `${API_BASE_URL}/api/images/user-image-suggestions`,
  analyzeUserImages: `${API_BASE_URL}/api/images/analyze-user-images`,
  imageAnalysis: `${API_BASE_URL}/api/images/image-analysis`,
  deleteUserImage: `${API_BASE_URL}/api/images/plan`,
  deleteImage: `${API_BASE_URL}/api/images/plan`,
  uploadAss: `${API_BASE_URL}/api/images/plan`,
  cleanupAssCache: `${API_BASE_URL}/api/images/plan`,
  // Copy/paste functionality routes
  getAssContent: `${API_BASE_URL}/api/images/ass-content`,
  uploadCustomSuggestions: `${API_BASE_URL}/api/images/upload-custom-suggestions`,
} as const;
