import { generateObject, generateText, experimental_generateImage as generate_image } from "ai";
import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
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

// GEMINI API KEY FALLBACK
const PRIMARY_GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const SECONDARY_GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY_SECONDARY;

const googlePrimary = createGoogleGenerativeAI({
  apiKey: PRIMARY_GEMINI_KEY,
});

const googleSecondary = SECONDARY_GEMINI_KEY
  ? createGoogleGenerativeAI({ apiKey: SECONDARY_GEMINI_KEY })
  : null;

function isGeminiQuotaError(error: unknown): boolean {
  const err = error as any;
  const msg: string | undefined = err?.message;
  const statusCode: number | undefined = err?.statusCode ?? err?.status;
  const body: string | undefined = err?.responseBody ?? err?.body;
  const quotaRegex = /quota|RESOURCE_EXHAUSTED/i;
  return (
    statusCode === 429 ||
    (typeof msg === 'string' && quotaRegex.test(msg)) ||
    (typeof body === 'string' && quotaRegex.test(body))
  );
}

async function withGeminiFallback<T>(
  modelName: string,
  runWithModel: (model: any) => Promise<T>
): Promise<T> {
  const primaryModel = googlePrimary(modelName);

  try {
    return await runWithModel(primaryModel);
  } catch (error) {
    if (!googleSecondary || !isGeminiQuotaError(error)) {
      throw error;
    }

    console.warn('[GEMINI] Primary key quota exceeded, retrying with secondary key');
    const secondaryModel = googleSecondary(modelName);
    return await runWithModel(secondaryModel);
  }
}

const researchontopicwithlinks = async (topic: string) => {
  try {
    const enhancedPrompt = `${stewiepetertechprompt}Generate detailed information about the given topic "${topic}".`;
    const result = await withGeminiFallback('gemini-3-flash-preview', (model) =>
      generateText({
        model,
        prompt: enhancedPrompt,
      })
    );
    return result.text;
  } catch (error) {
    throw new Error(`Error generating research: ${error}`);
  }
}
//dont use imagegeneration not satisfactory results
const imagegeneration = async (prompt: string) => {
  const result = await withGeminiFallback('gemini-2.5-flash-image-preview', (model) =>
    generateText({
      model,
      providerOptions: {
        google: { responseModalities: ['TEXT', 'IMAGE'] },
      },
      prompt,
    })
  );

  return result;
}

export const generateConversation = async (topic: string) => {
  try {
    const researchInfo = await researchontopicwithlinks(topic);

    const prompt = `${stewiepetertechprompt}

Use the following research information to inform the dialogue: ${researchInfo}

IMPORTANT: Ignore all links from the research info. Focus only on the textual content.

Generate a conversation between Stewie and Peter about the topic "${topic}". The conversation should be approximately 10-15 dialogue exchanges (5-7 per character) suitable for an Instagram reel audience.

Each dialogue line must be 280 characters or less.

The response must be a valid JSON object with this structure:
- conversation: array of dialogue objects
- topic: string

Each dialogue object must have:
- character: either "Stewie" or "Peter"
- dialogue: the text they speak (max 280 characters)

**Dialogue Length Requirement:** Generate exactly 10-15 dialogue exchanges (5-7 per character).

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

    const result = await withGeminiFallback('gemini-3-flash-preview', (model) =>
      generateObject({
        model,
        schema: conversationperterstewieschema as any,
        prompt,
      })
    );

    return result.object;
  } catch (error) {
    throw new Error(`Error generating conversation: ${error}`);
  }
}

export { researchontopicwithlinks };
export { imagegeneration };

