import { Router, type IRouter } from 'express';
import { 
  generateConversationWithAudio, 
  generateAudioFromScript,
  regenerateAudioFile,
  getAudioFiles,
  getSessionDetails,
  downloadAudio, 
  deleteAudioFile, 
  deleteAudioSession,
  cleanupAudioFiles,
  testTTSConnection
} from '../controllers/audioController';

const router: IRouter = Router();

// GET /api/audio/test-connection - Test TTS API connection
router.get('/test-connection', testTTSConnection);

// POST /api/audio/generate-script - Generate conversation script only
router.post('/generate-script', generateConversationWithAudio);

// POST /api/audio/generate-audio - Generate audio from approved script
router.post('/generate-audio', generateAudioFromScript);

// POST /api/audio/regenerate/:sessionId/:filename - Regenerate specific audio file
router.post('/regenerate/:sessionId/:filename', regenerateAudioFile);

// POST /api/audio/generate - Generate conversation with audio using enhanced parameters (legacy)
router.post('/generate', generateConversationWithAudio);

// GET /api/audio/files - Get list of generated audio files
router.get('/files', getAudioFiles);

// GET /api/audio/session/:sessionId - Get detailed information about a specific session
router.get('/session/:sessionId', getSessionDetails);

// GET /api/audio/download/:filename - Download specific audio file
router.get('/download/:filename', downloadAudio);

// DELETE /api/audio/files/:filename - Delete specific audio file
router.delete('/files/:filename', deleteAudioFile);

// DELETE /api/audio/session/:sessionId - Delete entire session and all associated files
router.delete('/session/:sessionId', deleteAudioSession);

// GET /api/audio/cleanup - Cleanup temporary audio files
router.get('/cleanup', cleanupAudioFiles);

export default router;
