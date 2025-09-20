import { Request, Response } from 'express';
import { generateConversation } from '../service/assistants';
import { CharacterName } from '../config/tts-config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import { PrismaClient } from '../generated/prisma';

// Initialize Prisma client
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
  Stewie: 'F:\\Aniruddha\\code\\webdev\\PROJECTS\\aislop\\stew.mp3',
  Peter: 'F:\\Aniruddha\\code\\webdev\\PROJECTS\\aislop\\peta.mp3'
};

// Chatterbox TTS API configuration
const CHATTERBOX_TTS_API = 'http://localhost:8000';
const AUDIO_OUTPUT_DIR = path.join(process.cwd(), 'generated_audio');
const TEMP_DIR = path.join(process.cwd(), 'temp');

// Ensure audio output directory exists
if (!fs.existsSync(AUDIO_OUTPUT_DIR)) {
  fs.mkdirSync(AUDIO_OUTPUT_DIR, { recursive: true });
}

// Clean up old user image files from previous sessions
export function cleanupOldUserImageFiles(): void {
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      console.log(`🧹 [CLEANUP] Temp directory doesn't exist, skipping cleanup`);
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
        console.log(`🧹 [CLEANUP] Removed old user images file: ${file}`);
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
        console.log(`🧹 [CLEANUP] Removed old image analysis file: ${file}`);
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
            console.log(`🧹 [CLEANUP] Removed old subtitles file: ${file}`);
          }
        } catch (error) {
          console.warn(`⚠️ [CLEANUP] Error checking age of ${file}:`, error);
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
          console.log(`🧹 [CLEANUP] Removed old ASS cache file: ${cacheFile}`);
        }
      } catch (error) {
        console.warn(`⚠️ [CLEANUP] Error cleaning ASS cache directory:`, error);
      }
    }
    
    // Clean up generated_images directory contents
    const generatedImagesDir = path.join(process.cwd(), 'generated_images');
    if (fs.existsSync(generatedImagesDir)) {
      try {
        const sessionDirs = fs.readdirSync(generatedImagesDir);
        for (const sessionDir of sessionDirs) {
          const sessionDirPath = path.join(generatedImagesDir, sessionDir);
          
          // Only delete directories (session folders), not files
          if (fs.statSync(sessionDirPath).isDirectory()) {
            fs.rmSync(sessionDirPath, { recursive: true, force: true });
            cleanedCount++;
            console.log(`🧹 [CLEANUP] Removed old generated images session: ${sessionDir}`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ [CLEANUP] Error cleaning generated images directory:`, error);
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 [CLEANUP] Cleaned up ${cleanedCount} old temp files and directories`);
    } else {
      console.log(`🧹 [CLEANUP] No old temp files to clean`);
    }
  } catch (error) {
    console.warn(`⚠️ [CLEANUP] Error cleaning up old temp files:`, error);
  }
}

// Helper function to test Chatterbox TTS API connection
async function testTTSApiConnection(): Promise<boolean> {
  try {
    const response = await axios.get(`${CHATTERBOX_TTS_API}/health`);
    return response.status === 200;
  } catch (error) {
    console.error('Chatterbox TTS API connection test failed:', error);
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
    
    if (text.length > 1000) {
      console.warn(`Text truncated from ${text.length} to 1000 characters for ${character}`);
    }

    console.log(`Generating audio for ${character} with text: "${truncatedText.substring(0, 50)}..."`);

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
    console.log(`Making POST request to: ${url}`);
    console.log(`Request parameters:`, {
      text: truncatedText,
      exaggeration: params.exaggeration,
      temperature: params.temperature,
      seed_num: params.seedNum,
      cfg_weight: params.cfgWeight,
      min_p: params.minP,
      top_p: params.topP,
      repetition_penalty: params.repetitionPenalty
    });

    // Generate the audio
    const generateResponse = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders()
      },
      timeout: 120000, // 2 minutes timeout
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log(`✅ TTS API response status: ${generateResponse.status}`);
    console.log(`TTS API response:`, generateResponse.data);

    if (!generateResponse.data || !generateResponse.data.audio_file_path) {
      throw new Error('Invalid response from TTS API - no audio file path returned');
    }

    const generatedAudioPath = generateResponse.data.audio_file_path;
    const audioFilename = path.basename(generatedAudioPath);

    console.log(`Generated audio file: ${audioFilename}`);

    // Download the generated audio file
    console.log(`Downloading audio from: ${CHATTERBOX_TTS_API}/audio/${audioFilename}`);
    const downloadResponse = await axios.get(`${CHATTERBOX_TTS_API}/audio/${audioFilename}`, {
      responseType: 'stream',
      timeout: 60000
    });

    // Save to output path
    const writer = fs.createWriteStream(outputPath);
    downloadResponse.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`✅ Audio saved successfully: ${outputPath}`);
        resolve();
      });
      writer.on('error', (err) => {
        console.error(`❌ Error writing audio file: ${err.message}`);
        reject(err);
      });
    });

  } catch (error: any) {
    console.error(`❌ Error generating audio with Chatterbox TTS for ${character}:`, error.message);
    
    // Enhanced debugging for 422 errors
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Headers:', error.response.headers);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 422 && error.response.data?.detail) {
        console.error('🔍 FastAPI Validation Errors:');
        if (Array.isArray(error.response.data.detail)) {
          error.response.data.detail.forEach((err: any, index: number) => {
            console.error(`  ${index + 1}. Field: ${err.loc.join('.')} | Type: ${err.type} | Message: ${err.msg}`);
            if (err.input !== undefined) {
              console.error(`     Input received: ${JSON.stringify(err.input)}`);
            }
          });
        } else {
          console.error('  Detail:', error.response.data.detail);
        }
      }
    } else if (error.request) {
      console.error('❌ No response received from server');
      console.error('Request config:', {
        url: error.config?.url,
        method: error.config?.method,
        timeout: error.config?.timeout
      });
    } else {
      console.error('❌ Request setup error:', error.message);
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

export const generateConversationWithAudio = async (req: Request, res: Response) => {
  try {
    const {
      text,
      exaggeration = 0.6,
      temperature = 1.5,
      seedNum = 0,
      cfgWeight = 0.3,
      minP = 0.05,
      topP = 1.0,
      repetitionPenalty = 1.2,
      character
    } = req.body;

    console.log('🚀 Starting conversation generation with parameters:', {
      textLength: text?.length,
      exaggeration,
      temperature,
      seedNum,
      cfgWeight,
      minP,
      topP,
      repetitionPenalty
    });

    // Validate text
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({
        error: 'Text is required and must be a non-empty string'
      });
    }

    // Validate text length
    if (text.length > 1000) {
      return res.status(400).json({
        error: 'Text must be 300 characters or less'
      });
    }

    // Validate parameters to match FastAPI constraints exactly
    if (exaggeration < 0.25 || exaggeration > 2.0) {
      return res.status(400).json({
        error: 'Exaggeration must be between 0.25 and 2.0'
      });
    }

    if (temperature < 0.05 || temperature > 5.0) {
      return res.status(400).json({
        error: 'Temperature must be between 0.05 and 5.0'
      });
    }

    if (cfgWeight < 0.0 || cfgWeight > 1.0) {
      return res.status(400).json({
        error: 'CFG weight must be between 0.0 and 1.0'
      });
    }

    if (minP < 0.0 || minP > 1.0) {
      return res.status(400).json({
        error: 'min_p must be between 0.0 and 1.0'
      });
    }

    if (topP < 0.0 || topP > 1.0) {
      return res.status(400).json({
        error: 'top_p must be between 0.0 and 1.0'
      });
    }

    if (repetitionPenalty < 1.0 || repetitionPenalty > 2.0) {
      return res.status(400).json({
        error: 'Repetition penalty must be between 1.0 and 2.0'
      });
    }

    // Generate conversation using AI assistant
    console.log('🤖 Generating conversation script...');
    const result = await generateConversation(text);
    const conversation = result;

    if (!conversation || !conversation.conversation || conversation.conversation.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate conversation script'
      });
    }

    console.log(`✅ Generated conversation with ${conversation.conversation.length} dialogue items`);

    return res.status(200).json({
      success: true,
      message: 'Conversation script generated successfully',
      data: conversation,
      parameters: {
        exaggeration,
        temperature,
        seedNum,
        cfgWeight,
        minP,
        topP,
        repetitionPenalty
      }
    });

  } catch (error) {
    console.error('💥 Error in generateScript controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error occurred while generating conversation script',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const generateAudioFromScript = async (req: Request, res: Response) => {
  try {
    const {
      conversation,
      exaggeration = 0.6,
      temperature = 1.5,
      seedNum = 0,
      cfgWeight = 0.3,
      minP = 0.05,
      topP = 1.0,
      repetitionPenalty = 1.2
    } = req.body;

    console.log('🎵 Starting audio generation from script with parameters:', {
      dialogueCount: conversation?.conversation?.length,
      exaggeration,
      temperature,
      seedNum,
      cfgWeight,
      minP,
      topP,
      repetitionPenalty
    });

    // Validate conversation
    if (!conversation || !conversation.conversation || !Array.isArray(conversation.conversation) || conversation.conversation.length === 0) {
      return res.status(400).json({
        error: 'Valid conversation script is required'
      });
    }

    // Validate parameters to match FastAPI constraints exactly
    if (exaggeration < 0.25 || exaggeration > 2.0) {
      return res.status(400).json({
        error: 'Exaggeration must be between 0.25 and 2.0'
      });
    }

    if (temperature < 0.05 || temperature > 5.0) {
      return res.status(400).json({
        error: 'Temperature must be between 0.05 and 5.0'
      });
    }

    if (cfgWeight < 0.0 || cfgWeight > 1.0) {
      return res.status(400).json({
        error: 'CFG weight must be between 0.0 and 1.0'
      });
    }

    if (minP < 0.0 || minP > 1.0) {
      return res.status(400).json({
        error: 'min_p must be between 0.0 and 1.0'
      });
    }

    if (topP < 0.0 || topP > 1.0) {
      return res.status(400).json({
        error: 'top_p must be between 0.0 and 1.0'
      });
    }

    if (repetitionPenalty < 1.0 || repetitionPenalty > 2.0) {
      return res.status(400).json({
        error: 'Repetition penalty must be between 1.0 and 2.0'
      });
    }

    // Test TTS API connection
    console.log('🔍 Testing TTS API connection...');
    const apiConnected = await testTTSApiConnection();
    if (!apiConnected) {
      return res.status(503).json({
        success: false,
        error: 'TTS API is not available. Please ensure the Chatterbox TTS server is running on port 8000.'
      });
    }
    console.log('✅ TTS API connection successful');

    // Verify audio files exist before proceeding
    console.log('🔍 Checking reference audio files...');
    for (const [char, audioPath] of Object.entries(REFERENCE_AUDIO_PATHS)) {
      if (!fs.existsSync(audioPath)) {
        return res.status(500).json({
          success: false,
          error: `Reference audio file missing for ${char}: ${audioPath}`
        });
      }
      console.log(`✅ ${char} audio file exists: ${audioPath}`);
    }

    // Create session in database
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
    console.log(`📝 Created database session: ${sessionId}`);

    // Clean up old user image files from previous sessions
    cleanupOldUserImageFiles();

    // Initialize session directory
    let audioFiles: string[] = [];
    const sessionDir = path.join(AUDIO_OUTPUT_DIR, sessionId);

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Save conversation data for regeneration
    const conversationPath = path.join(sessionDir, 'conversation.json');
    fs.writeFileSync(conversationPath, JSON.stringify(conversation, null, 2));
    console.log(`Saved conversation data to: ${conversationPath}`);

    // Create dialogue records in database
    const dialogueRecords = [];
    for (let i = 0; i < conversation.conversation.length; i++) {
      const { character: convCharacter, dialogue } = conversation.conversation[i];

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

    console.log(`📝 Created ${dialogueRecords.length} dialogue records in database`);
    console.log('🎵 Starting audio generation...');
    console.log(`Session: ${sessionId}`);

    // Process each dialogue item
    for (let i = 0; i < conversation.conversation.length; i++) {
      const dialogueRecord = dialogueRecords[i];
      const { character: convCharacter, dialogue } = conversation.conversation[i];

      console.log(`\n📢 [${i + 1}/${conversation.conversation.length}] Processing dialogue for ${convCharacter}`);
      console.log(`Text: "${dialogue.substring(0, 80)}${dialogue.length > 80 ? '...' : ''}"`);

      // Validate character
      if (!['Stewie', 'Peter'].includes(convCharacter)) {
        console.warn(`⚠️ Skipping invalid character: ${convCharacter}`);

        // Update dialogue record with error
        await prisma.dialogue.update({
          where: { id: dialogueRecord.id },
          data: {}
        });

        continue;
      }

      // Generate audio
      const filename = `${sessionId}_${String(i + 1).padStart(2, '0')}_${convCharacter.toLowerCase()}.wav`;
      const outputPath = path.join(sessionDir, filename);

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

        audioFiles.push(outputPath);

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

        console.log(`✅ Audio ${i + 1} completed: ${filename}`);

        // Short delay between requests
        if (i < conversation.conversation.length - 1) {
          console.log(`⏳ Waiting 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (audioError) {
        console.error(`❌ Failed to generate audio ${i + 1} for ${convCharacter}:`, audioError);

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

        continue;
      }
    }

    const allGenerated = audioFiles.length === conversation.conversation.length;

    // Update session with final stats
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        audioFilesGenerated: audioFiles.length,
        allSuccessful: allGenerated
      }
    });

    console.log(`🏁 Audio generation complete: ${audioFiles.length}/${conversation.conversation.length} files generated`);

    return res.status(200).json({
      success: true,
      message: allGenerated
        ? 'Audio generated successfully'
        : `Audio generated with ${audioFiles.length}/${conversation.conversation.length} files`,
      audioFiles: audioFiles.map(file => ({
        path: file,
        filename: path.basename(file)
      })),
      sessionId: sessionId,
      parameters: {
        exaggeration,
        temperature,
        seedNum,
        cfgWeight,
        minP,
        topP,
        repetitionPenalty
      },
      stats: {
        totalDialogues: conversation.conversation.length,
        audioFilesGenerated: audioFiles.length,
        allSuccessful: allGenerated
      }
    });

  } catch (error) {
    console.error('💥 Error in generateScript controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error occurred while generating conversation script',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const regenerateAudioFile = async (req: Request, res: Response) => {
  try {
    const { sessionId, filename } = req.params;
    const {
      exaggeration = 0.6,
      temperature = 1.5,
      seedNum = 0,
      cfgWeight = 0.3,
      minP = 0.05,
      topP = 1.0,
      repetitionPenalty = 1.2
    } = req.body;

    console.log('🔄 Starting audio regeneration for:', { sessionId, filename });

    // Validate parameters
    if (exaggeration < 0.25 || exaggeration > 2.0) {
      return res.status(400).json({ error: 'Exaggeration must be between 0.25 and 2.0' });
    }
    if (temperature < 0.05 || temperature > 5.0) {
      return res.status(400).json({ error: 'Temperature must be between 0.05 and 5.0' });
    }
    if (cfgWeight < 0.0 || cfgWeight > 1.0) {
      return res.status(400).json({ error: 'CFG weight must be between 0.0 and 1.0' });
    }
    if (minP < 0.0 || minP > 1.0) {
      return res.status(400).json({ error: 'min_p must be between 0.0 and 1.0' });
    }
    if (topP < 0.0 || topP > 1.0) {
      return res.status(400).json({ error: 'top_p must be between 0.0 and 1.0' });
    }
    if (repetitionPenalty < 1.0 || repetitionPenalty > 2.0) {
      return res.status(400).json({ error: 'Repetition penalty must be between 1.0 and 2.0' });
    }

    // Parse the filename to extract the dialogue order and actual sessionId
    // Filename format: {sessionId}_{order}_{character}.wav
    const filenameParts = filename.split('_');
    if (filenameParts.length < 3) {
      return res.status(400).json({ error: 'Invalid filename format' });
    }
    
    const actualSessionId = filenameParts[0];
    const order = parseInt(filenameParts[1], 10);
    if (isNaN(order)) {
      return res.status(400).json({ error: 'Invalid order in filename' });
    }

    console.log('🔍 Parsed filename:', { 
      urlSessionId: sessionId,
      actualSessionId, 
      filename, 
      order 
    });

    // Use the actual sessionId from the filename
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
      return res.status(404).json({ error: 'Dialogue record not found in database' });
    }

    const outputPath = path.join(AUDIO_OUTPUT_DIR, actualSessionId, filename);

    // Test TTS API connection
    const apiConnected = await testTTSApiConnection();
    if (!apiConnected) {
      return res.status(503).json({ error: 'TTS API is not available' });
    }

    // Regenerate audio
    await generateAudioWithChatterbox(
      dialogueRecord.text,
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

    console.log(`✅ Regenerated audio: ${filename}`);

    return res.status(200).json({
      success: true,
      message: 'Audio regenerated successfully',
      filename,
      sessionId: actualSessionId,
      parameters: { exaggeration, temperature, seedNum, cfgWeight, minP, topP, repetitionPenalty }
    });

  } catch (error) {
    console.error('💥 Error regenerating audio:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to regenerate audio',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getSessionDetails = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required'
      });
    }

    // Fetch session with all related data
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
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    // Format the response
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

    return res.status(200).json({
      success: true,
      session: formattedSession
    });

  } catch (error) {
    console.error('Error getting session details:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get session details'
    });
  }
};

export const getAudioFiles = async (req: Request, res: Response) => {
  try {
    // Fetch sessions with their dialogues and audio files from database
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
    const formattedSessions = sessions.map(session => ({
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
      files: session.audioFiles
        .filter(audioFile => audioFile.success)
        .map(audioFile => ({
          id: audioFile.id,
          filename: audioFile.filename,
          path: audioFile.filePath,
          fileSize: audioFile.fileSize,
          generatedAt: audioFile.generatedAt
        }))
    }));

    return res.status(200).json({
      success: true,
      sessions: formattedSessions
    });

  } catch (error) {
    console.error('Error getting audio files:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get audio files'
    });
  }
};

export const downloadAudio = async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const { sessionId } = req.query;

    if (!filename) {
      return res.status(400).json({
        error: 'Filename is required'
      });
    }

    let filePath: string;

    if (sessionId) {
      // Find the audio file in the database for the specific session
      const audioFile = await prisma.audioFile.findFirst({
        where: {
          sessionId: sessionId as string,
          filename: filename
        }
      });

      if (!audioFile) {
        return res.status(404).json({
          error: 'Audio file not found in database'
        });
      }

      filePath = audioFile.filePath;
    } else {
      // Find the audio file in the database across all sessions
      const audioFile = await prisma.audioFile.findFirst({
        where: {
          filename: filename
        }
      });

      if (!audioFile) {
        return res.status(404).json({
          error: 'Audio file not found in database'
        });
      }

      filePath = audioFile.filePath;
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'Audio file not found on disk'
      });
    }

    // Set headers for audio download
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream the file
    const fileStream = fs.createReadStream(filePath!);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Error downloading audio:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to download audio file'
    });
  }
};

export const deleteAudioFile = async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const { sessionId } = req.query;

    console.log('Delete request:', { filename, sessionId, sessionIdType: typeof sessionId });

    if (!filename) {
      return res.status(400).json({
        error: 'Filename is required'
      });
    }

    // Find and delete the audio file record from database
    const audioFile = await prisma.audioFile.findFirst({
      where: {
        sessionId: sessionId as string,
        filename: filename
      }
    });

    console.log('Database query result:', { found: !!audioFile, audioFile });

    if (!audioFile) {
      return res.status(404).json({
        error: 'Audio file not found in database'
      });
    }

    // Delete from database
    await prisma.audioFile.delete({
      where: { id: audioFile.id }
    });

    // Delete physical file
    if (fs.existsSync(audioFile.filePath)) {
      fs.unlinkSync(audioFile.filePath);
      console.log(`Deleted audio file: ${audioFile.filePath}`);
    }

    return res.status(200).json({
      success: true,
      message: `Audio file ${filename} deleted successfully`
    });

  } catch (error) {
    console.error('Error deleting audio file:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete audio file'
    });
  }
};

export const deleteAudioSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required'
      });
    }

    // Find the session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        audioFiles: true,
        dialogues: true
      }
    });

    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    // Delete physical files
    for (const audioFile of session.audioFiles) {
      if (fs.existsSync(audioFile.filePath)) {
        fs.unlinkSync(audioFile.filePath);
        console.log(`Deleted audio file: ${audioFile.filePath}`);
      }
    }

    // Delete the session directory if it exists
    const sessionDir = path.join(AUDIO_OUTPUT_DIR, sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`Deleted session directory: ${sessionDir}`);
    }

    // Delete from database (cascade will handle related records)
    await prisma.session.delete({
      where: { id: sessionId }
    });

    return res.status(200).json({
      success: true,
      message: `Session ${sessionId} and all associated files deleted successfully`
    });

  } catch (error) {
    console.error('Error deleting audio session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete audio session'
    });
  }
};

export const testTTSConnection = async (req: Request, res: Response) => {
  try {
    console.log('Testing TTS API connection...');
    const connected = await testTTSApiConnection();
    
    if (connected) {
      return res.status(200).json({
        success: true,
        message: 'TTS API is connected and running',
        apiUrl: CHATTERBOX_TTS_API
      });
    } else {
      return res.status(503).json({
        success: false,
        message: 'TTS API is not available',
        apiUrl: CHATTERBOX_TTS_API,
        suggestion: 'Please ensure the Chatterbox TTS FastAPI server is running on port 8000'
      });
    }
  } catch (error) {
    console.error('Error testing TTS connection:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test TTS connection',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const cleanupAudioFiles = async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(AUDIO_OUTPUT_DIR)) {
      return res.status(200).json({
        success: true,
        message: 'No audio files to clean up',
        deletedCount: 0
      });
    }

    let deletedCount = 0;
    const sessions = fs.readdirSync(AUDIO_OUTPUT_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory());

    for (const session of sessions) {
      const sessionPath = path.join(AUDIO_OUTPUT_DIR, session.name);
      const files = fs.readdirSync(sessionPath);
      
      for (const file of files) {
        const filePath = path.join(sessionPath, file);
        fs.unlinkSync(filePath);
        deletedCount++;
      }

      // Remove the session directory if empty
      if (fs.readdirSync(sessionPath).length === 0) {
        fs.rmdirSync(sessionPath);
      }
    }

    console.log(`Cleaned up ${deletedCount} audio files`);

    return res.status(200).json({
      success: true,
      message: `Cleaned up ${deletedCount} temporary audio files`,
      deletedCount
    });

  } catch (error) {
    console.error('Error cleaning up audio files:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to clean up audio files'
    });
  }
};
