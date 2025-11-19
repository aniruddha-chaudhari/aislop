import { generateObject, generateText } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import * as fs from 'fs';
import * as path from 'path';
const ffmpeg = require('fluent-ffmpeg');

// Usage examples and helpers
export class ImageEmbedderExamples {
  // Example with user images
  static async exampleWithUserImages() {
    const userImages: UserProvidedImage[] = [
      UserImageManager.createUserImage(
        './my-images/docker-architecture.png',
        'Docker Container Architecture',
        'Custom diagram showing Docker container layers and isolation',
        5.0,
        'high'
      ),
      UserImageManager.createUserImage(
        './my-images/kubernetes-cluster.png',
        'Kubernetes Pod Structure',
        'My custom Kubernetes pod and service diagram',
        25.0,
        'high'
      )
    ];

    const { valid, invalid } = UserImageManager.validateUserImages(userImages);
    if (invalid.length > 0) {
      console.log(' Invalid images:', invalid);
    }

    const plan = await ImageEmbeddingService.generateImageEmbeddingPlan(
      'session_123',
      './subtitles.ass',
      'Docker and Kubernetes tutorial',
      valid
    );

    console.log(ImageEmbeddingService.formatPlanForUser(plan));

    return plan;
  }

  // Prepare user images
  static prepareUserImages() {
    return `
HOW TO PREPARE USER-PROVIDED IMAGES:

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
  10.5,
  'high'
);

The AI will evaluate your images and decide if they're valuable for the video!
    `;
  }
}

const ASS_CONFIG = {
  imageTimingOffset: 0.3, // Image appears 0.3 seconds before subtitle (reduced for more frequent images)
  minTextLength: 10,      // Minimum text length for image consideration (reduced from 20 for more technical diagrams)
  maxImagesPerMinute: 15, // Maximum images per minute (increased from 6 for more technical content)
  imageDisplayDuration: 3.0 // Images stay on screen for dynamic duration (3-8 seconds based on dialogue relevance)
};

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

// Parse ASS time format to seconds
export class AssFileProcessor {
  // Parse ASS time
  static parseAssTime(timeString: string): number {
    try {
      const parts = timeString.split(':');
      if (parts.length !== 3) throw new Error('Invalid time format');

      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const secondsParts = parts[2].split('.');
      const seconds = parseInt(secondsParts[0]);
      const centiseconds = parseInt(secondsParts[1] || '0');

      return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
    } catch (error) {
      console.error('Error parsing ASS time:', timeString, error);
      return 0;
    }
  }

  // Parse ASS file
  static parseAssFile(content: string): AssFileData {
    const lines = content.split('\n');
    const entries: AssSubtitleEntry[] = [];
    const styles: Record<string, any> = {};
    let metadata: any = {};

    let currentSection = '';
    let dialogueStartLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('[Script Info]')) {
        currentSection = 'script';
      } else if (line.startsWith('[V4+ Styles]')) {
        currentSection = 'styles';
      } else if (line.startsWith('[Events]')) {
        currentSection = 'events';
        dialogueStartLine = i + 1;
      }

      if (currentSection === 'script' && line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        metadata[key.trim()] = value;
      }

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

      if (currentSection === 'events' && line.startsWith('Dialogue:')) {
        try {
          const parts = line.substring(9).split(',');
          if (parts.length >= 10) {
            const startTime = this.parseAssTime(parts[1].trim());
            const endTime = this.parseAssTime(parts[2].trim());
            const style = parts[3].trim();
            const actor = parts[4].trim();
            const text = parts.slice(9).join(',').trim();

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
          console.warn(`Error parsing dialogue line ${i + 1}:`, line, error);
        }
      }
    }

    const groupedEntries: AssSubtitleEntry[] = [];
    let currentGroup: AssSubtitleEntry | null = null;

    for (const entry of entries) {
      if (!currentGroup ||
        currentGroup.character !== entry.character ||
        (entry.startTime - currentGroup.endTime) > 0.5) {

        if (currentGroup) {
          groupedEntries.push(currentGroup);
        }

        currentGroup = {
          startTime: entry.startTime,
          endTime: entry.endTime,
          text: entry.text,
          character: entry.character,
          style: entry.style,
          layer: entry.layer
        };
      } else {
        currentGroup.endTime = Math.max(currentGroup.endTime, entry.endTime);
        if (entry.text.length > currentGroup.text.length) {
          currentGroup.text = entry.text;
        }
      }
    }

    if (currentGroup) {
      groupedEntries.push(currentGroup);
    }

    const totalDuration = groupedEntries.length > 0
      ? Math.max(...groupedEntries.map(e => e.endTime))
      : 0;

    return {
      entries: groupedEntries.sort((a, b) => a.startTime - b.startTime),
      styles,
      metadata: {
        ...metadata,
        totalEntries: groupedEntries.length,
        duration: totalDuration
      }
    };
  }

  // Generate image timing from ASS
  static generateImageTimingFromAss(
    assData: AssFileData,
    imageDensity: 'low' | 'medium' | 'high' | 'ultra' = 'high'
  ): Array<{ startTime: number; endTime: number; text: string; character?: string }> {
    const { entries } = assData;
    const imageTimings: Array<{ startTime: number; endTime: number; text: string; character?: string }> = [];

    const intervals = {
      low: 8,
      medium: 4,
      high: 2,
      ultra: 1.5
    };

    const interval = intervals[imageDensity];
    let lastImageTime = 0;
    const maxImages = Math.floor((assData.metadata.duration / 60) * ASS_CONFIG.maxImagesPerMinute);

    for (const entry of entries) {
      if (entry.startTime - lastImageTime >= interval &&
        entry.text.length > ASS_CONFIG.minTextLength &&
        imageTimings.length < maxImages) {

        const imageStart = Math.max(0, entry.startTime - ASS_CONFIG.imageTimingOffset);
        const imageEnd = Math.min(assData.metadata.duration, entry.endTime + ASS_CONFIG.imageDisplayDuration);

        imageTimings.push({
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

###  INCLUDE (Smart Technical Visuals):
- **Simple system diagrams** showing 3-5 key components with clear labels
- **Clean process flows** with 3-4 logical steps and arrows
- **Before/after comparisons** showing clear technical improvements
- **Essential code patterns** (max 2-3 lines, large fonts, key concepts only)
- **Architecture overviews** with main building blocks clearly labeled
- **Data flow diagrams** showing simple input -> process -> output
- **Comparison charts** highlighting key differences between technologies
- **Visual metaphors** that accurately represent technical concepts

###  AVOID (Too Simple or Too Complex):
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
- Development workflows (design -> code -> test -> deploy)
- Data processing chains
- User interaction flows

## SMART CODE VISUAL EXAMPLES:

**GOOD Code Visuals:**
- "function add(a: number, b: number): number" - Shows TypeScript typing concept
- "// JavaScript: runtime error " vs "// TypeScript: compile-time error "
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
- "Simple diagram: 'TypeScript Code' -> 'Compiler' -> 'JavaScript Code' with type checking highlighted at compiler stage"
- "Split screen: Left shows 'let x = 5; x.toUpperCase()' with runtime error icon, Right shows 'let x: string = \"hello\"; x.toUpperCase()' with success checkmark"
- "Clean architecture: Frontend (React icon) <-> API Gateway <-> Backend Services (3 boxes), with data flow arrows"
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

  // Analyze dialogue for images
  static async analyzeDialogueForImages(
    sessionId: string,
    assData: AssFileData,
    topic: string,
    userProvidedImages?: UserProvidedImage[]
  ): Promise<ImageEmbeddingPlan> {
    try {
      console.log('[AI] Starting enhanced AI analysis with Google search for technical diagrams');

      const { entries } = assData;
      const imageTimings = AssFileProcessor.generateImageTimingFromAss(assData, 'ultra');

      console.log('Researching technical concepts for visual diagrams:', topic);
      const researchPrompt = `Research the technical topic "${topic}" and suggest specific visual diagrams and illustrations that would effectively explain the key technical concepts of this subject.

Focus on identifying:
1. The main system architecture components and their interactions
2. The primary processes and technical workflows involved
3. Key comparisons or trade-offs that would benefit from visual explanation
4. Technical lifecycle stages or deployment processes
5. Network topologies or data flow patterns specific to this technology

Provide specific diagram concepts that would work well in educational video content about this particular technology. Focus on diagrams that help explain how the technology actually works and its core concepts.`;

      const researchResult = await generateText({
        model: google('models/gemini-2.5-flash'),
        prompt: researchPrompt,
        tools: {
          google_search: google.tools.googleSearch({}),
        }
      });

      const visualResearch = researchResult.text;
      console.log(' [SEARCH] Technical research completed');

      const cleanDialogueEntries = entries.map(entry => {
        const cleanedText = entry.text
          .replace(/\\N/g, ' ')
          .replace(/\\n/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        return {
          ...entry,
          text: cleanedText
        };
      });

      console.log(` [DEBUG] ASS file has ${entries.length} entries`);
      if (entries.length > 0) {
        console.log(` [DEBUG] First few entries:`);
        for (let i = 0; i < Math.min(5, entries.length); i++) {
          const entry = entries[i];
          console.log(` [DEBUG] Entry ${i}: ${entry.startTime.toFixed(1)}s - ${entry.character || 'Unknown'}: "${entry.text?.substring(0, 50)}..."`);
        }
      }

      const dialogueSequence = cleanDialogueEntries
        .map((entry, index) => {
          const contextEntries = [];
          const contextWindow = 30;

          for (let i = 0; i < cleanDialogueEntries.length; i++) {
            const otherEntry = cleanDialogueEntries[i];
            const timeDiff = Math.abs(entry.startTime - otherEntry.startTime);

            if (timeDiff <= contextWindow) {
              contextEntries.push(otherEntry);
            }
          }

          contextEntries.sort((a, b) => a.startTime - b.startTime);

          const contextLines = contextEntries.map(e =>
            `[${e.startTime.toFixed(1)}s] ${e.character}: ${e.text}`
          );

          return contextLines.join(' | ');
        })
        .join('\n');

      const enhancedPrompt = this.IMAGE_ANALYSIS_PROMPT
        .replace('{{DIALOGUE_SEQUENCE}}', dialogueSequence)
        .replace('{{TOPIC}}', topic) +
        `\n\nVISUAL RESEARCH CONTEXT:\n${visualResearch}\n\n` +
        (userProvidedImages?.length ? `\n\nUSER-PROVIDED IMAGES:\n${userProvidedImages.map(img => `- ${img.label}: ${img.description || 'No description'}`).join('\n')}\n\n` : '') +
        `Use this research to inspire creative, impactful image suggestions that maximize visual learning and engagement.` +
        (userProvidedImages?.length ? `\n\nEVALUATE USER IMAGES: The user has explicitly provided ${userProvidedImages.length} images they want to include in the video. These images represent content they consider important for their audience. For each user-provided image, you should STRONGLY CONSIDER including it unless it is completely irrelevant to the technical topic or of very poor quality. If you decide to use a user image, you MUST provide a specific timestamp (in seconds) for when it should appear, based on the most relevant dialogue moment where the concept matches the image content. The timestamp is required, not optional. Give user images the benefit of the doubt and include them when there's reasonable relevance to the dialogue.` : '');

      const schema = z.object({
        imageRequirements: z.array(z.object({
          timestamp: z.number(),
          dialogueText: z.string().describe("The complete, readable dialogue text being spoken at this timestamp. Must be a full sentence or complete thought, not fragments. Clean up any ASS formatting artifacts like \\N."),
          character: z.string().describe("The character speaking this dialogue (e.g., 'Peter', 'Stewie')"),
          imageType: z.enum(['architecture', 'process', 'comparison', 'diagram', 'workflow', 'infrastructure', 'lifecycle', 'concept_diagram', 'smart_code', 'process', 'architecture']),
          dialogueAtTimestamp: z.string().optional().describe("Optional: The exact dialogue text at this specific timestamp"),
          title: z.string(),
          description: z.string(),
          priority: z.enum(['high', 'medium', 'low']),
          contextualDuration: z.number().describe("Duration in seconds this image should be visible based on how long the concept is explained in the dialogue (3-15 seconds)"),
          relevanceReasoning: z.string().describe("Explanation of why this specific duration was chosen based on dialogue analysis")
        })),
        userImageDecisions: z.array(z.object({
          userImageLabel: z.string(),
          useImage: z.boolean(),
          timestamp: z.number().describe("Required timestamp in seconds where this user image should appear in the video"),
          contextualDuration: z.number().optional().describe("Duration based on concept explanation length"),
          reasoning: z.string()
        })).optional()
      });

      const result = await generateObject({
        model: google('models/gemini-2.5-flash'),
        schema: schema as any,
        prompt: enhancedPrompt
      });

      console.log(` [DEBUG] AI generated ${result.object.imageRequirements?.length || 0} image requirements`);
      if (result.object.imageRequirements?.length > 0) {
        console.log(` [DEBUG] First few AI requirements:`);
        for (let i = 0; i < Math.min(3, result.object.imageRequirements.length); i++) {
          const req = result.object.imageRequirements[i];
          console.log(` [DEBUG] AI Req ${i}: "${req.title}" at ${req.timestamp}s`);
          console.log(` [DEBUG] - dialogueText: "${req.dialogueText}"`);
          console.log(` [DEBUG] - character: "${req.character}"`);
        }
      }

      const imageRequirements: ImageRequirement[] = (result.object as any).imageRequirements?.map((req: any, index: number) => {
        let targetEntry: AssSubtitleEntry | undefined = entries.find(entry => Math.abs(entry.startTime - req.timestamp) < 1.0);

        if (!targetEntry) {
          const sortedEntries = entries.sort((a, b) => Math.abs(a.startTime - req.timestamp) - Math.abs(b.startTime - req.timestamp));
          targetEntry = sortedEntries[0] && Math.abs(sortedEntries[0].startTime - req.timestamp) < 5.0 ? sortedEntries[0] : undefined;
        }

        if (!targetEntry) {
          targetEntry = entries.find(entry => entry.startTime <= req.timestamp && entry.endTime >= req.timestamp);
        }

        if (!targetEntry && entries.length > 0) {
          const sortedEntries = entries.sort((a, b) => Math.abs(a.startTime - req.timestamp) - Math.abs(b.startTime - req.timestamp));
          targetEntry = sortedEntries[0];
        }

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
          cleanedTargetText = req.dialogueText || '';
          derivedCharacter = req.character || 'Unknown';
        }

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

          const contextParts = cleanedContextEntries.map(entry => `${entry.character}: ${entry.text}`);
          const dedupedParts: string[] = [];
          for (const part of contextParts) {
            if (dedupedParts[dedupedParts.length - 1] !== part) dedupedParts.push(part);
          }
          fullDialogue = dedupedParts.join(' | ');
          dialogueAtTimestamp = `${derivedCharacter}: ${cleanedTargetText}`.trim();
        } else {
          fullDialogue = `${derivedCharacter}: ${cleanedTargetText}`;
          dialogueAtTimestamp = `${derivedCharacter}: ${cleanedTargetText}`;
        }

        if (!fullDialogue || fullDialogue.trim() === '') {
          fullDialogue = `${derivedCharacter}: ${cleanedTargetText}`;
        }

        console.log(` [DEBUG] Image requirement ${index}: "${req.title}"`);
        console.log(` [DEBUG] - cleanedTargetText: "${cleanedTargetText}"`);
        console.log(` [DEBUG] - derivedCharacter: "${derivedCharacter}"`);
        console.log(` [DEBUG] - fullDialogue: "${fullDialogue}"`);
        console.log(` [DEBUG] - dialogueAtTimestamp: "${dialogueAtTimestamp}"`);

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

      let userProvidedUsed = 0;
      const userImageDecisions = (result.object as any).userImageDecisions || [];

      console.log(' [AI] User Image Evaluation Results:');
      userImageDecisions.forEach((decision: any) => {
        const status = decision.useImage ? ' ACCEPTED' : ' REJECTED';
        console.log(`   ${status}: "${decision.userImageLabel}"`);
        if (decision.useImage) {
          console.log(`       Will appear at ${decision.timestamp?.toFixed(1) || 'optimal'}s`);
        }
        console.log(`       Reason: ${decision.reasoning}`);
        console.log('');
      });

      userImageDecisions.forEach((decision: any) => {
        console.log(` [AI-DECISION] User image decision:`, {
          label: decision.userImageLabel,
          useImage: decision.useImage,
          timestamp: decision.timestamp,
          reasoning: decision.reasoning
        });

        if (decision.useImage && userProvidedImages) {
          const userImage = userProvidedImages.find(img => img.label === decision.userImageLabel);
          if (userImage) {
            userImage.preferredTimestamp = decision.timestamp || userImage.preferredTimestamp || 0;
            userImage.contextualDuration = decision.contextualDuration || userImage.contextualDuration || 8;
            userImage.relevanceReasoning = decision.reasoning || userImage.relevanceReasoning;

            const finalTimestamp = userImage.preferredTimestamp;
            console.log(` [TIMESTAMP] Updated "${userImage.label}" with AI timestamp: ${finalTimestamp}s`);

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
      });      //  FALLBACK: If AI rejected all user images but user images exist, try to place them based on keyword matching
      if (userProvidedImages && userProvidedImages.length > 0 && userProvidedUsed === 0) {
        console.log(' [AI] AI rejected all user images, applying fallback placement logic...');

        userProvidedImages.forEach((userImage, index) => {
          let fallbackTimestamp = 10 + (index * 15); // Default spacing
          let foundMatch = false;

          const keywords = userImage.label.toLowerCase().split(/[\s\-_]+/).filter(word => word.length > 3);

          for (const entry of entries) {
            const dialogueText = entry.text.toLowerCase();
            if (keywords.some(keyword => dialogueText.includes(keyword))) {
              fallbackTimestamp = entry.startTime + 2; // Show 2 seconds after the mention
              foundMatch = true;
              console.log(`    Found keyword match for "${userImage.label}" at ${entry.startTime.toFixed(1)}s: "${entry.text.substring(0, 50)}..."`);
              break;
            }
          }

          userImage.preferredTimestamp = fallbackTimestamp;
          userImage.contextualDuration = 8;
          userImage.relevanceReasoning = foundMatch ?
            `Fallback placement: Keyword match found in dialogue` :
            `Fallback placement: Spaced placement for user-provided image`;

          console.log(`    Fallback placement for "${userImage.label}" at ${fallbackTimestamp}s`);

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

        console.log(` [AI] Applied fallback placement for ${userProvidedUsed} user images`);
      }

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

      let workingImageRequirements: ImageRequirement[] = dedupedImageRequirements;


      if (userProvidedImages?.length) {
        console.log(' [AI] Saving user images with updated timestamps:');
        userProvidedImages.forEach(img => {
          console.log(`    "${img.label}" -> ${img.preferredTimestamp}s`);
        });
        UserImageManager.saveUserImages(userProvidedImages, sessionId);
        console.log(` [AI] Saved ${userProvidedImages.length} user images with AI-determined timestamps`);
      }

      console.log(' [AI] Matching existing images to requirements...');

      const sessionImageDir = path.join(process.cwd(), 'generated_images', sessionId);
      if (fs.existsSync(sessionImageDir)) {
        const existingImages = fs.readdirSync(sessionImageDir)
          .filter(file => file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.jpeg') || file.endsWith('.gif'))
          .map(file => ({
            filename: file,
            path: path.join(sessionImageDir, file),
            title: file.replace(/[_-]/g, ' ').replace(/\..*$/, '').replace(/img.*$/, '').trim()
          }));

        console.log(` [AI] Found ${existingImages.length} existing images in session directory`);

        workingImageRequirements.forEach(req => {
          const matchingImage = existingImages.find(img =>
            img.title.toLowerCase().includes(req.title.toLowerCase().substring(0, 10)) ||
            req.title.toLowerCase().includes(img.title.toLowerCase().substring(0, 10))
          );

          if (matchingImage) {
            req.imagePath = matchingImage.path;
            req.uploaded = true;
            console.log(` [AI] Matched requirement "${req.title}" to existing image: ${matchingImage.filename}`);
          } else {
            console.log(` [AI] No match found for requirement: "${req.title}"`);
          }
        });
      } else {
        console.log(` [AI] No existing images directory found for session: ${sessionImageDir}`);
      }

      console.log(' [AI] Adding default Introduction image suggestion at 0:00 (thumbnail)');
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

      workingImageRequirements.unshift(introductionImageReq);

      const finalSeenKeys = new Set<string>();
      const finalImageRequirements = workingImageRequirements.filter(req => {
        const roundedTs = Math.round((req.timestamp || 0) * 10) / 10;
        const key = `${roundedTs}|${normalizeText(req.dialogueAtTimestamp || req.dialogueText)}|${(req.character || '').toLowerCase()}|${(req.title || '').toLowerCase()}`;
        if (finalSeenKeys.has(key)) return false;
        finalSeenKeys.add(key);
        return true;
      });
      console.log(` [AI] Added Introduction image suggestion: "${introductionImageReq.title}" at ${introductionImageReq.timestamp}s`);

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

      console.log(' [AI] Enhanced technical diagram analysis completed successfully');
      console.log(` [AI] Generated ${imageRequirements.length} technical diagram requirements with Google search research`);
      if (userProvidedImages?.length) {
        console.log(` [AI] Evaluated ${userProvidedImages.length} user images, using ${userProvidedUsed}`);
      }

      return plan;

    } catch (error) {
      console.error(' [AI] Error in enhanced AI analysis:', error);
      throw new Error(`Failed to analyze dialogue for images: ${error}`);
    }
  }

  // Save image plan to file
  static saveImagePlan(plan: ImageEmbeddingPlan, outputDir: string = './temp'): string {
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filePath = path.join(outputDir, `${plan.sessionId}_image_plan.json`);
      fs.writeFileSync(filePath, JSON.stringify(plan, null, 2));

      console.log(' [SAVE] Image plan saved to:', filePath);
      return filePath;

    } catch (error) {
      console.error(' [SAVE] Error saving image plan:', error);
      throw new Error(`Failed to save image plan: ${error}`);
    }
  }

  // Load image plan from file
  static loadImagePlan(filePath: string): ImageEmbeddingPlan {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const plan = JSON.parse(content) as ImageEmbeddingPlan;

      console.log(' [LOAD] Image plan loaded from:', filePath);
      return plan;

    } catch (error) {
      console.error(' [LOAD] Error loading image plan:', error);
      throw new Error(`Failed to load image plan: ${error}`);
    }
  }

  // Get upload progress
  static getUploadProgress(plan: ImageEmbeddingPlan): { uploaded: number; total: number; percentage: number } {
    const uploaded = plan.imageRequirements.filter(req => req.uploaded).length;
    const total = plan.imageRequirements.length;
    const percentage = total > 0 ? Math.round((uploaded / total) * 100) : 0;

    return { uploaded, total, percentage };
  }

  // Update image upload status
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

// User-provided image management
export class UserImageManager {
  // Create user image
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

  // Validate user images
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

  // Save user images to file
  static saveUserImages(images: UserProvidedImage[], sessionId: string, outputDir: string = './temp'): string {
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filePath = path.join(outputDir, `${sessionId}_user_images.json`);
      fs.writeFileSync(filePath, JSON.stringify(images, null, 2));

      console.log(' [USER] User images saved to:', filePath);
      return filePath;

    } catch (error) {
      console.error(' [USER] Error saving user images:', error);
      throw new Error(`Failed to save user images: ${error}`);
    }
  }

  // Load user images from file
  static loadUserImages(filePath: string): UserProvidedImage[] {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const images = JSON.parse(content) as UserProvidedImage[];

      const validImages = images.filter(img => {
        if (!fs.existsSync(img.imagePath)) {
          console.warn(` [USER] Skipping non-existent user image: ${img.label} (${img.imagePath})`);
          return false;
        }
        return true;
      });

      console.log(` [USER] User images loaded from: ${filePath} (${validImages.length}/${images.length} valid)`);
      return validImages;

    } catch (error) {
      console.error(' [USER] Error loading user images:', error);
      throw new Error(`Failed to load user images: ${error}`);
    }
  }
}
// Image embedding service
export class ImageEmbeddingService {
  // Generate image plan from clean timestamps
  static async generateImageEmbeddingPlanFromCleanTimestamps(
    sessionId: string,
    dialogues: Array<{ character: string; text: string; audioFile: { filePath: string } }>,
    topic: string,
    userProvidedImages?: UserProvidedImage[],
    density: 'low' | 'medium' | 'high' | 'ultra' = 'ultra'
  ): Promise<ImageEmbeddingPlan> {
    try {
      console.log(' [SERVICE] Starting clean timestamp-based image analysis for session:', sessionId);
      console.log(' [SERVICE] Using WhisperX clean alignment for accurate sentence-level timing');
      if (userProvidedImages?.length) {
        console.log(` [SERVICE] Evaluating ${userProvidedImages.length} user-provided images`);
      }

      const { getWhisperXCleanAlignment } = await import('./videoGenerator');

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
        console.log(` [SERVICE] Processing clean alignment for: "${dialogue.text.substring(0, 50)}..."`);

        const cleanResult = await getWhisperXCleanAlignment(dialogue.audioFile.filePath, dialogue.text);

        if (cleanResult.success && cleanResult.sentences) {
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
          console.warn(` [SERVICE] Failed to get clean timestamps for dialogue: ${cleanResult.error}`);

          const ffmpeg = require('fluent-ffmpeg');
          const audioDuration = await new Promise<number>((resolve, reject) => {
            ffmpeg.ffprobe(dialogue.audioFile.filePath, (err: any, metadata: any) => {
              if (err) reject(err);
              else resolve(metadata.format.duration || 0);
            });
          });

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

      console.log(` [SERVICE] Processed clean timestamps: ${cleanTimestamps.length} dialogues, ${totalDuration.toFixed(2)}s total duration`);

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

      const imagePlan = await ImageEmbeddingAnalyzer.analyzeDialogueForImages(sessionId, assLikeData, topic, userProvidedImages);

      const planFilePath = await ImageEmbeddingAnalyzer.saveImagePlan(imagePlan);

      console.log(' [SERVICE] Clean timestamp-based image plan generated successfully');
      console.log(` [SERVICE] Plan includes ${imagePlan.summary.totalImages} technical diagrams for maximum educational impact`);
      if (userProvidedImages?.length) {
        console.log(` [SERVICE] ${imagePlan.summary.userProvidedUsed} user-provided images incorporated`);
      }

      return imagePlan;

    } catch (error) {
      console.error(' [SERVICE] Error generating clean timestamp-based image embedding plan:', error);
      throw new Error(`Failed to generate image embedding plan: ${error}`);
    }
  }

  // Generate image embedding plan
  static async generateImageEmbeddingPlan(
    sessionId: string,
    assFilePath: string,
    topic: string,
    userProvidedImages?: UserProvidedImage[],
    density: 'low' | 'medium' | 'high' | 'ultra' = 'ultra'
  ): Promise<ImageEmbeddingPlan> {
    try {
      console.log(' [SERVICE] Starting enhanced technical diagram analysis for session:', sessionId);
      console.log(' [SERVICE] Using ultra-high density for maximum technical visualization');
      if (userProvidedImages?.length) {
        console.log(` [SERVICE] Evaluating ${userProvidedImages.length} user-provided images`);
      }

      const assContent = fs.readFileSync(assFilePath, 'utf8');
      const assData = AssFileProcessor.parseAssFile(assContent);

      console.log(` [SERVICE] Parsed ASS file: ${assData.entries.length} dialogue entries, ${assData.metadata.duration}s duration`);

      const imagePlan = await ImageEmbeddingAnalyzer.analyzeDialogueForImages(sessionId, assData, topic, userProvidedImages);

      const planFilePath = await ImageEmbeddingAnalyzer.saveImagePlan(imagePlan);

      console.log(' [SERVICE] Enhanced technical diagram plan generated successfully');
      console.log(` [SERVICE] Plan includes ${imagePlan.summary.totalImages} technical diagrams for maximum educational impact`);
      if (userProvidedImages?.length) {
        console.log(` [SERVICE] ${imagePlan.summary.userProvidedUsed} user-provided images incorporated`);
      }

      return imagePlan;

    } catch (error) {
      console.error(' [SERVICE] Error generating enhanced image embedding plan:', error);
      throw new Error(`Failed to generate image embedding plan: ${error}`);
    }
  }

  // Format plan for user display
  static formatPlanForUser(plan: ImageEmbeddingPlan): string {
    const progress = ImageEmbeddingAnalyzer.getUploadProgress(plan);

    let output = ` **ENHANCED IMAGE EMBEDDING PLAN FOR SESSION: ${plan.sessionId}**\n\n`;
    output += ` **ENHANCED FEATURES:**\n`;
    output += `• Technical diagram focus (architectures, workflows, comparisons)\n`;
    output += `• AI-determined contextual image duration (3-15 seconds based on concept explanation length)\n`;
    output += `• Google search-powered technical research\n`;
    output += `• Quality over quantity - strategic technical visualizations\n\n`;

    output += ` **SUMMARY:**\n`;
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

    output += ` **UPLOAD PROGRESS:** ${progress.uploaded}/${progress.total} (${progress.percentage}%)\n\n`;

    output += ` **REQUIRED IMAGES (ULTRA-DENSITY VISUAL EXPERIENCE):**\n\n`;

    plan.imageRequirements.forEach((req, index) => {
      const status = req.uploaded ? ' UPLOADED' : ' PENDING';
      const priorityEmoji = req.priority === 'high' ? '' : req.priority === 'medium' ? '' : '';
      const typeEmoji = {
        'architecture': '',
        'process': '',
        'comparison': '',
        'diagram': '',
        'workflow': '',
        'infrastructure': '',
        'lifecycle': ''
      }[req.imageType] || '';

      if (req.title === 'Introduction') {
        output += `${index + 1}. **${req.title}** ${status}  **(THUMBNAIL - OPTIONAL)**\n`;
        output += `    Special: Acts as video thumbnail/opening image\n`;
        output += `   ${priorityEmoji} Priority: ${req.priority.toUpperCase()}\n`;
        output += `   ${typeEmoji} Type: ${req.imageType}\n`;
        output += `    Timestamp: ${req.timestamp.toFixed(1)}s (${req.contextualDuration}s display)\n`;
        output += `    Character: ${req.character}\n`;
        output += `    Context: "${req.dialogueText.substring(0, 60)}${req.dialogueText.length > 60 ? '...' : ''}"\n`;
        output += `    AI Description: ${req.description}\n`;
        output += `    **Note: If not uploaded, no default image will be added**\n\n`;
      } else {
        output += `${index + 1}. **${req.title}** ${status}\n`;
        output += `   ${priorityEmoji} Priority: ${req.priority.toUpperCase()}\n`;
        output += `   ${typeEmoji} Type: ${req.imageType}\n`;
        output += `    Timestamp: ${req.timestamp.toFixed(1)}s (${req.contextualDuration || 3}s display)\n`;
        output += `    Character: ${req.character}\n`;
        output += `    Context: "${req.dialogueText.substring(0, 60)}${req.dialogueText.length > 60 ? '...' : ''}"\n`;
        output += `    AI Description: ${req.description}\n\n`;
      }
    });

    output += ` **NEXT STEPS:**\n`;
    output += `1. Upload the required images using the ultra-concise titles above\n`;
    output += `2.  The "Introduction" image is optional - acts as a thumbnail/opening image\n`;
    output += `3. Each image will display for their specified duration at its timestamp\n`;
    output += `4. The system will create maximum visual impact with frequent, creative imagery\n\n`;

    output += ` **ENHANCED TIPS:**\n`;
    output += `• Images focus on technical diagrams and architectures\n`;
    output += `• Introduction image creates engaging video thumbnail effect\n`;
    output += `• Each image stays longer for better technical understanding\n`;
    output += `• Google search ensures accurate technical visualizations\n`;
    output += `• Quality technical diagrams enhance learning retention\n`;
    output += `• Strategic placement maximizes educational impact\n`;

    if (plan.userProvidedImages?.length) {
      output += `\n\n **USER-PROVIDED IMAGES EVALUATION:**\n\n`;

      if (plan.userImageDecisions?.length) {
        output += ` **AI EVALUATION RESULTS:**\n`;
        plan.userImageDecisions.forEach((decision, index) => {
          const status = decision.useImage ? ' ACCEPTED' : ' REJECTED';
          const priorityEmoji = decision.useImage ? '' : '';

          output += `${index + 1}. **${decision.userImageLabel}** ${status}\n`;
          output += `   ${priorityEmoji} Decision: ${decision.useImage ? 'Will be included in video' : 'Not suitable for this content'}\n`;
          output += `    AI Reasoning: ${decision.reasoning}\n`;
          if (decision.useImage && decision.timestamp) {
            output += `    Will appear at: ${decision.timestamp.toFixed(1)}s\n`;
          }
          output += `\n`;
        });
        output += `\n`;
      }

      output += ` **ALL USER IMAGES SUMMARY:**\n`;
      plan.userProvidedImages.forEach((userImg, index) => {
        const isUsed = plan.imageRequirements.some(req => req.title === userImg.label && req.imagePath === userImg.imagePath);
        const status = isUsed ? ' USED' : ' NOT USED';
        const priorityEmoji = userImg.priority === 'high' ? '' : userImg.priority === 'medium' ? '' : '';

        output += `${index + 1}. **${userImg.label}** ${status}\n`;
        output += `   ${priorityEmoji} Priority: ${userImg.priority?.toUpperCase() || 'MEDIUM'}\n`;
        if (userImg.preferredTimestamp) {
          output += `    Preferred Timestamp: ${userImg.preferredTimestamp.toFixed(1)}s\n`;
        }
        output += `    Path: ${userImg.imagePath}\n`;
        if (userImg.description) {
          output += `    Description: ${userImg.description}\n`;
        }
        output += `\n`;
      });
    }

    return output;
  }

  // Generate video with embedded images
  static async generateVideoWithEmbeddedImages(
    sessionId: string,
    backgroundVideoPath: string,
    imagePlan: ImageEmbeddingPlan,
    device: string = 'cuda',
    backgroundVideoSpeed: number = 1.10
  ): Promise<{ success: boolean; videoPath?: string; error?: string }> {
    try {
      console.log(' [SERVICE] ENHANCED VIDEO GENERATION with technical diagram embeddings');
      console.log(' [SERVICE] Session ID:', sessionId);
      console.log(' [SERVICE] Background video:', backgroundVideoPath);
      console.log(' [SERVICE] Device:', device);
      console.log(' [SERVICE] Background video speed:', backgroundVideoSpeed);

      console.log(' [SERVICE] Image requirements:');
      imagePlan.imageRequirements?.forEach((req, index) => {
        console.log(`   ${index + 1}. ${req.title} (${req.imageType}) - uploaded: ${req.uploaded} - path: ${req.imagePath || 'NO PATH'}`);
      });
      const uploadedImages = imagePlan.imageRequirements.filter(req => req.uploaded && req.imagePath);
      const missingImages = imagePlan.imageRequirements.filter(req => !req.uploaded || !req.imagePath);

      let userProvidedImages: UserProvidedImage[] = [];
      try {
        const userImagesFile = path.join(process.cwd(), 'temp', `${sessionId}_user_images.json`);
        if (fs.existsSync(userImagesFile)) {
          const allUserImages = UserImageManager.loadUserImages(userImagesFile);

          const approvedImagePaths = new Set(
            imagePlan.imageRequirements
              .filter(req => req.imagePath)
              .map(req => req.imagePath)
          );
          userProvidedImages = allUserImages.filter(img => !approvedImagePaths.has(img.imagePath));
          console.log(` [SERVICE] Found ${allUserImages.length} total user images, ${userProvidedImages.length} unapproved (already approved: ${approvedImagePaths.size})`);
        }
      } catch (error) {
        console.warn(' [SERVICE] Could not load user-provided images:', error);
      }

      const totalAvailableImages = uploadedImages.length + userProvidedImages.length;

      console.log(` [SERVICE] Image status: ${uploadedImages.length} uploaded, ${userProvidedImages.length} user-provided, ${missingImages.length} missing`);
      console.log(' [SERVICE] Uploaded images:');
      uploadedImages.forEach((img, index) => {
        console.log(`   ${index + 1}. ${img.title} (${img.imageType}) - ${img.timestamp}s - ${img.imagePath}`);
      });
      console.log(' [SERVICE] User-provided images:');
      userProvidedImages.forEach((img, index) => {
        console.log(`   ${index + 1}. ${img.label} - ${img.imagePath} - timestamp: ${img.preferredTimestamp || 'none'}`);
      });
      console.log(' [SERVICE] Missing images:');
      missingImages.forEach((img, index) => {
        console.log(`   ${index + 1}. ${img.title} (${img.imageType}) - uploaded: ${img.uploaded} - path: ${img.imagePath || 'NO PATH'}`);
      });
      console.log(` [SERVICE] Total available images: ${totalAvailableImages}`);
      console.log(` [SERVICE] Expected images per minute: ${((imagePlan.summary.totalImages / imagePlan.totalDuration) * 60).toFixed(1)}`);

      if (missingImages.length > 0) {
        console.log(' [SERVICE] Proceeding with available images. Missing AI-generated images will be skipped.');
        missingImages.slice(0, 5).forEach(img => { // Show first 5 missing
          console.log(`   - ${img.title} (${img.imageType}, ${img.priority} priority)`);
        });
        if (missingImages.length > 5) {
          console.log(`   ... and ${missingImages.length - 5} more`);
        }
      }

      if (userProvidedImages.length > 0) {
        console.log(' [SERVICE] User-provided images available:');
        userProvidedImages.forEach(img => {
          console.log(`   - ${img.label} (${img.priority} priority) - ${img.description || 'No description'}`);
        });
      }

      const existingAssPath = path.join(process.cwd(), 'temp', `${sessionId}_subtitles.ass`);

      if (fs.existsSync(existingAssPath)) {
        console.log(' [SERVICE] Found existing ASS file from analysis, will reuse for video generation');
        console.log(' [SERVICE] Existing ASS path:', existingAssPath);

        const videoAssPath = path.join(process.cwd(), 'generated_videos', `${sessionId}_styled_subtitles.ass`);
        fs.copyFileSync(existingAssPath, videoAssPath);
        console.log(' [SERVICE] Reused existing ASS file for video generation');
      } else {
        console.log(' [SERVICE] No existing ASS file found, video generator will create new one');
      }

      const { generateVideoWithSubtitles } = await import('./videoGenerator');

      const baseVideoResult = await generateVideoWithSubtitles(sessionId, backgroundVideoPath, device, backgroundVideoSpeed);

      if (!baseVideoResult.success) {
        return {
          success: false,
          error: `Failed to generate base video: ${baseVideoResult.error}`
        };
      }

      console.log(' [SERVICE] Base video generated successfully.');
      console.log(' [SERVICE] Now implementing image embedding...');

      if (totalAvailableImages === 0) {
        console.log(' [SERVICE] No uploaded images found (AI requirements or user-provided), returning base video');
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

      if (!baseVideoResult.videoPath) {
        return {
          success: false,
          error: 'Base video generation failed - no video path returned'
        };
      }

      if (totalAvailableImages === 0) {
        console.log(' [SERVICE] No uploaded images found (AI requirements or user-provided) - returning enhanced base video with subtitles');
        console.log(' [SERVICE] Upload technical diagram images to unlock enhanced educational visualization');
        return {
          success: true,
          videoPath: baseVideoResult.videoPath
        };
      }

      console.log(' [SERVICE] Proceeding with technical diagram embedding...');
      console.log(` [SERVICE] Will embed ${totalAvailableImages} images (${uploadedImages.length} AI-generated + ${userProvidedImages.length} user-provided) for maximum educational impact`);

      const finalVideoResult = await this.embedImagesInVideo(
        baseVideoResult.videoPath,
        uploadedImages,
        sessionId,
        userProvidedImages // Pass user-provided images
      );

      return finalVideoResult;

    } catch (error) {
      console.error(' [SERVICE] Error generating video with embedded images:', error);
      return {
        success: false,
        error: `Failed to generate video with embedded images: ${error}`
      };
    }
  }

  // Embed images in video
  static async embedImagesInVideo(
    baseVideoPath: string,
    uploadedImages: ImageRequirement[],
    sessionId: string,
    userProvidedImages: UserProvidedImage[] = []
  ): Promise<{ success: boolean; videoPath?: string; error?: string; videoFile?: { filename: string; path: string; fileSize: number; sessionId: string } }> {
    try {
      console.log(' [EMBED] Starting image embedding process');
      console.log(` [EMBED] Base video: ${baseVideoPath}`);
      console.log(` [EMBED] AI-generated images to embed: ${uploadedImages.length}`);
      console.log(` [EMBED] User-provided images to embed: ${userProvidedImages.length}`);

      const validAiImages = uploadedImages.filter(img => {
        if (img.title === 'Introduction' && (!img.uploaded || !img.imagePath)) {
          console.log(' [EMBED] Skipping Introduction image - not uploaded (acts as thumbnail suggestion only)');
          return false;
        }
        return img.imagePath;
      });
      console.log(' [EMBED] Valid AI images:');
      validAiImages.forEach((img, index) => {
        console.log(`   ${index + 1}. ${img.title} - ${img.timestamp}s - ${img.imagePath}`);
      });

      let validUserImages = userProvidedImages.filter(img =>
        img.imagePath &&
        fs.existsSync(img.imagePath) &&
        !validAiImages.some(aiImg => aiImg.imagePath === img.imagePath) &&
        img.preferredTimestamp !== undefined && img.preferredTimestamp !== null // Only include images with proper timestamps
      );

      const seenCombinations = new Set<string>();
      validUserImages = validUserImages.filter(img => {
        const combinationKey = `${img.label.toLowerCase()}_${Math.round(img.preferredTimestamp || 0)}`;
        if (seenCombinations.has(combinationKey)) {
          console.log(` [EMBED] Skipping duplicate: ${img.label} at ${img.preferredTimestamp}s (already have one)`);
          return false;
        }
        seenCombinations.add(combinationKey);
        return true;
      });

      console.log(' [EMBED] Valid user images (with timestamps, deduplicated):');
      validUserImages.forEach((img, index) => {
        console.log(`   ${index + 1}. ${img.label} - ${img.preferredTimestamp}s - ${img.imagePath}`);
      });
      console.log(' [EMBED] Filtered out user images:');
      userProvidedImages.filter(img => !validUserImages.some(valid => valid.id === img.id)).forEach((img, index) => {
        console.log(`   ${index + 1}. ${img.label} - timestamp: ${img.preferredTimestamp || 'none'} - path: ${img.imagePath} - exists: ${fs.existsSync(img.imagePath)}`);
      });

      console.log(` [EMBED] Valid AI-generated images: ${validAiImages.length}`);
      console.log(` [EMBED] Valid user-provided images: ${validUserImages.length}`);

      const totalValidImages = validAiImages.length + validUserImages.length;
      console.log(` [EMBED] Total valid images: ${totalValidImages}`);

      if (totalValidImages === 0) {
        console.log(' [EMBED] No valid images to embed, returning base video');
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

      if (!fs.existsSync(baseVideoPath)) {
        console.error(` [EMBED] Base video file does not exist: ${baseVideoPath}`);
        return {
          success: false,
          error: `Base video file not found: ${baseVideoPath}`
        };
      }

      const allImagesToValidate = [
        ...validAiImages.map(img => ({ path: img.imagePath!, type: 'ai', title: img.title })),
        ...validUserImages.map(img => ({ path: img.imagePath, type: 'user', title: img.label }))
      ];

      for (const img of allImagesToValidate) {
        if (!fs.existsSync(img.path)) {
          console.error(` [EMBED] Image file does not exist: ${img.path}`);
          return {
            success: false,
            error: `Image file not found: ${img.path}`
          };
        }

        const stats = fs.statSync(img.path);
        if (stats.size === 0) {
          console.error(` [EMBED] Image file is empty: ${img.path}`);
          return {
            success: false,
            error: `Image file is empty: ${img.path}`
          };
        }
      }

      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
      ffmpeg.setFfmpegPath(ffmpegPath);

      const outputVideoPath = path.join(process.cwd(), 'generated_videos', `${sessionId}_with_images.mp4`);

      let ffmpegCommand = ffmpeg().input(baseVideoPath);
      console.log(` [EMBED] Added base video input: ${baseVideoPath}`);

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

      console.log(' [EMBED] Image schedule:');
      allImages.forEach((img, index) => {
        console.log(`   ${index + 1}. ${img.title} (${img.type}) - ${img.timestamp.toFixed(1)}s - duration: ${(img.contextualDuration || 8).toFixed(1)}s`);
      });

      allImages.forEach((image, index) => {
        ffmpegCommand = ffmpegCommand.input(image.path);
        console.log(` [EMBED] Added image input ${index + 1}: ${image.path} (${image.title}) - ${image.type}`);
      });

      let filterChain = '';

      allImages.forEach((image, index) => {
        const inputIndex = index + 1; // FFmpeg inputs start at 1 (0 is base video)
        const startTime = image.timestamp;

        let duration = image.contextualDuration || 6; // Use AI-determined duration, fallback to 6 seconds

        if (index < allImages.length - 1) {
          const nextImageTime = allImages[index + 1].timestamp;
          const timeUntilNext = nextImageTime - startTime;

          if (duration > timeUntilNext) {
            duration = Math.max(timeUntilNext * 0.9, 2); // Leave small gap, minimum 2 seconds
            console.log(` [EMBED] Reduced duration for ${image.title} from ${image.contextualDuration}s to ${duration.toFixed(1)}s to prevent overlap`);
          }
        }

        const endTime = startTime + duration;

        console.log(` [EMBED] Image ${index + 1}: ${image.title} - Start: ${startTime.toFixed(1)}s, Duration: ${duration.toFixed(1)}s, End: ${endTime.toFixed(1)}s`);
        if (image.relevanceReasoning) {
          console.log(` [AI-DURATION] ${image.relevanceReasoning}`);
        }

        const scaledLabel = `scaled_img_${index}`;

        if (index === 0) {
          filterChain += `[${inputIndex}:v]scale=960:720:force_original_aspect_ratio=decrease[${scaledLabel}];[0:v][${scaledLabel}]overlay=(W-w)/2:40:enable='between(t,${startTime},${endTime})'[with_img_${index}]`;
        } else {
          const prevLabel = `with_img_${index - 1}`;
          filterChain += `;[${inputIndex}:v]scale=960:720:force_original_aspect_ratio=decrease[${scaledLabel}];[${prevLabel}][${scaledLabel}]overlay=(W-w)/2:40:enable='between(t,${startTime},${endTime})'[with_img_${index}]`;
        }

        if (index === allImages.length - 1) {
          filterChain = filterChain.replace(`[with_img_${index}]`, '[final_with_images]');
        }
      });

      console.log(' [EMBED] Generated filter chain for image overlay');
      console.log(` [EMBED] Filter complexity: ${allImages.length} images, ${filterChain.length} characters`);

      if (allImages.length === 0) {
        filterChain = '[0:v]copy[final_with_images]';
        console.log(' [EMBED] No images to embed, using copy filter');
      } else {
        console.log(` [EMBED] Generated filter chain for ${allImages.length} image(s)`);
      }

      console.log(' [EMBED] Number of images to embed:', allImages.length);
      console.log(' [EMBED] Image positioning: Centered horizontally in top half at y=40, 960x720 taller size, maintains aspect ratio');

      if (!filterChain || filterChain.trim() === '') {
        console.error(' [EMBED] Empty filter chain generated');
        return {
          success: false,
          error: 'Failed to generate FFmpeg filter chain'
        };
      }

      if (allImages.length > 1) {
        const expectedLabels = allImages.length - 1; // Should have with_img_0 through with_img_(n-2)
        let labelCount = 0;
        for (let i = 0; i < expectedLabels; i++) {
          if (filterChain.includes(`[with_img_${i}]`)) {
            labelCount++;
          }
        }
        if (labelCount !== expectedLabels) {
          console.warn(` [EMBED] Filter chain may have incorrect label count. Expected ${expectedLabels}, found ${labelCount}`);
        }
      }

      console.log(' [EMBED] Starting FFmpeg processing...');
      console.log(` [EMBED] Processing ${allImages.length} images with complex overlay filters`);

      return new Promise((resolve) => {
        ffmpegCommand
          .outputOptions([
            '-map', '0:a', // Copy audio from base video
            '-map', '[final_with_images]', // Video with overlays
            '-c:v', 'libx264', 
            '-c:a', 'aac',
            '-b:v', '2000k',
            '-b:a', '128k',
            '-filter_complex', filterChain,
            '-y' // Overwrite output file
          ])
          .output(outputVideoPath)
          .on('start', (commandLine: string) => {
            console.log(' [EMBED] Starting FFmpeg processing...');
          })
          .on('progress', (progress: any) => {
          })
          .on('end', () => {
            console.log(' [EMBED] Image embedding completed successfully');
            console.log(` [EMBED] Output video: ${outputVideoPath}`);
            console.log(` [EMBED] Successfully embedded ${allImages.length} images:`);
            allImages.forEach((img, index) => {
              console.log(`   ${index + 1}. ${img.title} (${img.type}) at ${img.timestamp.toFixed(1)}s`);
            });

            if (fs.existsSync(outputVideoPath)) {
              const stats = fs.statSync(outputVideoPath);
              console.log(` [EMBED] Output file size: ${stats.size} bytes`);

              if (stats.size === 0) {
                console.error(' [EMBED] Output file is empty');
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
              console.error(' [EMBED] Output file was not created');
              resolve({
                success: false,
                error: 'FFmpeg completed but output file was not created'
              });
            }
          })
          .on('error', (err: any) => {
            console.error(' [EMBED] FFmpeg error:', err);
            console.error(' [EMBED] Error message:', err.message);
            console.error(' [EMBED] Error code:', err.code);
            console.error(' [EMBED] Filter chain that failed:', filterChain);
            resolve({
              success: false,
              error: `FFmpeg embedding failed: ${err.message}`
            });
          })
          .run();
      });

    } catch (error) {
      console.error(' [EMBED] Error in image embedding:', error);
      return {
        success: false,
        error: `Failed to embed images: ${error}`
      };
    }
  }

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

  // Get user image placement suggestions
  static async getUserImagePlacementSuggestions(
    sessionId: string,
    assFilePath: string,
    topic: string,
    userImages: UserProvidedImage[]
  ): Promise<UserImageSuggestion[]> {
    try {
      console.log(' [SUGGESTIONS] Analyzing user images for placement suggestions...');
      console.log(' [SUGGESTIONS] Number of user images to analyze:', userImages.length);
      console.log(' [SUGGESTIONS] User image labels:', userImages.map(img => `"${img.label}"`).join(', '));

      const assContent = fs.readFileSync(assFilePath, 'utf8');
      const assData = AssFileProcessor.parseAssFile(assContent);
      const dialogueEntries = assData.entries.filter((entry: AssSubtitleEntry) =>
        entry.text && entry.text.length > 10 // Filter meaningful dialogue
      );

      console.log(` [SUGGESTIONS] Found ${dialogueEntries.length} dialogue entries in ASS file`);
      console.log(` [SUGGESTIONS] First entry: ${dialogueEntries[0]?.startTime}s - "${dialogueEntries[0]?.text?.substring(0, 50)}..."`);
      console.log(` [SUGGESTIONS] Last entry: ${dialogueEntries[dialogueEntries.length - 1]?.startTime}s`);

      for (let i = 0; i < Math.min(10, dialogueEntries.length); i++) {
        const entry = dialogueEntries[i];
        console.log(` [SUGGESTIONS] Entry ${i + 1}: ${entry.startTime.toFixed(1)}s - ${entry.character}: "${entry.text?.substring(0, 60)}..."`);
      }

      if (dialogueEntries.length === 0) {
        console.error(' [SUGGESTIONS] No valid dialogue entries found in ASS file');
        return [];
      }

      const suggestions: UserImageSuggestion[] = [];
      const usedTimestamps = new Set<number>(); // Track used timestamps to avoid clustering

      for (const userImage of userImages) {
        console.log(` [SUGGESTIONS] Analyzing placement for: "${userImage.label}"`);

        const analysisPrompt = this.getUserImageAnalysisPrompt(userImage, dialogueEntries, topic);

        console.log(` [SUGGESTIONS] AI Prompt for "${userImage.label}": Using clean, topic-specific analysis prompt`);

        const analysisSchema = z.object({
          bestDialogueIndex: z.number().min(1).max(dialogueEntries.length).describe(`Index of best matching dialogue (1-based, must be between 1 and ${dialogueEntries.length})`),
          relevanceScore: z.number().min(0).max(10).describe("Relevance score 0-10"),
          reasoning: z.string().describe("Detailed explanation for placement choice"),
          isRelevant: z.boolean().describe("Whether image should be included"),
          alternativeIndices: z.array(z.number().min(1).max(dialogueEntries.length)).max(5).describe(`Alternative dialogue indices (1-based, each between 1 and ${dialogueEntries.length}, maximum 5 alternatives)`)
        });

        try {
          const analysis = await generateObject({
            model: google('models/gemini-2.5-flash'),
            prompt: analysisPrompt,
            schema: analysisSchema as any,
          });

          const result = analysis.object;

          console.log(` [SUGGESTIONS] AI selected dialogue index: ${result.bestDialogueIndex} (1-based)`);
          console.log(` [SUGGESTIONS] AI relevance score: ${result.relevanceScore}`);
          console.log(` [SUGGESTIONS] AI reasoning: ${result.reasoning.substring(0, 100)}...`);

          let dialogueIndex = Math.max(0, Math.min(result.bestDialogueIndex - 1, dialogueEntries.length - 1));

          if (result.bestDialogueIndex < 1 || result.bestDialogueIndex > dialogueEntries.length) {
            console.log(` [SUGGESTIONS] AI returned invalid dialogue index ${result.bestDialogueIndex}, defaulting to 0`);
            dialogueIndex = 0;
          }

          let bestDialogue = dialogueEntries[dialogueIndex];

          console.log(` [SUGGESTIONS] Selected dialogue [${dialogueIndex}]: "${bestDialogue.text?.substring(0, 50)}..." at ${bestDialogue.startTime}s`);
          console.log(` [SUGGESTIONS] Expected timestamp around: ${bestDialogue.startTime.toFixed(1)}s, Character: ${bestDialogue.character}`);

          if (usedTimestamps.has(Math.round(bestDialogue.startTime))) {
            console.log(` [SUGGESTIONS] Timestamp ${bestDialogue.startTime}s already used, trying alternatives...`);
            console.log(` [SUGGESTIONS] Alternative indices from AI: ${result.alternativeIndices.join(', ')}`);

            for (const altIndex of result.alternativeIndices) {
              const arrayIndex = altIndex - 1;
              if (arrayIndex >= 0 && arrayIndex < dialogueEntries.length) {
                const altDialogue = dialogueEntries[arrayIndex];
                if (!usedTimestamps.has(Math.round(altDialogue.startTime))) {
                  dialogueIndex = arrayIndex;
                  bestDialogue = altDialogue;
                  console.log(` [SUGGESTIONS] Using alternative at ${altDialogue.startTime}s`);
                  break;
                }
              }
            }
          }

          if (!result.isRelevant || result.relevanceScore < 1) {
            console.log(` [SUGGESTIONS] Image "${userImage.label}" not relevant (score: ${result.relevanceScore})`);
            continue; // Skip irrelevant images
          }

          usedTimestamps.add(Math.round(bestDialogue.startTime));

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

          console.log(` [SUGGESTIONS] "${userImage.label}" -> ${bestDialogue.startTime}s (score: ${result.relevanceScore})`);

        } catch (aiError) {
          console.error(` [SUGGESTIONS] AI analysis failed for "${userImage.label}":`, aiError);

          let bestMatch = { dialogueIndex: -1, score: 0, reasoning: 'No clear relevance found' };

          dialogueEntries.forEach((entry: any, index: number) => {
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

            console.log(` [SUGGESTIONS] "${userImage.label}" -> ${bestDialogue.startTime}s (fallback, score: ${bestMatch.score})`);
          } else {
            console.log(` [SUGGESTIONS] "${userImage.label}" not relevant enough for fallback (score: ${bestMatch.score})`);
          }
        }

        const hasSuggestion = suggestions.some(s => s.userImageId === userImage.id);
        if (!hasSuggestion) {
          console.log(` [SUGGESTIONS] No suggestion created for "${userImage.label}", applying final fallback...`);

          let bestPlacement = { index: 0, score: 0 };

          dialogueEntries.forEach((entry, index) => {
            if (usedTimestamps.has(Math.round(entry.startTime))) return;

            let score = 0;
            const dialogueText = entry.text.toLowerCase();

            const labelWords = userImage.label.toLowerCase().split(/\s+/);
            labelWords.forEach(word => {
              if (word.length > 3 && dialogueText.includes(word)) score += 3;
            });

            const topicWords = topic.toLowerCase().split(/\s+/);
            topicWords.forEach(word => {
              if (word.length > 3 && dialogueText.includes(word)) score += 1;
            });

            if (score > bestPlacement.score) {
              bestPlacement = { index, score };
            }
          });

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

          console.log(` [SUGGESTIONS] Final fallback placement for "${userImage.label}" at ${placementDialogue.startTime}s`);
        }
      }

      const uniqueSuggestions = suggestions.filter((suggestion, index, self) =>
        index === self.findIndex(s =>
          s.userImageId === suggestion.userImageId &&
          Math.abs(s.suggestedTimestamp - suggestion.suggestedTimestamp) < 5 // Merge suggestions within 5 seconds
        )
      );

      uniqueSuggestions.sort((a, b) => b.relevanceScore - a.relevanceScore);

      console.log(` [SUGGESTIONS] Generated ${uniqueSuggestions.length} placement suggestions (removed ${suggestions.length - uniqueSuggestions.length} duplicates)`);
      console.log(` [SUGGESTIONS] Timestamp distribution:`, uniqueSuggestions.map(s => `${s.userImageLabel}@${s.suggestedTimestamp.toFixed(1)}s`).join(', '));

      if (uniqueSuggestions.length > 0) {
        console.log(` [SUGGESTIONS] Returning all ${uniqueSuggestions.length} suggestions:`);
        uniqueSuggestions.forEach((s, i) => {
          console.log(`  ${i + 1}. "${s.userImageLabel}" (score: ${s.relevanceScore})`);
        });
        return uniqueSuggestions;
      }

      return uniqueSuggestions;

    } catch (error) {
      console.error(' [SUGGESTIONS] Error generating user image placement suggestions:', error);
      throw error;
    }
  }
}
