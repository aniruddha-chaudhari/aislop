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

  fs.writeFileSync(outputPath, assContent, 'utf8');
  console.log('✅ [ASS] Mobile-optimized ASS subtitle file generated successfully');
}

// Main video generation function with burned-in subtitles
export async function generateVideoWithSubtitles(
  sessionId: string,
  backgroundVideoPath: string,
  device: string = 'cuda'
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

    console.log('🎬 [GENERATOR] Starting enhanced video generation with burned-in subtitles using device:', device);

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

    // Generate word-level timestamps using WhisperX
    const dialogueTimestamps: DialogueTimestamp[] = [];
    let cumulativeTime = 0;

    for (let i = 0; i < successfulDialogues.length; i++) {
      const dialogue = successfulDialogues[i];

      if (dialogue.audioFile) {
        console.log(`🎯 [GENERATOR] Processing dialogue ${i + 1}/${successfulDialogues.length}: "${dialogue.text.substring(0, 50)}..."`);

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
        console.log(`✅ [GENERATOR] Processed dialogue ${i + 1}, cumulative time: ${cumulativeTime.toFixed(2)}s`);
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

    // Create the video with burned-in subtitles using the subtitles filter
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
        .input(tempAudioPath);  // Audio

      // Add character image inputs
      Object.values(CHARACTER_IMAGES).forEach(imgPath => {
        ffmpegCommand = ffmpegCommand.input(imgPath);
      });

      // Build filter chain with proper chaining
      let filterChain = '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg]';
      
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
      
      // Add single overlay for each character with combined time ranges
      filterChain += `;[2:v]scale=500:600[scaled_stewie];[bg][scaled_stewie]overlay=300:1350:enable='${stewieEnable}'[with_stewie]`;
      filterChain += `;[3:v]scale=550:800[scaled_peter];[with_stewie][scaled_peter]overlay=300:1250:enable='${peterEnable}'[with_characters]`;
      
      // Add subtitles to the final result
      filterChain += `;[with_characters]subtitles='${escapedAssPath}':force_style='${forceStyleOptions}'[final]`;

      console.log('🖼️ [CHARACTERS] Complex filter chain:', filterChain);

      ffmpegCommand
        .outputOptions([
          '-t', cumulativeTime.toString(),
          '-map', '[final]', // Video from final output
          '-map', '1:a:0', // Audio from second input
          '-c:v', 'libx264',
          '-b:v', '2000k',
          '-r', '30',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-filter_complex', filterChain
        ]);

      ffmpegCommand
        .output(outputVideoPath)
        .on('start', (commandLine: any) => {
          console.log('🖼️ [CHARACTERS] FFmpeg command with character overlays:', commandLine);
        })
        .on('stderr', (stderrLine: string) => {
          // Only log important stderr messages to reduce noise
          if (stderrLine.includes('error') || stderrLine.includes('Error') || stderrLine.includes('failed')) {
            console.log('🎬 [FFmpeg STDERR]:', stderrLine);
          }
        })
        .on('progress', (progress: any) => {
          if (progress.percent) {
            console.log(`🔥 [GENERATOR] Burning subtitles progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log('✅ [GENERATOR] Video with burned-in styled subtitles generated successfully');
          resolve();
        })
        .on('error', (err: any) => {
          console.error('❌ [GENERATOR] Video generation with burned subtitles failed:', err);
          reject(err);
        })
        .run();
    });

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
      message: 'Video with burned-in styled subtitles generated successfully',
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
        subtitleStyle: 'Burned-in with custom fonts and colors'
      }
    };

    console.log('📤 [GENERATOR] Sending burned subtitles success response');
    console.log('🎬 [GENERATOR] FFmpeg used ASS subtitles for burned-in text (with karaoke effects and character colors)');
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