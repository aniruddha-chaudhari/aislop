import { Router, type IRouter } from 'express';
import { generateConversation, generateScript, generateAudioFromScript, getAudioFiles, downloadAudio, testTTS, getModels, setGPTWeights, setSoVITSWeights, testAssistants, testResearch } from '../controllers/assistantController';

const router: IRouter = Router();

// POST /api/assistant/script - Generate conversation script only (for approval)
router.post('/script', generateScript);

// POST /api/assistant/audio-from-script - Generate audio from approved script
router.post('/audio-from-script', generateAudioFromScript);

// POST /api/assistant/conversation - Generate Peter and Stewie conversation (legacy endpoint)
router.post('/conversation', generateConversation);

// GET /api/assistant/audio - Get list of generated audio files
router.get('/audio', getAudioFiles);

// GET /api/assistant/audio/:filename - Download specific audio file
router.get('/audio/:filename', downloadAudio);

// POST /api/assistant/test-tts - Test TTS functionality
router.post('/test-tts', testTTS);

// GET /api/assistant/models - Get list of available GPT and SoVITS models
router.get('/models', getModels);

// GET /api/assistant/set-gpt-weights - Set GPT model weights
router.get('/set-gpt-weights', setGPTWeights);

// GET /api/assistant/set-sovits-weights - Set SoVITS model weights
router.get('/set-sovits-weights', setSoVITSWeights);

// POST /api/assistant/test-assistants - Test assistants.ts conversation generation
router.post('/test-assistants', testAssistants);

// POST /api/assistant/test-research - Test assistants.ts research function
router.post('/test-research', testResearch);

export default router;
