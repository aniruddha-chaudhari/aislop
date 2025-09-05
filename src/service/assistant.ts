import { generateObject, generateText, streamObject, streamText } from 'ai';
import { google } from '@ai-sdk/google';
import {z } from 'zod';

export async function assistant(prompt: string = '') {
  try {
    const conversationperterstewieschema = z.object({
      conversation: z.array(
        z.object({
          character: z.enum(['Stewie', 'Peter']),
          dialogue: z.string()
            .max(280, 'Dialogue must be 280 characters or less to fit TTS API limits')
            .describe('The character\'s line of dialogue. Must follow character-specific speaking patterns and personality traits. Keep each line under 280 characters for TTS compatibility.')
        })
      ).min(2, 'Conversation must have at least 2 dialogue items')
       .max(10, 'Conversation should not exceed 10 dialogue items for performance'),
      topic: z.string().describe('The main technology topic being discussed (e.g., System Design, AI/ML, DevOps, etc.)'),
    });
    
    const enhancedPrompt = `${prompt}

Important guidelines:
- Create a conversation between Stewie Griffin (the baby genius) and Peter Griffin (the bumbling father)
- Each dialogue line should be under 280 characters for audio generation compatibility
- Stewie should sound intellectual, sophisticated, and sometimes condescending
- Peter should sound simple, confused, but well-meaning
- The conversation should be engaging and funny while staying on the topic
- Include 4-8 exchanges total (alternating between characters)`;

    const result = await generateObject({
      model: google('gemini-2.5-flash-lite-preview-06-17'),
      prompt: enhancedPrompt,
      schema: conversationperterstewieschema,
    });
    
    return result;
  } catch (error) {
    console.error('Error in assistant function:', error);
    throw error;
  }
}