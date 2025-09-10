import { generateObject, generateText } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import * as fs from 'fs';
import * as path from 'path';
const ffmpeg = require('fluent-ffmpeg');

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
      console.log('❌ Invalid images:', invalid);
    }

    // Generate image plan with user images
    const plan = await ImageEmbeddingService.generateImageEmbeddingPlan(
      'session_123',
      './subtitles.ass',
      'Docker and Kubernetes tutorial',
      valid
    );

    // Display the plan
    console.log(ImageEmbeddingService.formatPlanForUser(plan));

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

// 🎯 ASS CONFIGURATION
const ASS_CONFIG = {
  imageTimingOffset: 0.3, // Image appears 0.3 seconds before subtitle (reduced for more frequent images)
  minTextLength: 10,      // Minimum text length for image consideration (reduced from 20 for more technical diagrams)
  maxImagesPerMinute: 15, // Maximum images per minute (increased from 6 for more technical content)
  imageDisplayDuration: 3.0 // Images stay on screen for 3 seconds (extended duration for better learning)
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
      console.error('Error parsing ASS time:', timeString, error);
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

      // 🎯 5. DIALOGUE EXTRACTION
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
          console.warn(`Error parsing dialogue line ${i + 1}:`, line, error);
        }
      }
    }

    // 📊 CALCULATE TOTAL DURATION
    const totalDuration = entries.length > 0
      ? Math.max(...entries.map(e => e.endTime))
      : 0;

    return {
      entries: entries.sort((a, b) => a.startTime - b.startTime), // Sort by time
      styles,
      metadata: {
        ...metadata,
        totalEntries: entries.length,
        duration: totalDuration
      }
    };
  }

  // 🎯 6. IMAGE TIMING GENERATION - Extract timing for images based on subtitles
  static generateImageTimingFromAss(
    assData: AssFileData,
    imageDensity: 'low' | 'medium' | 'high' | 'ultra' = 'high'
  ): Array<{startTime: number; endTime: number; text: string; character?: string}> {
    const { entries } = assData;
    const imageTimings: Array<{startTime: number; endTime: number; text: string; character?: string}> = [];

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

// 🎯 AI-POWERED IMAGE EMBEDDING ANALYZER
export class ImageEmbeddingAnalyzer {
  private static readonly IMAGE_ANALYSIS_PROMPT = `
You are an expert technical content strategist specializing in DevOps, containerization, and cloud architecture visualization for educational videos.

Analyze the following technical dialogue sequence and create STRATEGIC visual overlays that enhance technical understanding and learning retention.

DIALOGUE SEQUENCE:
{{DIALOGUE_SEQUENCE}}

CONTENT CONTEXT: This dialogue covers {{TOPIC}}. Focus on creating images that explain complex technical concepts visually.

INSTRUCTIONS - TECHNICAL FOCUS:
1. Prioritize images that explain KEY TECHNICAL CONCEPTS, not character jokes or personality traits
2. Focus on architectural diagrams, process flows, and technical workflows
3. Include images for system architectures, data flows, and technical processes
4. Create concise, technically accurate descriptions suitable for AI image generation
5. Emphasize visual clarity and technical accuracy over humor

TECHNICAL IMAGE TYPES TO PRIORITIZE:
- System Architecture Diagrams (how components interact)
- Process Flow Visualizations (step-by-step workflows)
- Container Lifecycle Illustrations (creation, deployment, scaling)
- Infrastructure Comparisons (VMs vs Containers, etc.)
- Network and Data Flow Diagrams
- Configuration and Setup Visualizations
- Performance and Efficiency Comparisons

AVOID:
- Character-specific jokes or personality depictions
- Forced analogies that don't help technical understanding
- Images that don't directly relate to the technical concepts being discussed
- Overly literal interpretations of character dialogue

For each image you recommend, provide:
- EXACT timestamp where it should appear (be precise)
- Type of image (architecture, process, comparison, diagram, workflow)
- TECHNICAL title (max 6 words, focused on the concept)
- DETAILED technical description for AI image generation
- Priority level (high/medium/low) - prioritize technical clarity and learning value

GOAL: Create a technically accurate visual experience that helps viewers understand complex DevOps and containerization concepts.
`;

  // 🎯 8. AI ANALYSIS FOR IMAGE REQUIREMENTS WITH GOOGLE SEARCH AND USER IMAGES
  static async analyzeDialogueForImages(
    sessionId: string,
    assData: AssFileData,
    topic: string,
    userProvidedImages?: UserProvidedImage[]
  ): Promise<ImageEmbeddingPlan> {
    try {
      console.log('🤖 [AI] Starting enhanced AI analysis with Google search for technical diagrams');

      const { entries } = assData;
      const imageTimings = AssFileProcessor.generateImageTimingFromAss(assData, 'ultra'); // Use ultra density for more images

      // 🎯 9. TECHNICAL RESEARCH FOR BETTER IMAGE IDEAS
      console.log('🔍 [SEARCH] Researching technical concepts for visual diagrams:', topic);
      const researchPrompt = `Research the technical topic "${topic}" and suggest specific visual diagrams and illustrations that would effectively explain key technical concepts. Focus on:

1. System architecture diagrams and component interactions
2. Process flows and technical workflows
3. Infrastructure comparisons and technical trade-offs
4. Container lifecycle and deployment visualizations
5. Network topologies and data flow diagrams

Provide specific, technical diagram concepts that would work well in educational video content about DevOps and containerization. Focus on diagrams that actually help explain the technology, not character-based humor or forced analogies.`;

      const researchResult = await generateText({
        model: google('models/gemini-2.5-flash'),
        prompt: researchPrompt,
        tools: {
          google_search: google.tools.googleSearch({}),
        }
      });

      const visualResearch = researchResult.text;
      console.log('✅ [SEARCH] Technical research completed');

      // 🎯 10. PREPARE ENHANCED DIALOGUE SEQUENCE FOR AI
      const dialogueSequence = entries
        .map(entry => `[${entry.startTime.toFixed(1)}s] ${entry.character || 'Narrator'}: ${entry.text}`)
        .join('\n');

      const enhancedPrompt = this.IMAGE_ANALYSIS_PROMPT
        .replace('{{DIALOGUE_SEQUENCE}}', dialogueSequence)
        .replace('{{TOPIC}}', topic) +
        `\n\nVISUAL RESEARCH CONTEXT:\n${visualResearch}\n\n` +
        (userProvidedImages?.length ? `\n\nUSER-PROVIDED IMAGES:\n${userProvidedImages.map(img => `- ${img.label}: ${img.description || 'No description'}`).join('\n')}\n\n` : '') +
        `Use this research to inspire creative, impactful image suggestions that maximize visual learning and engagement.` +
        (userProvidedImages?.length ? `\n\nEVALUATE USER IMAGES: Consider the user-provided images above. For each one, decide if it would be valuable to include in the video at an appropriate timestamp. If you decide to use a user image, create a corresponding image requirement with the exact same label and suggest the best timestamp for it.` : '');

      // 🎯 11. TECHNICAL IMAGE REQUIREMENT GENERATION WITH USER IMAGES
      const schema = z.object({
        imageRequirements: z.array(z.object({
          timestamp: z.number(),
          dialogueText: z.string(),
          character: z.string(),
          imageType: z.enum(['architecture', 'process', 'comparison', 'diagram', 'workflow', 'infrastructure', 'lifecycle']),
          title: z.string(),
          description: z.string(),
          priority: z.enum(['high', 'medium', 'low'])
        })),
        userImageDecisions: z.array(z.object({
          userImageLabel: z.string(),
          useImage: z.boolean(),
          timestamp: z.number().optional(),
          reasoning: z.string()
        })).optional()
      });

      const result = await generateObject({
        model: google('models/gemini-2.5-flash'),
        schema: schema as any,
        prompt: enhancedPrompt
      });

      // 🎯 12. CREATE IMAGE REQUIREMENTS WITH UNIQUE IDS AND USER IMAGE INTEGRATION
      const imageRequirements: ImageRequirement[] = (result.object as any).imageRequirements?.map((req: any, index: number) => ({
        id: `img_${sessionId}_${index}`,
        timestamp: req.timestamp || 0,
        dialogueText: req.dialogueText || '',
        character: req.character || '',
        imageType: req.imageType || 'diagram',
        title: req.title || '',
        description: req.description || '',
        priority: req.priority || 'medium',
        uploaded: false
      })) || [];

      // 🎯 13. PROCESS USER IMAGE DECISIONS WITH DETAILED FEEDBACK
      let userProvidedUsed = 0;
      const userImageDecisions = (result.object as any).userImageDecisions || [];

      console.log('📊 [AI] User Image Evaluation Results:');
      userImageDecisions.forEach((decision: any) => {
        const status = decision.useImage ? '✅ ACCEPTED' : '❌ REJECTED';
        console.log(`   ${status}: "${decision.userImageLabel}"`);
        if (decision.useImage) {
          console.log(`      📍 Will appear at ${decision.timestamp?.toFixed(1) || 'optimal'}s`);
        }
        console.log(`      💭 Reason: ${decision.reasoning}`);
        console.log('');
      });

      // Add user-provided images that AI decided to use
      userImageDecisions.forEach((decision: any) => {
        if (decision.useImage && userProvidedImages) {
          const userImage = userProvidedImages.find(img => img.label === decision.userImageLabel);
          if (userImage) {
            const imageReq: ImageRequirement = {
              id: `user_${sessionId}_${userProvidedUsed}`,
              timestamp: decision.timestamp || userImage.preferredTimestamp || 0,
              dialogueText: userImage.description || userImage.label,
              character: 'System',
              imageType: 'diagram', // Default type for user images
              title: userImage.label,
              description: userImage.description || `User-provided image: ${userImage.label}`,
              priority: userImage.priority || 'medium',
              uploaded: true,
              imagePath: userImage.imagePath
            };
            imageRequirements.push(imageReq);
            userProvidedUsed++;
          }
        }
      });

      // 📊 CALCULATE SUMMARY STATISTICS
      const highPriority = imageRequirements.filter(req => req.priority === 'high').length;
      const mediumPriority = imageRequirements.filter(req => req.priority === 'medium').length;
      const lowPriority = imageRequirements.filter(req => req.priority === 'low').length;

      const plan: ImageEmbeddingPlan = {
        sessionId,
        totalDuration: assData.metadata.duration,
        imageRequirements,
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

      console.log('✅ [AI] Enhanced technical diagram analysis completed successfully');
      console.log(`📊 [AI] Generated ${imageRequirements.length} technical diagram requirements with Google search research`);
      if (userProvidedImages?.length) {
        console.log(`📊 [AI] Evaluated ${userProvidedImages.length} user images, using ${userProvidedUsed}`);
      }

      return plan;

    } catch (error) {
      console.error('❌ [AI] Error in enhanced AI analysis:', error);
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

      console.log('💾 [SAVE] Image plan saved to:', filePath);
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

      console.log('📖 [LOAD] Image plan loaded from:', filePath);
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
  static saveUserImages(images: UserProvidedImage[], outputDir: string = './temp'): string {
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filePath = path.join(outputDir, `user_images_${Date.now()}.json`);
      fs.writeFileSync(filePath, JSON.stringify(images, null, 2));

      console.log('💾 [USER] User images saved to:', filePath);
      return filePath;

    } catch (error) {
      console.error('❌ [USER] Error saving user images:', error);
      throw new Error(`Failed to save user images: ${error}`);
    }
  }

  // 📖 LOAD USER IMAGES FROM FILE
  static loadUserImages(filePath: string): UserProvidedImage[] {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const images = JSON.parse(content) as UserProvidedImage[];

      console.log('📖 [USER] User images loaded from:', filePath);
      return images;

    } catch (error) {
      console.error('❌ [USER] Error loading user images:', error);
      throw new Error(`Failed to load user images: ${error}`);
    }
  }
}
export class ImageEmbeddingService {
  // 🚀 MAIN WORKFLOW - ANALYZE AND GENERATE IMAGE PLAN WITH USER-PROVIDED IMAGES
  static async generateImageEmbeddingPlan(
    sessionId: string,
    assFilePath: string,
    topic: string,
    userProvidedImages?: UserProvidedImage[],
    density: 'low' | 'medium' | 'high' | 'ultra' = 'ultra'
  ): Promise<ImageEmbeddingPlan> {
    try {
      console.log('🎬 [SERVICE] Starting enhanced technical diagram analysis for session:', sessionId);
      console.log('🎬 [SERVICE] Using ultra-high density for maximum technical visualization');
      if (userProvidedImages?.length) {
        console.log(`🎬 [SERVICE] Evaluating ${userProvidedImages.length} user-provided images`);
      }

      // 📖 READ AND PARSE ASS FILE
      const assContent = fs.readFileSync(assFilePath, 'utf8');
      const assData = AssFileProcessor.parseAssFile(assContent);

      console.log(`📊 [SERVICE] Parsed ASS file: ${assData.entries.length} dialogue entries, ${assData.metadata.duration}s duration`);

      // 🤖 ENHANCED AI ANALYSIS WITH GOOGLE SEARCH AND USER IMAGES
      const imagePlan = await ImageEmbeddingAnalyzer.analyzeDialogueForImages(sessionId, assData, topic, userProvidedImages);

      // 💾 SAVE PLAN TO FILE
      const planFilePath = await ImageEmbeddingAnalyzer.saveImagePlan(imagePlan);

      console.log('✅ [SERVICE] Enhanced technical diagram plan generated successfully');
      console.log(`📊 [SERVICE] Plan includes ${imagePlan.summary.totalImages} technical diagrams for maximum educational impact`);
      if (userProvidedImages?.length) {
        console.log(`📊 [SERVICE] ${imagePlan.summary.userProvidedUsed} user-provided images incorporated`);
      }

      return imagePlan;

    } catch (error) {
      console.error('❌ [SERVICE] Error generating enhanced image embedding plan:', error);
      throw new Error(`Failed to generate image embedding plan: ${error}`);
    }
  }

  // 📋 FORMAT ENHANCED PLAN FOR USER DISPLAY
  static formatPlanForUser(plan: ImageEmbeddingPlan): string {
    const progress = ImageEmbeddingAnalyzer.getUploadProgress(plan);

    let output = `🎨 **ENHANCED IMAGE EMBEDDING PLAN FOR SESSION: ${plan.sessionId}**\n\n`;
    output += `🚀 **ENHANCED FEATURES:**\n`;
    output += `• Technical diagram focus (architectures, workflows, comparisons)\n`;
    output += `• Extended image display duration (3+ seconds per image)\n`;
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

      output += `${index + 1}. **${req.title}** ${status}\n`;
      output += `   ${priorityEmoji} Priority: ${req.priority.toUpperCase()}\n`;
      output += `   ${typeEmoji} Type: ${req.imageType}\n`;
      output += `   🕒 Timestamp: ${req.timestamp.toFixed(1)}s (3s display)\n`;
      output += `   👤 Character: ${req.character}\n`;
      output += `   � Context: "${req.dialogueText.substring(0, 60)}${req.dialogueText.length > 60 ? '...' : ''}"\n`;
      output += `   🎨 AI Description: ${req.description}\n\n`;
    });

    output += `📤 **NEXT STEPS:**\n`;
    output += `1. Upload the required images using the ultra-concise titles above\n`;
    output += `2. Each image will display for 3+ seconds at its timestamp\n`;
    output += `3. The system will create maximum visual impact with frequent, creative imagery\n\n`;

    output += `💡 **ENHANCED TIPS:**\n`;
    output += `• Images focus on technical diagrams and architectures\n`;
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
    device: string = 'cuda'
  ): Promise<{ success: boolean; videoPath?: string; error?: string }> {
    try {
      console.log('🎨 [SERVICE] ENHANCED VIDEO GENERATION with technical diagram embeddings');
      console.log('🎨 [SERVICE] Session ID:', sessionId);
      console.log('🎨 [SERVICE] Background video:', backgroundVideoPath);
      console.log('🎨 [SERVICE] Device:', device);
      console.log('🎨 [SERVICE] Enhanced technical diagram plan has', imagePlan.imageRequirements?.length || 0, 'requirements');
      console.log('🎨 [SERVICE] Features: Technical diagrams, 3s display duration, Google search research');

      // Check which images are actually uploaded
      const uploadedImages = imagePlan.imageRequirements.filter(req => req.uploaded && req.imagePath);
      const missingImages = imagePlan.imageRequirements.filter(req => !req.uploaded || !req.imagePath);

      // Also check for user-provided images
      let userProvidedImages: UserProvidedImage[] = [];
      try {
        const userImagesFile = path.join(process.cwd(), 'temp', `${sessionId}_user_images.json`);
        if (fs.existsSync(userImagesFile)) {
          userProvidedImages = UserImageManager.loadUserImages(userImagesFile);
          console.log(`👤 [SERVICE] Found ${userProvidedImages.length} user-provided images`);
        }
      } catch (error) {
        console.warn('⚠️ [SERVICE] Could not load user-provided images:', error);
      }

      const totalAvailableImages = uploadedImages.length + userProvidedImages.length;

      console.log(`📊 [SERVICE] Image status: ${uploadedImages.length} AI requirements uploaded, ${userProvidedImages.length} user-provided, ${missingImages.length} missing`);
      console.log(`📊 [SERVICE] Total available images: ${totalAvailableImages}`);
      console.log(`📊 [SERVICE] Expected images per minute: ${((imagePlan.summary.totalImages / imagePlan.totalDuration) * 60).toFixed(1)}`);

      if (missingImages.length > 0) {
        console.log('⚠️ [SERVICE] Proceeding with available images. Missing AI-generated images will be skipped.');
        missingImages.slice(0, 5).forEach(img => { // Show first 5 missing
          console.log(`   - ${img.title} (${img.imageType}, ${img.priority} priority)`);
        });
        if (missingImages.length > 5) {
          console.log(`   ... and ${missingImages.length - 5} more`);
        }
      }

      if (userProvidedImages.length > 0) {
        console.log('👤 [SERVICE] User-provided images available:');
        userProvidedImages.forEach(img => {
          console.log(`   - ${img.label} (${img.priority} priority) - ${img.description || 'No description'}`);
        });
      }

      // Check if we have an existing ASS file from analysis that we can reuse
      const existingAssPath = path.join(process.cwd(), 'temp', `${sessionId}_subtitles.ass`);

      if (fs.existsSync(existingAssPath)) {
        console.log('🎯 [SERVICE] Found existing ASS file from analysis, will reuse for video generation');
        console.log('🎯 [SERVICE] Existing ASS path:', existingAssPath);

        // Copy the existing ASS file to the expected location for video generation
        const videoAssPath = path.join(process.cwd(), 'generated_videos', `${sessionId}_styled_subtitles.ass`);
        fs.copyFileSync(existingAssPath, videoAssPath);
        console.log('✅ [SERVICE] Reused existing ASS file for video generation');
      } else {
        console.log('⚠️ [SERVICE] No existing ASS file found, video generator will create new one');
      }

      // Import the video generator service
      const { generateVideoWithSubtitles } = await import('./videoGenerator');

      // Generate the base video with subtitles
      const baseVideoResult = await generateVideoWithSubtitles(sessionId, backgroundVideoPath, device);

      if (!baseVideoResult.success) {
        return {
          success: false,
          error: `Failed to generate base video: ${baseVideoResult.error}`
        };
      }

      // 🎨 IMPLEMENT ACTUAL IMAGE EMBEDDING
      console.log('🎨 [SERVICE] Base video generated successfully.');
      console.log('🎨 [SERVICE] Now implementing image embedding...');

      if (totalAvailableImages === 0) {
        console.log('🎨 [SERVICE] No uploaded images found (AI requirements or user-provided), returning base video');
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
        console.log('🎨 [SERVICE] No uploaded images found (AI requirements or user-provided) - returning enhanced base video with subtitles');
        console.log('💡 [SERVICE] Upload technical diagram images to unlock enhanced educational visualization');
        return {
          success: true,
          videoPath: baseVideoResult.videoPath
        };
      }

      console.log('🎨 [SERVICE] Proceeding with technical diagram embedding...');
      console.log(`🎨 [SERVICE] Will embed ${totalAvailableImages} images (${uploadedImages.length} AI-generated + ${userProvidedImages.length} user-provided) for maximum educational impact`);

      const finalVideoResult = await this.embedImagesInVideo(
        baseVideoResult.videoPath,
        uploadedImages,
        sessionId,
        userProvidedImages // Pass user-provided images
      );

      return finalVideoResult;

    } catch (error) {
      console.error('❌ [SERVICE] Error generating video with embedded images:', error);
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
      console.log('🎨 [EMBED] Starting image embedding process');
      console.log(`🎨 [EMBED] Base video: ${baseVideoPath}`);
      console.log(`🎨 [EMBED] AI-generated images to embed: ${uploadedImages.length}`);
      console.log(`🎨 [EMBED] User-provided images to embed: ${userProvidedImages.length}`);

      // Filter out AI-generated images without valid paths
      const validAiImages = uploadedImages.filter(img => img.imagePath);

      // User-provided images are already validated during upload, so all should be valid
      const validUserImages = userProvidedImages.filter(img => fs.existsSync(img.imagePath));

      const totalValidImages = validAiImages.length + validUserImages.length;

      console.log(`🎨 [EMBED] Valid AI-generated images: ${validAiImages.length}`);
      console.log(`🎨 [EMBED] Valid user-provided images: ${validUserImages.length}`);
      console.log(`🎨 [EMBED] Total valid images: ${totalValidImages}`);

      // If no valid images, return the base video
      if (totalValidImages === 0) {
        console.log('🎨 [EMBED] No valid images to embed, returning base video');
        return {
          success: true,
          videoPath: baseVideoPath,
          videoFile: {
            filename: path.basename(baseVideoPath),
            path: baseVideoPath,
            fileSize: fs.statSync(baseVideoPath).size,
            sessionId: sessionId
          }
        };
      }

      // Validate base video exists
      if (!fs.existsSync(baseVideoPath)) {
        console.error(`❌ [EMBED] Base video file does not exist: ${baseVideoPath}`);
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
          console.error(`❌ [EMBED] Image file does not exist: ${img.path}`);
          return {
            success: false,
            error: `Image file not found: ${img.path}`
          };
        }

        // Check file size (basic validation)
        const stats = fs.statSync(img.path);
        if (stats.size === 0) {
          console.error(`❌ [EMBED] Image file is empty: ${img.path}`);
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
      const outputVideoPath = path.join(process.cwd(), 'generated_videos', `${sessionId}_with_images.mp4`);

      // Build FFmpeg command with image overlays
      let ffmpegCommand = ffmpeg().input(baseVideoPath);
      console.log(`🎨 [EMBED] Added base video input: ${baseVideoPath}`);

      // Combine and sort all images by timestamp
      const allImages = [
        ...validAiImages.map(img => ({
          path: img.imagePath!,
          timestamp: img.timestamp,
          title: img.title,
          type: 'ai' as const
        })),
        ...validUserImages.map((img, index) => ({
          path: img.imagePath,
          timestamp: img.preferredTimestamp || (index * 5) + 2, // Spread user images every 5 seconds starting at 2s if no preferred timestamp
          title: img.label,
          type: 'user' as const
        }))
      ].sort((a, b) => a.timestamp - b.timestamp); // Sort by timestamp

      console.log('🎨 [EMBED] Image schedule:');
      allImages.forEach((img, index) => {
        console.log(`   ${index + 1}. ${img.title} (${img.type}) - ${img.timestamp.toFixed(1)}s`);
      });

      // Add image inputs
      allImages.forEach((image, index) => {
        ffmpegCommand = ffmpegCommand.input(image.path);
        console.log(`🎨 [EMBED] Added image input ${index + 1}: ${image.path} (${image.title}) - ${image.type}`);
      });

      // Build filter chain for image overlays
      let filterChain = '';

      // Add image overlay filters
      allImages.forEach((image, index) => {
        const inputIndex = index + 1; // FFmpeg inputs start at 1 (0 is base video)
        const startTime = image.timestamp;
        const duration = 3; // Show image for 3 seconds
        const endTime = startTime + duration;

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
        console.log('🎨 [EMBED] No images to embed, using copy filter');
      } else {
        console.log(`🎨 [EMBED] Generated filter chain for ${allImages.length} image(s)`);
      }

      console.log('🎨 [EMBED] Filter chain:', filterChain);
      console.log('🎨 [EMBED] Number of images to embed:', allImages.length);
      console.log('🎨 [EMBED] Image positioning: Centered horizontally in top half at y=40, 960x720 taller size, maintains aspect ratio');

      // Validate filter chain before proceeding
      if (!filterChain || filterChain.trim() === '') {
        console.error('❌ [EMBED] Empty filter chain generated');
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
          console.warn(`⚠️ [EMBED] Filter chain may have incorrect label count. Expected ${expectedLabels}, found ${labelCount}`);
        }
      }

      // Execute FFmpeg command
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
            console.log('🎨 [EMBED] FFmpeg command:', commandLine);
            console.log('🎨 [EMBED] Filter chain being used:', filterChain);
          })
          .on('progress', (progress: any) => {
            // Progress logging removed - only log when done
          })
          .on('end', () => {
            console.log('✅ [EMBED] Image embedding completed successfully');
            console.log(`🎨 [EMBED] Output video: ${outputVideoPath}`);

            // Check if output file exists and has content
            if (fs.existsSync(outputVideoPath)) {
              const stats = fs.statSync(outputVideoPath);
              console.log(`🎨 [EMBED] Output file size: ${stats.size} bytes`);

              if (stats.size === 0) {
                console.error('❌ [EMBED] Output file is empty');
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
              console.error('❌ [EMBED] Output file was not created');
              resolve({
                success: false,
                error: 'FFmpeg completed but output file was not created'
              });
            }
          })
          .on('error', (err: any) => {
            console.error('❌ [EMBED] FFmpeg error:', err);
            console.error('❌ [EMBED] Error message:', err.message);
            console.error('❌ [EMBED] Error code:', err.code);
            console.error('❌ [EMBED] Filter chain that failed:', filterChain);
            resolve({
              success: false,
              error: `FFmpeg embedding failed: ${err.message}`
            });
          })
          .run();
      });

    } catch (error) {
      console.error('❌ [EMBED] Error in image embedding:', error);
      return {
        success: false,
        error: `Failed to embed images: ${error}`
      };
    }
  }

  // 🎯 USER IMAGE PLACEMENT SUGGESTIONS
  static async getUserImagePlacementSuggestions(
    sessionId: string,
    assFilePath: string,
    topic: string,
    userImages: UserProvidedImage[]
  ): Promise<UserImageSuggestion[]> {
    try {
      console.log('🎯 [SUGGESTIONS] Analyzing user images for placement suggestions...');

      // Parse ASS file to get dialogue entries
      const assContent = fs.readFileSync(assFilePath, 'utf8');
      const assData = AssFileProcessor.parseAssFile(assContent);
      const dialogueEntries = assData.entries.filter((entry: AssSubtitleEntry) =>
        entry.text && entry.text.length > 10 // Filter meaningful dialogue
      );

      console.log(`📊 [SUGGESTIONS] Found ${dialogueEntries.length} dialogue entries in ASS file`);
      console.log(`📊 [SUGGESTIONS] First entry: ${dialogueEntries[0]?.startTime}s - "${dialogueEntries[0]?.text?.substring(0, 50)}..."`);
      console.log(`📊 [SUGGESTIONS] Last entry: ${dialogueEntries[dialogueEntries.length - 1]?.startTime}s`);

      if (dialogueEntries.length === 0) {
        console.error('❌ [SUGGESTIONS] No valid dialogue entries found in ASS file');
        return [];
      }

      const suggestions: UserImageSuggestion[] = [];
      const usedTimestamps = new Set<number>(); // Track used timestamps to avoid clustering

      for (const userImage of userImages) {
        console.log(`📝 [SUGGESTIONS] Analyzing placement for: "${userImage.label}"`);

        // Use AI to analyze the image against dialogue content with distribution awareness
        const analysisPrompt = `
Analyze this user-provided image for placement in an educational video about "${topic}":

Image Label: "${userImage.label}"
Image Description: "${userImage.description || 'No description provided'}"

Available dialogue segments:
${dialogueEntries.map((entry: any, index: number) => 
  `${index + 1}. [${entry.startTime.toFixed(1)}s-${entry.endTime.toFixed(1)}s] ${entry.character || 'Speaker'}: "${entry.text}"`
).join('\n')}

IMPORTANT GUIDELINES:
1. Find the dialogue segment where this image would be MOST educationally valuable
2. Consider the content relevance - does the dialogue discuss concepts shown in the image?
3. Prefer distributing images across different timestamps rather than clustering them
4. Score relevance honestly: 10 = perfect match, 5-7 = good match, 1-4 = weak match, 0 = irrelevant
5. If multiple segments could work, choose the one that best explains the concept

Return your analysis focusing on educational value and content relevance.
`;

        const analysisSchema = z.object({
          bestDialogueIndex: z.number().min(0).describe("Index of best matching dialogue (0-based)"),
          relevanceScore: z.number().min(0).max(10).describe("Relevance score 0-10"),
          reasoning: z.string().describe("Detailed explanation for placement choice"),
          isRelevant: z.boolean().describe("Whether image should be included"),
          alternativeIndices: z.array(z.number()).max(3).describe("Alternative dialogue indices")
        });

        try {
          const analysis = await generateObject({
            model: google('gemini-2.0-flash-exp'),
            prompt: analysisPrompt,
            schema: analysisSchema as any,
          });

          const result = analysis.object;
          
          // Validate and get the selected dialogue
          let dialogueIndex = Math.min(result.bestDialogueIndex, dialogueEntries.length - 1);
          let bestDialogue = dialogueEntries[dialogueIndex];
          
          // If this timestamp is too close to an already used one, try alternatives
          if (usedTimestamps.has(Math.round(bestDialogue.startTime))) {
            console.log(`⚠️ [SUGGESTIONS] Timestamp ${bestDialogue.startTime}s already used, trying alternatives...`);
            
            for (const altIndex of result.alternativeIndices) {
              if (altIndex < dialogueEntries.length) {
                const altDialogue = dialogueEntries[altIndex];
                if (!usedTimestamps.has(Math.round(altDialogue.startTime))) {
                  dialogueIndex = altIndex;
                  bestDialogue = altDialogue;
                  console.log(`✅ [SUGGESTIONS] Using alternative at ${altDialogue.startTime}s`);
                  break;
                }
              }
            }
          }
          
          if (!result.isRelevant || result.relevanceScore < 3) {
            console.log(`⚠️ [SUGGESTIONS] Image "${userImage.label}" not relevant (score: ${result.relevanceScore})`);
            continue; // Skip irrelevant images
          }

          // Mark this timestamp as used
          usedTimestamps.add(Math.round(bestDialogue.startTime));

          // Calculate alternative placements (excluding used timestamps)
          const alternatives = result.alternativeIndices
            .filter(idx => idx !== dialogueIndex && idx < dialogueEntries.length)
            .filter(idx => !usedTimestamps.has(Math.round(dialogueEntries[idx].startTime)))
            .slice(0, 2)
            .map(idx => ({
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

          console.log(`✅ [SUGGESTIONS] "${userImage.label}" -> ${bestDialogue.startTime}s (score: ${result.relevanceScore})`);

        } catch (aiError) {
          console.error(`❌ [SUGGESTIONS] AI analysis failed for "${userImage.label}":`, aiError);
          
          // Fallback to distributed keyword matching
          let bestMatch = { dialogueIndex: 0, score: 0, reasoning: 'Fallback keyword matching' };
          
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
          
          if (bestMatch.score > 0) {
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
              relevanceScore: Math.min(bestMatch.score, 6), // Cap fallback scores
              suggestedDuration: 4.0,
              alternativePlacements: []
            });
            
            console.log(`✅ [SUGGESTIONS] "${userImage.label}" -> ${bestDialogue.startTime}s (fallback, score: ${bestMatch.score})`);
          }
        }
      }

      // Remove duplicate suggestions and sort by relevance
      const uniqueSuggestions = suggestions.filter((suggestion, index, self) => 
        index === self.findIndex(s => s.userImageId === suggestion.userImageId)
      );
      
      uniqueSuggestions.sort((a, b) => b.relevanceScore - a.relevanceScore);

      console.log(`✅ [SUGGESTIONS] Generated ${uniqueSuggestions.length} placement suggestions`);
      console.log(`📊 [SUGGESTIONS] Timestamp distribution:`, uniqueSuggestions.map(s => `${s.suggestedTimestamp}s`).join(', '));
      
      return uniqueSuggestions;

    } catch (error) {
      console.error('❌ [SUGGESTIONS] Error generating user image placement suggestions:', error);
      throw error;
    }
  }
          
          // Fallback to keyword matching
          let bestMatch = { dialogueIndex: 0, score: 0, reasoning: 'Fallback keyword matching' };
          
          dialogueEntries.forEach((entry: any, index: number) => {
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
              bestMatch = { dialogueIndex: index, score, reasoning: `Keyword matches: ${searchTerms.filter(term => dialogueText.includes(term)).join(', ')}` };
            }
          });
          
          if (bestMatch.score > 0) {
            const bestDialogue = dialogueEntries[bestMatch.dialogueIndex];
            suggestions.push({
              userImageId: userImage.id,
              userImageLabel: userImage.label,
              suggestedTimestamp: bestDialogue.startTime,
              dialogueIndex: bestMatch.dialogueIndex + 1,
              dialogueText: bestDialogue.text,
              character: bestDialogue.character || 'Speaker',
              reasoning: bestMatch.reasoning,
              relevanceScore: Math.min(bestMatch.score, 6), // Cap fallback scores
              suggestedDuration: 4.0,
              alternativePlacements: []
            });
          }
        }
      }

      // Remove duplicate suggestions and sort by relevance
      const uniqueSuggestions = suggestions.filter((suggestion, index, self) => 
        index === self.findIndex(s => s.userImageId === suggestion.userImageId)
      );
      
      uniqueSuggestions.sort((a, b) => b.relevanceScore - a.relevanceScore);

      console.log(`✅ [SUGGESTIONS] Generated ${uniqueSuggestions.length} placement suggestions`);
      return uniqueSuggestions;

    } catch (error) {
      console.error('❌ [SUGGESTIONS] Error generating user image placement suggestions:', error);
      throw error;
    }
  }
}
