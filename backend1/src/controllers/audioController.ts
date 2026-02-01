import type { HttpContext } from '../utils/http';
import { jsonResponse } from '../utils/http';
import type { HandlerResult } from '../utils/http';
import { generateConversation } from '../service/assistants';
import type { CharacterName } from '../config/tts-config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { PrismaClient } from '../generated/prisma';
import { publishFileUpdate } from '../service/eventEmitter';
import { updateSessionDuration } from '../service/sessionDuration';

// Initialize Prisma client - schema.prisma has hardcoded database path
const prisma = new PrismaClient();

// Helper function to generate meaningful session names
function generateSessionName(conversation: any): string {
  if (!conversation || !conversation.topic) {
    return `Conversation ${new Date().toLocaleDateString()}`;
  }

  const topic = conversation.topic;
  const date = new Date().toLocaleDateString();

  // Clean up the topic and make it suitable for a filename/title
  const cleanTopic = topic
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim()
    .substring(0, 50); // Limit length

  return `${cleanTopic} - ${date}`;
}

// Hard-coded reference audio paths for Chatterbox TTS
const REFERENCE_AUDIO_PATHS = {
  Stewie: 'src/character_audio/family_guy/stew.mp3',
  Peter: 'src/character_audio/family_guy/peta.mp3'
};

// Chatterbox TTS API configuration
const CHATTERBOX_TTS_API = 'http://localhost:8000';
// Centralised storage directories for generated assets
const AUDIO_OUTPUT_DIR = path.join(process.cwd(), 'storage', 'audio');
const TEMP_DIR = path.join(process.cwd(), 'storage', 'temp');

// Concurrency control for TTS API - limit concurrent requests to prevent overwhelming the server.
// Chatterbox often runs effectively single-threaded on GPU; running concurrent /generate calls can
// make the 2nd request wait long enough to hit client timeouts. Default to 1 for reliability.
const MAX_CONCURRENT_TTS_REQUESTS = 1;

// Semaphore for controlling concurrent TTS requests
class TTSConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (this.running < MAX_CONCURRENT_TTS_REQUESTS) {
      this.running++;
      return;
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.running++;
        next();
      }
    }
  }
}

const ttsLimiter = new TTSConcurrencyLimiter();

// Ensure audio output directory exists
if (!fs.existsSync(AUDIO_OUTPUT_DIR)) {
  fs.mkdirSync(AUDIO_OUTPUT_DIR, { recursive: true });
}

// Helper to compute WAV duration from header; falls back to 0 if parsing fails
function getWavDurationSeconds(filePath: string): number {
  try {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(128);
    fs.readSync(fd, header, 0, 128, 0);
    fs.closeSync(fd);

    // Validate RIFF/WAVE
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
      return 0;
    }

    // Find 'fmt ' chunk to get byte rate; simple linear scan for chunk IDs
    let offset = 12; // after RIFF/WAVE
    let byteRate = 0;
    let dataSize = 0;
    while (offset + 8 <= header.length) {
      const chunkId = header.toString('ascii', offset, offset + 4);
      const chunkSize = header.readUInt32LE(offset + 4);
      if (chunkId === 'fmt ') {
        // Byte rate at fmt chunk + 8 + 8 (after chunk header and fmt fields up to byte rate)
        // Standard PCM fmt chunk size is 16; byteRate is at offset 28 from start of RIFF (or fmt start + 8 + 8)
        // But we are inside header buffer, we can safely read at offset + 8 + 8
        const pos = offset + 8 + 8;
        if (pos + 4 <= header.length) {
          byteRate = header.readUInt32LE(pos);
        }
      } else if (chunkId === 'data') {
        dataSize = chunkSize;
      }
      offset += 8 + chunkSize;
      if (offset > header.length) break;
    }

    if (byteRate > 0 && dataSize > 0) {
      return dataSize / byteRate;
    }
    return 0;
  } catch {
    return 0;
  }
}

// Clean up old user image files from previous sessions
export function cleanupOldUserImageFiles(): void {
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      return;
    }

    const files = fs.readdirSync(TEMP_DIR);

    let cleanedCount = 0;
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);

      // Clean up user images files
      if (file.endsWith('_user_images.json')) {
        fs.unlinkSync(filePath);
        cleanedCount++;
      }

      // Clean up image plan files
      if (file.endsWith('_image_plan.json')) {
        fs.unlinkSync(filePath);
        cleanedCount++;
        console.log(`🧹 [CLEANUP] Removed old image plan file: ${file}`);
      }

      // Clean up image analysis files
      if (file.endsWith('_image_analysis.json')) {
        fs.unlinkSync(filePath);
        cleanedCount++;
      }

      // Clean up subtitle files (older than 1 hour)
      if (file.endsWith('_subtitles.ass')) {
        try {
          const stats = fs.statSync(filePath);
          const fileAge = Date.now() - stats.mtime.getTime();
          const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds

          if (fileAge > oneHour) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        } catch (error) {
          // skip
        }
      }
    }

    // Clean up ass_cache directory contents
    const assCacheDir = path.join(TEMP_DIR, 'ass_cache');
    if (fs.existsSync(assCacheDir)) {
      try {
        const cacheFiles = fs.readdirSync(assCacheDir);
        for (const cacheFile of cacheFiles) {
          const cacheFilePath = path.join(assCacheDir, cacheFile);
          fs.unlinkSync(cacheFilePath);
          cleanedCount++;
        }
      } catch (error) {
        // skip
      }
    }

    // Clean up generated images directory contents
    const generatedImagesDir = path.join(process.cwd(), 'storage', 'images');
    if (fs.existsSync(generatedImagesDir)) {
      try {
        const sessionDirs = fs.readdirSync(generatedImagesDir);
        for (const sessionDir of sessionDirs) {
          const sessionDirPath = path.join(generatedImagesDir, sessionDir);

          // Only delete directories (session folders), not files
          if (fs.statSync(sessionDirPath).isDirectory()) {
            fs.rmSync(sessionDirPath, { recursive: true, force: true });
            cleanedCount++;
          }
        }
      } catch (error) {
        // skip
      }
    }

  } catch (error) {
    // skip
  }
}

// Helper function to test Chatterbox TTS API connection
async function testTTSApiConnection(): Promise<boolean> {
  try {
    const response = await axios.get(`${CHATTERBOX_TTS_API}/health`);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

export interface AudioGenerationParams {
  text: string;
  audioPath?: string;
  exaggeration?: number;
  temperature?: number;
  seedNum?: number;
  cfgWeight?: number;
  minP?: number;
  topP?: number;
  repetitionPenalty?: number;
  character?: CharacterName;
}

// Helper function to generate audio using Chatterbox TTS API
async function generateAudioWithChatterbox(
  text: string,
  character: CharacterName,
  outputPath: string,
  params: {
    exaggeration: number;
    temperature: number;
    seedNum: number;
    cfgWeight: number;
    minP: number;
    topP: number;
    repetitionPenalty: number;
  }
): Promise<void> {
  try {
    const referenceAudioPath = REFERENCE_AUDIO_PATHS[character];

    if (!fs.existsSync(referenceAudioPath)) {
      throw new Error(`Reference audio file not found for ${character}: ${referenceAudioPath}`);
    }

    // Truncate text if too long (API limit is 1000 characters)
    const truncatedText = text.length > 1000 ? text.substring(0, 1000) : text;

    // Create form data with request parameters and audio file
    const formData = new FormData();

    // Add each parameter as a separate form field
    formData.append('text', truncatedText);
    formData.append('exaggeration', params.exaggeration.toString());
    formData.append('temperature', params.temperature.toString());
    formData.append('seed_num', params.seedNum.toString());
    formData.append('cfg_weight', params.cfgWeight.toString());
    formData.append('min_p', params.minP.toString());
    formData.append('top_p', params.topP.toString());
    formData.append('repetition_penalty', params.repetitionPenalty.toString());

    // Add the audio prompt file
    formData.append('audio_prompt', fs.createReadStream(referenceAudioPath), {
      filename: path.basename(referenceAudioPath),
      contentType: 'audio/mpeg'
    });

    const url = `${CHATTERBOX_TTS_API}/generate`;

    // Generate the audio
    const generateResponse = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders()
      },
      // Generation can take >2 minutes depending on GPU + model warmup + text length.
      timeout: 300000, // 5 minutes
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });


    if (!generateResponse.data || !generateResponse.data.audio_file_path) {
      throw new Error('Invalid response from TTS API - no audio file path returned');
    }

    const generatedAudioPath = generateResponse.data.audio_file_path;
    const audioFilename = path.basename(generatedAudioPath);


    // Download the generated audio file
    const downloadResponse = await axios.get(`${CHATTERBOX_TTS_API}/audio/${audioFilename}`, {
      responseType: 'stream',
      timeout: 180000 // 3 minutes (slow disks / large files)
    });

    // Save to output path
    const writer = fs.createWriteStream(outputPath);
    downloadResponse.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        resolve();
      });
      writer.on('error', (err) => {
        reject(err);
      });
    });

  } catch (error: any) {

    // Enhanced debugging for 422 errors
    if (error.response) {

      if (error.response.status === 422 && error.response.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          error.response.data.detail.forEach((err: any, index: number) => {
            if (err.input !== undefined) {
            }
          });
        } else {
        }
      }
    } else if (error.request) {
    } else {
    }

    // Format error message
    let errorMessage = error.message;
    if (error.response?.status === 422) {
      if (error.response.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          const validationErrors = error.response.data.detail.map((err: any) =>
            `${err.loc.join('.')}: ${err.msg} (got: ${err.input})`
          ).join('; ');
          errorMessage = `Validation failed - ${validationErrors}`;
        } else {
          errorMessage = `Validation failed - ${error.response.data.detail}`;
        }
      }
    }

    throw new Error(`Failed to generate audio for ${character}: ${errorMessage}`);
  }
}

export async function generateConversationWithAudio(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const b = ctx.body as Record<string, unknown>;
    const text = b?.text;
    const exaggeration = (b?.exaggeration as number) ?? 0.6;
    const temperature = (b?.temperature as number) ?? 1.5;
    const seedNum = (b?.seedNum as number) ?? 0;
    const cfgWeight = (b?.cfgWeight as number) ?? 0.3;
    const minP = (b?.minP as number) ?? 0.05;
    const topP = (b?.topP as number) ?? 1.0;
    const repetitionPenalty = (b?.repetitionPenalty as number) ?? 1.2;


    if (!text || typeof text !== 'string' || (text as string).trim() === '') {
      return jsonResponse(400, { error: 'Text is required and must be a non-empty string' });
    }
    if ((text as string).length > 1000) {
      return jsonResponse(400, { error: 'Text must be 300 characters or less' });
    }
    if (exaggeration < 0.25 || exaggeration > 2.0) return jsonResponse(400, { error: 'Exaggeration must be between 0.25 and 2.0' });
    if (temperature < 0.05 || temperature > 5.0) return jsonResponse(400, { error: 'Temperature must be between 0.05 and 5.0' });
    if (cfgWeight < 0.0 || cfgWeight > 1.0) return jsonResponse(400, { error: 'CFG weight must be between 0.0 and 1.0' });
    if (minP < 0.0 || minP > 1.0) return jsonResponse(400, { error: 'min_p must be between 0.0 and 1.0' });
    if (topP < 0.0 || topP > 1.0) return jsonResponse(400, { error: 'top_p must be between 0.0 and 1.0' });
    if (repetitionPenalty < 1.0 || repetitionPenalty > 2.0) return jsonResponse(400, { error: 'Repetition penalty must be between 1.0 and 2.0' });

    const conversation = await generateConversation(text as string);
    if (!conversation?.conversation?.length) {
      return jsonResponse(500, { success: false, error: 'Failed to generate conversation script' });
    }

    return jsonResponse(200, {
      success: true,
      message: 'Conversation script generated successfully',
      data: conversation,
      parameters: { exaggeration, temperature, seedNum, cfgWeight, minP, topP, repetitionPenalty },
    });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Internal server error occurred while generating conversation script', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function generateAudioFromScript(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const b = ctx.body as Record<string, unknown>;
    const conversation = b?.conversation as { conversation: unknown[]; topic?: string } | undefined;
    const exaggeration = (b?.exaggeration as number) ?? 0.6;
    const temperature = (b?.temperature as number) ?? 1.5;
    const seedNum = (b?.seedNum as number) ?? 0;
    const cfgWeight = (b?.cfgWeight as number) ?? 0.3;
    const minP = (b?.minP as number) ?? 0.05;
    const topP = (b?.topP as number) ?? 1.0;
    const repetitionPenalty = (b?.repetitionPenalty as number) ?? 1.2;


    if (!conversation?.conversation || !Array.isArray(conversation.conversation) || conversation.conversation.length === 0) {
      return jsonResponse(400, { error: 'Valid conversation script is required' });
    }
    if (exaggeration < 0.25 || exaggeration > 2.0) return jsonResponse(400, { error: 'Exaggeration must be between 0.25 and 2.0' });
    if (temperature < 0.05 || temperature > 5.0) return jsonResponse(400, { error: 'Temperature must be between 0.05 and 5.0' });
    if (cfgWeight < 0.0 || cfgWeight > 1.0) return jsonResponse(400, { error: 'CFG weight must be between 0.0 and 1.0' });
    if (minP < 0.0 || minP > 1.0) return jsonResponse(400, { error: 'min_p must be between 0.0 and 1.0' });
    if (topP < 0.0 || topP > 1.0) return jsonResponse(400, { error: 'top_p must be between 0.0 and 1.0' });
    if (repetitionPenalty < 1.0 || repetitionPenalty > 2.0) return jsonResponse(400, { error: 'Repetition penalty must be between 1.0 and 2.0' });

    const apiConnected = await testTTSApiConnection();
    if (!apiConnected) {
      return jsonResponse(503, { success: false, error: 'TTS API is not available. Please ensure the Chatterbox TTS server is running on port 8000.' });
    }

    for (const [char, audioPath] of Object.entries(REFERENCE_AUDIO_PATHS)) {
      if (!fs.existsSync(audioPath)) {
        return jsonResponse(500, { success: false, error: `Reference audio file missing for ${char}: ${audioPath}` });
      }
    }

    const sessionName = generateSessionName(conversation);
    const session = await prisma.session.create({
      data: {
        name: sessionName,
        exaggeration,
        temperature,
        seedNum,
        cfgWeight,
        minP,
        topP,
        repetitionPenalty,
        totalDialogues: conversation.conversation.length,
        audioFilesGenerated: 0,
        allSuccessful: false
      }
    });

    const sessionId = session.id;

    // Clean up old user image files from previous sessions
    cleanupOldUserImageFiles();

    // Initialize session directory
    const sessionDir = path.join(AUDIO_OUTPUT_DIR, sessionId);

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Save conversation data for regeneration
    const conversationPath = path.join(sessionDir, 'conversation.json');
    fs.writeFileSync(conversationPath, JSON.stringify(conversation, null, 2));

    const dialogueRecords: { id: string }[] = [];
    for (let i = 0; i < conversation.conversation.length; i++) {
      const item = conversation.conversation[i] as { character: string; dialogue: string };
      const { character: convCharacter, dialogue } = item;

      const dialogueRecord = await prisma.dialogue.create({
        data: {
          sessionId,
          text: dialogue,
          character: convCharacter,
          order: i + 1
        }
      });

      dialogueRecords.push(dialogueRecord);
    }


    // Publish start event immediately (SSE controller buffers recent messages)
    publishFileUpdate(sessionId, {
      type: 'started',
      total: conversation.conversation.length
    });

    const totalFiles = conversation.conversation.length;

    // Process files in parallel - don't wait for all to complete
    // Use a Set to track completed files atomically
    const completedFiles = new Set<string>();
    
    const generatePromises = conversation.conversation.map(async (item, i) => {
      const dialogueRecord = dialogueRecords[i];
      const { character: convCharacter, dialogue } = item as { character: string; dialogue: string };


      // Validate character
      if (!['Stewie', 'Peter'].includes(convCharacter)) {
        const fileId = `${sessionId}_${i + 1}`;
        completedFiles.add(fileId);
        publishFileUpdate(sessionId, {
          type: 'error',
          fileId: dialogueRecord.id,
          error: `Invalid character: ${convCharacter}`,
          progress: completedFiles.size,
          total: totalFiles
        });
        return;
      }

      // Generate audio
      const filename = `${sessionId}_${String(i + 1).padStart(2, '0')}_${convCharacter.toLowerCase()}.wav`;
      const outputPath = path.join(sessionDir, filename);
      const fileId = `${sessionId}_${i + 1}`;

      try {
        // Publish progress update (starting)
        publishFileUpdate(sessionId, {
          type: 'progress',
          fileId,
          filename,
          progress: i + 1,
          total: totalFiles,
          status: 'generating'
        });

        // Acquire semaphore to limit concurrent TTS requests
        await ttsLimiter.acquire();
        try {
          await generateAudioWithChatterbox(dialogue, convCharacter as CharacterName, outputPath, {
            exaggeration,
            temperature,
            seedNum,
            cfgWeight,
            minP,
            topP,
            repetitionPenalty
          });
        } finally {
          // Always release semaphore, even if generation fails
          ttsLimiter.release();
        }

        // Get file size
        const stats = fs.statSync(outputPath);
        const fileSize = stats.size;

        // Create audio file record
        await prisma.audioFile.create({
          data: {
            sessionId,
            dialogueId: dialogueRecord.id,
            filename,
            filePath: outputPath,
            fileSize,
            success: true
          }
        });


        // Track completion atomically
        completedFiles.add(fileId);
        const currentCompleted = completedFiles.size;

        // Publish completion update immediately
        publishFileUpdate(sessionId, {
          type: 'completed',
          fileId,
          filename,
          path: outputPath,
          progress: currentCompleted,
          total: totalFiles,
          completedCount: currentCompleted,
          status: 'ready'
        });

      } catch (audioError) {

        // Track completion even on error
        completedFiles.add(fileId);
        const currentCompleted = completedFiles.size;

        // Create audio file record with error
        await prisma.audioFile.create({
          data: {
            sessionId,
            dialogueId: dialogueRecord.id,
            filename,
            filePath: outputPath,
            success: false,
            errorMessage: audioError instanceof Error ? audioError.message : 'Unknown error'
          }
        });

        // Publish error update
        publishFileUpdate(sessionId, {
          type: 'error',
          fileId,
          filename,
          error: audioError instanceof Error ? audioError.message : 'Unknown error',
          progress: currentCompleted,
          total: totalFiles
        });
      }
    });

    // Start all generations in parallel but don't await - return immediately
    Promise.all(generatePromises).then(async () => {
      // Get final count from database
      const finalCount = await prisma.audioFile.count({
        where: { sessionId, success: true }
      });

      const allGenerated = finalCount === totalFiles;

      // Calculate and store total duration
      const totalDuration = await updateSessionDuration(sessionId);

      // Update session with final stats
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          audioFilesGenerated: finalCount,
          allSuccessful: allGenerated
        }
      });

      // Publish final completion event
      publishFileUpdate(sessionId, {
        type: 'completed',
        status: 'all_complete',
        progress: finalCount,
        total: totalFiles,
        allSuccessful: allGenerated
      });

    }).catch(error => {
      publishFileUpdate(sessionId, {
        type: 'error',
        error: 'Generation failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    });

    // Return immediately with sessionId - files will be streamed via SSE
    return jsonResponse(200, {
      success: true,
      message: 'Audio generation started',
      sessionId,
      parameters: { exaggeration, temperature, seedNum, cfgWeight, minP, topP, repetitionPenalty },
      streamEndpoint: `/api/stream/${sessionId}/files`,
      note: 'Files are being generated asynchronously. Connect to the stream endpoint to receive real-time updates.'
    });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Internal server error occurred while generating conversation script', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function regenerateAudioFile(ctx: HttpContext): Promise<HandlerResult> {
  let sessionId = '';
  let filename = '';
  try {
    sessionId = ctx.params?.sessionId ?? '';
    filename = ctx.params?.filename ?? '';
    const b = ctx.body as Record<string, unknown>;
    const text = (b?.text as string) ?? '';
    const exaggeration = (b?.exaggeration as number) ?? 0.6;
    const temperature = (b?.temperature as number) ?? 1.5;
    const seedNum = (b?.seedNum as number) ?? 0;
    const cfgWeight = (b?.cfgWeight as number) ?? 0.3;
    const minP = (b?.minP as number) ?? 0.05;
    const topP = (b?.topP as number) ?? 1.0;
    const repetitionPenalty = (b?.repetitionPenalty as number) ?? 1.2;


    if (exaggeration < 0.25 || exaggeration > 2.0) return jsonResponse(400, { error: 'Exaggeration must be between 0.25 and 2.0' });
    if (temperature < 0.05 || temperature > 5.0) return jsonResponse(400, { error: 'Temperature must be between 0.05 and 5.0' });
    if (cfgWeight < 0.0 || cfgWeight > 1.0) return jsonResponse(400, { error: 'CFG weight must be between 0.0 and 1.0' });
    if (minP < 0.0 || minP > 1.0) return jsonResponse(400, { error: 'min_p must be between 0.0 and 1.0' });
    if (topP < 0.0 || topP > 1.0) return jsonResponse(400, { error: 'top_p must be between 0.0 and 1.0' });
    if (repetitionPenalty < 1.0 || repetitionPenalty > 2.0) return jsonResponse(400, { error: 'Repetition penalty must be between 1.0 and 2.0' });

    const filenameParts = filename.split('_');
    if (filenameParts.length < 3) return jsonResponse(400, { error: 'Invalid filename format' });
    const actualSessionId = filenameParts[0];
    const order = parseInt(filenameParts[1], 10);
    if (isNaN(order)) return jsonResponse(400, { error: 'Invalid order in filename' });


    const dialogueRecord = await prisma.dialogue.findFirst({
      where: {
        sessionId: actualSessionId,
        order: order
      },
      include: {
        audioFile: true
      }
    });

    if (!dialogueRecord) {
      return jsonResponse(404, { error: 'Dialogue record not found in database' });
    }

    let finalText = dialogueRecord.text;

    if (text !== undefined && String(text).trim() !== '') {
      finalText = String(text).trim();
      // Update the database record with new text
      await prisma.dialogue.update({
        where: { id: dialogueRecord.id },
        data: { text: finalText }
      });
    } else {
    }

    const outputPath = path.join(AUDIO_OUTPUT_DIR, actualSessionId, filename);

    const apiConnected = await testTTSApiConnection();
    if (!apiConnected) {
      return jsonResponse(503, { error: 'TTS API is not available' });
    }

    // Regenerate audio
    await generateAudioWithChatterbox(
      finalText,
      dialogueRecord.character as CharacterName,
      outputPath,
      {
        exaggeration,
        temperature,
        seedNum,
        cfgWeight,
        minP,
        topP,
        repetitionPenalty
      }
    );

    // Get file size
    const stats = fs.statSync(outputPath);
    const fileSize = stats.size;

    // Update or create audio file record
    if (dialogueRecord.audioFile) {
      // Update existing record
      await prisma.audioFile.update({
        where: { id: dialogueRecord.audioFile.id },
        data: {
          filename,
          fileSize,
          success: true,
          errorMessage: null,
          generatedAt: new Date()
        }
      });
    } else {
      // Create new record
      await prisma.audioFile.create({
        data: {
          sessionId: actualSessionId,
          dialogueId: dialogueRecord.id,
          filename,
          filePath: outputPath,
          fileSize,
          success: true
        }
      });
    }


    // Recalculate and update session duration
    await updateSessionDuration(actualSessionId);

    return jsonResponse(200, {
      success: true,
      message: 'Audio regenerated successfully',
      filename,
      sessionId: actualSessionId,
      parameters: { exaggeration, temperature, seedNum, cfgWeight, minP, topP, repetitionPenalty },
      fileSize,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorType = error instanceof Error ? error.constructor.name : 'Unknown';
    return jsonResponse(500, {
      success: false,
      error: 'Failed to regenerate audio',
      details: errorMessage,
      debug: { sessionId, filename, errorType, errorMessage },
    });
  }
}

export async function getSessionDetails(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const sessionId = ctx.params?.sessionId;
    if (!sessionId) {
      return jsonResponse(400, { error: 'Session ID is required' });
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        dialogues: {
          include: {
            audioFile: true
          },
          orderBy: {
            order: 'asc'
          }
        },
        audioFiles: {
          orderBy: {
            generatedAt: 'asc'
          }
        }
      }
    });

    if (!session) {
      return jsonResponse(404, { error: 'Session not found' });
    }

    const formattedSession = {
      sessionId: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      parameters: {
        exaggeration: session.exaggeration,
        temperature: session.temperature,
        seedNum: session.seedNum,
        cfgWeight: session.cfgWeight,
        minP: session.minP,
        topP: session.topP,
        repetitionPenalty: session.repetitionPenalty
      },
      stats: {
        totalDialogues: session.totalDialogues,
        audioFilesGenerated: session.audioFilesGenerated,
        allSuccessful: session.allSuccessful
      },
      dialogues: session.dialogues.map(dialogue => ({
        id: dialogue.id,
        text: dialogue.text,
        character: dialogue.character,
        order: dialogue.order,
        createdAt: dialogue.createdAt,
        audioFile: dialogue.audioFile ? {
          id: dialogue.audioFile.id,
          filename: dialogue.audioFile.filename,
          filePath: dialogue.audioFile.filePath,
          fileSize: dialogue.audioFile.fileSize,
          duration: dialogue.audioFile.duration,
          success: dialogue.audioFile.success,
          errorMessage: dialogue.audioFile.errorMessage,
          generatedAt: dialogue.audioFile.generatedAt
        } : null
      })),
      audioFiles: session.audioFiles.map(audioFile => ({
        id: audioFile.id,
        filename: audioFile.filename,
        filePath: audioFile.filePath,
        fileSize: audioFile.fileSize,
        duration: audioFile.duration,
        success: audioFile.success,
        errorMessage: audioFile.errorMessage,
        generatedAt: audioFile.generatedAt
      }))
    };

    return jsonResponse(200, { success: true, session: formattedSession });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Failed to get session details' });
  }
}

export async function getAudioFiles(_ctx: HttpContext): Promise<HandlerResult> {
  try {
    const sessions = await prisma.session.findMany({
      include: {
        dialogues: {
          include: {
            audioFile: true
          },
          orderBy: {
            order: 'asc'
          }
        },
        audioFiles: {
          orderBy: {
            generatedAt: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Transform the data for the frontend
    const formattedSessions = sessions.map(session => {
      // Use stored total duration if available, otherwise calculate it
      let totalDurationSeconds = 0;
      
      if (typeof session.totalDuration === 'number' && session.totalDuration > 0) {
        totalDurationSeconds = Math.floor(session.totalDuration);
      } else {
        // Fallback: calculate from audio files
        const durationsByDialogueId: Record<string, number> = {};
        const sortedDialogues = [...session.dialogues].sort((a, b) => a.order - b.order);
        
        for (const d of sortedDialogues) {
          if (d.audioFile) {
            let duration = 0;
            if (typeof d.audioFile.duration === 'number' && isFinite(d.audioFile.duration) && d.audioFile.duration > 0) {
              duration = d.audioFile.duration;
            } else if (d.audioFile.filePath && fs.existsSync(d.audioFile.filePath)) {
              duration = getWavDurationSeconds(d.audioFile.filePath);
            }
            durationsByDialogueId[d.id] = Math.max(0, duration);
          }
        }
        
        let cumulative = 0;
        for (const d of sortedDialogues) {
          cumulative += durationsByDialogueId[d.id] || 0;
        }
        totalDurationSeconds = Math.floor(cumulative);
      }

      // Build a lookup from dialogue id to duration and start offsets
      const durationsByDialogueId: Record<string, number> = {};
      const sortedDialogues = [...session.dialogues].sort((a, b) => a.order - b.order);
      for (const d of sortedDialogues) {
        if (d.audioFile) {
          let duration = 0;
          if (typeof d.audioFile.duration === 'number' && isFinite(d.audioFile.duration) && d.audioFile.duration > 0) {
            duration = d.audioFile.duration;
          } else if (d.audioFile.filePath && fs.existsSync(d.audioFile.filePath)) {
            duration = getWavDurationSeconds(d.audioFile.filePath);
          }
          durationsByDialogueId[d.id] = Math.max(0, duration);
        }
      }

      const startOffsetByDialogueId: Record<string, number> = {};
      let cumulative = 0;
      for (const d of sortedDialogues) {
        startOffsetByDialogueId[d.id] = Math.floor(cumulative);
        cumulative += durationsByDialogueId[d.id] || 0;
      }

      return {
        sessionId: session.id,
        name: session.name,
        createdAt: session.createdAt,
        parameters: {
          exaggeration: session.exaggeration,
          temperature: session.temperature,
          seedNum: session.seedNum,
          cfgWeight: session.cfgWeight,
          minP: session.minP,
          topP: session.topP,
          repetitionPenalty: session.repetitionPenalty
        },
        stats: {
          totalDialogues: session.totalDialogues,
          audioFilesGenerated: session.audioFilesGenerated,
          allSuccessful: session.allSuccessful
        },
        dialogues: session.dialogues.map(dialogue => ({
          id: dialogue.id,
          text: dialogue.text,
          character: dialogue.character,
          order: dialogue.order,
          startOffsetSeconds: startOffsetByDialogueId[dialogue.id] || 0,
          audioFile: dialogue.audioFile ? {
            id: dialogue.audioFile.id,
            filename: dialogue.audioFile.filename,
            filePath: dialogue.audioFile.filePath,
            fileSize: dialogue.audioFile.fileSize,
            duration: durationsByDialogueId[dialogue.id] || 0,
            success: dialogue.audioFile.success,
            errorMessage: dialogue.audioFile.errorMessage,
            generatedAt: dialogue.audioFile.generatedAt
          } : null
        })),
        files: session.audioFiles
          .filter(audioFile => audioFile.success)
          .map(audioFile => ({
            id: audioFile.id,
            filename: audioFile.filename,
            path: audioFile.filePath,
            fileSize: audioFile.fileSize,
            generatedAt: audioFile.generatedAt
          })),
        totalDurationSeconds
      };
    });

    return jsonResponse(200, { success: true, sessions: formattedSessions });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Failed to get audio files', details: error instanceof Error ? error.message : String(error) });
  }
}

export async function downloadAudio(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const filename = ctx.params?.filename;
    const sessionId = ctx.query?.sessionId;

    if (!filename) {
      return jsonResponse(400, { error: 'Filename is required' });
    }

    let filePath: string;

    if (sessionId) {
      const audioFile = await prisma.audioFile.findFirst({
        where: { sessionId: String(sessionId), filename },
      });
      if (!audioFile) return jsonResponse(404, { error: 'Audio file not found in database' });
      filePath = audioFile.filePath;
    } else {
      const audioFile = await prisma.audioFile.findFirst({
        where: { filename },
      });
      if (!audioFile) return jsonResponse(404, { error: 'Audio file not found in database' });
      filePath = audioFile.filePath;
    }

    if (!fs.existsSync(filePath)) {
      return jsonResponse(404, { error: 'Audio file not found on disk' });
    }

    const buf = await fs.promises.readFile(filePath);
    return new Response(new Blob([buf]), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Failed to download audio file' });
  }
}

export async function deleteAudioFile(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const filename = ctx.params?.filename;
    const sessionId = ctx.query?.sessionId;


    if (!filename) return jsonResponse(400, { error: 'Filename is required' });

    const audioFile = await prisma.audioFile.findFirst({
      where: sessionId ? { sessionId: String(sessionId), filename } : { filename },
    });

    if (!audioFile) return jsonResponse(404, { error: 'Audio file not found in database' });

    await prisma.audioFile.delete({ where: { id: audioFile.id } });
    if (fs.existsSync(audioFile.filePath)) {
      fs.unlinkSync(audioFile.filePath);
    }

    return jsonResponse(200, { success: true, message: `Audio file ${filename} deleted successfully` });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Failed to delete audio file' });
  }
}

export async function deleteAudioSession(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const sessionId = ctx.params?.sessionId;
    if (!sessionId) return jsonResponse(400, { error: 'Session ID is required' });

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { audioFiles: true, dialogues: true },
    });
    if (!session) return jsonResponse(404, { error: 'Session not found' });

    for (const audioFile of session.audioFiles) {
      if (fs.existsSync(audioFile.filePath)) {
        fs.unlinkSync(audioFile.filePath);
      }
    }

    const sessionDir = path.join(AUDIO_OUTPUT_DIR, sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    await prisma.session.delete({ where: { id: sessionId } });

    return jsonResponse(200, { success: true, message: `Session ${sessionId} and all associated files deleted successfully` });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Failed to delete audio session' });
  }
}

export async function testTTSConnection(_ctx: HttpContext): Promise<HandlerResult> {
  try {
    const connected = await testTTSApiConnection();

    if (connected) {
      return jsonResponse(200, { success: true, message: 'TTS API is connected and running', apiUrl: CHATTERBOX_TTS_API });
    }
    return jsonResponse(503, {
      success: false,
      message: 'TTS API is not available',
      apiUrl: CHATTERBOX_TTS_API,
      suggestion: 'Please ensure the Chatterbox TTS FastAPI server is running on port 8000',
    });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Failed to test TTS connection', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function cleanupAudioFiles(_ctx: HttpContext): Promise<HandlerResult> {
  try {
    if (!fs.existsSync(AUDIO_OUTPUT_DIR)) {
      return jsonResponse(200, { success: true, message: 'No audio files to clean up', deletedCount: 0 });
    }

    let deletedCount = 0;
    const sessions = fs.readdirSync(AUDIO_OUTPUT_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());

    for (const session of sessions) {
      const sessionPath = path.join(AUDIO_OUTPUT_DIR, session.name);
      const files = fs.readdirSync(sessionPath);
      for (const file of files) {
        fs.unlinkSync(path.join(sessionPath, file));
        deletedCount++;
      }
      if (fs.readdirSync(sessionPath).length === 0) {
        fs.rmdirSync(sessionPath);
      }
    }

    return jsonResponse(200, { success: true, message: `Cleaned up ${deletedCount} temporary audio files`, deletedCount });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Failed to clean up audio files' });
  }
}
