import { Router } from 'express';
import type { Router as RouterType } from 'express';
import fs from 'fs';
import {
  generateVideoWithSubtitles,
  downloadVideo,
  getGeneratedVideos,
  deleteVideo,
  cleanupVideoFiles
} from '../controllers/videoController';

const router: RouterType = Router();

// Generate video with subtitles from session
router.post('/generate', generateVideoWithSubtitles);

// Test video generation setup
router.post('/test-generate', async (req, res) => {
  try {
    const { sessionId, backgroundVideoPath } = req.body;
    
    console.log('🧪 [TEST] Testing video generation setup...');
    console.log('🧪 [TEST] Session ID:', sessionId);
    console.log('🧪 [TEST] Background video path:', backgroundVideoPath);
    
    // Basic validation
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    if (!backgroundVideoPath || !fs.existsSync(backgroundVideoPath)) {
      return res.status(400).json({ error: 'Valid background video path is required' });
    }
    
    // Check FFmpeg availability
    const ffmpeg = require('fluent-ffmpeg');
    console.log('🧪 [TEST] FFmpeg available:', !!ffmpeg);
    
    // Check character images
    const characterImages = {
      Stewie: 'F:\\Aniruddha\\code\\webdev\\PROJECTS\\aislop\\src\\character_images\\Stewie_Griffin.png',
      Peter: 'F:\\Aniruddha\\code\\webdev\\PROJECTS\\aislop\\src\\character_images\\Peter_Griffin.png'
    };
    
    const missingImages = Object.entries(characterImages).filter(([char, path]) => !fs.existsSync(path));
    if (missingImages.length > 0) {
      console.log('🧪 [TEST] Missing character images:', missingImages);
      return res.status(400).json({ error: `Missing character images: ${missingImages.map(([char]) => char).join(', ')}` });
    }
    
    console.log('✅ [TEST] All prerequisites met');
    return res.json({ 
      success: true, 
      message: 'Video generation setup test passed',
      details: {
        sessionId,
        backgroundVideoExists: true,
        characterImagesExist: true,
        ffmpegAvailable: true
      }
    });
    
  } catch (error) {
    console.error('❌ [TEST] Test failed:', error);
    return res.status(500).json({ 
      error: 'Test failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get all generated videos
router.get('/list', getGeneratedVideos);

// Download video file
router.get('/download/:filename', downloadVideo);

// Delete specific video file
router.delete('/delete/:filename', deleteVideo);

// Clean up old video files (24h+)
router.delete('/cleanup', cleanupVideoFiles);

export default router;
