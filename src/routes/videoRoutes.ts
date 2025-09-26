import { Router } from 'express';
import type { Router as RouterType } from 'express';
import fs from 'fs';
import multer from 'multer';
import {
  generateVideoWithSubtitles,
  downloadVideo,
  getGeneratedVideos,
  deleteVideo,
  cleanupVideoFiles,
  getTemplateVideos,
  uploadTemplateVideo,
  analyzeAssForImages,
  getImagePlanStatus,
  uploadImageForRequirement,
  getUploadedImages,
  deleteUploadedImage,
  uploadAssFile,
  cleanupAssCache,
  uploadUserProvidedImage,
  getUserProvidedImages,
  deleteUserProvidedImage,
  updateUserProvidedImage,
  getUserImagePlacementSuggestions,
  analyzeUserImages,
  getImageAnalysis,
  // New copy/paste functionality
  getAssContent,
  uploadCustomSuggestions
} from '../controllers/videoController';

const router: RouterType = Router();

// Configure multer for file uploads
const upload = multer({ dest: 'temp/' });
const imageUpload = multer({
  dest: 'temp/',
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Generate video with subtitles from session
router.post('/generate', generateVideoWithSubtitles);

// Get all generated videos
router.get('/list', getGeneratedVideos);

// Get template videos
router.get('/templates', getTemplateVideos);

// Upload template video
router.post('/upload-template', upload.single('video'), uploadTemplateVideo);

// Download video file
router.get('/download/:filename', downloadVideo);

// Delete specific video file
router.delete('/delete/:filename', deleteVideo);

// Clean up old video files (24h+)
router.delete('/cleanup', cleanupVideoFiles);

// 🎯 IMAGE EMBEDDING ROUTES

// Upload ASS file for analysis
router.post('/upload-ass', upload.single('assFile'), uploadAssFile);

// Analyze ASS file and generate image embedding plan
router.post('/analyze-ass', analyzeAssForImages);

// Generate image plan (simplified workflow)
router.post('/generate-image-plan', analyzeAssForImages);

// Get current image plan status for a session
router.get('/image-plan/:sessionId', getImagePlanStatus);

// Upload image for specific requirement
router.post('/upload-image', imageUpload.single('image'), uploadImageForRequirement);

// 🎯 USER-PROVIDED IMAGE ROUTES

// Upload user-provided image with metadata
router.post('/upload-user-image', imageUpload.single('image'), uploadUserProvidedImage);

// Get user-provided images for a session
router.get('/user-images/:sessionId', getUserProvidedImages);

// Update user-provided image metadata
router.put('/user-images/:sessionId/:imageId', updateUserProvidedImage);

// Get user image placement suggestions
router.post('/user-image-suggestions/:sessionId', getUserImagePlacementSuggestions);

// 🎯 NEW: Analyze user images for relevance and suggest placements
router.post('/analyze-user-images', analyzeUserImages);

// 🎯 NEW: Get image analysis results
router.get('/image-analysis/:sessionId', getImageAnalysis);

// Delete user-provided image
router.delete('/delete-user-image/:sessionId/:imageId', deleteUserProvidedImage);

// Get list of uploaded images for a session
router.get('/uploaded-images/:sessionId', getUploadedImages);

// Delete uploaded image
router.delete('/delete-image/:sessionId/:filename', deleteUploadedImage);

// Cleanup ASS cache (remove expired files)
router.get('/cleanup-ass-cache', cleanupAssCache);

// 🆕 NEW: Copy/Paste functionality routes
// Get ASS content for viewing/copying
router.get('/ass-content', getAssContent);

// Upload custom suggestions via JSON (copy/paste approach)
router.post('/upload-custom-suggestions', uploadCustomSuggestions);

export default router;
