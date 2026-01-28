import * as fs from 'fs';
import * as path from 'path';
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
import { spawn } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
const FormData = require('form-data');
import { PrismaClient } from '../generated/prisma';
import { getVideoStylePreset, VideoStylePreset } from '../config/video-styles';

// Helper to detect image backgrounds
function isImageFile(filePath: string): boolean {
  return /\.(jpe?g|png|gif|webp)$/i.test(filePath);
}

// Convert a single image into a video of the desired duration and size
async function createVideoFromImage(
  imagePath: string,
  outputPath: string,
  durationSec: number,
  width: number,
  height: number,
  fps: number
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop', '1'])
      .outputOptions([
        '-y',
        '-t', durationSec.toString(),
        '-r', fps.toString(),
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

// Initialize Prisma client
const prisma = new PrismaClient();

// WhisperX API configuration
const WHISPERX_API_URL = 'http://127.0.0.1:6000'; // Adjust this URL as needed

// Set ffmpeg path - Use custom path if available, otherwise use installer
// To use a custom FFmpeg: set CUSTOM_FFMPEG_PATH environment variable in .env file
// Example: CUSTOM_FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
const customFfmpegPath = process.env.CUSTOM_FFMPEG_PATH;
const ffmpegPath = customFfmpegPath || ffmpegInstaller.path;

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  if (customFfmpegPath) {
    console.log('🎬 [INIT] Using custom FFmpeg path:', ffmpegPath);
    
    // Check FFmpeg version
    const { exec } = require('child_process');
    exec(`"${ffmpegPath}" -version`, (error: any, stdout: string) => {
      if (!error) {
        const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
        if (versionMatch) {
          console.log('✅ [INIT] FFmpeg version:', versionMatch[1]);
        }
      }
    });
  } else {
    console.log('🎬 [INIT] FFmpeg path set to:', ffmpegPath);
  }
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

// Character overlay images.
// Bun can execute TS from a "virtual" path, so __dirname may not point at your repo.
// We detect the correct directory at runtime.
const CHARACTER_IMAGE_DIR_CANDIDATES = [
  // most reliable when you start backend1 via start.ps1 (cd backend1)
  path.join(process.cwd(), 'src', 'character_images'),
  // fallback: relative to this file location
  path.resolve(__dirname, '..', '..', 'character_images'),
];

function resolveCharacterImageDir(): string {
  for (const dir of CHARACTER_IMAGE_DIR_CANDIDATES) {
    const stewie = path.join(dir, 'Stewie_Griffin.png');
    const peter = path.join(dir, 'peter.png');
    if (fs.existsSync(stewie) && fs.existsSync(peter)) return dir;
  }
  // If not found, return the first candidate (so logs show where it looked)
  return CHARACTER_IMAGE_DIR_CANDIDATES[0];
}

const CHARACTER_IMAGE_DIR = resolveCharacterImageDir();
const CHARACTER_IMAGES = {
  Stewie: path.join(CHARACTER_IMAGE_DIR, 'Stewie_Griffin.png'),
  Peter: path.join(CHARACTER_IMAGE_DIR, 'peter.png'),
};

console.log(
  `🧍 [CHAR_IMG] dir=${CHARACTER_IMAGE_DIR} | cwd=${process.cwd()} | stewieExists=${bool01(fs.existsSync(CHARACTER_IMAGES.Stewie))} | peterExists=${bool01(fs.existsSync(CHARACTER_IMAGES.Peter))}`
);

// Pre-scaled character image cache for better performance
const PRESCALED_CHARACTER_CACHE_DIR = path.join(CHARACTER_IMAGE_DIR, 'prescaled');

// Ensure prescaled cache directory exists
if (!fs.existsSync(PRESCALED_CHARACTER_CACHE_DIR)) {
  fs.mkdirSync(PRESCALED_CHARACTER_CACHE_DIR, { recursive: true });
  console.log(`📁 [INIT] Created prescaled character cache directory: ${PRESCALED_CHARACTER_CACHE_DIR}`);
}

// Function to get or create prescaled character images
// Returns null if character image is not found (graceful degradation)
async function getOrCreatePrescaledCharacterImage(characterName: string, width: number, height: number): Promise<string | null> {
  const originalPath = CHARACTER_IMAGES[characterName as keyof typeof CHARACTER_IMAGES];
  if (!originalPath || !fs.existsSync(originalPath)) {
    console.log(`🧍 [CHAR_IMG] original missing | name=${characterName} | path=${originalPath ?? '(undefined path)'}`);
    return null;
  }

  const prescaledFilename = `${characterName}_${width}x${height}.png`;
  const prescaledPath = path.join(PRESCALED_CHARACTER_CACHE_DIR, prescaledFilename);

  // Check if prescaled version already exists and is newer than original
  if (fs.existsSync(prescaledPath)) {
    const originalStats = fs.statSync(originalPath);
    const prescaledStats = fs.statSync(prescaledPath);
    
    if (prescaledStats.mtime > originalStats.mtime) {
      console.log(`🧍 [CHAR_IMG] using cached prescaled | name=${characterName} | path=${prescaledPath}`);
      return prescaledPath;
    }
  }

  // Create prescaled version
  console.log(`🧍 [CHAR_IMG] prescaling | name=${characterName} | from=${originalPath} | to=${prescaledPath} | size=${width}x${height}`);
  
  await new Promise<void>((resolve, reject) => {
    ffmpeg(originalPath)
      .outputOptions([
        '-vf', `scale=${width}:${height}:flags=lanczos,format=yuva420p`,
        '-y' // Overwrite existing files
      ])
      .output(prescaledPath)
      .on('end', () => resolve())
      .on('error', (err: any) => {
        console.log(`❌ [CHAR_IMG] prescale failed | name=${characterName} | err=${String(err?.message ?? err)}`);
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

function normalizeCharacterName(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';

  // Common cleanup: "Stewie:", " STEWIE ", "Stewie Griffin"
  const cleaned = raw
    .replace(/[:\-–—]+$/g, '') // trailing punctuation like ":" or "-"
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (cleaned === 'stewie' || cleaned.startsWith('stewie ')) return 'Stewie';
  if (cleaned === 'peter' || cleaned.startsWith('peter ')) return 'Peter';

  // Fallback: keep original trimmed value
  return raw;
}

function ffmpegTime(t: number): string {
  // Avoid rounding to 0.00 which can disable overlays for short segments
  return Number.isFinite(t) ? t.toFixed(3) : '0';
}

function bool01(v: unknown): '1' | '0' {
  return v ? '1' : '0';
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
  backgroundVideoSpeed: number = 1.10, // Default 10% speed increase
  videoStyle: string = 'standard' // Video style preset
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

    // (noisy) general generator logs removed; keep CHAR_IMG logs + errors only

    // Get video style preset
    const stylePreset = getVideoStylePreset(videoStyle);
    // (noisy) removed

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

    // Pre-create scaled character images for better performance
    console.log(`🧍 [CHAR_IMG] Preparing overlays for ${successfulDialogues.length} dialogues...`);
    const prescaledStewieImage = await getOrCreatePrescaledCharacterImage('Stewie', 500, 600);
    const prescaledPeterImage = await getOrCreatePrescaledCharacterImage('Peter', 550, 800);
    
    const hasStewieImage = prescaledStewieImage !== null;
    const hasPeterImage = prescaledPeterImage !== null;

    console.log(
      `🧍 [CHAR_IMG] ready | stewie=${hasStewieImage ? prescaledStewieImage : 'missing'} | peter=${hasPeterImage ? prescaledPeterImage : 'missing'}`
    );

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
          character: normalizeCharacterName(dialogue.character),
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

    // Prepare background media (support images by converting to video)
    let backgroundMediaPath = backgroundVideoPath;
    let tempImageVideo: string | null = null;

    if (isImageFile(backgroundVideoPath)) {
      console.log('🖼️ [GENERATOR] Background is an image, creating video from image...');
      tempImageVideo = path.join(VIDEO_OUTPUT_DIR, `${sessionId}_bg_from_image.mp4`);
      const targetDuration = Math.max(cumulativeTime, 60); // ensure a reasonable minimum
      await createVideoFromImage(
        backgroundVideoPath,
        tempImageVideo,
        targetDuration,
        stylePreset.aspectRatio.width,
        stylePreset.aspectRatio.height,
        stylePreset.fps
      );
      backgroundMediaPath = tempImageVideo;
      console.log('✅ [GENERATOR] Image converted to background video:', tempImageVideo);
    }

    // Get background video duration to determine if we need to loop or trim
    const backgroundDuration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(backgroundMediaPath, (err: any, metadata: any) => {
        if (err) reject(err);
        else resolve(metadata.format.duration || 0);
      });
    });

    // (noisy) removed

    // Handle background video looping if needed
    let finalVideoInput = backgroundMediaPath;
    let tempLoopedVideo: string | null = null;

    if (cumulativeTime > backgroundDuration) {
      console.log('🔄 [GENERATOR] Audio longer than background - creating looped background video');
      tempLoopedVideo = path.join(VIDEO_OUTPUT_DIR, `${sessionId}_temp_looped.mp4`);

      await new Promise<void>((resolveLoop, rejectLoop) => {
        ffmpeg()
          .input(backgroundMediaPath)
          .inputOptions(['-stream_loop', '-1'])
          .outputOptions([
            '-y',
            '-t', cumulativeTime.toString(),
            '-c:v', 'libx264',
            '-b:v', '2000k',
            '-r', '30',
            '-vf', `scale=${stylePreset.aspectRatio.width}:${stylePreset.aspectRatio.height}:force_original_aspect_ratio=increase,crop=${stylePreset.aspectRatio.width}:${stylePreset.aspectRatio.height}`
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

    // (noisy) removed

    // Create the video with burned-in subtitles using optimized filterchain
    let useActualHardwareAccel = device === 'cuda';
    
    // Check if NVIDIA hardware encoding is available (BEFORE Promise)
    if (useActualHardwareAccel) {
      try {
        // Test if h264_nvenc encoder is available
        const encoderCheck = await new Promise<boolean>((resolve) => {
          const { exec } = require('child_process');
          exec(`"${ffmpegPath}" -hide_banner -encoders`, (error: any, stdout: string) => {
            if (error) {
              console.warn('⚠️ [GPU] Could not check encoder availability');
              resolve(false);
              return;
            }
            const hasNvenc = stdout.includes('h264_nvenc');
            resolve(hasNvenc);
          });
        });
        
        if (!encoderCheck) {
          console.warn('⚠️ [GPU] NVIDIA encoder not available, falling back to CPU encoding');
          useActualHardwareAccel = false;
        }
      } catch (checkError) {
        console.warn('⚠️ [GPU] Error checking encoder availability:', checkError);
        useActualHardwareAccel = false;
      }
    }
    
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

        // Build FFmpeg command - conditionally add character image inputs
        let ffmpegCommand = ffmpeg()
          .input(finalVideoInput) // Background video (input 0)
          .input(tempAudioPath);   // Audio (input 1)
        
        let inputIndex = 2; // Start character images at index 2
        let stewieInputIndex = -1;
        let peterInputIndex = -1;
        
        if (hasStewieImage && prescaledStewieImage) {
          ffmpegCommand = ffmpegCommand.input(prescaledStewieImage);
          stewieInputIndex = inputIndex++;
        }
        
        if (hasPeterImage && prescaledPeterImage) {
          ffmpegCommand = ffmpegCommand.input(prescaledPeterImage);
          peterInputIndex = inputIndex++;
        }
        
        console.log(
          `🧍 [CHAR_IMG] ffmpeg inputs | stewieIdx=${stewieInputIndex} | peterIdx=${peterInputIndex} | hasStewie=${bool01(hasStewieImage)} | hasPeter=${bool01(hasPeterImage)}`
        );

        // Build character overlay enable expressions (optimized)
        const stewieRanges: string[] = [];
        const peterRanges: string[] = [];
        
        const ENABLE_PAD_SECONDS = 0.15; // small pad so overlays are visible even with tight timings
        dialogueTimestamps.forEach(dialogue => {
          const startNum = dialogue.totalStart;
          const endNum = Math.max(dialogue.totalEnd, dialogue.totalStart + 0.05) + ENABLE_PAD_SECONDS;
          const start = ffmpegTime(startNum);
          const end = ffmpegTime(endNum);
          const character = normalizeCharacterName(dialogue.character);
          if (character === 'Stewie') {
            stewieRanges.push(`between(t,${start},${end})`);
          } else if (character === 'Peter') {
            peterRanges.push(`between(t,${start},${end})`);
          }
        });

        // Ensure enable expressions are never empty (use '0' to always disable if no ranges)
        const stewieEnable = stewieRanges.length > 0 && hasStewieImage ? stewieRanges.join('+') : '0';
        const peterEnable = peterRanges.length > 0 && hasPeterImage ? peterRanges.join('+') : '0';

        console.log(
          `🧍 [CHAR_IMG] overlay windows | stewie=${stewieRanges.length} | peter=${peterRanges.length} | stewieEnable=${stewieEnable === '0' ? '0' : '1'} | peterEnable=${peterEnable === '0' ? '0' : '1'}`
        );

        // OPTIMIZED FILTER CHAIN - Using pre-scaled images eliminates scaling in filterchain
        // Single pass: speed adjustment, scale background, overlay pre-scaled characters (if available), add subtitles
        let filterChain = `[0:v]setpts=PTS/${backgroundVideoSpeed},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[bg]`;
        
        let currentLabel = 'bg';
        
        // Add Stewie overlay if image is available
        if (hasStewieImage && stewieInputIndex >= 0) {
          filterChain += `;[${currentLabel}][${stewieInputIndex}:v]overlay=300:1350:enable='${stewieEnable}'[temp${stewieInputIndex}]`;
          currentLabel = `temp${stewieInputIndex}`;
        }
        
        // Add Peter overlay if image is available
        if (hasPeterImage && peterInputIndex >= 0) {
          filterChain += `;[${currentLabel}][${peterInputIndex}:v]overlay=300:1250:enable='${peterEnable}'[with_characters]`;
          currentLabel = 'with_characters';
        } else if (!hasStewieImage && !hasPeterImage) {
          // No character images, rename bg to with_characters for consistency
          filterChain += `;[${currentLabel}]copy[with_characters]`;
          currentLabel = 'with_characters';
        }
        
        // Add subtitles as final step and ensure explicit format for encoder
        filterChain += `;[${currentLabel}]subtitles='${escapedAssPath}':force_style='${forceStyleOptions}',format=yuv420p,setsar=1[final]`;

        // (noisy) filter chain log removed

        // Detect if NVIDIA GPU is available for hardware acceleration
        const outputOptions = [
          '-t', cumulativeTime.toString(),
          '-filter_complex', filterChain,
          '-map', '[final]', // Video from final output (must come after filter_complex)
          '-map', '1:a:0', // Audio from second input
        ];

        if (useActualHardwareAccel) {
          outputOptions.push(
            '-c:v', 'h264_nvenc',
            '-b:v', '2500k', // Higher bitrate for better quality with GPU
            '-maxrate', '3000k',
            '-bufsize', '5000k',
            '-preset', 'p4', // Modern NVENC preset (p1=fastest, p7=slowest/best quality, p4=balanced)
            '-profile:v', 'main', // Use main profile for better compatibility
            '-rc', 'vbr', // Variable bitrate
            '-pix_fmt', 'yuv420p', // Explicit pixel format
            '-r', '30' // Frame rate
          );
        } else {
          outputOptions.push(
            '-c:v', 'libx264',
            '-b:v', '2000k', // Maintain good quality
            '-preset', 'medium', // Better quality than 'fast', still efficient
            '-profile:v', 'high',
            '-level', '4.1',
            '-x264opts', 'keyint=60:min-keyint=60:scenecut=0', // Optimize for consistent quality
            '-pix_fmt', 'yuv420p', // Explicit pixel format
            '-r', '30' // Frame rate
          );
        }

        outputOptions.push(
          '-c:a', 'aac',
          '-b:a', '128k',
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
          .on('end', () => {
            clearTimeout(timeout);
            resolve();
          })
          .on('error', (err: any) => {
            clearTimeout(timeout);
            console.log(`❌ [FFMPEG] video generation failed: ${String(err?.message ?? err)}`);
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
            
            const ENABLE_PAD_SECONDS = 0.15; // small pad so overlays are visible even with tight timings
            dialogueTimestamps.forEach(dialogue => {
              const startNum = dialogue.totalStart;
              const endNum = Math.max(dialogue.totalEnd, dialogue.totalStart + 0.05) + ENABLE_PAD_SECONDS;
              const start = ffmpegTime(startNum);
              const end = ffmpegTime(endNum);
              const character = normalizeCharacterName(dialogue.character);
              if (character === 'Stewie') {
                stewieRanges.push(`between(t,${start},${end})`);
              } else if (character === 'Peter') {
                peterRanges.push(`between(t,${start},${end})`);
              }
            });

            // Ensure enable expressions are never empty (use '0' to always disable if no ranges)
            const stewieEnable = stewieRanges.length > 0 && hasStewieImage ? stewieRanges.join('+') : '0';
            const peterEnable = peterRanges.length > 0 && hasPeterImage ? peterRanges.join('+') : '0';

            console.log(
              `🧍 [CHAR_IMG][CPU] overlay windows | stewie=${stewieRanges.length} | peter=${peterRanges.length} | stewieEnable=${stewieEnable === '0' ? '0' : '1'} | peterEnable=${peterEnable === '0' ? '0' : '1'}`
            );

            // CPU filter chain that's the same but uses CPU encoding
            let filterChain = `[0:v]setpts=PTS/${backgroundVideoSpeed},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[bg]`;
            
            let currentLabel = 'bg';
            let cpuInputIndex = 2; // Character images start at index 2
            
            // Build FFmpeg command with CPU encoding - conditionally add character image inputs
            let cpuFfmpegCommand = ffmpeg()
              .input(finalVideoInput) // Background video (input 0)
              .input(tempAudioPath);   // Audio (input 1)
            
            // Add Stewie overlay if image is available
            if (hasStewieImage && prescaledStewieImage) {
              cpuFfmpegCommand = cpuFfmpegCommand.input(prescaledStewieImage);
              filterChain += `;[${currentLabel}][${cpuInputIndex}:v]overlay=300:1350:enable='${stewieEnable}'[temp${cpuInputIndex}]`;
              currentLabel = `temp${cpuInputIndex}`;
              cpuInputIndex++;
            }
            
            // Add Peter overlay if image is available
            if (hasPeterImage && prescaledPeterImage) {
              cpuFfmpegCommand = cpuFfmpegCommand.input(prescaledPeterImage);
              filterChain += `;[${currentLabel}][${cpuInputIndex}:v]overlay=300:1250:enable='${peterEnable}',format=yuv420p[with_characters]`;
              currentLabel = 'with_characters';
            } else if (!hasStewieImage && !hasPeterImage) {
              // No character images, rename bg to with_characters for consistency
              filterChain += `;[${currentLabel}]copy[with_characters]`;
              currentLabel = 'with_characters';
            }
            
            filterChain += `;[${currentLabel}]subtitles='${escapedAssPath}':force_style='${forceStyleOptions}'[final]`;

            // (noisy) filter chain log removed

            const outputOptions = [
              '-t', cumulativeTime.toString(),
              '-filter_complex', filterChain,
              '-map', '[final]', // Video from final output (must come after filter_complex)
              '-map', '1:a:0', // Audio from second input
              '-c:v', 'libx264',
              '-b:v', '2000k', // Maintain good quality
              '-preset', 'medium', // Better quality than 'fast', still efficient
              '-profile:v', 'high',
              '-level', '4.1',
              '-x264opts', 'keyint=60:min-keyint=60:scenecut=0', // Optimize for consistent quality
              '-pix_fmt', 'yuv420p', // Explicit pixel format
              '-r', '30', // Maintain 30 fps for smooth playback
              '-c:a', 'aac',
              '-b:a', '128k',
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
              .on('end', () => {
                clearTimeout(timeout);
                resolve();
              })
              .on('error', (err: any) => {
                clearTimeout(timeout);
                console.log(`❌ [FFMPEG][CPU] video generation failed: ${String(err?.message ?? err)}`);
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
      // (noisy) removed
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

    // (noisy) removed
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
