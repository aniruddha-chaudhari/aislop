import * as fs from 'fs';
import * as path from 'path';
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
import { spawn } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
const FormData = require('form-data');
import { PrismaClient } from '../generated/prisma';

// Initialize Prisma client
const prisma = new PrismaClient();

// WhisperX API configuration
const WHISPERX_API_URL = 'http://127.0.0.1:6000'; // Adjust this URL as needed

// Set ffmpeg path
const ffmpegPath = ffmpegInstaller.path;
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log('🎬 [INIT] FFmpeg path set to:', ffmpegPath);
} else {
  console.log('⚠️ [INIT] FFmpeg path not found, using system default');
}

// Video generation configuration
const VIDEO_OUTPUT_DIR = path.join(process.cwd(), 'generated_videos');
const TEMP_DIR = path.join(process.cwd(), 'temp_alignment');

// Ensure directories exist
[VIDEO_OUTPUT_DIR, TEMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 [INIT] Created directory: ${dir}`);
  }
});

const CHARACTER_IMAGES = {
  Stewie: 'F:\\Aniruddha\\code\\webdev\\PROJECTS\\aislop\\src\\character_images\\Stewie_Griffin.png',
  Peter: 'F:\\Aniruddha\\code\\webdev\\PROJECTS\\aislop\\src\\character_images\\peter.png'
};

// Pre-scaled character image cache for better performance
const PRESCALED_CHARACTER_CACHE_DIR = path.join(process.cwd(), 'src', 'character_images', 'prescaled');

// Ensure prescaled cache directory exists
if (!fs.existsSync(PRESCALED_CHARACTER_CACHE_DIR)) {
  fs.mkdirSync(PRESCALED_CHARACTER_CACHE_DIR, { recursive: true });
  console.log(`📁 [INIT] Created prescaled character cache directory: ${PRESCALED_CHARACTER_CACHE_DIR}`);
}

// Function to get or create prescaled character images
async function getOrCreatePrescaledCharacterImage(characterName: string, width: number, height: number): Promise<string> {
  const originalPath = CHARACTER_IMAGES[characterName as keyof typeof CHARACTER_IMAGES];
  if (!originalPath || !fs.existsSync(originalPath)) {
    throw new Error(`Character image not found: ${characterName}`);
  }

  const prescaledFilename = `${characterName}_${width}x${height}.png`;
  const prescaledPath = path.join(PRESCALED_CHARACTER_CACHE_DIR, prescaledFilename);

  // Check if prescaled version already exists and is newer than original
  if (fs.existsSync(prescaledPath)) {
    const originalStats = fs.statSync(originalPath);
    const prescaledStats = fs.statSync(prescaledPath);
    
    if (prescaledStats.mtime > originalStats.mtime) {
      console.log(`🖼️ [CACHE] Using cached prescaled image: ${prescaledFilename}`);
      return prescaledPath;
    }
  }

  // Create prescaled version
  console.log(`🔄 [PRESCALE] Creating prescaled ${characterName} image: ${width}x${height}`);
  
  await new Promise<void>((resolve, reject) => {
    ffmpeg(originalPath)
      .outputOptions([
        '-vf', `scale=${width}:${height}:flags=lanczos,format=yuva420p`,
        '-y' // Overwrite existing files
      ])
      .output(prescaledPath)
      .on('end', () => {
        console.log(`✅ [PRESCALE] Created prescaled image: ${prescaledFilename}`);
        resolve();
      })
      .on('error', (err: any) => {
        console.error(`❌ [PRESCALE] Failed to create prescaled image for ${characterName}:`, err);
        reject(err);
      })
      .run();
  });

  return prescaledPath;
}

// Subtitle styling configuration
const SUBTITLE_STYLES = {
  fontName: 'Arial-Black', // Changed from 'Arial Black' to avoid space issues
  fontSize: 58, // Increased from 32 to 58 for better mobile visibility
  primaryColor: '&H00FFFFFF', // White text
  secondaryColor: '&H000000FF', // Blue for karaoke
  outlineColor: '&H00000000', // Black outline
  backColor: '&H80000000', // Semi-transparent black background
  bold: 1,
  italic: 0,
  borderStyle: 1,
  outline: 3,
  shadow: 2,
  alignment: 2, // Bottom center
  marginV: 700 // Increased for mobile optimization (1920px height)
};

// Character-specific color scheme
const CHARACTER_COLORS = {
  Stewie: '&H0000FFFF', // Yellow for Stewie
  Peter: '&H00FF0000', // Blue for Peter
  default: '&H00FFFFFF' // White default
};

// Word-level timestamp interface
export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface DialogueTimestamp {
  character: string;
  text: string;
  audioPath: string;
  words: WordTimestamp[];
  totalStart: number;
  totalEnd: number;
}

// WhisperX alignment function using FastAPI
export async function getWhisperXAlignment(audioPath: string, text: string): Promise<WordTimestamp[]> {
  console.log('🎯 [ALIGNMENT] Starting WhisperX alignment via API for:', path.basename(audioPath));

  try {
    // First, check if WhisperX API is available
    try {
      const healthCheck = await axios.get(`${WHISPERX_API_URL}/health`, { timeout: 5000 });
      console.log('✅ [ALIGNMENT] WhisperX API is healthy:', healthCheck.data.status);
    } catch (healthError) {
      console.warn('⚠️ [ALIGNMENT] WhisperX API health check failed, falling back to basic timing');
      return await generateBasicWordTimestamps(audioPath, text);
    }

    // Create form data for the API request
    const formData = new FormData();

    // Read audio file and append to form data
    const audioBuffer = fs.readFileSync(audioPath);
    const fileName = path.basename(audioPath);
    formData.append('audio', audioBuffer, {
      filename: fileName,
      contentType: 'audio/wav'
    });

    formData.append('text', text);
    formData.append('device', 'cpu'); // Use CPU by default, change to 'cuda' if GPU available
    formData.append('model', 'base'); // You can make this configurable
    formData.append('language', 'en');
    formData.append('clean', 'false'); // Word-level timestamps for karaoke

    console.log('📤 [ALIGNMENT] Sending request to WhisperX API...');

    // Make request to WhisperX API
    const response = await axios.post(`${WHISPERX_API_URL}/align`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Content-Type': `multipart/form-data; boundary=${formData.getBoundary()}`
      },
      timeout: 120000 // 2 minutes timeout for processing
    });

    if (response.data.success && response.data.word_timestamps) {
      const wordTimestamps = response.data.word_timestamps;
      console.log(`✅ [ALIGNMENT] WhisperX API returned ${wordTimestamps.length} word timestamps`);

      // Validate and clean the timestamps
      const validTimestamps = wordTimestamps
        .filter((word: any) => word.word && typeof word.start === 'number' && typeof word.end === 'number')
        .map((word: any) => ({
          word: word.word.trim(),
          start: Math.max(0, word.start),
          end: Math.max(word.start, word.end),
          confidence: word.confidence || 1.0
        }));

      console.log(`✅ [ALIGNMENT] Processed ${validTimestamps.length} valid word timestamps`);
      return validTimestamps;
    } else {
      console.warn('⚠️ [ALIGNMENT] WhisperX API returned unsuccessful response, falling back to basic timing');
      return await generateBasicWordTimestamps(audioPath, text);
    }

  } catch (error) {
    console.error('❌ [ALIGNMENT] WhisperX API error:', error instanceof Error ? error.message : String(error));

    if (axios.isAxiosError(error)) {
      console.error('❌ [ALIGNMENT] Axios error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
    }

    // Fallback to basic timing estimation
    console.log('⚠️ [ALIGNMENT] Falling back to basic timing estimation');
    return await generateBasicWordTimestamps(audioPath, text);
  }
}

// Helper function to group word timestamps into sentence-level timestamps
function groupWordsIntoSentences(words: WordTimestamp[], originalText: string): Array<{
  text: string;
  start: number;
  end: number;
}> {
  if (!words || words.length === 0) {
    return [];
  }

  // Split original text into sentences using common sentence endings
  const sentenceEndings = /[.!?]+(?:\s+|$)/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = sentenceEndings.exec(originalText)) !== null) {
    const sentence = originalText.slice(lastIndex, match.index + match[0].length).trim();
    if (sentence) {
      sentences.push(sentence);
    }
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text as a sentence if any
  if (lastIndex < originalText.length) {
    const remaining = originalText.slice(lastIndex).trim();
    if (remaining) {
      sentences.push(remaining);
    }
  }

  // If no sentences found, treat entire text as one sentence
  if (sentences.length === 0) {
    sentences.push(originalText.trim());
  }

  console.log(`📝 [GROUP WORDS] Found ${sentences.length} sentences from text`);
  console.log(`🔤 [GROUP WORDS] Available ${words.length} word timestamps`);

  // Group words into sentences based on sentence boundaries
  const result: Array<{ text: string; start: number; end: number; }> = [];
  let wordIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentenceText = sentences[i];
    const sentenceWords: WordTimestamp[] = [];
    
    // Clean sentence text for better matching
    const cleanSentenceWords = sentenceText
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);

    console.log(`📝 [GROUP WORDS] Processing sentence ${i + 1}: "${sentenceText}" (${cleanSentenceWords.length} words)`);

    // Match words from the word timestamps to this sentence
    let wordsMatched = 0;
    const startWordIndex = wordIndex;

    while (wordIndex < words.length && wordsMatched < cleanSentenceWords.length) {
      const word = words[wordIndex];
      const cleanWord = word.word.toLowerCase().replace(/[^\w]/g, '');
      
      // Check if this word belongs to current sentence
      if (cleanWord && cleanSentenceWords.includes(cleanWord)) {
        sentenceWords.push(word);
        wordsMatched++;
      }
      
      wordIndex++;
      
      // If we've gone too far without finding matches, backtrack
      if (wordIndex - startWordIndex > cleanSentenceWords.length * 2) {
        break;
      }
    }

    // If we couldn't match enough words, include remaining words proportionally
    if (sentenceWords.length === 0 && wordIndex < words.length) {
      // Take next few words as fallback
      const wordsToTake = Math.min(5, words.length - wordIndex);
      for (let j = 0; j < wordsToTake; j++) {
        if (wordIndex + j < words.length) {
          sentenceWords.push(words[wordIndex + j]);
        }
      }
      wordIndex += wordsToTake;
    }

    if (sentenceWords.length > 0) {
      const start = sentenceWords[0].start;
      const end = sentenceWords[sentenceWords.length - 1].end;
      
      result.push({
        text: sentenceText,
        start: start,
        end: end
      });

      console.log(`✅ [GROUP WORDS] Sentence ${i + 1}: ${sentenceWords.length} words, ${start.toFixed(2)}s - ${end.toFixed(2)}s`);
    } else {
      console.warn(`⚠️ [GROUP WORDS] Could not match words for sentence: "${sentenceText}"`);
    }
  }

  console.log(`📊 [GROUP WORDS] Generated ${result.length} sentence timestamps from ${words.length} words`);
  return result;
}

// NEW: WhisperX clean alignment function for image analysis - generates sentence-level timestamps
export async function getWhisperXCleanAlignment(audioPath: string, text: string): Promise<{
  success: boolean;
  sentences?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  total_duration?: number;
  error?: string;
}> {
  console.log('🖼️ [CLEAN ALIGNMENT] Starting WhisperX clean sentence-level alignment for image analysis:', path.basename(audioPath));

  try {
    // First, check if WhisperX API is available
    try {
      const healthCheck = await axios.get(`${WHISPERX_API_URL}/health`, { timeout: 5000 });
      console.log('✅ [CLEAN ALIGNMENT] WhisperX API is healthy:', healthCheck.data.status);
    } catch (healthError) {
      console.warn('⚠️ [CLEAN ALIGNMENT] WhisperX API health check failed');
      return {
        success: false,
        error: 'WhisperX API not available'
      };
    }

    // Create form data for the API request
    const formData = new FormData();

    // Read audio file and append to form data
    const audioBuffer = fs.readFileSync(audioPath);
    const fileName = path.basename(audioPath);
    formData.append('audio', audioBuffer, {
      filename: fileName,
      contentType: 'audio/wav'
    });

    formData.append('text', text);
    formData.append('device', 'cpu'); // Use CPU by default
    formData.append('model', 'base');
    formData.append('language', 'en');
    formData.append('clean', 'true'); // Clean sentence-level timestamps for image analysis

    console.log('📤 [CLEAN ALIGNMENT] Sending request to WhisperX API for clean timestamps...');

    // Make request to WhisperX API
    const response = await axios.post(`${WHISPERX_API_URL}/align`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Content-Type': `multipart/form-data; boundary=${formData.getBoundary()}`
      },
      timeout: 120000 // 2 minutes timeout
    });

    if (response.data.success) {
      console.log(`✅ [CLEAN ALIGNMENT] WhisperX API returned clean sentence timestamps`);
      console.log(`📊 [CLEAN ALIGNMENT] Sentences found:`, response.data.sentences?.length || 0);
      console.log(`⏱️ [CLEAN ALIGNMENT] Total duration: ${response.data.total_duration?.toFixed(2) || 'unknown'}s`);

      // If no sentences returned, fall back to word timestamps and group them
      if (!response.data.sentences || response.data.sentences.length === 0) {
        console.log('🔄 [CLEAN ALIGNMENT] No sentences returned, falling back to word timestamps grouping');
        
        // Get regular word timestamps
        const wordResult = await getWhisperXAlignment(audioPath, text);
        
        if (wordResult && wordResult.length > 0) {
          // Group words into sentences
          const sentences = groupWordsIntoSentences(wordResult, text);
          console.log(`📊 [CLEAN ALIGNMENT] Generated ${sentences.length} sentences from word timestamps`);
          
          return {
            success: true,
            sentences: sentences,
            total_duration: response.data.total_duration
          };
        } else {
          console.warn('⚠️ [CLEAN ALIGNMENT] Could not get word timestamps either');
          return {
            success: false,
            error: 'Could not generate any timestamps'
          };
        }
      }

      return {
        success: true,
        sentences: response.data.sentences || [],
        total_duration: response.data.total_duration
      };
    } else {
      console.warn('⚠️ [CLEAN ALIGNMENT] WhisperX API returned unsuccessful response');
      return {
        success: false,
        error: response.data.error || 'Unknown error from WhisperX API'
      };
    }

  } catch (error) {
    console.error('❌ [CLEAN ALIGNMENT] WhisperX API error:', error instanceof Error ? error.message : String(error));

    if (axios.isAxiosError(error)) {
      console.error('❌ [CLEAN ALIGNMENT] Response status:', error.response?.status);
      console.error('❌ [CLEAN ALIGNMENT] Response data:', error.response?.data);
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Fallback basic timing function
export async function generateBasicWordTimestamps(audioPath: string, text: string): Promise<WordTimestamp[]> {
  console.log('⏱️ [BASIC] Generating basic timestamps for:', audioPath);

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err: any, metadata: any) => {
      if (err) {
        reject(err);
        return;
      }

      const duration = metadata.format.duration || 0;
      const words = text.split(/\s+/).filter(word => word.length > 0);

      // More sophisticated timing with pauses
      const avgWordsPerSecond = 2.5; // Typical speech rate
      const estimatedDuration = words.length / avgWordsPerSecond;
      const actualDuration = Math.min(duration, estimatedDuration * 1.2); // Add some buffer

      const timePerWord = actualDuration / words.length;

      const timestamps = words.map((word, index) => ({
        word: word.replace(/[^\w']/g, ''), // Keep apostrophes
        start: index * timePerWord,
        end: (index + 1) * timePerWord,
        confidence: 0.8 // Lower confidence for estimated timing
      }));

      resolve(timestamps);
    });
  });
}

// Generate SRT subtitle file with character names and timing
export function generateSRTSubtitles(dialogueTimestamps: DialogueTimestamp[], outputPath: string): void {
  console.log('📝 [SRT] Generating SRT subtitle file at:', outputPath);

  let srtContent = '';

  dialogueTimestamps.forEach((dialogue, dialogueIndex) => {
    const { character, text, totalStart, totalEnd } = dialogue;

    // Ensure valid timing (end time should be after start time)
    const validStart = Math.max(0, totalStart);
    const validEnd = Math.max(validStart + 0.1, totalEnd); // Minimum 0.1s duration

    // Format time for SRT (HH:MM:SS,mmm)
    const formatTime = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const millisecs = Math.floor((seconds % 1) * 1000);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millisecs.toString().padStart(3, '0')}`;
    };

    const startTime = formatTime(validStart);
    const endTime = formatTime(validEnd);

    // Add subtitle entry with character name
    srtContent += `${dialogueIndex + 1}\n`;
    srtContent += `${startTime} --> ${endTime}\n`;
    srtContent += `<font color="${character === 'Stewie' ? '#FFFF00' : character === 'Peter' ? '#0080FF' : '#FFFFFF'}"><b>${character}:</b></font> ${text}\n\n`;
  });

  fs.writeFileSync(outputPath, srtContent, 'utf8');
  console.log('✅ [SRT] Enhanced SRT subtitle file generated successfully');
}

// Generate ASS subtitle file with mobile-optimized 3-word rolling display
export function generateASSSubtitles(dialogueTimestamps: DialogueTimestamp[], outputPath: string): void {
  console.log('📝 [ASS] Generating mobile-optimized ASS subtitle file at:', outputPath);

  let assContent = `[Script Info]
Title: Mobile-Optimized Dialogue with 3-Word Rolling Display
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Normal,Arial-Black,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,2,30,30,800,1
Style: Highlight,Arial-Black,48,&H0000FFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,2,30,30,800,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  dialogueTimestamps.forEach((dialogue, dialogueIndex) => {
    const { words, character } = dialogue;

    // Process words in groups of 3 for better karaoke flow
    for (let i = 0; i < words.length; i += 3) {
      let wordGroup = words.slice(i, Math.min(i + 3, words.length));

      // Check if the text is too long for one line (estimate based on character count)
      const fullText = wordGroup.map(w => w.word || w).join(' ');
      const isTooLong = fullText.length > 25; // Rough estimate for mobile screens

      if (isTooLong && wordGroup.length > 2) {
        // Show first 2 words on first line, third word on second line
        const firstTwoWords = wordGroup.slice(0, 2);
        const thirdWord = wordGroup[2];

        // Create separate subtitle events for each line
        // Format time for ASS (H:MM:SS.CC)
        const formatTime = (seconds: number): string => {
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = Math.floor(seconds % 60);
          const centisecs = Math.floor((seconds % 1) * 100);
          return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
        };

        // Create karaoke effect for first two words + third word on new line
        // First, handle the first two words
        firstTwoWords.forEach((word, groupIndex) => {
          const wordStart = word.start;
          const wordEnd = groupIndex === firstTwoWords.length - 1 ?
            thirdWord.start : // End at start of third word
            firstTwoWords[groupIndex + 1].start;

          let subtitleText = '';
          firstTwoWords.forEach((groupWord, wordIdx) => {
            const wordText = groupWord.word || groupWord;

            if (wordIdx === groupIndex) {
              subtitleText += `{\\c&H0000FFFF&}${wordText}{\\c&H00FFFFFF&}`;
            } else {
              subtitleText += wordText;
            }

            if (wordIdx < firstTwoWords.length - 1) {
              subtitleText += ' ';
            }
          });

          // Add third word on new line (not highlighted yet)
          subtitleText += `\\N${thirdWord.word || thirdWord}`;

          const startTime = formatTime(wordStart);
          const endTime = formatTime(wordEnd);

          assContent += `Dialogue: 0,${startTime},${endTime},Normal,${character || 'Speaker'},0,0,0,,${subtitleText}\n`;
        });

        // Then handle the third word highlighting
        const thirdWordStart = thirdWord.start;
        const thirdWordEnd = i + 2 === words.length - 1 ? thirdWord.end : words[i + 3]?.start || thirdWord.end;

        let subtitleText = '';
        // First two words (not highlighted)
        firstTwoWords.forEach((groupWord, wordIdx) => {
          const wordText = groupWord.word || groupWord;
          subtitleText += wordText;
          if (wordIdx < firstTwoWords.length - 1) {
            subtitleText += ' ';
          }
        });

        // Third word highlighted on new line
        subtitleText += `\\N{\\c&H0000FFFF&}${thirdWord.word || thirdWord}{\\c&H00FFFFFF&}`;

        const startTime = formatTime(thirdWordStart);
        const endTime = formatTime(thirdWordEnd);

        assContent += `Dialogue: 0,${startTime},${endTime},Normal,${character || 'Speaker'},0,0,0,,${subtitleText}\n`;

        // Skip to next group since we handled this one specially
        continue;
      }

      // Create karaoke effect for this group
      wordGroup.forEach((word, groupIndex) => {
        // Calculate timing for this specific highlight state
        const wordStart = word.start;
        const wordEnd = groupIndex === wordGroup.length - 1 ?
          (i + groupIndex === words.length - 1 ? word.end : words[i + groupIndex + 1].start) :
          wordGroup[groupIndex + 1].start;

        // Build subtitle text for THIS SPECIFIC MOMENT
        let subtitleText = '';
        wordGroup.forEach((groupWord, wordIdx) => {
          const wordText = groupWord.word || groupWord;

          if (wordIdx === groupIndex) {
            // ONLY the current word being highlighted is yellow
            subtitleText += `{\\c&H0000FFFF&}${wordText}{\\c&H00FFFFFF&}`;
          } else {
            // All other words in the group are white
            subtitleText += wordText;
          }

          // Add space between words (except for last word)
          if (wordIdx < wordGroup.length - 1) {
            subtitleText += ' ';
          }
        });

        // Format time for ASS (H:MM:SS.CC)
        const formatTime = (seconds: number): string => {
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = Math.floor(seconds % 60);
          const centisecs = Math.floor((seconds % 1) * 100);
          return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
        };

        const startTime = formatTime(wordStart);
        const endTime = formatTime(wordEnd);

        // Add subtitle event for this specific highlight state
        assContent += `Dialogue: 0,${startTime},${endTime},Normal,${character || 'Speaker'},0,0,0,,${subtitleText}\n`;
      });
    }
  });

  // Ensure the directory exists before writing the file
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 [ASS] Created directory: ${outputDir}`);
  }

  fs.writeFileSync(outputPath, assContent, 'utf8');
  console.log('✅ [ASS] Mobile-optimized ASS subtitle file generated successfully');
}

// Main video generation function with burned-in subtitles
export async function generateVideoWithSubtitles(
  sessionId: string,
  backgroundVideoPath: string,
  device: string = 'cuda',
  backgroundVideoSpeed: number = 1.10 // Default 10% speed increase
): Promise<{
  success: boolean;
  message: string;
  videoPath?: string;
  videoFile?: any;
  stats?: any;
  error?: string;
  details?: string;
  processingTime?: number;
}> {
  const startTime = Date.now();

  try {
    // Validate device parameter
    if (!['cpu', 'cuda'].includes(device)) {
      throw new Error('Device must be either "cpu" or "cuda"');
    }

    // Validate speed parameter
    if (backgroundVideoSpeed <= 0 || backgroundVideoSpeed > 2) {
      throw new Error('Background video speed must be between 0.1 and 2.0');
    }

    console.log('🎬 [GENERATOR] Starting enhanced video generation with burned-in subtitles using device:', device);
    console.log('🚀 [GENERATOR] Background video speed:', backgroundVideoSpeed);

    // Validation
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    if (!backgroundVideoPath || !fs.existsSync(backgroundVideoPath)) {
      throw new Error('Invalid background video path');
    }

    // Get session data
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        dialogues: {
          include: { audioFile: true },
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!session) {
      throw new Error('Session not found');
    }

    const successfulDialogues = session.dialogues.filter(d => d.audioFile && d.audioFile.success);

    if (successfulDialogues.length === 0) {
      throw new Error('No successful audio files found');
    }

    console.log(`📝 [GENERATOR] Processing ${successfulDialogues.length} dialogues with enhanced timing`);

    // Pre-create scaled character images for better performance
    console.log('🔄 [PRESCALE] Pre-scaling character images for optimal performance...');
    const prescaledStewieImage = await getOrCreatePrescaledCharacterImage('Stewie', 500, 600);
    const prescaledPeterImage = await getOrCreatePrescaledCharacterImage('Peter', 550, 800);
    console.log('✅ [PRESCALE] Character images pre-scaled successfully');

    // Generate word-level timestamps using WhisperX
    const dialogueTimestamps: DialogueTimestamp[] = [];
    let cumulativeTime = 0;

    for (let i = 0; i < successfulDialogues.length; i++) {
      const dialogue = successfulDialogues[i];

      if (dialogue.audioFile) {

        // Get audio duration first
        const audioDuration = await new Promise<number>((resolve, reject) => {
          ffmpeg.ffprobe(dialogue.audioFile!.filePath, (err: any, metadata: any) => {
            if (err) reject(err);
            else resolve(metadata.format.duration || 0);
          });
        });

        // Get word-level timestamps
        const wordTimestamps = await getWhisperXAlignment(dialogue.audioFile.filePath, dialogue.text);

        // Adjust timestamps to cumulative timeline
        const adjustedWords = wordTimestamps.map(word => ({
          ...word,
          start: word.start + cumulativeTime,
          end: word.end + cumulativeTime
        }));

        dialogueTimestamps.push({
          character: dialogue.character,
          text: dialogue.text,
          audioPath: dialogue.audioFile.filePath,
          words: adjustedWords,
          totalStart: cumulativeTime,
          totalEnd: cumulativeTime + audioDuration
        });

        cumulativeTime += audioDuration;
      }
    }

    // Create concatenated audio file
    const tempAudioPath = path.join(VIDEO_OUTPUT_DIR, `${sessionId}_temp_audio.wav`);
    const audioInputs = successfulDialogues
      .map(d => d.audioFile!.filePath)
      .map(path => `file '${path}'`)
      .join('\n');

    const audioListPath = path.join(VIDEO_OUTPUT_DIR, `${sessionId}_audio_list.txt`);
    fs.writeFileSync(audioListPath, audioInputs);

    // Concatenate audio
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(audioListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .audioCodec('pcm_s16le')
        .output(tempAudioPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });

    // Generate styled subtitle files
    const srtSubtitlePath = path.join(VIDEO_OUTPUT_DIR, `${sessionId}_styled_subtitles.srt`);
    const assSubtitlePath = path.join(VIDEO_OUTPUT_DIR, `${sessionId}_styled_subtitles.ass`);
    
    // Check if ASS file already exists (copied from analysis)
    if (fs.existsSync(assSubtitlePath)) {
      console.log('🎯 [SUBTITLES] Found existing ASS file, skipping generation');
      console.log('🎯 [SUBTITLES] Existing ASS path:', assSubtitlePath);
    } else {
      console.log('📝 [SUBTITLES] Generating new ASS subtitle file');
      generateASSSubtitles(dialogueTimestamps, assSubtitlePath);
    }
    
    generateSRTSubtitles(dialogueTimestamps, srtSubtitlePath);

    // Verify subtitle files exist
    if (!fs.existsSync(srtSubtitlePath)) {
      throw new Error(`SRT subtitle file not found at: ${srtSubtitlePath}`);
    }
    if (!fs.existsSync(assSubtitlePath)) {
      throw new Error(`ASS subtitle file not found at: ${assSubtitlePath}`);
    }
    console.log('✅ [SUBTITLES] Styled subtitle files verified successfully');

    // Get background video duration to determine if we need to loop or trim
    const backgroundDuration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(backgroundVideoPath, (err: any, metadata: any) => {
        if (err) reject(err);
        else resolve(metadata.format.duration || 0);
      });
    });

    console.log(`🎬 [GENERATOR] Audio duration: ${cumulativeTime.toFixed(2)}s`);
    console.log(`🎬 [GENERATOR] Background video duration: ${backgroundDuration.toFixed(2)}s`);

    // Handle background video looping if needed
    let finalVideoInput = backgroundVideoPath;
    let tempLoopedVideo: string | null = null;

    if (cumulativeTime > backgroundDuration) {
      console.log('🔄 [GENERATOR] Audio longer than background - creating looped background video');
      tempLoopedVideo = path.join(VIDEO_OUTPUT_DIR, `${sessionId}_temp_looped.mp4`);

      await new Promise<void>((resolveLoop, rejectLoop) => {
        ffmpeg()
          .input(backgroundVideoPath)
          .inputOptions(['-stream_loop', '-1'])
          .outputOptions([
            '-y',
            '-t', cumulativeTime.toString(),
            '-c:v', 'libx264',
            '-b:v', '2000k',
            '-r', '30',
            '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
          ])
          .output(tempLoopedVideo!)
          .on('end', () => {
            console.log('✅ [GENERATOR] Looped background video created');
            resolveLoop();
          })
          .on('error', rejectLoop)
          .run();
      });

      finalVideoInput = tempLoopedVideo;
    }

    // Generate final video with burned-in subtitles
    const outputVideoPath = path.join(VIDEO_OUTPUT_DIR, `${sessionId}_with_burned_subtitles.mp4`);

    console.log('🔥 [GENERATOR] Starting video generation with burned-in styled subtitles...');

    // Create the video with burned-in subtitles using optimized filterchain
    let useActualHardwareAccel = device === 'cuda';
    
    try {
      await new Promise<void>((resolve, reject) => {
        // Build the subtitle force_style options
        const forceStyleOptions = [
          `Fontname=${SUBTITLE_STYLES.fontName}`,
          `FontSize=${SUBTITLE_STYLES.fontSize}`,
          `PrimaryColour=${SUBTITLE_STYLES.primaryColor}`,
          `OutlineColour=${SUBTITLE_STYLES.outlineColor}`,
          `BackColour=${SUBTITLE_STYLES.backColor}`,
          `Bold=${SUBTITLE_STYLES.bold}`,
          `BorderStyle=${SUBTITLE_STYLES.borderStyle}`,
          `Outline=${SUBTITLE_STYLES.outline}`,
          `Shadow=${SUBTITLE_STYLES.shadow}`,
          `Alignment=${SUBTITLE_STYLES.alignment}`,
          `MarginV=${SUBTITLE_STYLES.marginV}`
        ].join(',');

        // Escape the subtitle path for Windows
        const escapedAssPath = assSubtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');

        // Build FFmpeg command
        let ffmpegCommand = ffmpeg()
          .input(finalVideoInput) // Background video
          .input(tempAudioPath)   // Audio
          .input(prescaledStewieImage) // Pre-scaled Stewie image
          .input(prescaledPeterImage); // Pre-scaled Peter image

        // Build character overlay enable expressions (optimized)
        const stewieRanges: string[] = [];
        const peterRanges: string[] = [];
        
        dialogueTimestamps.forEach(dialogue => {
          const start = dialogue.totalStart.toFixed(2);
          const end = dialogue.totalEnd.toFixed(2);
          if (dialogue.character === 'Stewie') {
            stewieRanges.push(`between(t,${start},${end})`);
          } else if (dialogue.character === 'Peter') {
            peterRanges.push(`between(t,${start},${end})`);
          }
        });
        
        const stewieEnable = stewieRanges.join('+');
        const peterEnable = peterRanges.join('+');

        // OPTIMIZED FILTER CHAIN - Using pre-scaled images eliminates scaling in filterchain
        // Single pass: speed adjustment, scale background, overlay pre-scaled characters, add subtitles
        let filterChain = `[0:v]setpts=PTS/${backgroundVideoSpeed},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[bg]`;
        
        // Use pre-scaled images directly - no scaling needed in filterchain!
        // Combine overlays in single operation with optimized blending
        filterChain += `;[bg][2:v]overlay=300:1350:enable='${stewieEnable}'[temp]`;
        filterChain += `;[temp][3:v]overlay=300:1250:enable='${peterEnable}',format=yuv420p[with_characters]`;
        
        // Add subtitles as final step
        filterChain += `;[with_characters]subtitles='${escapedAssPath}':force_style='${forceStyleOptions}'[final]`;

        console.log('🚀 [OPTIMIZED] Ultra-optimized filter chain using pre-scaled images:', filterChain);

        // Detect if NVIDIA GPU is available for hardware acceleration
        const outputOptions = [
          '-t', cumulativeTime.toString(),
          '-map', '[final]', // Video from final output
          '-map', '1:a:0', // Audio from second input
        ];

        if (useActualHardwareAccel) {
          console.log('🎮 [GPU] Using NVIDIA hardware acceleration');
          outputOptions.push(
            '-c:v', 'h264_nvenc',
            '-b:v', '2500k', // Higher bitrate for better quality with GPU
            '-maxrate', '3000k',
            '-bufsize', '5000k',
            '-preset', 'fast', // Valid NVIDIA preset: ultrafast, fast, medium, slow, slower, veryslow
            '-profile:v', 'main', // Use main profile for better compatibility
            '-level', '4.1',
            '-rc', 'vbr',
            '-2pass', '0' // Single pass encoding
          );
        } else {
          console.log('🖥️ [CPU] Using optimized CPU encoding');
          outputOptions.push(
            '-c:v', 'libx264',
            '-b:v', '2000k', // Maintain good quality
            '-preset', 'medium', // Better quality than 'fast', still efficient
            '-profile:v', 'high',
            '-level', '4.1',
            '-x264opts', 'keyint=60:min-keyint=60:scenecut=0' // Optimize for consistent quality
          );
        }

        outputOptions.push(
          '-r', '30', // Maintain 30 fps for smooth playback
          '-c:a', 'aac',
          '-b:a', '128k',
          '-filter_complex', filterChain,
          '-threads', '0', // Use optimal thread count automatically
          '-movflags', '+faststart' // Optimize for streaming
        );

        ffmpegCommand.outputOptions(outputOptions);

        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          console.error('⏰ [GENERATOR] Optimized video generation timeout (10 minutes)');
          reject(new Error('Video generation timeout - process took longer than 10 minutes'));
        }, 10 * 60 * 1000); // 10 minutes timeout

        ffmpegCommand
          .output(outputVideoPath)
          .on('start', (commandLine: any) => {
            const accelType = useActualHardwareAccel ? 'GPU-accelerated' : 'CPU-optimized';
            console.log(`🎬 [OPTIMIZED] Starting ${accelType} FFmpeg video generation with optimized filterchain`);
          })
          .on('stderr', (stderrLine: string) => {
            // Log important information for debugging
            if (stderrLine.includes('error') || stderrLine.includes('Error') || 
                stderrLine.includes('failed') || stderrLine.includes('fps=')) {
              console.log('🎬 [FFmpeg]:', stderrLine);
            }
          })
          .on('progress', (progress: any) => {
            if (progress.percent) {
              const percent = Math.round(progress.percent);
              if (percent % 20 === 0 && percent > 0) {
                console.log(`🔢 [OPTIMIZED] Processing progress: ${percent}% (${progress.currentFps || 'N/A'} fps)`);
              }
            }
          })
          .on('end', () => {
            clearTimeout(timeout);
            const accelType = useActualHardwareAccel ? 'GPU-accelerated' : 'CPU-optimized';
            console.log(`✅ [OPTIMIZED] ${accelType} video generation completed successfully`);
            resolve();
          })
          .on('error', (err: any) => {
            clearTimeout(timeout);
            console.error('❌ [OPTIMIZED] Video generation failed:', err);
            reject(err);
          })
          .run();
      });
    } catch (error) {
      // Check if GPU encoding failed and we should retry with CPU
      if (useActualHardwareAccel && error instanceof Error && 
          (error.message.includes('h264_nvenc') || error.message.includes('preset') || error.message.includes('hardware'))) {
        console.warn('⚠️ [GPU] Hardware encoding failed, falling back to CPU encoding...');
        
        // Retry without hardware acceleration
        try {
          await new Promise<void>((resolve, reject) => {
            console.log('🖥️ [FALLBACK] Retrying with CPU-optimized encoding...');
            
            // Build the subtitle force_style options for fallback
            const forceStyleOptions = [
              `Fontname=${SUBTITLE_STYLES.fontName}`,
              `FontSize=${SUBTITLE_STYLES.fontSize}`,
              `PrimaryColour=${SUBTITLE_STYLES.primaryColor}`,
              `OutlineColour=${SUBTITLE_STYLES.outlineColor}`,
              `BackColour=${SUBTITLE_STYLES.backColor}`,
              `Bold=${SUBTITLE_STYLES.bold}`,
              `BorderStyle=${SUBTITLE_STYLES.borderStyle}`,
              `Outline=${SUBTITLE_STYLES.outline}`,
              `Shadow=${SUBTITLE_STYLES.shadow}`,
              `Alignment=${SUBTITLE_STYLES.alignment}`,
              `MarginV=${SUBTITLE_STYLES.marginV}`
            ].join(',');

            // Escape the subtitle path for Windows
            const escapedAssPath = assSubtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');

            // Build character overlay enable expressions
            const stewieRanges: string[] = [];
            const peterRanges: string[] = [];
            
            dialogueTimestamps.forEach(dialogue => {
              const start = dialogue.totalStart.toFixed(2);
              const end = dialogue.totalEnd.toFixed(2);
              if (dialogue.character === 'Stewie') {
                stewieRanges.push(`between(t,${start},${end})`);
              } else if (dialogue.character === 'Peter') {
                peterRanges.push(`between(t,${start},${end})`);
              }
            });
            
            const stewieEnable = stewieRanges.join('+');
            const peterEnable = peterRanges.join('+');

            // CPU filter chain that's the same but uses CPU encoding
            let filterChain = `[0:v]setpts=PTS/${backgroundVideoSpeed},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[bg]`;
            filterChain += `;[bg][2:v]overlay=300:1350:enable='${stewieEnable}'[temp]`;
            filterChain += `;[temp][3:v]overlay=300:1250:enable='${peterEnable}',format=yuv420p[with_characters]`;
            filterChain += `;[with_characters]subtitles='${escapedAssPath}':force_style='${forceStyleOptions}'[final]`;

            console.log('🚀 [CPU FALLBACK] Ultra-optimized filter chain using CPU:', filterChain);

            // Build FFmpeg command with CPU encoding
            const cpuFfmpegCommand = ffmpeg()
              .input(finalVideoInput) // Background video
              .input(tempAudioPath)   // Audio
              .input(prescaledStewieImage) // Pre-scaled Stewie image
              .input(prescaledPeterImage); // Pre-scaled Peter image

            const outputOptions = [
              '-t', cumulativeTime.toString(),
              '-map', '[final]', // Video from final output
              '-map', '1:a:0', // Audio from second input
              '-c:v', 'libx264',
              '-b:v', '2000k', // Maintain good quality
              '-preset', 'medium', // Better quality than 'fast', still efficient
              '-profile:v', 'high',
              '-level', '4.1',
              '-x264opts', 'keyint=60:min-keyint=60:scenecut=0', // Optimize for consistent quality
              '-r', '30', // Maintain 30 fps for smooth playback
              '-c:a', 'aac',
              '-b:a', '128k',
              '-filter_complex', filterChain,
              '-threads', '0', // Use optimal thread count automatically
              '-movflags', '+faststart' // Optimize for streaming
            ];

            cpuFfmpegCommand.outputOptions(outputOptions);

            // Add timeout to prevent hanging
            const timeout = setTimeout(() => {
              console.error('⏰ [CPU FALLBACK] Video generation timeout (10 minutes)');
              reject(new Error('CPU fallback video generation timeout - process took longer than 10 minutes'));
            }, 10 * 60 * 1000); // 10 minutes timeout

            cpuFfmpegCommand
              .output(outputVideoPath)
              .on('start', (commandLine: any) => {
                console.log(`🎬 [CPU FALLBACK] Starting CPU-optimized FFmpeg video generation`);
              })
              .on('stderr', (stderrLine: string) => {
                if (stderrLine.includes('error') || stderrLine.includes('Error') || 
                    stderrLine.includes('failed') || stderrLine.includes('fps=')) {
                  console.log('🎬 [CPU FFmpeg]:', stderrLine);
                }
              })
              .on('progress', (progress: any) => {
                if (progress.percent) {
                  const percent = Math.round(progress.percent);
                  if (percent % 20 === 0 && percent > 0) {
                    console.log(`🔢 [CPU FALLBACK] Processing progress: ${percent}% (${progress.currentFps || 'N/A'} fps)`);
                  }
                }
              })
              .on('end', () => {
                clearTimeout(timeout);
                console.log(`✅ [CPU FALLBACK] CPU-optimized video generation completed successfully`);
                resolve();
              })
              .on('error', (err: any) => {
                clearTimeout(timeout);
                console.error('❌ [CPU FALLBACK] CPU video generation failed:', err);
                reject(err);
              })
              .run();
          });
        } catch (fallbackError) {
          console.error('❌ [CPU FALLBACK] CPU fallback also failed:', fallbackError);
          console.error('❌ [OPTIMIZED] Original GPU error:', error);
          const errorMessage = `Video generation failed (tried both GPU and CPU): GPU: ${error instanceof Error ? error.message : String(error)}, CPU: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`;
          throw new Error(errorMessage);
        }
      } else {
        console.error('❌ [OPTIMIZED] Video generation failed:', error);
        // Throw error instead of fallback
        const errorMessage = `Video generation with character overlays and subtitles failed: ${error instanceof Error ? error.message : String(error)}`;
        throw new Error(errorMessage);
      }
    }

    // Cleanup temporary files (but preserve cached ASS files)
    try {
      const filesToCleanup = [tempAudioPath, audioListPath, srtSubtitlePath];
      if (tempLoopedVideo && fs.existsSync(tempLoopedVideo)) {
        filesToCleanup.push(tempLoopedVideo);
      }

      // Only cleanup ASS file if it's not in the cache directory
      const assCacheDir = path.join(process.cwd(), 'temp', 'ass_cache');
      if (assSubtitlePath && !assSubtitlePath.startsWith(assCacheDir)) {
        filesToCleanup.push(assSubtitlePath);
      } else if (assSubtitlePath) {
        console.log('💾 [GENERATOR] Preserving cached ASS file:', path.basename(assSubtitlePath));
      }

      filesToCleanup.forEach(file => {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      });
      console.log('🧹 [GENERATOR] Temporary files cleaned up (cached ASS files preserved)');
    } catch (err) {
      console.warn('⚠️ [GENERATOR] Warning: Could not clean up some temporary files:', err);
    }

    // Get file stats and return response
    const stats = fs.statSync(outputVideoPath);
    const totalDuration = (Date.now() - startTime) / 1000;

    const response = {
      success: true,
      message: `Video with optimized burned-in subtitles generated successfully (${device === 'cuda' ? 'GPU-accelerated' : 'CPU-optimized'}, background speed: ${backgroundVideoSpeed}x)`,
      videoPath: outputVideoPath,
      videoFile: {
        filename: path.basename(outputVideoPath),
        path: outputVideoPath,
        fileSize: stats.size,
        sessionId: sessionId
      },
      stats: {
        totalDialogues: successfulDialogues.length,
        totalWords: dialogueTimestamps.reduce((sum, d) => sum + d.words.length, 0),
        videoDuration: `${cumulativeTime.toFixed(2)}s`,
        aspectRatio: '9:16',
        processingTime: `${totalDuration.toFixed(2)}s`,
        subtitleStyle: 'Burned-in with optimized filterchain',
        backgroundVideoSpeed: backgroundVideoSpeed,
        encodingMethod: device === 'cuda' ? 'Hardware-accelerated (NVIDIA)' : 'CPU-optimized',
        optimizations: [
          'Pre-scaled character images (eliminates runtime scaling)',
          'Combined filter operations (reduced passes)',
          'Optimized pixel format conversions',
          'Automatic optimal thread detection',
          device === 'cuda' ? 'NVENC hardware encoding with VBR' : 'x264 medium preset with optimized keyframes',
          'Fast-start MP4 optimization for streaming',
          'Lanczos scaling algorithm for quality',
          'Efficient overlay enable expressions'
        ]
      }
    };

    console.log('📤 [OPTIMIZED] Sending optimized video generation success response');
    console.log(`🚀 [OPTIMIZED] Used ${device === 'cuda' ? 'GPU acceleration' : 'CPU optimization'} with combined filterchain for faster processing`);
    return response;

  } catch (error) {
    console.error('💥 [GENERATOR] Video generation with burned subtitles error:', error);

    const totalDuration = (Date.now() - startTime) / 1000;
    return {
      success: false,
      message: 'Failed to generate video with burned-in subtitles',
      error: 'Failed to generate video with burned-in subtitles',
      details: error instanceof Error ? error.message : 'Unknown error',
      processingTime: totalDuration
    };
  }
}
