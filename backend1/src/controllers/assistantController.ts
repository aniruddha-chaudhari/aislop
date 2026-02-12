import type { HttpContext } from '../utils/http';
import { jsonResponse } from '../utils/http';
import type { HandlerResult } from '../utils/http';
import { ttsService } from '../service/tts';
import { TTS_CONFIG, type CharacterName } from '../config/tts-config';
import fs from 'fs';
import path from 'path';

const SUPPORTED_CHARACTERS = Object.keys(TTS_CONFIG.characters);

export async function generateScript(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const body = ctx.body as Record<string, unknown>;
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return jsonResponse(400, { error: 'Prompt is required and must be a non-empty string' });
    }

    const { generateConversation: generateConv } = await import('../service/assistants');
    const conversation = await generateConv(prompt);

    return jsonResponse(200, { success: true, data: conversation });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Internal server error occurred while generating script' });
  }
}

export async function generateAudioFromScript(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const body = ctx.body as Record<string, unknown>;
    const conversation = body?.conversation as unknown[] | undefined;
    const sessionId = body?.sessionId as string | undefined;

    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      return jsonResponse(400, { error: 'Conversation array is required and must not be empty' });
    }

    for (const item of conversation) {
      const it = item as Record<string, unknown>;
      if (!it.character || !it.dialogue || !SUPPORTED_CHARACTERS.includes(String(it.character))) {
        return jsonResponse(400, { error: `Each conversation item must have a valid character (${SUPPORTED_CHARACTERS.join(', ')}) and dialogue` });
      }
    }

    let audioFiles: string[] = [];
    try {
      audioFiles = await ttsService.generateConversationAudio(conversation as { character: CharacterName; dialogue: string }[], sessionId);
    } catch (audioError) {
      return jsonResponse(500, {
        success: false,
        error: 'Failed to generate audio files',
        audioError: audioError instanceof Error ? audioError.message : 'Unknown error',
      });
    }

    return jsonResponse(200, {
      success: true,
      message: 'Audio generated successfully',
      audioFiles: audioFiles.map((file) => ({
        path: file,
        filename: file.split('\\').pop() || file.split('/').pop(),
      })),
    });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Internal server error occurred while generating audio' });
  }
}

export async function generateConversation(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const body = ctx.body as Record<string, unknown>;
    const prompt = body?.prompt;
    const generateAudio = body?.generateAudio;

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return jsonResponse(400, { error: 'Prompt is required and must be a non-empty string' });
    }

    const { generateConversation: generateConv } = await import('../service/assistants');
    const conversation = await generateConv(prompt);

    let audioFiles: string[] = [];
    if (generateAudio === true) {
      try {
        audioFiles = await ttsService.generateConversationAudio(conversation.conversation);
      } catch (audioError) {
        return jsonResponse(200, {
          success: true,
          data: conversation,
          audioGenerated: false,
          audioError: 'Failed to generate audio files',
          audioFiles: [],
        });
      }
    }

    return jsonResponse(200, {
      success: true,
      data: conversation,
      audioGenerated: generateAudio === true,
      audioFiles: audioFiles.map((file) => ({
        path: file,
        filename: file.split('\\').pop() || file.split('/').pop(),
      })),
    });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Internal server error occurred while generating conversation' });
  }
}

export async function getAudioFiles(_ctx: HttpContext): Promise<HandlerResult> {
  try {
    const audioDir = ttsService.getAudioOutputDirectory();

    if (!fs.existsSync(audioDir)) {
      return jsonResponse(200, { success: true, sessions: [] });
    }

    const sessions = fs
      .readdirSync(audioDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const sessionPath = path.join(audioDir, d.name);
        const files = fs
          .readdirSync(sessionPath)
          .filter((f) => f.endsWith('.wav'))
          .map((f) => ({ filename: f, path: path.join(sessionPath, f) }));
        return { sessionId: d.name, files };
      });

    return jsonResponse(200, { success: true, sessions });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Failed to get audio files' });
  }
}

export async function downloadAudio(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const filename = ctx.params?.filename;
    const sessionId = ctx.query?.sessionId;

    if (!filename) {
      return jsonResponse(400, { error: 'Filename is required' });
    }

    const audioDir = ttsService.getAudioOutputDirectory();
    let filePath: string;

    if (sessionId) {
      filePath = path.join(audioDir, sessionId, filename);
    } else {
      const sessions = fs.readdirSync(audioDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      let found = false;
      filePath = '';
      for (const s of sessions) {
        const testPath = path.join(audioDir, s.name, filename);
        if (fs.existsSync(testPath)) {
          filePath = testPath;
          found = true;
          break;
        }
      }
      if (!found) {
        return jsonResponse(404, { error: 'Audio file not found' });
      }
    }

    if (!fs.existsSync(filePath)) {
      return jsonResponse(404, { error: 'Audio file not found' });
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

export async function testTTS(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const body = ctx.body as Record<string, unknown>;
    const character = body?.character;
    const text = body?.text;

    if (!character || !SUPPORTED_CHARACTERS.includes(String(character))) {
      return jsonResponse(400, { error: `Character must be one of: ${SUPPORTED_CHARACTERS.join(', ')}` });
    }
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return jsonResponse(400, { error: 'Text is required and must be a non-empty string' });
    }

    const testConversation = [{ character: character as CharacterName, dialogue: text as string }];
    const audioFiles = await ttsService.generateConversationAudio(testConversation, `test_${Date.now()}`);

    return jsonResponse(200, {
      success: true,
      message: `Successfully generated audio for ${character}`,
      audioFiles: audioFiles.map((f) => ({
        path: f,
        filename: f.split('\\').pop() || f.split('/').pop(),
      })),
    });
  } catch (error) {
    return jsonResponse(500, { success: false, error: 'Failed to test TTS functionality' });
  }
}

export async function getModels(_ctx: HttpContext): Promise<HandlerResult> {
  try {
    const models = await ttsService.getModels();
    return jsonResponse(200, { success: true, data: models });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: 'Failed to get models list',
      Exception: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function setGPTWeights(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const weights_path = ctx.query?.weights_path;
    if (!weights_path || typeof weights_path !== 'string') {
      return jsonResponse(400, { error: 'weights_path query parameter is required' });
    }
    await ttsService.setGPTWeightsPublic(weights_path);
    return jsonResponse(200, { message: 'success' });
  } catch (error) {
    return jsonResponse(400, {
      message: 'change gpt weight failed',
      Exception: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function setSoVITSWeights(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const weights_path = ctx.query?.weights_path;
    if (!weights_path || typeof weights_path !== 'string') {
      return jsonResponse(400, { error: 'weights_path query parameter is required' });
    }
    await ttsService.setSoVITSWeightsPublic(weights_path);
    return jsonResponse(200, { message: 'success' });
  } catch (error) {
    return jsonResponse(400, {
      message: 'change sovits weight failed',
      Exception: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function testAssistants(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const body = ctx.body as Record<string, unknown>;
    const topic = body?.topic;
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      return jsonResponse(400, { error: 'Topic is required and must be a non-empty string' });
    }
    const { generateConversation } = await import('../service/assistants');
    const conversationResult = await generateConversation(topic);
    return jsonResponse(200, { success: true, data: { topic, conversation: conversationResult } });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: 'Internal server error occurred while testing assistants',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function testResearch(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const body = ctx.body as Record<string, unknown>;
    const topic = body?.topic;
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      return jsonResponse(400, { error: 'Topic is required and must be a non-empty string' });
    }
    const { researchontopicwithlinks } = await import('../service/assistants');
    const researchResult = await researchontopicwithlinks(topic);
    return jsonResponse(200, { success: true, data: { topic, research: researchResult } });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: 'Internal server error occurred while testing research',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
