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

const singleCharacterLineSchema = z.object({
  text: z.string().max(280),
});

const singleCharacterConversationSchema = z.array(singleCharacterLineSchema)
  .min(8)
  .max(20);

const singleCharacterScriptSchema = z.object({
  conversation: singleCharacterConversationSchema,
  topic: z.string(),
  character: z.string(),
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

export const generateSingleCharacterScript = async (topic: string, characterId: string) => {
  try {
    const researchInfo = await researchontopicwithlinks(topic);

    const prompt = `You are writing an educational Instagram Reel script for a single narrator named "${characterId}".
Topic: "${topic}"
Use this research context:
${researchInfo}

### CRITICAL INSTRUCTION: EXAMPLE CONTAMINATION PREVENTION
Any examples below are purely instructional. Always generate content about the ACTUAL topic provided, not placeholder examples.

### PRIMARY OBJECTIVE
Create a monologue that:
1. Educates Instagram Reel viewers about tech topics with precise accuracy
2. Maintains an authentic, consistent narrator voice and personality
3. Follows strict formatting and content requirements
4. Optimizes for social media engagement patterns
5. Transforms abstract technical updates into concrete viewer impact

### NARRATIVE VOICE SYSTEM

The narrator must use DIVERSIFIED delivery types across the script. Rotate through these response types naturally:

Response Type 1 - Technical Explanation (20% of lines):
- Provide precise technical details with clear vocabulary
- Reference underlying principles or mechanisms
- Connect to broader technological context
- Always ground the explanation in what the viewer already uses or knows

Response Type 2 - Myth-Busting Correction (20% of lines):
- Challenge a common misconception directly
- Use framing like "Most people think... but actually..."
- Show the contrast between assumption and reality
- This is your contrarian snapback — the bigger the gap between assumption and reality the better

Response Type 3 - Surprising Challenge (15% of lines):
- Present a counterintuitive fact that reframes understanding
- Ask a rhetorical question that creates curiosity
- Present an edge case or unexpected implication
- For tech updates: frame as what most coverage missed or got wrong

Response Type 4 - Historical or Contextual Perspective (15% of lines):
- Reference the evolution or origin of the technology
- Compare to older methods or systems
- Discuss where this technology is heading
- Use the fortune teller angle: present vs future contrast

Response Type 5 - Practical Application (15% of lines):
- Show exactly how this tech update changes something the viewer already does daily
- Use a concrete before and after behavior example
- Answer the implicit viewer question: so what does this mean for me
- This is non-negotiable for every tech script — abstract updates must be grounded in real behavior change

Response Type 6 - Philosophical or Broader Implication (15% of lines):
- Connect the technology to a larger societal or human impact
- Discuss what this means beyond the technical definition
- Make a memorable closing statement or open a bigger question
- For tech: frame around FOMO or significance — why missing this update matters

### HOOK REQUIREMENTS (First 2 lines)
The hook must follow this three part structure:

Part 1 - Context Lean:
- Immediately signal what the update or technology is about
- Reference something the viewer already uses or a gap between what they assume and what is true
- For tech content anchor to FOMO or curiosity: "this changes something you already use" beats "here is a new technology"
- Use second person framing — address the viewer directly
- Do not open with abstract claims — open with something the viewer can immediately relate to their own experience

Part 2 - Scroll Stop Interjection:
- One line using a contrasting word like "but" or "however" or "except"
- Stun the viewer mid-lean by introducing tension or contradiction
- Challenge the conventional coverage or obvious assumption about the update

Part 3 - Contrarian Snapback:
- Snap the viewer in the opposite direction of their initial assumption
- The bigger the contrast between what they expected and what you reveal the better
- For tech news: "everyone thinks this update does X but the real change is Y" is the ideal structure
- This line must make the viewer feel they are about to learn something no other coverage told them

### PROGRESSIVE KNOWLEDGE BUILDING (Middle lines)
- Start with fundamentals before increasing complexity
- Lines must have causal or contrasting relationships — connect ideas with logic like "but" or "therefore" not sequential addition
- Each line must add new information or deepen understanding — never restate or summarize a previous line
- Address at least one common misconception
- Include at least one practical real world example showing behavior change
- Frontload value — the first three lines after the hook must contain substantive insight not setup or transition
- For tech updates: explain what changed, why it matters, and what the viewer will do or see differently

### CLOSING (Last 2 lines)
- End with an implication that extends beyond the technical explanation
- Frame around significance — why this update or technology matters beyond the feature itself
- Leave the viewer with either a behavior change to try or a bigger question to sit with
- For tech reactions: the closing should answer "why should I care about this in six months"
- Avoid generic wrap-ups

### LINE VARIETY REQUIREMENTS
- Mix short punchy lines with longer explanatory lines
- Look at your line endings — they must form a jagged uneven pattern in length, not a uniform block
- Not every line should follow the same sentence structure
- Vary emotional tone: confident, curious, serious, enthusiastic, provocative
- Include at least one rhetorical question somewhere in the script
- Include at least one specific number, metric, or data point if accurate
- Use "you" and "your" as the dominant pronouns — this script is about the viewer not the technology

### CAUSAL CHAIN REQUIREMENT
- Every line must connect to the next with either a "but" or "therefore" relationship
- Avoid "and then" chaining where lines just stack information sequentially
- Each line should either deepen a point, contradict it, or show a consequence of it
- If a line could be removed without breaking the flow of understanding it is a filler line — remove it

### TECHNICAL ACCURACY REQUIREMENTS
- All explanations must be factually accurate
- Use current industry terminology
- Avoid outdated information or deprecated technologies
- Acknowledge trade-offs or limitations where relevant
- Focus on principles over implementation details
- For every technical claim ask: can this be shown visually or demonstrated concretely

### ABSOLUTE FORMATTING PROHIBITIONS
1. NO contractions (cannot, do not, it is, they are)
2. NO special characters for emphasis (*, _, etc.)
3. NO abbreviation periods (API not A.P.I.)
4. NO numerical digits (write "three hundred milliseconds" not "300ms")
5. NO laugh indicators or filler sounds
6. NO stage directions, emojis, markdown, or quotes around whole lines

### SPECIAL SPELLING REQUIREMENTS
- Write "kubernetis" instead of "kubernetes" in all instances
- Spell out all numbers as words

Return strict JSON only. No preamble, no markdown, no backticks.
Return this exact shape:
{
  "conversation": [
    { "text": "..." }
  ],
  "topic": "${topic}",
  "character": "${characterId}"
}

Rules:
- Exactly ten to fifteen lines total
- Each line must be two hundred and eighty characters or fewer
- One key insight per line
- The narrator must stay the same for every line
- Each line must contain meaningful educational content, never filler or transitions
- Lines must logically build on each other in a coherent narrative arc
- Every script must answer three questions by the end: what changed, why it matters, and what the viewer does differently now`;

    const result = await withGeminiFallback('gemini-3-flash-preview', (model) =>
      generateObject({
        model,
        schema: singleCharacterScriptSchema as any,
        prompt,
      })
    );

    const lines = ((result.object.conversation || []) as Array<{ text?: string }>)
      .map((line: { text?: string }) => ({ text: String(line.text || '').trim() }))
      .filter((line: { text: string }) => line.text.length > 0);

    return {
      topic,
      character: characterId,
      conversation: lines,
    };
  } catch (error) {
    throw new Error(`Error generating single-character conversation: ${error}`);
  }
}

export { researchontopicwithlinks };
export { imagegeneration };

