import { Request, Response } from 'express';
// import { assistant } from '../service/assistant'; // This file doesn't exist
import { ttsService } from '../service/tts';
import { CharacterName } from '../config/tts-config';
import fs from 'fs';
import path from 'path';

export const generateScript = async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({
        error: 'Prompt is required and must be a non-empty string'
      });
    }

    // Call the assistant function to generate only the script
    // const result = await assistant(prompt);
    // const conversation = result.object;
    
    // Use the function from assistants.ts
    const { generateConversation: generateConv } = await import('../service/assistants');
    const conversation = await generateConv(prompt);

    // Return only the generated conversation script
    return res.status(200).json({
      success: true,
      data: conversation
    });

  } catch (error) {
    console.error('Error in generateScript controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error occurred while generating script'
    });
  }
};

export const generateAudioFromScript = async (req: Request, res: Response) => {
  try {
    const { conversation, sessionId } = req.body;

    // Validate conversation
    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      return res.status(400).json({
        error: 'Conversation array is required and must not be empty'
      });
    }

    // Validate conversation structure
    for (const item of conversation) {
      if (!item.character || !item.dialogue || !['Stewie', 'Peter'].includes(item.character)) {
        return res.status(400).json({
          error: 'Each conversation item must have a valid character (Stewie or Peter) and dialogue'
        });
      }
    }

    let audioFiles: string[] = [];
    
    try {
      console.log('Starting audio generation for approved script...');
      audioFiles = await ttsService.generateConversationAudio(conversation, sessionId);
      console.log(`Audio generation completed. Generated ${audioFiles.length} files.`);
    } catch (audioError) {
      console.error('Error generating audio:', audioError);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate audio files',
        audioError: audioError instanceof Error ? audioError.message : 'Unknown error'
      });
    }

    // Return the audio generation result
    return res.status(200).json({
      success: true,
      message: 'Audio generated successfully',
      audioFiles: audioFiles.map(file => ({
        path: file,
        filename: file.split('\\').pop() || file.split('/').pop()
      }))
    });

  } catch (error) {
    console.error('Error in generateAudioFromScript controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error occurred while generating audio'
    });
  }
};

export const generateConversation = async (req: Request, res: Response) => {
  try {
    const { prompt, generateAudio } = req.body;

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({
        error: 'Prompt is required and must be a non-empty string'
      });
    }

    // Call the assistant function
    // const result = await assistant(prompt);
    // const conversation = result.object;
    
    // Use the function from assistants.ts
    const { generateConversation: generateConv } = await import('../service/assistants');
    const conversation = await generateConv(prompt);

    let audioFiles: string[] = [];
    
    // Generate audio if requested
    if (generateAudio === true) {
      try {
        console.log('Starting audio generation...');
        audioFiles = await ttsService.generateConversationAudio(conversation.conversation);
        console.log(`Audio generation completed. Generated ${audioFiles.length} files.`);
      } catch (audioError) {
        console.error('Error generating audio:', audioError);
        // Continue without audio if generation fails
        return res.status(200).json({
          success: true,
          data: conversation,
          audioGenerated: false,
          audioError: 'Failed to generate audio files',
          audioFiles: []
        });
      }
    }

    // Return the generated conversation with audio info
    return res.status(200).json({
      success: true,
      data: conversation,
      audioGenerated: generateAudio === true,
      audioFiles: audioFiles.map(file => ({
        path: file,
        filename: file.split('\\').pop() || file.split('/').pop()
      }))
    });

  } catch (error) {
    console.error('Error in generateConversation controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error occurred while generating conversation'
    });
  }
};

export const getAudioFiles = async (req: Request, res: Response) => {
  try {
    const audioDir = ttsService.getAudioOutputDirectory();
    
    if (!fs.existsSync(audioDir)) {
      return res.status(200).json({
        success: true,
        sessions: []
      });
    }

    const sessions = fs.readdirSync(audioDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const sessionPath = path.join(audioDir, dirent.name);
        const files = fs.readdirSync(sessionPath)
          .filter(file => file.endsWith('.wav'))
          .map(file => ({
            filename: file,
            path: path.join(sessionPath, file)
          }));
        
        return {
          sessionId: dirent.name,
          files
        };
      });

    return res.status(200).json({
      success: true,
      sessions
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

    const audioDir = ttsService.getAudioOutputDirectory();
    let filePath: string;

    if (sessionId) {
      filePath = path.join(audioDir, sessionId as string, filename);
    } else {
      // Search for the file in all sessions
      const sessions = fs.readdirSync(audioDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());
      
      let found = false;
      for (const session of sessions) {
        const testPath = path.join(audioDir, session.name, filename);
        if (fs.existsSync(testPath)) {
          filePath = testPath;
          found = true;
          break;
        }
      }

      if (!found) {
        return res.status(404).json({
          error: 'Audio file not found'
        });
      }
    }

    if (!fs.existsSync(filePath!)) {
      return res.status(404).json({
        error: 'Audio file not found'
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

export const testTTS = async (req: Request, res: Response) => {
  try {
    const { character, text } = req.body;

    if (!character || !['Stewie', 'Peter'].includes(character)) {
      return res.status(400).json({
        error: 'Character must be either "Stewie" or "Peter"'
      });
    }

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({
        error: 'Text is required and must be a non-empty string'
      });
    }

    const testConversation = [{
      character: character as CharacterName,
      dialogue: text
    }];

    console.log(`Testing TTS for ${character}: ${text}`);
    const audioFiles = await ttsService.generateConversationAudio(testConversation, `test_${Date.now()}`);

    return res.status(200).json({
      success: true,
      message: `Successfully generated audio for ${character}`,
      audioFiles: audioFiles.map(file => ({
        path: file,
        filename: file.split('\\').pop() || file.split('/').pop()
      }))
    });

  } catch (error) {
    console.error('Error in testTTS controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to test TTS functionality'
    });
  }
};

export const getModels = async (req: Request, res: Response) => {
  try {
    console.log('Fetching available models from GPT-SoVITS API...');
    const models = await ttsService.getModels();

    return res.status(200).json({
      success: true,
      data: models
    });

  } catch (error) {
    console.error('Error in getModels controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get models list',
      Exception: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const setGPTWeights = async (req: Request, res: Response) => {
  try {
    const { weights_path } = req.query;

    if (!weights_path || typeof weights_path !== 'string') {
      return res.status(400).json({
        error: 'weights_path query parameter is required'
      });
    }

    console.log(`Setting GPT weights to: ${weights_path}`);
    await ttsService.setGPTWeightsPublic(weights_path);

    return res.status(200).json({
      message: 'success'
    });

  } catch (error) {
    console.error('Error in setGPTWeights controller:', error);
    return res.status(400).json({
      message: 'change gpt weight failed',
      Exception: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const setSoVITSWeights = async (req: Request, res: Response) => {
  try {
    const { weights_path } = req.query;

    if (!weights_path || typeof weights_path !== 'string') {
      return res.status(400).json({
        error: 'weights_path query parameter is required'
      });
    }

    console.log(`Setting SoVITS weights to: ${weights_path}`);
    await ttsService.setSoVITSWeightsPublic(weights_path);

    return res.status(200).json({
      message: 'success'
    });

  } catch (error) {
    console.error('Error in setSoVITSWeights controller:', error);
    return res.status(400).json({
      message: 'change sovits weight failed',
      Exception: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const testAssistants = async (req: Request, res: Response) => {
  try {
    const { topic } = req.body;

    // Validate topic
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      return res.status(400).json({
        error: 'Topic is required and must be a non-empty string'
      });
    }

    // Import the functions dynamically to avoid conflicts
    const { generateConversation } = await import('../service/assistants');

    // Call generateConversation
    const conversationResult = await generateConversation(topic);

    // Return the results
    return res.status(200).json({
      success: true,
      data: {
        topic,
        conversation: conversationResult
      }
    });

  } catch (error) {
    console.error('Error in testAssistants controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error occurred while testing assistants',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const testResearch = async (req: Request, res: Response) => {
  try {
    const { topic } = req.body;

    // Validate topic
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      return res.status(400).json({
        error: 'Topic is required and must be a non-empty string'
      });
    }

    // Import the research function
    const { researchontopicwithlinks } = await import('../service/assistants');

    // Call research function
    const researchResult = await researchontopicwithlinks(topic);

    // Return the results
    return res.status(200).json({
      success: true,
      data: {
        topic,
        research: researchResult
      }
    });

  } catch (error) {
    console.error('Error in testResearch controller:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error occurred while testing research',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
