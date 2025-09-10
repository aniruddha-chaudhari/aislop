import { generateObject, generateText, experimental_generateImage as generate_image } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { stewiepetertechprompt } from "../utils/systemprompts";

// Define simpler schemas to avoid type instantiation issues
const dialogueItemSchema = z.object({
  character: z.string(), // Changed from enum to string for more flexibility
  dialogue: z.string().max(280)   // Added 280 character limit per dialogue
});

const conversationSchema = z.array(dialogueItemSchema)
  .min(8)  // Reduced minimum to be more permissive
  .max(20); // Increased maximum

const conversationperterstewieschema = z.object({
  conversation: conversationSchema,
  topic: z.string()
});

const researchontopicwithlinks = async (topic: string) => {
  try {
    const enhancedPrompt = `${stewiepetertechprompt}Generate detailed information about the given topic "${topic}".`;
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      prompt: enhancedPrompt,
      tools: {
        google_search: google.tools.googleSearch({}),
      }
    });
    return result.text;
  } catch (error) {
    throw new Error(`Error generating research: ${error}`);
  }
}
//dont use imagegeneration not satisfactory results
const imagegeneration = async (prompt: string) => {
  const result = await generateText({
    model: google('gemini-2.5-flash-image-preview'),
    providerOptions: {
      google: { responseModalities: ['TEXT', 'IMAGE'] },
    },
    prompt: prompt,
  });

  return result;
}

export const generateConversation = async (topic: string) => {
  try {
    const researchInfo = await researchontopicwithlinks(topic);
    // Randomly decide who is the knowledgeable one
    const random = Math.random(); // Generates a number between 0 and 1
    const knowledgeableCharacter = random < 0.5 ? 'Peter' : 'Stewie';
    const lessknowledgeableCharacter = knowledgeableCharacter === 'Peter' ? 'Stewie' : 'Peter';

    const prompt = `${stewiepetertechprompt}

Use the following research information to inform the dialogue: ${researchInfo}

IMPORTANT: Ignore all links from the research info. Focus only on the textual content.

Generate a conversation between Stewie and Peter about the topic "${topic}". The conversation should be approximately 10-15 dialogue (4-6 exchanges) and explain concepts suitable for an Instagram reel audience.

In this conversation, ${knowledgeableCharacter} should be the knowledgeable character who explains the topic, while ${lessknowledgeableCharacter} should be the less knowledgeable one who asks questions and tries to understand by simplifying complex ideas.

Each dialogue line must be 280 characters or less.

The response must be a valid JSON object with this structure:
- conversation: array of dialogue objects
- topic: string

Each dialogue object must have:
- character: either "Stewie" or "Peter" 
- dialogue: the text they speak (max 280 characters)

**Dialogue Length Requirement:** Generate approximately more than 10 dialogues (roughly 4-6 exchanges between characters, suitable for video content).

**Important Rules:**
- Do not split a single character's dialogue across multiple entries. Each character's turn must be complete in one dialogue object.
- Do not have multiple consecutive dialogues from the same character. Alternate between Stewie and Peter.
- Each dialogue must have substantial content and meaningful substance, not just filler or short responses.

Example format:
{
  "conversation": [
    {"character": "Stewie", "dialogue": "Hey Peter, did you know..."},
    {"character": "Peter", "dialogue": "Oh wow Stewie, tell me more!"}
  ],
  "topic": "${topic}"
}`;

    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: conversationperterstewieschema as any,
      prompt: prompt,
    });

    return result.object;
  } catch (error) {
    throw new Error(`Error generating conversation: ${error}`);
  }
}

export { researchontopicwithlinks };
export { imagegeneration };

