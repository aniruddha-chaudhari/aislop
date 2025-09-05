import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { TTS_CONFIG, CharacterName } from '../config/tts-config';

const AUDIO_OUTPUT_DIR = path.join(process.cwd(), TTS_CONFIG.audioOutputDir);

// Ensure audio output directory exists
if (!fs.existsSync(AUDIO_OUTPUT_DIR)) {
  fs.mkdirSync(AUDIO_OUTPUT_DIR, { recursive: true });
}

interface ConversationItem {
  character: CharacterName;
  dialogue: string;
}

export class TTSService {
  private async setGPTWeights(weightsPath: string): Promise<void> {
    try {
      await axios.get(`${TTS_CONFIG.apiBaseUrl}/set_gpt_weights`, {
        params: { weights_path: weightsPath }
      });
      console.log(`Successfully set GPT weights: ${weightsPath}`);
    } catch (error) {
      console.error('Failed to set GPT weights:', error);
      throw new Error(`Failed to set GPT weights: ${weightsPath}`);
    }
  }

  private async setSoVITSWeights(weightsPath: string): Promise<void> {
    try {
      await axios.get(`${TTS_CONFIG.apiBaseUrl}/set_sovits_weights`, {
        params: { weights_path: weightsPath }
      });
      console.log(`Successfully set SoVITS weights: ${weightsPath}`);
    } catch (error) {
      console.error('Failed to set SoVITS weights:', error);
      throw new Error(`Failed to set SoVITS weights: ${weightsPath}`);
    }
  }

  private async setReferenceAudio(audioPath: string): Promise<void> {
    try {
      await axios.get(`${TTS_CONFIG.apiBaseUrl}/set_refer_audio`, {
        params: { refer_audio_path: audioPath }
      });
      console.log(`Successfully set reference audio: ${audioPath}`);
    } catch (error) {
      console.error('Failed to set reference audio:', error);
      throw new Error(`Failed to set reference audio: ${audioPath}`);
    }
  }

  private async generateAudio(
    text: string,
    character: CharacterName,
    outputPath: string
  ): Promise<void> {
    try {
      const config = TTS_CONFIG.characters[character];
      
      const response = await axios.post(`${TTS_CONFIG.apiBaseUrl}/tts`, {
        text: text,
        text_lang: TTS_CONFIG.settings.textLang,
        ref_audio_path: config.referenceAudio,
        prompt_text: config.promptText,
        prompt_lang: config.promptLang,
        media_type: TTS_CONFIG.settings.mediaType,
        streaming_mode: TTS_CONFIG.settings.streamingMode
      }, {
        responseType: 'stream'
      });

      // Save audio to file
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`Audio saved: ${outputPath}`);
          resolve();
        });
        writer.on('error', reject);
      });
    } catch (error) {
      console.error('Failed to generate audio:', error);
      throw new Error(`Failed to generate audio for ${character}: ${text}`);
    }
  }

  private async setupModelsForCharacter(character: CharacterName): Promise<void> {
    const config = TTS_CONFIG.characters[character];
    
    console.log(`Setting up models for ${character}...`);
    
    // Set models in sequence
    await this.setGPTWeights(config.gpt);
    await this.setSoVITSWeights(config.sovits);
    await this.setReferenceAudio(config.referenceAudio);
    
    console.log(`Models setup complete for ${character}`);
  }

  public async generateConversationAudio(
    conversation: ConversationItem[],
    sessionId: string = Date.now().toString()
  ): Promise<string[]> {
    const audioFiles: string[] = [];
    const sessionDir = path.join(AUDIO_OUTPUT_DIR, sessionId);
    
    // Create session directory
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    try {
      let currentCharacter: CharacterName | null = null;

      for (let i = 0; i < conversation.length; i++) {
        const { character, dialogue } = conversation[i];
        
        // Only switch models if character changed
        if (currentCharacter !== character) {
          await this.setupModelsForCharacter(character);
          currentCharacter = character;
        }

        // Generate filename
        const filename = `${sessionId}_${i + 1}_${character.toLowerCase()}_${Date.now()}.wav`;
        const outputPath = path.join(sessionDir, filename);

        // Generate audio
        console.log(`Generating audio for ${character}: ${dialogue.substring(0, 50)}...`);
        await this.generateAudio(dialogue, character, outputPath);
        
        audioFiles.push(outputPath);
        
        // Small delay between generations to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, TTS_CONFIG.settings.delayBetweenCalls));
      }

      console.log(`Generated ${audioFiles.length} audio files for session ${sessionId}`);
      return audioFiles;
      
    } catch (error) {
      console.error('Error generating conversation audio:', error);
      throw error;
    }
  }

  public getAudioOutputDirectory(): string {
    return AUDIO_OUTPUT_DIR;
  }

  public async getModels(): Promise<any> {
    try {
      const response = await axios.get(`${TTS_CONFIG.apiBaseUrl}/models`);
      return response.data;
    } catch (error) {
      console.error('Failed to get models list:', error);
      throw new Error('Failed to fetch models from GPT-SoVITS API');
    }
  }

  public async setGPTWeightsPublic(weightsPath: string): Promise<void> {
    return this.setGPTWeights(weightsPath);
  }

  public async setSoVITSWeightsPublic(weightsPath: string): Promise<void> {
    return this.setSoVITSWeights(weightsPath);
  }
}

export const ttsService = new TTSService();
