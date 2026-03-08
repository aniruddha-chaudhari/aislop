/**
 * Bun route registration. Import for side effects before starting the server.
 */
import { register } from '../router';
import { jsonResponse } from '../utils/http';
import * as assistant from '../controllers/assistantController';
import * as audio from '../controllers/audioController';
import * as audioAssets from '../controllers/audioAssetsController';
import { generateImage } from '../controllers/imageController';
import * as video from '../controllers/videoController';
import * as stream from '../controllers/streamController';
import * as project from '../controllers/projectController';

register([
  { method: 'GET', pattern: '/', handler: async () => jsonResponse(200, { message: 'Hello World!', server: 'AI Slope Backend', status: 'Running' }) },
  { method: 'GET', pattern: '/api/test', handler: async (ctx) => {
    const headers: Record<string, string> = {};
    ctx.headers.forEach((v, k) => { headers[k] = v; });
    return jsonResponse(200, { message: 'Backend connection successful!', timestamp: new Date().toISOString(), headers });
  } },

  // Assistant
  { method: 'POST', pattern: '/api/assistant/script', handler: assistant.generateScript },
  { method: 'POST', pattern: '/api/assistant/audio-from-script', handler: assistant.generateAudioFromScript },
  { method: 'POST', pattern: '/api/assistant/conversation', handler: assistant.generateConversation },
  { method: 'GET', pattern: '/api/assistant/audio', handler: assistant.getAudioFiles },
  { method: 'GET', pattern: '/api/assistant/audio/:filename', handler: assistant.downloadAudio },
  { method: 'POST', pattern: '/api/assistant/test-tts', handler: assistant.testTTS },
  { method: 'GET', pattern: '/api/assistant/models', handler: assistant.getModels },
  { method: 'GET', pattern: '/api/assistant/set-gpt-weights', handler: assistant.setGPTWeights },
  { method: 'GET', pattern: '/api/assistant/set-sovits-weights', handler: assistant.setSoVITSWeights },
  { method: 'POST', pattern: '/api/assistant/test-assistants', handler: assistant.testAssistants },
  { method: 'POST', pattern: '/api/assistant/test-research', handler: assistant.testResearch },

  // Audio
  { method: 'GET', pattern: '/api/audio/test-connection', handler: audio.testTTSConnection },
  { method: 'GET', pattern: '/api/audio/config', handler: audio.getAudioGenerationConfig },
  { method: 'POST', pattern: '/api/audio/generate-script', handler: audio.generateConversationWithAudio },
  { method: 'POST', pattern: '/api/audio/generate-audio', handler: audio.generateAudioFromScript },
  { method: 'POST', pattern: '/api/audio/regenerate/:sessionId/:filename', handler: audio.regenerateAudioFile },
  { method: 'POST', pattern: '/api/audio/generate', handler: audio.generateConversationWithAudio },
  { method: 'GET', pattern: '/api/audio/files', handler: audio.getAudioFiles },
  { method: 'GET', pattern: '/api/audio/session/:sessionId', handler: audio.getSessionDetails },
  { method: 'GET', pattern: '/api/audio/download/:filename', handler: audio.downloadAudio },
  { method: 'DELETE', pattern: '/api/audio/files/:filename', handler: audio.deleteAudioFile },
  { method: 'DELETE', pattern: '/api/audio/session/:sessionId', handler: audio.deleteAudioSession },
  { method: 'GET', pattern: '/api/audio/cleanup', handler: audio.cleanupAudioFiles },

  // Audio Assets (music + sfx)
  { method: 'GET', pattern: '/api/audio-assets/music', handler: audioAssets.listMusicAssets },
  { method: 'GET', pattern: '/api/audio-assets/sfx', handler: audioAssets.listSfxAssets },

  // Image
  { method: 'POST', pattern: '/api/image/generate', handler: generateImage },

  // Video
  { method: 'POST', pattern: '/api/video/generate', handler: video.generateVideoWithSubtitles },
  { method: 'GET', pattern: '/api/video/list', handler: video.getGeneratedVideos },
  { method: 'GET', pattern: '/api/video/templates', handler: video.getTemplateVideos },
  { method: 'GET', pattern: '/api/video/templates/:filename', handler: video.serveTemplateVideo },
  { method: 'POST', pattern: '/api/video/upload-template', handler: video.uploadTemplateVideo, multipart: 'single', multipartField: 'video' },
  { method: 'GET', pattern: '/api/video/download/:filename', handler: video.downloadVideo },
  { method: 'DELETE', pattern: '/api/video/delete/:filename', handler: video.deleteVideo },
  { method: 'DELETE', pattern: '/api/video/cleanup', handler: video.cleanupVideoFiles },
  { method: 'POST', pattern: '/api/video/upload-ass', handler: video.uploadAssFile, multipart: 'single', multipartField: 'assFile' },
  { method: 'POST', pattern: '/api/video/analyze-ass', handler: video.analyzeAssForImages },
  { method: 'POST', pattern: '/api/video/generate-image-plan', handler: video.analyzeAssForImages },
  { method: 'GET', pattern: '/api/video/image-plan/:sessionId', handler: video.getImagePlanStatus },
  { method: 'POST', pattern: '/api/video/upload-image', handler: video.uploadImageForRequirement, multipart: 'single', multipartField: 'image' },
  { method: 'GET', pattern: '/api/video/uploaded-images/:sessionId', handler: video.getUploadedImages },
  { method: 'DELETE', pattern: '/api/video/delete-image/:sessionId/:filename', handler: video.deleteUploadedImage },
  { method: 'DELETE', pattern: '/api/video/uploaded-images/:sessionId/:filename', handler: video.deleteUploadedImage },
  { method: 'POST', pattern: '/api/video/upload-user-image', handler: video.uploadUserProvidedImage, multipart: 'single', multipartField: 'image' },
  { method: 'GET', pattern: '/api/video/user-images/:sessionId', handler: video.getUserProvidedImages },
  { method: 'PUT', pattern: '/api/video/user-images/:sessionId/:imageId', handler: video.updateUserProvidedImage },
  { method: 'POST', pattern: '/api/video/user-image-suggestions/:sessionId', handler: video.getUserImagePlacementSuggestions },
  { method: 'POST', pattern: '/api/video/analyze-user-images', handler: video.analyzeUserImages },
  { method: 'GET', pattern: '/api/video/image-analysis/:sessionId', handler: video.getImageAnalysis },
  { method: 'DELETE', pattern: '/api/video/delete-user-image/:sessionId/:imageId', handler: video.deleteUserProvidedImage },
  { method: 'GET', pattern: '/api/video/cleanup-ass-cache', handler: video.cleanupAssCache },
  { method: 'GET', pattern: '/api/video/ass-content', handler: video.getAssContent },
  { method: 'POST', pattern: '/api/video/upload-custom-suggestions', handler: video.uploadCustomSuggestions },

  // Project (Timeline Editor)
  // Register specific routes BEFORE parameterized routes to avoid conflicts
  { method: 'POST', pattern: '/api/project/create', handler: project.createProject },
  { method: 'GET', pattern: '/api/project/list', handler: project.listProjects },
  // Parameterized routes come after specific routes
  { method: 'GET', pattern: '/api/project/:id/export/status', handler: project.getExportStatus },
  { method: 'GET', pattern: '/api/project/:id/images', handler: project.listProjectImages },
  { method: 'GET', pattern: '/api/project/:id/image/:assetId', handler: project.serveProjectImage },
  { method: 'DELETE', pattern: '/api/project/:id/image/:assetId', handler: project.deleteProjectImage },
  { method: 'POST', pattern: '/api/project/:id/ai-draft', handler: project.generateAiDraftForProject },
  { method: 'POST', pattern: '/api/project/:id/image-plan', handler: project.generateImagePlanForProject },
  { method: 'POST', pattern: '/api/project/:id/animation-plan', handler: project.generateAnimationPlanForProject },
  { method: 'DELETE', pattern: '/api/project/:id/animation-plan', handler: project.deleteAnimationPlanForProject },
  { method: 'POST', pattern: '/api/project/:id/sfx-plan', handler: project.generateSfxPlanForProject },
  { method: 'POST', pattern: '/api/project/:id/preview', handler: project.generateProjectPreview },
  { method: 'POST', pattern: '/api/project/:id/preview/segment', handler: project.generateProjectPreviewSegment },
  { method: 'GET', pattern: '/api/project/:id/preview/segment/status', handler: project.getProjectPreviewSegmentStatus },
  { method: 'GET', pattern: '/api/project/:id/preview', handler: project.serveProjectPreview },
  { method: 'POST', pattern: '/api/project/:id/preview/hls', handler: project.generateProjectPreviewHls },
  { method: 'GET', pattern: '/api/project/:id/preview/hls/status', handler: project.getProjectPreviewHlsStatus },
  { method: 'GET', pattern: '/api/project/:id/preview/hls/:version/index.m3u8', handler: project.serveProjectPreviewHlsManifest },
  { method: 'GET', pattern: '/api/project/:id/preview/hls/:version/:segment', handler: project.serveProjectPreviewHlsSegment },
  { method: 'PUT', pattern: '/api/project/:id/timeline', handler: project.saveTimeline },
  { method: 'POST', pattern: '/api/project/:id/export', handler: project.startExport },
  { method: 'POST', pattern: '/api/project/:id/upload-image', handler: project.uploadImageForClip, multipart: 'single', multipartField: 'image' },
  { method: 'GET', pattern: '/api/project/:id', handler: project.getProject },
  { method: 'PUT', pattern: '/api/project/:id', handler: project.updateProject },
  { method: 'DELETE', pattern: '/api/project/:id', handler: project.deleteProject },

  // Streaming
  { method: 'GET', pattern: '/api/stream/:sessionId/files', handler: stream.streamFileUpdates },
]);
