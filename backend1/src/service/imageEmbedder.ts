import { generateObject, generateText } from "ai";
import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import * as fs from 'fs';
import * as path from 'path';
const ffmpeg = require('fluent-ffmpeg');

// OpenCode imports for agentic image plan generation with web research
import { opencodeRun, parseOpenCodeJSON, OPENCODE_MODELS } from "../agents/opencodeagent";

// 🎯 USAGE EXAMPLES AND HELPERS
export class ImageEmbedderExamples {
  // 📖 EXAMPLE: How to use user-provided images
  static async exampleWithUserImages() {
    // Create user-provided images
    const userImages: UserProvidedImage[] = [
      UserImageManager.createUserImage(
        './my-images/docker-architecture.png',
        'Docker Container Architecture',
        'Custom diagram showing Docker container layers and isolation',
        5.0, // Show at 5 seconds
        'high'
      ),
      UserImageManager.createUserImage(
        './my-images/kubernetes-cluster.png',
        'Kubernetes Pod Structure',
        'My custom Kubernetes pod and service diagram',
        25.0, // Show at 25 seconds
        'high'
      )
    ];

    // Validate images
    const { valid, invalid } = UserImageManager.validateUserImages(userImages);
    if (invalid.length > 0) {
    }

    // Generate image plan with user images
    const plan = await ImageEmbeddingService.generateImageEmbeddingPlan(
      'session_123',
      './subtitles.ass',
      'Docker and Kubernetes tutorial',
      valid
    );

    // Display the plan

    return plan;
  }

  // 💡 TIP: How to prepare user images
  static prepareUserImages() {
    return `
📝 HOW TO PREPARE USER-PROVIDED IMAGES:

1. Create high-quality images (PNG/JPG, 1024x1024px minimum)
2. Give them descriptive labels that match your content
3. Add detailed descriptions for the AI to understand context
4. Set preferred timestamps if you want specific timing
5. Use appropriate priority levels (high for key concepts)

Example:
const myImage = UserImageManager.createUserImage(
  './images/my-diagram.png',
  'Custom System Architecture',
  'My detailed diagram showing the complete system workflow',
  10.5,  // Show at 10.5 seconds
  'high' // High priority
);

The AI will evaluate your images and decide if they're valuable for the video!
    `;
  }
}

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

// 🎯 ASS CONFIGURATION
const ASS_CONFIG = {
  imageTimingOffset: 0.3, // Image appears 0.3 seconds before subtitle (reduced for more frequent images)
  minTextLength: 10,      // Minimum text length for image consideration (reduced from 20 for more technical diagrams)
  maxImagesPerMinute: 15, // Maximum images per minute (increased from 6 for more technical content)
  imageDisplayDuration: 3.0 // Images stay on screen for dynamic duration (3-8 seconds based on dialogue relevance)
};

// 🎯 DATA TYPES
export interface AssSubtitleEntry {
  startTime: number;
  endTime: number;
  text: string;
  character?: string;
  style?: string;
  layer: number;
}

export interface AssFileData {
  entries: AssSubtitleEntry[];
  styles: Record<string, any>;
  metadata: any;
}

export interface ImageRequirement {
  id: string;
  timestamp: number;
  dialogueText: string;
  dialogueAtTimestamp?: string; // Exact dialogue text being spoken at this timestamp
  fullDialogue?: string;
  character: string;
  imageType: 'architecture' | 'process' | 'comparison' | 'diagram' | 'workflow' | 'infrastructure' | 'lifecycle';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  uploaded: boolean;
  imagePath?: string;
  contextualDuration?: number; // AI-determined duration based on dialogue context
  relevanceReasoning?: string; // Explanation of why this duration was chosen
}

export interface UserProvidedImage {
  id: string;
  imagePath: string;
  label: string;
  description?: string;
  preferredTimestamp?: number;
  priority?: 'high' | 'medium' | 'low';
  contextualDuration?: number; // AI-determined duration based on dialogue context
  relevanceReasoning?: string; // Explanation of why this duration was chosen
}

export interface ImageEmbeddingPlan {
  sessionId: string;
  totalDuration: number;
  imageRequirements: ImageRequirement[];
  userProvidedImages?: UserProvidedImage[];
  summary: {
    totalImages: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
    userProvidedUsed: number;
    estimatedProcessingTime: string;
  };
}
export interface AssSubtitleEntry {
  startTime: number;
  endTime: number;
  text: string;
  character?: string;
  style?: string;
  layer: number;
}

export interface AssFileData {
  entries: AssSubtitleEntry[];
  styles: Record<string, any>;
  metadata: any;
}

export interface ImageRequirement {
  id: string;
  timestamp: number;
  dialogueText: string;
  dialogueAtTimestamp?: string; // Exact dialogue text being spoken at this timestamp
  fullDialogue?: string;
  character: string;
  imageType: 'architecture' | 'process' | 'comparison' | 'diagram' | 'workflow' | 'infrastructure' | 'lifecycle';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  uploaded: boolean;
  imagePath?: string;
}

export interface UserProvidedImage {
  id: string;
  imagePath: string;
  label: string;
  description?: string;
  preferredTimestamp?: number;
  priority?: 'high' | 'medium' | 'low';
}

export interface UserImageDecision {
  userImageLabel: string;
  useImage: boolean;
  reasoning: string;
  timestamp?: number;
}

export interface ImageEmbeddingPlan {
  sessionId: string;
  totalDuration: number;
  imageRequirements: ImageRequirement[];
  userProvidedImages?: UserProvidedImage[];
  userImageDecisions?: UserImageDecision[];
  summary: {
    totalImages: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
    userProvidedUsed: number;
    estimatedProcessingTime: string;
  };
}

export interface UserProvidedImage {
  id: string;
  imagePath: string;
  label: string;
  description?: string;
  preferredTimestamp?: number;
  priority?: 'high' | 'medium' | 'low';
}

export interface UserImageSuggestion {
  userImageId: string;
  userImageLabel: string;
  suggestedTimestamp: number;
  dialogueIndex: number;
  dialogueText: string;
  character: string;
  reasoning: string;
  relevanceScore: number;
  suggestedDuration: number;
  alternativePlacements: Array<{
    timestamp: number;
    dialogueIndex: number;
    reasoning: string;
    score: number;
  }>;
}

// 🎯 1. ASS TIME PARSING - Converts ASS time format to seconds
export class AssFileProcessor {
  static parseAssTime(timeString: string): number {
    try {
      // ASS format: H:MM:SS.CC (hours:minutes:seconds.centiseconds)
      const parts = timeString.split(':');
      if (parts.length !== 3) throw new Error('Invalid time format');

      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const secondsParts = parts[2].split('.');
      const seconds = parseInt(secondsParts[0]);
      const centiseconds = parseInt(secondsParts[1] || '0');

      // 🕒 CONVERTS TO TOTAL SECONDS FOR VIDEO TIMING
      return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
    } catch (error) {
      return 0;
    }
  }

  static parseAssFile(content: string): AssFileData {
    const lines = content.split('\n');
    const entries: AssSubtitleEntry[] = [];
    const styles: Record<string, any> = {};
    let metadata: any = {};

    let currentSection = '';
    let dialogueStartLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 🎯 2. SECTION DETECTION
      if (line.startsWith('[Script Info]')) {
        currentSection = 'script';
      } else if (line.startsWith('[V4+ Styles]')) {
        currentSection = 'styles';
      } else if (line.startsWith('[Events]')) {
        currentSection = 'events';
        dialogueStartLine = i + 1;
      }

      // 🎯 3. METADATA EXTRACTION
      if (currentSection === 'script' && line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        metadata[key.trim()] = value;
      }

      // 🎯 4. STYLE EXTRACTION
      if (currentSection === 'styles' && line.startsWith('Style:')) {
        const parts = line.substring(6).split(',');
        if (parts.length >= 4) {
          const styleName = parts[0].trim();
          styles[styleName] = {
            name: styleName,
            fontName: parts[1].trim(),
            fontSize: parts[2].trim(),
            primaryColor: parts[3].trim()
          };
        }
      }

      // 🎯 5. DIALOGUE EXTRACTION - Group consecutive entries by logical dialogue segments
      if (currentSection === 'events' && line.startsWith('Dialogue:')) {
        try {
          const parts = line.substring(9).split(',');
          if (parts.length >= 10) {
            const startTime = this.parseAssTime(parts[1].trim());
            const endTime = this.parseAssTime(parts[2].trim());
            const style = parts[3].trim();
            const actor = parts[4].trim();
            const text = parts.slice(9).join(',').trim();

            // Remove ASS formatting tags
            const cleanText = text.replace(/{[^}]*}/g, '');

            entries.push({
              startTime,
              endTime,
              text: cleanText,
              character: actor || undefined,
              style: style || undefined,
              layer: parseInt(parts[5]) || 0
            });
          }
        } catch (error) {
        }
      }
    }

    // 📊 GROUP ENTRIES BY LOGICAL DIALOGUE SEGMENTS
    const groupedEntries: AssSubtitleEntry[] = [];
    let currentGroup: AssSubtitleEntry | null = null;

    for (const entry of entries) {
      // If this is the first entry or a new logical segment (different character or gap > 0.5s)
      if (!currentGroup ||
        currentGroup.character !== entry.character ||
        (entry.startTime - currentGroup.endTime) > 0.5) {

        // Save previous group if it exists
        if (currentGroup) {
          groupedEntries.push(currentGroup);
        }

        // Start new group
        currentGroup = {
          startTime: entry.startTime,
          endTime: entry.endTime,
          text: entry.text,
          character: entry.character,
          style: entry.style,
          layer: entry.layer
        };
      } else {
        // Extend current group
        currentGroup.endTime = Math.max(currentGroup.endTime, entry.endTime);
        // For cumulative text entries, replace with the longer version
        if (entry.text.length > currentGroup.text.length) {
          currentGroup.text = entry.text;
        }
      }
    }

    // Add the last group
    if (currentGroup) {
      groupedEntries.push(currentGroup);
    }

    // 📊 CALCULATE TOTAL DURATION
    const totalDuration = groupedEntries.length > 0
      ? Math.max(...groupedEntries.map(e => e.endTime))
      : 0;

    return {
      entries: groupedEntries.sort((a, b) => a.startTime - b.startTime), // Sort by time
      styles,
      metadata: {
        ...metadata,
        totalEntries: groupedEntries.length,
        duration: totalDuration
      }
    };
  }

  // 🎯 6. IMAGE TIMING GENERATION - Extract timing for images based on subtitles
  static generateImageTimingFromAss(
    assData: AssFileData,
    imageDensity: 'low' | 'medium' | 'high' | 'ultra' = 'high'
  ): Array<{ startTime: number; endTime: number; text: string; character?: string }> {
    const { entries } = assData;
    const imageTimings: Array<{ startTime: number; endTime: number; text: string; character?: string }> = [];

    // 📏 DENSITY CONFIGURATION - How often to place images (more frequent now)
    const intervals = {
      low: 8,     // Every 8 seconds
      medium: 4,  // Every 4 seconds
      high: 2,    // Every 2 seconds
      ultra: 1.5  // Every 1.5 seconds (very frequent)
    };

    const interval = intervals[imageDensity];
    let lastImageTime = 0;
    const maxImages = Math.floor((assData.metadata.duration / 60) * ASS_CONFIG.maxImagesPerMinute);

    for (const entry of entries) {
      // 🎯 7. TECHNICAL IMAGE PLACEMENT - Strategic placement for educational content
      // Only add image if:
      // - Enough time has passed since last image
      // - Text has minimum length (reduced threshold for technical content)
      // - Haven't exceeded max images per minute
      if (entry.startTime - lastImageTime >= interval &&
        entry.text.length > ASS_CONFIG.minTextLength &&
        imageTimings.length < maxImages) {

        const imageStart = Math.max(0, entry.startTime - ASS_CONFIG.imageTimingOffset);
        const imageEnd = Math.min(assData.metadata.duration, entry.endTime + ASS_CONFIG.imageDisplayDuration);

        imageTimings.push({
          // 🕒 INTELLIGENT TIMING OFFSET - Image appears slightly before subtitle and stays longer
          startTime: imageStart,
          endTime: imageEnd,
          text: entry.text,
          character: entry.character
        });
        lastImageTime = entry.startTime;
      }
    }

    return imageTimings;
  }
}

// CONTAMINATION-FREE IMAGE ANALYSIS PROMPT
export class ImageEmbeddingAnalyzer {
  private static readonly IMAGE_ANALYSIS_PROMPT = `
# Visual Image Recommendation System for Instagram Reels - Technical Education Focus

You are an expert visual content strategist specializing in recommending EDUCATIONAL IMAGES for Instagram Reels and YouTube Shorts about technology topics.

## PRIMARY OBJECTIVE
Analyze technical dialogue and recommend SMART, ENGAGING IMAGES that enhance viewer retention and technical understanding for SHORT-FORM vertical video content.

## CRITICAL DIALOGUE CONTEXT REQUIREMENT
For each image recommendation, you MUST extract COMPLETE DIALOGUE CONTEXT, not fragments. Users will see this dialogue in the frontend as the context for when images appear. Provide the full conversation exchange that makes sense as a standalone piece of dialogue - like what someone would actually say in a complete sentence or thought.

## DIALOGUE ANALYSIS
**DIALOGUE SEQUENCE:** {{DIALOGUE_SEQUENCE}}
**CONTENT CONTEXT:** This dialogue covers {{TOPIC}}

**IMPORTANT:** For each image recommendation, you must extract and CLEAN the dialogue text being spoken at the specified timestamp. The dialogue sequence may contain ASS subtitle formatting artifacts (like \N for line breaks). You must:

1. **Find the complete dialogue segment** - Look for the full conversation context around the timestamp, not just isolated words
2. **Include surrounding context** - Provide enough dialogue to understand what the characters are discussing
3. **Clean up formatting artifacts** - Remove \N, weird line breaks, etc. and make it readable
4. **Provide meaningful context** - Include the full thought or conversation segment, not just fragments

**EXAMPLE:**
- Raw ASS: "[18.6s] Peter: superpowers. TypeScript\Nadds"
- **BAD (fragment only):** "superpowers. TypeScript adds"
- **GOOD (full context):** "Actually, it is JavaScript but with superpowers. TypeScript adds type checking to your code, so instead of finding bugs when users click buttons, you catch them while writing code"

This cleaned dialogue will be displayed to users in the frontend, so it must be properly formatted and readable.

**CRITICAL:** Always provide the COMPLETE dialogue context, not isolated fragments. Look for the full thought or conversation segment that gives users meaningful context about what the characters are discussing at that moment in the video.

## THE SMART TECHNICAL VISUAL PHILOSOPHY:
Create images that are **educationally effective** - they should be:
- **Instantly comprehensible** (2-3 seconds to grasp the concept)
- **Technically meaningful** (actually explain how something works)
- **Visually clean** (not cluttered or overwhelming)
- **Mobile-optimized** (readable on small screens)
- **Conceptually rich** (convey real technical knowledge)

## TECHNICAL DEPTH GUIDELINES:

### ✅ INCLUDE (Smart Technical Visuals):
- **Simple system diagrams** showing 3-5 key components with clear labels
- **Clean process flows** with 3-4 logical steps and arrows
- **Before/after comparisons** showing clear technical improvements
- **Essential code patterns** (max 2-3 lines, large fonts, key concepts only)
- **Architecture overviews** with main building blocks clearly labeled
- **Data flow diagrams** showing simple input → process → output
- **Comparison charts** highlighting key differences between technologies
- **Visual metaphors** that accurately represent technical concepts

### ❌ AVOID (Too Simple or Too Complex):
**Too Simple:**
- Generic logos or icons without educational value
- Empty marketing graphics with no technical content
- Abstract shapes that don't explain concepts
- Decorative images that add no learning value

**Too Complex:**
- Dense code blocks with more than 3-4 lines
- Detailed configuration files or settings screens
- Complex network diagrams with 10+ components
- Small text that can't be read on mobile
- Multi-step processes with more than 5 steps

## SMART IMAGE TYPES FOR TECHNICAL EDUCATION:

#### 1. CONCEPT DIAGRAMS (35% priority)
- Clean system architecture with 3-5 main components
- Simple process flows showing key stages
- Input/Output diagrams with clear data paths
- Component interaction diagrams

#### 2. SMART CODE VISUALS (25% priority)
- **Key syntax patterns** (2-3 lines max, large font)
- **Before/after code comparisons** showing improvements
- **Function signatures** with parameter types clearly shown
- **Error examples** vs correct implementations
- Focus on CONCEPTS not complete implementations

#### 3. COMPARISON GRAPHICS (20% priority)
- Side-by-side technology comparisons
- Performance metrics with clear visual representation
- Feature matrices showing advantages/disadvantages
- Timeline showing evolution or adoption

#### 4. PROCESS VISUALIZATIONS (20% priority)
- Build/deployment pipelines (3-4 key steps)
- Development workflows (design → code → test → deploy)
- Data processing chains
- User interaction flows

## SMART CODE VISUAL EXAMPLES:

**GOOD Code Visuals:**
- "function add(a: number, b: number): number" - Shows TypeScript typing concept
- "// JavaScript: runtime error ❌" vs "// TypeScript: compile-time error ✅"
- Key import statement showing framework usage
- Single line showing syntax difference between languages

**BAD Code Visuals:**
- Complete function implementations with 10+ lines
- Configuration files with multiple nested objects
- Raw API responses or detailed JSON structures
- Complex algorithms or business logic

## IMAGE RECOMMENDATION FORMAT

For each recommended image:

**TIMESTAMP:** Exact second when image should appear
**DIALOGUE AT TIMESTAMP:** CRITICALLY IMPORTANT - Extract the COMPLETE DIALOGUE SEGMENT from the sequence above. The dialogue sequence now provides all dialogue within a 30-second window around each timestamp. You must provide the FULL CONVERSATION CONTEXT, not just fragments. Look for the complete thought or conversation exchange that makes sense as a standalone piece of dialogue that users can understand.
**IMAGE TYPE:** Category (concept_diagram, smart_code, comparison, process, architecture)
**TITLE:** Clear, educational title (max 4 words)
**IMAGE DESCRIPTION:** Focus on educational value:
- What technical concept does this explain?
- How does it enhance understanding?
- Specific visual elements that teach the concept
- Clean design suitable for mobile viewing
**PRIORITY:** High/Medium/Low based on learning impact
**CONTEXTUAL DURATION:** 4-12 seconds based on concept complexity
**RETENTION VALUE:** Why this image helps viewers learn and stay engaged

## EXAMPLE DESCRIPTIONS:

**EXCELLENT Examples:**
- "Simple diagram: 'TypeScript Code' → 'Compiler' → 'JavaScript Code' with type checking highlighted at compiler stage"
- "Split screen: Left shows 'let x = 5; x.toUpperCase()' with runtime error icon, Right shows 'let x: string = \"hello\"; x.toUpperCase()' with success checkmark"
- "Clean architecture: Frontend (React icon) ↔ API Gateway ↔ Backend Services (3 boxes), with data flow arrows"
- "Before/After: Messy JavaScript function vs same function with TypeScript types, highlighting improved readability"

## DIALOGUE CLEANING EXAMPLES:

**Raw ASS Format (from dialogue sequence):**
"[18.6s] Peter: superpowers. TypeScript\Nadds"

**BAD (fragment only):**
"superpowers. TypeScript adds"

**GOOD (full context):**
"Actually, it is JavaScript but with superpowers. TypeScript adds type checking to your code, so instead of finding bugs when users click buttons, you catch them while writing code"

**Raw ASS Format with line breaks:**
"[37.4s] Stewie: what precisely\Ndistinguishes | Peter: TypeScript spots mistakes"

**DIALOGUE CONTEXT EXTRACTION EXAMPLES:**

**Raw Dialogue Sequence:**
[0.0s] System: Introduction to TypeScript Introduction and Benefits for JavaScrip - 22/9/2025
[9.7s] Stewie: what precisely distinguishes | [18.6s] Peter: superpowers. TypeScript adds | [28.4s] Stewie: additional syntactic requirements | [37.4s] Peter: TypeScript spots mistakes

**BAD (fragment only):**
"superpowers. TypeScript adds"

**GOOD (complete context):**
"Ever wonder why your JavaScript code breaks in production but works perfectly on your machine? Let me tell you about TypeScript and why it saves me hours of debugging every week."

**Another Example:**
**BAD:** "what precisely distinguishes"
**GOOD:** "TypeScript? I have heard this term bandied about, but what precisely distinguishes it from ordinary JavaScript? Are we discussing some arcane Microsoft invention?"

**AVOID Examples:**
- "Glowing TypeScript logo with sparkles"
- "Complete class definition with constructor, methods, and inheritance"
- "Detailed tsconfig.json file with all configuration options"
- "Complex microservices diagram with 15 interconnected services"

## LEARNING-FOCUSED PRIORITIES:

**High Priority Images (Concept Mastery):**
- Core concepts that are essential to understanding the topic
- Common misconceptions or errors that need visual clarification
- Key differences between related technologies
- Fundamental workflows or processes

**Medium Priority Images (Depth & Context):**
- Supporting examples that reinforce main concepts
- Practical applications of theoretical concepts
- Performance or efficiency comparisons
- Real-world usage patterns

**Low Priority Images (Enhancement):**
- Additional context or background information
- Nice-to-know features or advanced concepts
- Historical context or evolution

## GOAL
Recommend educationally valuable, technically accurate images that help viewers understand key concepts while maintaining engagement for Instagram Reels format. Balance technical depth with visual clarity.

## OUTPUT FORMAT:
Return a JSON object with this structure:
{
  "imageRequirements": [
    {
      "timestamp": 0.0,
      "dialogueAtTimestamp": "COMPLETE dialogue segment that provides full context (extract the entire conversation exchange, not just fragments - look for complete thoughts and conversations that make sense standalone, remove ASS formatting artifacts like \\N)",
      "dialogueText": "exact dialogue text at this timestamp", 
      "character": "Character name",
      "imageType": "concept_diagram|smart_code|comparison|process|architecture",
      "title": "Educational title (max 4 words)",
      "description": "Clear educational description focusing on what technical concept this teaches and how it enhances understanding",
      "priority": "high|medium|low",
      "contextualDuration": 6,
      "relevanceReasoning": "Why this image enhances technical learning at this moment"
    }
  ]
}
`;

  // 🎯 8. AI ANALYSIS FOR IMAGE REQUIREMENTS WITH USER IMAGES
  static async analyzeDialogueForImages(
    sessionId: string,
    assData: AssFileData,
    topic: string,
    userProvidedImages?: UserProvidedImage[]
  ): Promise<ImageEmbeddingPlan> {
    try {

      const { entries } = assData;
      const imageTimings = AssFileProcessor.generateImageTimingFromAss(assData, 'ultra'); // Use ultra density for more images

      // ═══════════════════════════════════════════════════════════════════════════
      // 🚀 OPENCODE-BASED IMAGE PLAN GENERATION (with Exa MCP web research)
      // Uses Gemini 3 Pro for smarter analysis + real-time web research
      // ═══════════════════════════════════════════════════════════════════════════

      // 🎯 10. PREPARE ENHANCED DIALOGUE SEQUENCE FOR AI
      // Clean up ASS formatting artifacts from dialogue text
      const cleanDialogueEntries = entries.map(entry => {
        const cleanedText = entry.text
          .replace(/\\N/g, ' ') // Replace \N with space
          .replace(/\\n/g, ' ') // Replace \n with space
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .trim(); // Remove leading/trailing whitespace

        return {
          ...entry,
          text: cleanedText
        };
      });

      // Create comprehensive dialogue sequence with full context
      const dialogueSequence = cleanDialogueEntries
        .map((entry, index) => {
          // Get broader context - include more surrounding dialogue entries
          const contextEntries = [];
          const contextWindow = 30; // Look at 30 seconds before and after

          // Find all entries within the context window
          for (let i = 0; i < cleanDialogueEntries.length; i++) {
            const otherEntry = cleanDialogueEntries[i];
            const timeDiff = Math.abs(entry.startTime - otherEntry.startTime);

            if (timeDiff <= contextWindow) {
              contextEntries.push(otherEntry);
            }
          }

          // Sort context entries by time
          contextEntries.sort((a, b) => a.startTime - b.startTime);

          // Create a more comprehensive context line
          const contextLines = contextEntries.map(e =>
            `[${e.startTime.toFixed(1)}s] ${e.character}: ${e.text}`
          );

          return contextLines.join(' | ');
        })
        .join('\n');

      // Build user images context
      const userImagesContext = userProvidedImages?.length
        ? `\n\nUSER-PROVIDED IMAGES:\n${userProvidedImages.map(img => `- ${img.label}: ${img.description || 'No description'}`).join('\n')}\n\nEVALUATE USER IMAGES: The user has explicitly provided ${userProvidedImages.length} images they want to include. For each user-provided image, you should STRONGLY CONSIDER including it unless it is completely irrelevant. If you decide to use a user image, you MUST provide a specific timestamp (in seconds) for when it should appear.`
        : '';

      // Calculate video duration from dialogue timestamps
      const timestampMatches = dialogueSequence.match(/\[(\d+\.?\d*)s\]/g);
      const timestamps = timestampMatches?.map(t => parseFloat(t.replace(/[\[\]s]/g, ''))) || [];
      const videoDuration = Math.max(...timestamps, 15); // Fallback to 15s if no timestamps

      // Calculate appropriate image count: ~1 image per 5-7 seconds of content
      const minImages = Math.max(2, Math.floor(videoDuration / 7));
      const maxImages = Math.max(3, Math.ceil(videoDuration / 4));

      console.log(`📏 [ImagePlan] Video duration: ~${videoDuration.toFixed(1)}s, recommending ${minImages}-${maxImages} images`);

      // 🚀 OPENCODE PROMPT - Combines research + image plan generation
      const opencodePrompt = `You are an expert visual content strategist for educational Instagram Reels. You have access to web search via Exa MCP - USE IT to research the topic.

TOPIC: "${topic}"

VIDEO DURATION: ~${videoDuration.toFixed(0)} seconds

DIALOGUE SEQUENCE:
${dialogueSequence}

TASK:
1. FIRST, use web search (Exa) to research "${topic}" - find current best practices, visual diagram ideas, and educational approaches
2. Based on your research AND the dialogue, suggest specific educational images/diagrams

For each image recommendation, provide:
- timestamp: number (when it should appear in seconds)
- dialogueText: string (the complete dialogue being spoken at this timestamp)
- character: string (who is speaking - e.g., "Peter", "Stewie")
- imageType: one of ["architecture", "process", "comparison", "diagram", "workflow", "infrastructure", "lifecycle", "concept_diagram", "smart_code"]
- title: string (max 4 words)
- description: string (what the image should show - focus on educational value)
- priority: "high" | "medium" | "low"
- contextualDuration: number (3-8 seconds - how long this image should display)
- relevanceReasoning: string (why this image helps learning)
${userImagesContext}

RETURN ONLY VALID JSON in this exact format:
{
  "imageRequirements": [
    {
      "timestamp": 0.0,
      "dialogueText": "full dialogue text",
      "character": "Character name",
      "imageType": "diagram",
      "title": "Title Here",
      "description": "Description of what the image shows",
      "priority": "high",
      "contextualDuration": 5,
      "relevanceReasoning": "Why this image is useful"
    }
  ],
  "userImageDecisions": [
    {
      "userImageLabel": "label",
      "useImage": true,
      "timestamp": 5.0,
      "contextualDuration": 6,
      "reasoning": "Why include/exclude"
    }
  ]
}

CRITICAL TIMING RULES:
- Video is only ${videoDuration.toFixed(0)} seconds long
- Recommend ONLY ${minImages}-${maxImages} images total (quality over quantity!)
- Each image should display for 4-6 seconds minimum (viewers need time to read)
- Space images at least 4 seconds apart
- Focus on the MOST IMPORTANT concepts only
- Don't add an image for every dialogue line - be selective!
- Mobile-optimized: keep diagrams simple (3-5 components max)`;

      console.log('🚀 [ImagePlan] Using OpenCode with Gemini 3 Pro for image plan generation...');
      console.log('🔍 [ImagePlan] OpenCode will use Exa MCP for web research on:', topic);

      // Run OpenCode with Gemini 3 Pro model
      const opencodeOutput = await opencodeRun({
        prompt: opencodePrompt,
        model: 'pro', // Use Gemini 3 Pro for better analysis
        format: 'json',
        quiet: true,
      });

      console.log('✅ [ImagePlan] OpenCode completed, parsing JSON response...');

      // Parse the JSON from OpenCode output
      const parsedResult = parseOpenCodeJSON<{
        imageRequirements: Array<{
          timestamp: number;
          dialogueText: string;
          character: string;
          imageType: string;
          dialogueAtTimestamp?: string;
          title: string;
          description: string;
          priority: 'high' | 'medium' | 'low';
          contextualDuration: number;
          relevanceReasoning: string;
        }>;
        userImageDecisions?: Array<{
          userImageLabel: string;
          useImage: boolean;
          timestamp: number;
          contextualDuration?: number;
          reasoning: string;
        }>;
      }>(opencodeOutput);

      if (!parsedResult) {
        console.error('❌ [ImagePlan] Failed to parse OpenCode output, falling back to empty plan');
        console.error('Raw output:', opencodeOutput.substring(0, 500));
        throw new Error('Failed to parse OpenCode JSON output for image plan');
      }

      console.log(`✅ [ImagePlan] Parsed ${parsedResult.imageRequirements?.length || 0} image requirements`);

      // Create a result object compatible with the rest of the code
      const result = {
        object: parsedResult
      };

      // Debug: Log the AI response to understand what's being generated
      if (result.object.imageRequirements?.length > 0) {
        for (let i = 0; i < Math.min(3, result.object.imageRequirements.length); i++) {
          const req = result.object.imageRequirements[i];
        }
      }

      // 🎯 12. CREATE IMAGE REQUIREMENTS WITH UNIQUE IDS AND AI-DETERMINED DURATIONS
      const imageRequirements: ImageRequirement[] = (result.object as any).imageRequirements?.map((req: any, index: number) => {
        // Find the specific dialogue entry for this timestamp (closest within 5s tolerance)
        let targetEntry: AssSubtitleEntry | undefined = entries.find(entry => Math.abs(entry.startTime - req.timestamp) < 1.0);

        // If no exact match within 1s, find the closest entry within 5s
        if (!targetEntry) {
          const sortedEntries = entries.sort((a, b) => Math.abs(a.startTime - req.timestamp) - Math.abs(b.startTime - req.timestamp));
          targetEntry = sortedEntries[0] && Math.abs(sortedEntries[0].startTime - req.timestamp) < 5.0 ? sortedEntries[0] : undefined;
        }

        // If still no match, find the entry that contains this timestamp
        if (!targetEntry) {
          targetEntry = entries.find(entry => entry.startTime <= req.timestamp && entry.endTime >= req.timestamp);
        }

        // If still no match, use the closest entry by time
        if (!targetEntry && entries.length > 0) {
          const sortedEntries = entries.sort((a, b) => Math.abs(a.startTime - req.timestamp) - Math.abs(b.startTime - req.timestamp));
          targetEntry = sortedEntries[0];
        }

        // Always derive dialogue from ASS, never trust AI-provided text
        let cleanedTargetText = '';
        let derivedCharacter = '';

        if (targetEntry) {
          cleanedTargetText = (targetEntry.text || '')
            .replace(/\\N/g, ' ')
            .replace(/\\n/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          derivedCharacter = targetEntry.character || '';
        } else {
          // Fallback: use AI-provided dialogue text if no ASS entry found
          cleanedTargetText = req.dialogueText || '';
          derivedCharacter = req.character || 'Unknown';
        }

        // Build full context from previous and current entries (ASS-derived only)
        let fullDialogue = cleanedTargetText;
        let dialogueAtTimestamp = cleanedTargetText;
        if (targetEntry) {
          const targetIndex = entries.indexOf(targetEntry);
          const contextStart = Math.max(0, targetIndex - 1); // Include previous dialogue for context
          const contextEntries = entries.slice(contextStart, targetIndex + 1);

          const cleanedContextEntries = contextEntries.map(entry => {
            const cleanedText = (entry.text || '')
              .replace(/\\N/g, ' ')
              .replace(/\\n/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            return { ...entry, text: cleanedText };
          });

          // Compose readable context without duplication
          const contextParts = cleanedContextEntries.map(entry => `${entry.character}: ${entry.text}`);
          // Remove exact adjacent duplicates
          const dedupedParts: string[] = [];
          for (const part of contextParts) {
            if (dedupedParts[dedupedParts.length - 1] !== part) dedupedParts.push(part);
          }
          fullDialogue = dedupedParts.join(' | ');
          dialogueAtTimestamp = `${derivedCharacter}: ${cleanedTargetText}`.trim();
        } else {
          // If no target entry found, create a basic full context
          fullDialogue = `${derivedCharacter}: ${cleanedTargetText}`;
          dialogueAtTimestamp = `${derivedCharacter}: ${cleanedTargetText}`;
        }

        // Ensure fullDialogue is never empty
        if (!fullDialogue || fullDialogue.trim() === '') {
          fullDialogue = `${derivedCharacter}: ${cleanedTargetText}`;
        }

        // Debug: Log the fullDialogue creation

        return {
          id: `img_${sessionId}_${index}`,
          timestamp: req.timestamp || 0,
          dialogueText: cleanedTargetText, // strictly from ASS
          dialogueAtTimestamp,            // strictly from ASS
          fullDialogue,
          character: derivedCharacter,
          imageType: req.imageType || 'diagram',
          title: req.title || '',
          description: req.description || '',
          priority: req.priority || 'medium',
          uploaded: false,
          contextualDuration: req.contextualDuration || 6, // AI-determined duration
          relevanceReasoning: req.relevanceReasoning || 'Standard educational timing'
        };
      }) || [];

      // 🎯 13. PROCESS USER IMAGE DECISIONS WITH DETAILED FEEDBACK
      let userProvidedUsed = 0;
      const userImageDecisions = (result.object as any).userImageDecisions || [];

      userImageDecisions.forEach((decision: any) => {
        const status = decision.useImage ? '✅ ACCEPTED' : '❌ REJECTED';
        if (decision.useImage) {
        }
      });

      // Add user-provided images that AI decided to use
      userImageDecisions.forEach((decision: any) => {

        if (decision.useImage && userProvidedImages) {
          const userImage = userProvidedImages.find(img => img.label === decision.userImageLabel);
          if (userImage) {
            // Update the user image with AI-determined timestamp
            userImage.preferredTimestamp = decision.timestamp || userImage.preferredTimestamp || 0;
            userImage.contextualDuration = decision.contextualDuration || userImage.contextualDuration || 8;
            userImage.relevanceReasoning = decision.reasoning || userImage.relevanceReasoning;

            const finalTimestamp = userImage.preferredTimestamp;

            const imageReq: ImageRequirement = {
              id: `user_${sessionId}_${userProvidedUsed}`,
              timestamp: finalTimestamp || 0,
              dialogueText: userImage.description || userImage.label,
              character: 'System',
              imageType: 'diagram', // Default type for user images
              title: userImage.label,
              description: userImage.description || `User-provided image: ${userImage.label}`,
              priority: userImage.priority || 'medium',
              uploaded: true,
              imagePath: userImage.imagePath,
              contextualDuration: decision.contextualDuration || 8, // AI-determined duration for user images
              relevanceReasoning: decision.reasoning || 'User-provided image with AI timing analysis'
            };
            imageRequirements.push(imageReq);
            userProvidedUsed++;
          }
        }
      });      // 🎯 FALLBACK: If AI rejected all user images but user images exist, try to place them based on keyword matching
      if (userProvidedImages && userProvidedImages.length > 0 && userProvidedUsed === 0) {

        userProvidedImages.forEach((userImage, index) => {
          // Try to find a reasonable timestamp based on keywords in the dialogue
          let fallbackTimestamp = 10 + (index * 15); // Default spacing
          let foundMatch = false;

          // Look for keywords in the image label/description in the dialogue
          const keywords = userImage.label.toLowerCase().split(/[\s\-_]+/).filter(word => word.length > 3);

          for (const entry of entries) {
            const dialogueText = entry.text.toLowerCase();
            if (keywords.some(keyword => dialogueText.includes(keyword))) {
              fallbackTimestamp = entry.startTime + 2; // Show 2 seconds after the mention
              foundMatch = true;
              break;
            }
          }

          // Update the user image with fallback timestamp
          userImage.preferredTimestamp = fallbackTimestamp;
          userImage.contextualDuration = 8;
          userImage.relevanceReasoning = foundMatch ?
            `Fallback placement: Keyword match found in dialogue` :
            `Fallback placement: Spaced placement for user-provided image`;


          const imageReq: ImageRequirement = {
            id: `user_fallback_${sessionId}_${userProvidedUsed}`,
            timestamp: fallbackTimestamp,
            dialogueText: userImage.description || userImage.label,
            character: 'System',
            imageType: 'diagram',
            title: userImage.label,
            description: userImage.description || `User-provided image: ${userImage.label}`,
            priority: userImage.priority || 'medium',
            uploaded: true,
            imagePath: userImage.imagePath,
            contextualDuration: 8,
            relevanceReasoning: userImage.relevanceReasoning
          };
          imageRequirements.push(imageReq);
          userProvidedUsed++;
        });

      }

      // DEDUPLICATE REQUIREMENTS BY TIMESTAMP + CONTEXT to avoid repeated items
      const normalizeText = (t: string | undefined) => (t || '')
        .toLowerCase()
        .replace(/[^a-z0-9:\s|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const seenReqKeys = new Set<string>();
      const dedupedImageRequirements = imageRequirements.filter(req => {
        const roundedTs = Math.round((req.timestamp || 0) * 10) / 10; // 0.1s resolution
        const key = `${roundedTs}|${normalizeText(req.dialogueAtTimestamp || req.dialogueText)}|${(req.character || '').toLowerCase()}`;
        if (seenReqKeys.has(key)) return false;
        seenReqKeys.add(key);
        return true;
      });

      // Replace with deduped list before matching existing images
      let workingImageRequirements: ImageRequirement[] = dedupedImageRequirements;

      // 🎯 14. MATCH EXISTING IMAGES TO REQUIREMENTS

      // Save updated user images with AI-determined timestamps back to file
      if (userProvidedImages?.length) {
        userProvidedImages.forEach(img => {
        });
        UserImageManager.saveUserImages(userProvidedImages, sessionId);
      }


      const sessionImageDir = path.join(process.cwd(), 'storage', 'images', sessionId);
      if (fs.existsSync(sessionImageDir)) {
        const existingImages = fs.readdirSync(sessionImageDir)
          .filter(file => file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.jpeg') || file.endsWith('.gif'))
          .map(file => ({
            filename: file,
            path: path.join(sessionImageDir, file),
            title: file.replace(/[_-]/g, ' ').replace(/\..*$/, '').replace(/img.*$/, '').trim()
          }));


        // Match existing images to requirements
        workingImageRequirements.forEach(req => {
          const matchingImage = existingImages.find(img =>
            img.title.toLowerCase().includes(req.title.toLowerCase().substring(0, 10)) ||
            req.title.toLowerCase().includes(img.title.toLowerCase().substring(0, 10))
          );

          if (matchingImage) {
            req.imagePath = matchingImage.path;
            req.uploaded = true;
          } else {
          }
        });
      } else {
      }

      // 🎬 ADD DEFAULT INTRODUCTION IMAGE SUGGESTION (Thumbnail)
      const introductionImageReq: ImageRequirement = {
        id: `img_${sessionId}_introduction`,
        timestamp: 0.0,
        dialogueText: `Introduction to ${topic}`,
        character: 'System',
        imageType: 'diagram',
        title: 'Introduction',
        description: `An engaging introduction image that serves as a thumbnail for the video about ${topic}. This image should represent the main topic and create visual interest for viewers.`,
        priority: 'medium',
        uploaded: false,
        contextualDuration: 5.0, // Show for 5 seconds at the beginning
        relevanceReasoning: 'Introduction image acts as video thumbnail and sets the visual tone for the content'
      };

      // Add introduction image at the beginning of the array
      workingImageRequirements.unshift(introductionImageReq);

      // Final dedup including possible conflicts at t=0 after adding intro
      const finalSeenKeys = new Set<string>();
      const finalImageRequirements = workingImageRequirements.filter(req => {
        const roundedTs = Math.round((req.timestamp || 0) * 10) / 10;
        const key = `${roundedTs}|${normalizeText(req.dialogueAtTimestamp || req.dialogueText)}|${(req.character || '').toLowerCase()}|${(req.title || '').toLowerCase()}`;
        if (finalSeenKeys.has(key)) return false;
        finalSeenKeys.add(key);
        return true;
      });

      // 📊 CALCULATE SUMMARY STATISTICS
      const highPriority = imageRequirements.filter(req => req.priority === 'high').length;
      const mediumPriority = imageRequirements.filter(req => req.priority === 'medium').length;
      const lowPriority = imageRequirements.filter(req => req.priority === 'low').length;

      const plan: ImageEmbeddingPlan = {
        sessionId,
        totalDuration: assData.metadata.duration,
        imageRequirements: finalImageRequirements,
        userProvidedImages,
        userImageDecisions,
        summary: {
          totalImages: imageRequirements.length,
          highPriority,
          mediumPriority,
          lowPriority,
          userProvidedUsed,
          estimatedProcessingTime: `${Math.ceil(imageRequirements.length * 1.5)} minutes` // Reduced time estimate
        }
      };

      if (userProvidedImages?.length) {
      }

      return plan;

    } catch (error) {
      throw new Error(`Failed to analyze dialogue for images: ${error}`);
    }
  }

  // 💾 SAVE IMAGE PLAN TO FILE
  static saveImagePlan(plan: ImageEmbeddingPlan, outputDir: string = './temp'): string {
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filePath = path.join(outputDir, `${plan.sessionId}_image_plan.json`);
      fs.writeFileSync(filePath, JSON.stringify(plan, null, 2));

      return filePath;

    } catch (error) {
      console.error('❌ [SAVE] Error saving image plan:', error);
      throw new Error(`Failed to save image plan: ${error}`);
    }
  }

  // 📖 LOAD IMAGE PLAN FROM FILE
  static loadImagePlan(filePath: string): ImageEmbeddingPlan {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const plan = JSON.parse(content) as ImageEmbeddingPlan;
      return plan;

    } catch (error) {
      console.error('❌ [LOAD] Error loading image plan:', error);
      throw new Error(`Failed to load image plan: ${error}`);
    }
  }

  // 📊 GET UPLOAD PROGRESS
  static getUploadProgress(plan: ImageEmbeddingPlan): { uploaded: number; total: number; percentage: number } {
    const uploaded = plan.imageRequirements.filter(req => req.uploaded).length;
    const total = plan.imageRequirements.length;
    const percentage = total > 0 ? Math.round((uploaded / total) * 100) : 0;

    return { uploaded, total, percentage };
  }

  // 🔄 UPDATE IMAGE UPLOAD STATUS
  static updateImageUploadStatus(
    plan: ImageEmbeddingPlan,
    imageId: string,
    uploaded: boolean,
    imagePath?: string
  ): ImageEmbeddingPlan {
    const updatedRequirements = plan.imageRequirements.map(req => {
      if (req.id === imageId) {
        return {
          ...req,
          uploaded,
          imagePath: uploaded ? imagePath : undefined
        };
      }
      return req;
    });

    return {
      ...plan,
      imageRequirements: updatedRequirements
    };
  }
}

// 🎯 USER-PROVIDED IMAGE MANAGEMENT
export class UserImageManager {
  // 📝 CREATE USER-PROVIDED IMAGE OBJECT
  static createUserImage(
    imagePath: string,
    label: string,
    description?: string,
    preferredTimestamp?: number,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): UserProvidedImage {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file does not exist: ${imagePath}`);
    }

    return {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      imagePath,
      label,
      description,
      preferredTimestamp,
      priority
    };
  }

  // 📋 VALIDATE USER-PROVIDED IMAGES
  static validateUserImages(images: UserProvidedImage[]): { valid: UserProvidedImage[]; invalid: string[] } {
    const valid: UserProvidedImage[] = [];
    const invalid: string[] = [];

    images.forEach(img => {
      try {
        if (!fs.existsSync(img.imagePath)) {
          invalid.push(`${img.label}: File not found - ${img.imagePath}`);
        } else if (!img.label.trim()) {
          invalid.push(`${img.imagePath}: Label is required`);
        } else {
          valid.push(img);
        }
      } catch (error) {
        invalid.push(`${img.label}: Validation error - ${error}`);
      }
    });

    return { valid, invalid };
  }

  // 💾 SAVE USER IMAGES TO FILE
  static saveUserImages(images: UserProvidedImage[], sessionId: string, outputDir: string = './temp'): string {
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filePath = path.join(outputDir, `${sessionId}_user_images.json`);
      fs.writeFileSync(filePath, JSON.stringify(images, null, 2));

      return filePath;

    } catch (error) {
      throw new Error(`Failed to save user images: ${error}`);
    }
  }

  // 📖 LOAD USER IMAGES FROM FILE
  static loadUserImages(filePath: string): UserProvidedImage[] {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const images = JSON.parse(content) as UserProvidedImage[];

      // Validate that image files actually exist
      const validImages = images.filter(img => {
        if (!fs.existsSync(img.imagePath)) {
          return false;
        }
        return true;
      });

      return validImages;

    } catch (error) {
      throw new Error(`Failed to load user images: ${error}`);
    }
  }
}
export class ImageEmbeddingService {
  // 🚀 NEW METHOD - GENERATE IMAGE PLAN USING CLEAN TIMESTAMPS FOR BETTER ACCURACY
  static async generateImageEmbeddingPlanFromCleanTimestamps(
    sessionId: string,
    dialogues: Array<{ character: string; text: string; audioFile: { filePath: string } }>,
    topic: string,
    userProvidedImages?: UserProvidedImage[],
    density: 'low' | 'medium' | 'high' | 'ultra' = 'ultra'
  ): Promise<ImageEmbeddingPlan> {
    try {
      if (userProvidedImages?.length) {
      }

      // Import clean alignment function
      const { getWhisperXCleanAlignment } = await import('./videoGenerator');

      // Process each dialogue to get clean sentence-level timestamps
      const cleanTimestamps: Array<{
        character: string;
        sentences: Array<{
          text: string;
          start: number;
          end: number;
        }>;
      }> = [];

      let totalDuration = 0;

      for (const dialogue of dialogues) {

        const cleanResult = await getWhisperXCleanAlignment(dialogue.audioFile.filePath, dialogue.text);

        if (cleanResult.success && cleanResult.sentences) {
          // Adjust timestamps to cumulative timeline
          const adjustedSentences = cleanResult.sentences.map(sentence => ({
            ...sentence,
            start: sentence.start + totalDuration,
            end: sentence.end + totalDuration
          }));

          cleanTimestamps.push({
            character: dialogue.character,
            sentences: adjustedSentences
          });

          totalDuration += cleanResult.total_duration || 0;
        } else {

          // Fallback to basic duration estimation
          const ffmpeg = require('fluent-ffmpeg');
          const audioDuration = await new Promise<number>((resolve, reject) => {
            ffmpeg.ffprobe(dialogue.audioFile.filePath, (err: any, metadata: any) => {
              if (err) reject(err);
              else resolve(metadata.format.duration || 0);
            });
          });

          // Create a single sentence covering the entire dialogue
          cleanTimestamps.push({
            character: dialogue.character,
            sentences: [{
              text: dialogue.text,
              start: totalDuration,
              end: totalDuration + audioDuration
            }]
          });

          totalDuration += audioDuration;
        }
      }


      // Convert clean timestamps to ASS-like format for existing analysis pipeline
      const assLikeData: AssFileData = {
        entries: cleanTimestamps.flatMap(dialogue =>
          dialogue.sentences.map(sentence => ({
            startTime: sentence.start,
            endTime: sentence.end,
            text: sentence.text,
            character: dialogue.character,
            layer: 0
          }))
        ),
        styles: {},
        metadata: {
          duration: totalDuration
        }
      };

      // 🤖 ENHANCED AI ANALYSIS WITH GOOGLE SEARCH AND USER IMAGES
      const imagePlan = await ImageEmbeddingAnalyzer.analyzeDialogueForImages(sessionId, assLikeData, topic, userProvidedImages);

      // 💾 SAVE PLAN TO FILE
      await ImageEmbeddingAnalyzer.saveImagePlan(imagePlan);

      return imagePlan;

    } catch (error) {
      throw new Error(`Failed to generate image embedding plan: ${error}`);
    }
  }

  // 🚀 ORIGINAL METHOD - ANALYZE AND GENERATE IMAGE PLAN WITH USER-PROVIDED IMAGES (ASS-based)
  static async generateImageEmbeddingPlan(
    sessionId: string,
    assFilePath: string,
    topic: string,
    userProvidedImages?: UserProvidedImage[],
    density: 'low' | 'medium' | 'high' | 'ultra' = 'ultra'
  ): Promise<ImageEmbeddingPlan> {
    try {
      if (userProvidedImages?.length) {
      }

      // 📖 READ AND PARSE ASS FILE
      const assContent = fs.readFileSync(assFilePath, 'utf8');
      const assData = AssFileProcessor.parseAssFile(assContent);


      // 🤖 ENHANCED AI ANALYSIS WITH GOOGLE SEARCH AND USER IMAGES
      const imagePlan = await ImageEmbeddingAnalyzer.analyzeDialogueForImages(sessionId, assData, topic, userProvidedImages);

      // 💾 SAVE PLAN TO FILE
      const planFilePath = await ImageEmbeddingAnalyzer.saveImagePlan(imagePlan);

      if (userProvidedImages?.length) {
      }

      return imagePlan;

    } catch (error) {
      throw new Error(`Failed to generate image embedding plan: ${error}`);
    }
  }

  // 📋 FORMAT ENHANCED PLAN FOR USER DISPLAY
  static formatPlanForUser(plan: ImageEmbeddingPlan): string {
    const progress = ImageEmbeddingAnalyzer.getUploadProgress(plan);

    let output = `🎨 **ENHANCED IMAGE EMBEDDING PLAN FOR SESSION: ${plan.sessionId}**\n\n`;
    output += `🚀 **ENHANCED FEATURES:**\n`;
    output += `• Technical diagram focus (architectures, workflows, comparisons)\n`;
    output += `• AI-determined contextual image duration (3-15 seconds based on concept explanation length)\n`;
    output += `• Google search-powered technical research\n`;
    output += `• Quality over quantity - strategic technical visualizations\n\n`;

    output += `📊 **SUMMARY:**\n`;
    output += `- Total Images Required: ${plan.summary.totalImages}\n`;
    output += `- High Priority: ${plan.summary.highPriority}\n`;
    output += `- Medium Priority: ${plan.summary.mediumPriority}\n`;
    output += `- Low Priority: ${plan.summary.lowPriority}\n`;
    if (plan.userProvidedImages?.length) {
      output += `- User Images Provided: ${plan.userProvidedImages.length}\n`;
      output += `- User Images Used: ${plan.summary.userProvidedUsed}\n`;
    }
    output += `- Estimated Processing Time: ${plan.summary.estimatedProcessingTime}\n`;
    output += `- Video Duration: ${plan.totalDuration.toFixed(1)}s\n`;
    output += `- Images per Minute: ${((plan.summary.totalImages / plan.totalDuration) * 60).toFixed(1)}\n\n`;

    output += `📈 **UPLOAD PROGRESS:** ${progress.uploaded}/${progress.total} (${progress.percentage}%)\n\n`;

    output += `🖼️ **REQUIRED IMAGES (ULTRA-DENSITY VISUAL EXPERIENCE):**\n\n`;

    plan.imageRequirements.forEach((req, index) => {
      const status = req.uploaded ? '✅ UPLOADED' : '⏳ PENDING';
      const priorityEmoji = req.priority === 'high' ? '🔴' : req.priority === 'medium' ? '🟡' : '🟢';
      const typeEmoji = {
        'architecture': '🏗️',
        'process': '⚙️',
        'comparison': '⚖️',
        'diagram': '�',
        'workflow': '�',
        'infrastructure': '�',
        'lifecycle': '�'
      }[req.imageType] || '🖼️';

      // Special formatting for Introduction image
      if (req.title === 'Introduction') {
        output += `${index + 1}. **${req.title}** ${status} 🎬 **(THUMBNAIL - OPTIONAL)**\n`;
        output += `   🎯 Special: Acts as video thumbnail/opening image\n`;
        output += `   ${priorityEmoji} Priority: ${req.priority.toUpperCase()}\n`;
        output += `   ${typeEmoji} Type: ${req.imageType}\n`;
        output += `   🕒 Timestamp: ${req.timestamp.toFixed(1)}s (${req.contextualDuration}s display)\n`;
        output += `   👤 Character: ${req.character}\n`;
        output += `   � Context: "${req.dialogueText.substring(0, 60)}${req.dialogueText.length > 60 ? '...' : ''}"\n`;
        output += `   🎨 AI Description: ${req.description}\n`;
        output += `   ℹ️ **Note: If not uploaded, no default image will be added**\n\n`;
      } else {
        output += `${index + 1}. **${req.title}** ${status}\n`;
        output += `   ${priorityEmoji} Priority: ${req.priority.toUpperCase()}\n`;
        output += `   ${typeEmoji} Type: ${req.imageType}\n`;
        output += `   🕒 Timestamp: ${req.timestamp.toFixed(1)}s (${req.contextualDuration || 3}s display)\n`;
        output += `   👤 Character: ${req.character}\n`;
        output += `   � Context: "${req.dialogueText.substring(0, 60)}${req.dialogueText.length > 60 ? '...' : ''}"\n`;
        output += `   🎨 AI Description: ${req.description}\n\n`;
      }
    });

    output += `📤 **NEXT STEPS:**\n`;
    output += `1. Upload the required images using the ultra-concise titles above\n`;
    output += `2. 🎬 The "Introduction" image is optional - acts as a thumbnail/opening image\n`;
    output += `3. Each image will display for their specified duration at its timestamp\n`;
    output += `4. The system will create maximum visual impact with frequent, creative imagery\n\n`;

    output += `💡 **ENHANCED TIPS:**\n`;
    output += `• Images focus on technical diagrams and architectures\n`;
    output += `• Introduction image creates engaging video thumbnail effect\n`;
    output += `• Each image stays longer for better technical understanding\n`;
    output += `• Google search ensures accurate technical visualizations\n`;
    output += `• Quality technical diagrams enhance learning retention\n`;
    output += `• Strategic placement maximizes educational impact\n`;

    // Add user-provided images section if any
    if (plan.userProvidedImages?.length) {
      output += `\n\n👤 **USER-PROVIDED IMAGES EVALUATION:**\n\n`;

      // Show detailed AI decisions if available
      if (plan.userImageDecisions?.length) {
        output += `🤖 **AI EVALUATION RESULTS:**\n`;
        plan.userImageDecisions.forEach((decision, index) => {
          const status = decision.useImage ? '✅ ACCEPTED' : '❌ REJECTED';
          const priorityEmoji = decision.useImage ? '🎯' : '🚫';

          output += `${index + 1}. **${decision.userImageLabel}** ${status}\n`;
          output += `   ${priorityEmoji} Decision: ${decision.useImage ? 'Will be included in video' : 'Not suitable for this content'}\n`;
          output += `   💭 AI Reasoning: ${decision.reasoning}\n`;
          if (decision.useImage && decision.timestamp) {
            output += `   🕒 Will appear at: ${decision.timestamp.toFixed(1)}s\n`;
          }
          output += `\n`;
        });
        output += `\n`;
      }

      // Show summary of all user images
      output += `📋 **ALL USER IMAGES SUMMARY:**\n`;
      plan.userProvidedImages.forEach((userImg, index) => {
        const isUsed = plan.imageRequirements.some(req => req.title === userImg.label && req.imagePath === userImg.imagePath);
        const status = isUsed ? '✅ USED' : '❌ NOT USED';
        const priorityEmoji = userImg.priority === 'high' ? '🔴' : userImg.priority === 'medium' ? '🟡' : '🟢';

        output += `${index + 1}. **${userImg.label}** ${status}\n`;
        output += `   ${priorityEmoji} Priority: ${userImg.priority?.toUpperCase() || 'MEDIUM'}\n`;
        if (userImg.preferredTimestamp) {
          output += `   🕒 Preferred Timestamp: ${userImg.preferredTimestamp.toFixed(1)}s\n`;
        }
        output += `   📁 Path: ${userImg.imagePath}\n`;
        if (userImg.description) {
          output += `   📝 Description: ${userImg.description}\n`;
        }
        output += `\n`;
      });
    }

    return output;
  }

  // 🎬 GENERATE FINAL VIDEO WITH ENHANCED EMBEDDED IMAGES
  static async generateVideoWithEmbeddedImages(
    sessionId: string,
    backgroundVideoPath: string,
    imagePlan: ImageEmbeddingPlan,
    device: string = 'cuda',
    backgroundVideoSpeed: number = 1.25,
    videoStyle: string = 'standard'
  ): Promise<{ success: boolean; videoPath?: string; error?: string }> {
    try {

      // Debug: Log all image requirements
      imagePlan.imageRequirements?.forEach((req, index) => {
      });
      const uploadedImages = imagePlan.imageRequirements.filter(req => req.uploaded && req.imagePath);
      const missingImages = imagePlan.imageRequirements.filter(req => !req.uploaded || !req.imagePath);

      // Check for user-provided images that are NOT already in the image requirements
      // (to avoid double-loading approved user images)
      let userProvidedImages: UserProvidedImage[] = [];
      try {
        const userImagesFile = path.join(process.cwd(), 'storage', 'temp', `${sessionId}_user_images.json`);
        if (fs.existsSync(userImagesFile)) {
          const allUserImages = UserImageManager.loadUserImages(userImagesFile);

          // Only include user images that are NOT already in the image requirements
          // (approved user images are already in imageRequirements with proper timestamps)
          const approvedImagePaths = new Set(
            imagePlan.imageRequirements
              .filter(req => req.imagePath)
              .map(req => req.imagePath)
          );
          userProvidedImages = allUserImages.filter(img => !approvedImagePaths.has(img.imagePath));
        }
      } catch (error) {
      }

      const totalAvailableImages = uploadedImages.length + userProvidedImages.length;

      uploadedImages.forEach((img, index) => {
      });
      userProvidedImages.forEach((img, index) => {
      });
      missingImages.forEach((img, index) => {
      });

      if (missingImages.length > 0) {
        missingImages.slice(0, 5).forEach(img => { // Show first 5 missing
        });
        if (missingImages.length > 5) {
        }
      }

      if (userProvidedImages.length > 0) {
        userProvidedImages.forEach(img => {
        });
      }

      // Check if we have an existing ASS file from analysis that we can reuse
      const existingAssPath = path.join(process.cwd(), 'storage', 'temp', `${sessionId}_subtitles.ass`);

      if (fs.existsSync(existingAssPath)) {

        // Copy the existing ASS file to the expected location for video generation
        const videoAssPath = path.join(process.cwd(), 'storage', 'videos', `${sessionId}_styled_subtitles.ass`);
        fs.copyFileSync(existingAssPath, videoAssPath);
      } else {
      }

      // Import the video generator service
      const { generateVideoWithSubtitles } = await import('./videoGenerator');

      // Generate the base video with subtitles
      const baseVideoResult = await generateVideoWithSubtitles(sessionId, backgroundVideoPath, device, backgroundVideoSpeed, videoStyle);

      if (!baseVideoResult.success) {
        return {
          success: false,
          error: `Failed to generate base video: ${baseVideoResult.error}`
        };
      }

      // 🎨 IMPLEMENT ACTUAL IMAGE EMBEDDING

      if (totalAvailableImages === 0) {
        if (!baseVideoResult.videoPath) {
          return {
            success: false,
            error: 'Base video generation failed - no video path returned'
          };
        }
        return {
          success: true,
          videoPath: baseVideoResult.videoPath,
          error: undefined
        };
      }

      // Generate video with embedded images
      if (!baseVideoResult.videoPath) {
        return {
          success: false,
          error: 'Base video generation failed - no video path returned'
        };
      }

      // Check if we have any uploaded images to embed
      if (totalAvailableImages === 0) {
        return {
          success: true,
          videoPath: baseVideoResult.videoPath
        };
      }


      const finalVideoResult = await this.embedImagesInVideo(
        baseVideoResult.videoPath,
        uploadedImages,
        sessionId,
        userProvidedImages // Pass user-provided images
      );

      return finalVideoResult;

    } catch (error) {
      return {
        success: false,
        error: `Failed to generate video with embedded images: ${error}`
      };
    }
  }

  // 🎨 EMBED IMAGES IN VIDEO USING FFMPEG
  static async embedImagesInVideo(
    baseVideoPath: string,
    uploadedImages: ImageRequirement[],
    sessionId: string,
    userProvidedImages: UserProvidedImage[] = []
  ): Promise<{ success: boolean; videoPath?: string; error?: string; videoFile?: { filename: string; path: string; fileSize: number; sessionId: string } }> {
    try {

      // Filter out AI-generated images without valid paths
      // Special handling: Skip Introduction image if not uploaded (no fallback required)
      const validAiImages = uploadedImages.filter(img => {
        // If this is the Introduction image and it's not uploaded, skip it entirely
        if (img.title === 'Introduction' && (!img.uploaded || !img.imagePath)) {
          return false;
        }
        return img.imagePath;
      });
      validAiImages.forEach((img, index) => {
      });

      // User-provided images: Get the ones with AI-decided timestamps from userProvidedImages
      // These have the correct timestamps from the AI analysis
      let validUserImages = userProvidedImages.filter(img =>
        img.imagePath &&
        fs.existsSync(img.imagePath) &&
        !validAiImages.some(aiImg => aiImg.imagePath === img.imagePath) &&
        img.preferredTimestamp !== undefined && img.preferredTimestamp !== null // Only include images with proper timestamps
      );

      // DEDUPLICATE: Only keep one image per label/timestamp combination
      // This prevents multiple identical images from appearing at the same time
      const seenCombinations = new Set<string>();
      validUserImages = validUserImages.filter(img => {
        const combinationKey = `${img.label.toLowerCase()}_${Math.round(img.preferredTimestamp || 0)}`;
        if (seenCombinations.has(combinationKey)) {
          return false;
        }
        seenCombinations.add(combinationKey);
        return true;
      });

      validUserImages.forEach((img, index) => {
      });
      userProvidedImages.filter(img => !validUserImages.some(valid => valid.id === img.id)).forEach((img, index) => {
      });


      const totalValidImages = validAiImages.length + validUserImages.length;

      // If no valid images, return the base video
      if (totalValidImages === 0) {
        return {
          success: true,
          videoPath: baseVideoPath,
          videoFile: {
            filename: path.basename(baseVideoPath),
            path: baseVideoPath,
            fileSize: fs.statSync(baseVideoPath).size,
            sessionId
          }
        };
      }

      // Validate base video exists
      if (!fs.existsSync(baseVideoPath)) {
        return {
          success: false,
          error: `Base video file not found: ${baseVideoPath}`
        };
      }

      // Validate image files exist and are readable
      const allImagesToValidate = [
        ...validAiImages.map(img => ({ path: img.imagePath!, type: 'ai', title: img.title })),
        ...validUserImages.map(img => ({ path: img.imagePath, type: 'user', title: img.label }))
      ];

      for (const img of allImagesToValidate) {
        if (!fs.existsSync(img.path)) {
          return {
            success: false,
            error: `Image file not found: ${img.path}`
          };
        }

        // Check file size (basic validation)
        const stats = fs.statSync(img.path);
        if (stats.size === 0) {
          return {
            success: false,
            error: `Image file is empty: ${img.path}`
          };
        }
      }

      // Set FFmpeg path if needed
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
      ffmpeg.setFfmpegPath(ffmpegPath);

      // Output path for final video
      const outputVideoPath = path.join(process.cwd(), 'storage', 'videos', `${sessionId}_with_images.mp4`);

      // Build FFmpeg command with image overlays
      let ffmpegCommand = ffmpeg().input(baseVideoPath);

      // Combine and sort all images by timestamp
      const allImages = [
        ...validAiImages.map(img => ({
          path: img.imagePath!,
          timestamp: img.timestamp,
          title: img.title,
          type: 'ai' as const,
          contextualDuration: img.contextualDuration || 6, // AI-determined duration
          relevanceReasoning: img.relevanceReasoning
        })),
        ...validUserImages.map((img, index) => ({
          path: img.imagePath!,
          timestamp: img.preferredTimestamp || (index * 5) + 2, // Use preferred timestamp or fallback
          title: img.label,
          type: 'user' as const,
          contextualDuration: img.contextualDuration || 8, // AI-determined duration for user images
          relevanceReasoning: img.relevanceReasoning
        }))
      ].sort((a, b) => a.timestamp - b.timestamp); // Sort by timestamp

      allImages.forEach((img, index) => {
      });

      // Add image inputs
      allImages.forEach((image, index) => {
        ffmpegCommand = ffmpegCommand.input(image.path);
      });

      // Build filter chain for image overlays
      let filterChain = '';

      // Add image overlay filters
      allImages.forEach((image, index) => {
        const inputIndex = index + 1; // FFmpeg inputs start at 1 (0 is base video)
        const startTime = image.timestamp;

        // Use AI-determined contextual duration instead of spacing-based calculation
        let duration = image.contextualDuration || 6; // Use AI-determined duration, fallback to 6 seconds

        // Optional: Still respect spacing constraints to prevent overlaps
        if (index < allImages.length - 1) {
          const nextImageTime = allImages[index + 1].timestamp;
          const timeUntilNext = nextImageTime - startTime;

          // If AI duration would cause overlap, reduce it
          if (duration > timeUntilNext) {
            duration = Math.max(timeUntilNext * 0.9, 2); // Leave small gap, minimum 2 seconds
          }
        }

        const endTime = startTime + duration;

        if (image.relevanceReasoning) {
        }

        // Scale and position image (top half with fixed size)
        const scaledLabel = `scaled_img_${index}`;

        if (index === 0) {
          // First image overlay - centered in top half with padding
          filterChain += `[${inputIndex}:v]scale=960:720:force_original_aspect_ratio=decrease[${scaledLabel}];[0:v][${scaledLabel}]overlay=(W-w)/2:40:enable='between(t,${startTime},${endTime})'[with_img_${index}]`;
        } else {
          // Subsequent image overlays - centered in top half with padding
          const prevLabel = `with_img_${index - 1}`;
          filterChain += `;[${inputIndex}:v]scale=960:720:force_original_aspect_ratio=decrease[${scaledLabel}];[${prevLabel}][${scaledLabel}]overlay=(W-w)/2:40:enable='between(t,${startTime},${endTime})'[with_img_${index}]`;
        }

        // Labels are now properly assigned in the if-else block above
        if (index === allImages.length - 1) {
          // For the last image, we need to output to final_with_images
          filterChain = filterChain.replace(`[with_img_${index}]`, '[final_with_images]');
        }
      });


      // If no valid images, just copy the video
      if (allImages.length === 0) {
        filterChain = '[0:v]copy[final_with_images]';
      } else {
      }


      // Validate filter chain before proceeding
      if (!filterChain || filterChain.trim() === '') {
        return {
          success: false,
          error: 'Failed to generate FFmpeg filter chain'
        };
      }

      // Additional validation for multiple images
      if (allImages.length > 1) {
        const expectedLabels = allImages.length - 1; // Should have with_img_0 through with_img_(n-2)
        let labelCount = 0;
        for (let i = 0; i < expectedLabels; i++) {
          if (filterChain.includes(`[with_img_${i}]`)) {
            labelCount++;
          }
        }
        if (labelCount !== expectedLabels) {
        }
      }

      // Execute FFmpeg command

      return new Promise((resolve) => {
        ffmpegCommand
          .outputOptions([
            '-map', '0:a', // Copy audio from base video
            '-map', '[final_with_images]', // Video with overlays
            '-c:v', 'libx264', // H.264 doesn't support alpha, but overlay handles transparency during processing
            '-c:a', 'aac',
            '-b:v', '2000k',
            '-b:a', '128k',
            '-filter_complex', filterChain,
            '-y' // Overwrite output file
          ])
          .output(outputVideoPath)
          .on('start', (commandLine: string) => {
          })
          .on('progress', (progress: any) => {
            // Progress logging removed - only log when done
          })
          .on('end', () => {
            allImages.forEach((img, index) => {
            });

            // Check if output file exists and has content
            if (fs.existsSync(outputVideoPath)) {
              const stats = fs.statSync(outputVideoPath);

              if (stats.size === 0) {
                resolve({
                  success: false,
                  error: 'FFmpeg completed but output file is empty'
                });
                return;
              }

              const filename = path.basename(outputVideoPath);

              resolve({
                success: true,
                videoPath: outputVideoPath,
                videoFile: {
                  filename,
                  path: outputVideoPath,
                  fileSize: stats.size,
                  sessionId
                }
              });
            } else {
              resolve({
                success: false,
                error: 'FFmpeg completed but output file was not created'
              });
            }
          })
          .on('error', (err: any) => {
            resolve({
              success: false,
              error: `FFmpeg embedding failed: ${err.message}`
            });
          })
          .run();
      });

    } catch (error) {
      return {
        success: false,
        error: `Failed to embed images: ${error}`
      };
    }
  }

  // CLEAN USER IMAGE ANALYSIS PROMPT (No contamination)
  private static getUserImageAnalysisPrompt = (userImage: UserProvidedImage, dialogueEntries: any[], topic: string) => `
Analyze this SPECIFIC user-provided image for placement in an educational video about "${topic}":

ACTUAL UPLOADED IMAGE DETAILS:
- Image Label: "${userImage.label}"
- Image Description: "${userImage.description || 'No description provided'}"
- Image ID: "${userImage.id}"

CRITICAL: You must ONLY analyze placement suggestions for THIS SPECIFIC IMAGE. The user has explicitly labeled this image as "${userImage.label}" and provided description "${userImage.description || 'No description'}". Focus your analysis on how well this image matches the user's intended concept, NOT on any assumptions about the actual image content.

Available dialogue segments:
${dialogueEntries.map((entry: any, index: number) =>
    `${index + 1}. [${entry.startTime.toFixed(1)}s-${entry.endTime.toFixed(1)}s] ${entry.character || 'Speaker'}: "${entry.text}"`
  ).join('\n')}

ANALYSIS GUIDELINES:
1. ONLY suggest placements for the image with label "${userImage.label}"
2. The user has labeled this image as "${userImage.label}" - assume this label is accurate and find dialogue that matches this concept
3. Look for dialogue segments that discuss concepts related to "${userImage.label}" or "${userImage.description || ''}"
4. If the dialogue mentions "${userImage.label}" or closely related terms, this is highly relevant
5. Consider educational value: would showing this image help explain the concept being discussed?
6. Score relevance based on how well the dialogue content matches the user's label and description
7. If this image label/description doesn't match any dialogue content, it may still be relevant if the user intended it for the topic "${topic}"
8. Score relevance honestly: 10 = perfect match with dialogue, 5-7 = good match, 1-4 = weak match, 0 = no clear connection
9. For alternativeIndices, provide MAXIMUM 3-5 backup options

EDUCATIONAL PLACEMENT STRATEGY:
- Images work best when placed during discussions of the concept they represent
- If the dialogue mentions the image's label or description, that's the ideal placement
- Consider the broader topic "${topic}" - images related to the main topic are generally valuable

Return your analysis focusing on how well THIS SPECIFIC user-labeled image matches the dialogue content about "${topic}". Trust the user's labeling and find the best educational placement.
`;

  // 🎯 USER IMAGE PLACEMENT SUGGESTIONS
  static async getUserImagePlacementSuggestions(
    sessionId: string,
    assFilePath: string,
    topic: string,
    userImages: UserProvidedImage[]
  ): Promise<UserImageSuggestion[]> {
    try {

      // Parse ASS file to get dialogue entries
      const assContent = fs.readFileSync(assFilePath, 'utf8');
      const assData = AssFileProcessor.parseAssFile(assContent);
      const dialogueEntries = assData.entries.filter((entry: AssSubtitleEntry) =>
        entry.text && entry.text.length > 10 // Filter meaningful dialogue
      );


      // Log a few more entries to help debug
      for (let i = 0; i < Math.min(10, dialogueEntries.length); i++) {
        const entry = dialogueEntries[i];
      }

      if (dialogueEntries.length === 0) {
        return [];
      }

      const suggestions: UserImageSuggestion[] = [];
      const usedTimestamps = new Set<number>(); // Track used timestamps to avoid clustering

      for (const userImage of userImages) {

        // Use AI to analyze the image against dialogue content with distribution awareness
        const analysisPrompt = this.getUserImageAnalysisPrompt(userImage, dialogueEntries, topic);


        const analysisSchema = z.object({
          bestDialogueIndex: z.number().min(1).max(dialogueEntries.length).describe(`Index of best matching dialogue (1-based, must be between 1 and ${dialogueEntries.length})`),
          relevanceScore: z.number().min(0).max(10).describe("Relevance score 0-10"),
          reasoning: z.string().describe("Detailed explanation for placement choice"),
          isRelevant: z.boolean().describe("Whether image should be included"),
          alternativeIndices: z.array(z.number().min(1).max(dialogueEntries.length)).max(5).describe(`Alternative dialogue indices (1-based, each between 1 and ${dialogueEntries.length}, maximum 5 alternatives)`)
        });

        try {
          const analysis = await generateObject({
            model: google('models/gemini-3-flash-preview'),
            prompt: analysisPrompt,
            schema: analysisSchema as any,
          });

          const result = analysis.object;


          // Validate and get the selected dialogue
          // AI returns 1-based index, convert to 0-based array index
          let dialogueIndex = Math.max(0, Math.min(result.bestDialogueIndex - 1, dialogueEntries.length - 1));

          // Additional validation: if AI returned an invalid index, default to index 0
          if (result.bestDialogueIndex < 1 || result.bestDialogueIndex > dialogueEntries.length) {
            dialogueIndex = 0;
          }

          let bestDialogue = dialogueEntries[dialogueIndex];


          // If this timestamp is too close to an already used one, try alternatives
          if (usedTimestamps.has(Math.round(bestDialogue.startTime))) {

            for (const altIndex of result.alternativeIndices) {
              // Convert 1-based AI index to 0-based array index
              const arrayIndex = altIndex - 1;
              if (arrayIndex >= 0 && arrayIndex < dialogueEntries.length) {
                const altDialogue = dialogueEntries[arrayIndex];
                if (!usedTimestamps.has(Math.round(altDialogue.startTime))) {
                  dialogueIndex = arrayIndex;
                  bestDialogue = altDialogue;
                  break;
                }
              }
            }
          }

          if (!result.isRelevant || result.relevanceScore < 1) {
            continue; // Skip irrelevant images
          }

          // Mark this timestamp as used
          usedTimestamps.add(Math.round(bestDialogue.startTime));

          // Calculate alternative placements (excluding used timestamps)
          const alternatives = result.alternativeIndices
            .filter((idx: number) => idx !== dialogueIndex && idx < dialogueEntries.length)
            .filter((idx: number) => !usedTimestamps.has(Math.round(dialogueEntries[idx].startTime)))
            .slice(0, 2)
            .map((idx: number) => ({
              timestamp: dialogueEntries[idx].startTime,
              dialogueIndex: idx + 1,
              reasoning: `Alternative placement based on content similarity`,
              score: Math.max(result.relevanceScore - 2, 1)
            }));

          suggestions.push({
            userImageId: userImage.id,
            userImageLabel: userImage.label,
            suggestedTimestamp: bestDialogue.startTime,
            dialogueIndex: dialogueIndex + 1,
            dialogueText: bestDialogue.text,
            character: bestDialogue.character || 'Speaker',
            reasoning: result.reasoning,
            relevanceScore: result.relevanceScore,
            suggestedDuration: Math.min(bestDialogue.endTime - bestDialogue.startTime + 2, 6), // Image duration based on dialogue length
            alternativePlacements: alternatives
          });


        } catch (aiError) {

          // Fallback: Only suggest placement if there's a clear keyword match
          let bestMatch = { dialogueIndex: -1, score: 0, reasoning: 'No clear relevance found' };

          dialogueEntries.forEach((entry: any, index: number) => {
            // Skip if timestamp already used
            if (usedTimestamps.has(Math.round(entry.startTime))) {

              return;
            }

            const dialogueText = entry.text.toLowerCase();
            const imageLabel = userImage.label.toLowerCase();
            const imageDesc = (userImage.description || '').toLowerCase();

            let score = 0;
            const searchTerms = [...imageLabel.split(/\s+/), ...imageDesc.split(/\s+/)]
              .filter(term => term.length > 3);

            searchTerms.forEach(term => {
              if (dialogueText.includes(term)) {
                score += 2;
              }
            });

            if (score > bestMatch.score) {
              bestMatch = {
                dialogueIndex: index,
                score,
                reasoning: `Keyword matches: ${searchTerms.filter(term => dialogueText.includes(term)).join(', ')}`
              };
            }
          });

          // Only create suggestion if there's a meaningful match (score >= 2 for user-provided images)
          if (bestMatch.score >= 2 && bestMatch.dialogueIndex >= 0) {
            const bestDialogue = dialogueEntries[bestMatch.dialogueIndex];
            usedTimestamps.add(Math.round(bestDialogue.startTime));

            suggestions.push({
              userImageId: userImage.id,
              userImageLabel: userImage.label,
              suggestedTimestamp: bestDialogue.startTime,
              dialogueIndex: bestMatch.dialogueIndex + 1,
              dialogueText: bestDialogue.text,
              character: bestDialogue.character || 'Speaker',
              reasoning: bestMatch.reasoning,
              relevanceScore: Math.min(bestMatch.score / 2, 6), // Cap fallback scores
              suggestedDuration: 4.0,
              alternativePlacements: []
            });

          } else {
          }
        }

        // FINAL FALLBACK: If no suggestion was created for this user image, create one anyway
        // since the user explicitly uploaded it
        const hasSuggestion = suggestions.some(s => s.userImageId === userImage.id);
        if (!hasSuggestion) {

          // Find a reasonable placement - prefer dialogue that mentions the topic or related terms
          let bestPlacement = { index: 0, score: 0 };

          dialogueEntries.forEach((entry, index) => {
            if (usedTimestamps.has(Math.round(entry.startTime))) return;

            let score = 0;
            const dialogueText = entry.text.toLowerCase();

            // Check if dialogue mentions the image label or related terms
            const labelWords = userImage.label.toLowerCase().split(/\s+/);
            labelWords.forEach(word => {
              if (word.length > 3 && dialogueText.includes(word)) score += 3;
            });

            // Check topic relevance
            const topicWords = topic.toLowerCase().split(/\s+/);
            topicWords.forEach(word => {
              if (word.length > 3 && dialogueText.includes(word)) score += 1;
            });

            if (score > bestPlacement.score) {
              bestPlacement = { index, score };
            }
          });

          // If no good match, just pick a middle timestamp
          if (bestPlacement.score === 0) {
            bestPlacement.index = Math.floor(dialogueEntries.length / 2);
          }

          const placementDialogue = dialogueEntries[bestPlacement.index];
          usedTimestamps.add(Math.round(placementDialogue.startTime));

          suggestions.push({
            userImageId: userImage.id,
            userImageLabel: userImage.label,
            suggestedTimestamp: placementDialogue.startTime,
            dialogueIndex: bestPlacement.index + 1,
            dialogueText: placementDialogue.text,
            character: placementDialogue.character || 'Speaker',
            reasoning: `User-provided image placed at reasonable location in video (fallback placement)`,
            relevanceScore: Math.max(bestPlacement.score / 2, 2), // Give minimum score of 2
            suggestedDuration: 4.0,
            alternativePlacements: []
          });

        }
      }

      // Remove duplicate suggestions and sort by relevance
      const uniqueSuggestions = suggestions.filter((suggestion, index, self) =>
        index === self.findIndex(s =>
          s.userImageId === suggestion.userImageId &&
          Math.abs(s.suggestedTimestamp - suggestion.suggestedTimestamp) < 5 // Merge suggestions within 5 seconds
        )
      );

      uniqueSuggestions.sort((a, b) => b.relevanceScore - a.relevanceScore);


      // Return all suggestions without artificial limits
      if (uniqueSuggestions.length > 0) {
        uniqueSuggestions.forEach((s, i) => {
        });
        return uniqueSuggestions;
      }

      return uniqueSuggestions;

    } catch (error) {
      throw error;
    }
  }
}
