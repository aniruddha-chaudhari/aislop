import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../generated/prisma';
import { generateVideoWithSubtitles as generateVideoService } from '../service/videoGenerator';
import multer from 'multer';
import { ImageEmbeddingService, ImageEmbeddingAnalyzer, AssFileProcessor, UserProvidedImage } from '../service/imageEmbedder';

// Import cleanup function from audioController
import { cleanupOldUserImageFiles } from './audioController';

// Initialize Prisma client
const prisma = new PrismaClient();

// ASS file cache configuration
const ASS_CACHE_DIR = path.join(process.cwd(), 'temp', 'ass_cache');
const ASS_CACHE_DURATION_HOURS = 24; // Keep ASS files for 24 hours

// Ensure ASS cache directory exists
if (!fs.existsSync(ASS_CACHE_DIR)) {
  fs.mkdirSync(ASS_CACHE_DIR, { recursive: true });
  console.log(`📁 [INIT] Created ASS cache directory: ${ASS_CACHE_DIR}`);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow video files for template uploads
    if (file.fieldname === 'video') {
      const allowedTypes = /mp4|mov|avi|mkv/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only video files are allowed!'));
      }
    }

    // Allow image files for image uploads
    if (file.fieldname === 'image') {
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only image files are allowed!'));
      }
    }

    // Allow ASS files
    if (file.fieldname === 'ass') {
      if (path.extname(file.originalname).toLowerCase() === '.ass') {
        return cb(null, true);
      } else {
        cb(new Error('Only .ass files are allowed!'));
      }
    }

    cb(new Error('Invalid file type!'));
  }
});

// Extend Request interface to include file property
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Video generation configuration
const VIDEO_OUTPUT_DIR = path.join(process.cwd(), 'generated_videos');
const TEMP_DIR = path.join(process.cwd(), 'temp');

// ASS Cache Utility Functions
const getAssCacheKey = (sessionId: string, dialogueHash: string): string => {
  return `${sessionId}_${dialogueHash}.ass`;
};

const getAssCachePath = (cacheKey: string): string => {
  return path.join(ASS_CACHE_DIR, cacheKey);
};

const generateDialogueHash = (dialogues: any[]): string => {
  const dialogueString = dialogues.map(d => `${d.character}:${d.text}`).join('|');
  const crypto = require('crypto');
  return crypto.createHash('md5').update(dialogueString).digest('hex').substring(0, 8);
};

const checkAssCache = (sessionId: string, dialogueHash: string): string | null => {
  const cacheKey = getAssCacheKey(sessionId, dialogueHash);
  const cachePath = getAssCachePath(cacheKey);

  if (fs.existsSync(cachePath)) {
    const stats = fs.statSync(cachePath);
    const ageInHours = (Date.now() - stats.birthtime.getTime()) / (1000 * 60 * 60);

    if (ageInHours <= ASS_CACHE_DURATION_HOURS) {
      console.log(`✅ [ASS CACHE] Found valid cached ASS file: ${cacheKey} (${ageInHours.toFixed(2)}h old)`);
      return cachePath;
    } else {
      console.log(`🗑️ [ASS CACHE] Cached ASS file expired: ${cacheKey} (${ageInHours.toFixed(2)}h old)`);
      fs.unlinkSync(cachePath);
    }
  }

  return null;
};

const saveAssToCache = (sessionId: string, dialogueHash: string, assContent: string): string => {
  const cacheKey = getAssCacheKey(sessionId, dialogueHash);
  const cachePath = getAssCachePath(cacheKey);

  // Ensure the cache directory exists
  const cacheDir = path.dirname(cachePath);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log(`📁 [ASS CACHE] Created cache directory: ${cacheDir}`);
  }

  fs.writeFileSync(cachePath, assContent, 'utf8');
  console.log(`💾 [ASS CACHE] Saved ASS file to cache: ${cacheKey}`);

  return cachePath;
};

const cleanupExpiredAssFiles = (): number => {
  if (!fs.existsSync(ASS_CACHE_DIR)) return 0;

  let deletedCount = 0;
  const files = fs.readdirSync(ASS_CACHE_DIR);

  for (const file of files) {
    if (!file.endsWith('.ass')) continue;

    const filePath = path.join(ASS_CACHE_DIR, file);
    const stats = fs.statSync(filePath);
    const ageInHours = (Date.now() - stats.birthtime.getTime()) / (1000 * 60 * 60);

    if (ageInHours > ASS_CACHE_DURATION_HOURS) {
      fs.unlinkSync(filePath);
      deletedCount++;
      console.log(`🗑️ [ASS CACHE] Cleaned up expired ASS file: ${file} (${ageInHours.toFixed(2)}h old)`);
    }
  }

  return deletedCount;
};
const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'generated_images');

// Ensure directories exist
if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
  fs.mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });
  console.log(`📁 [INIT] Created directory: ${VIDEO_OUTPUT_DIR}`);
}

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  console.log(`📁 [INIT] Created directory: ${TEMP_DIR}`);
}

if (!fs.existsSync(IMAGE_UPLOAD_DIR)) {
  fs.mkdirSync(IMAGE_UPLOAD_DIR, { recursive: true });
  console.log(`📁 [INIT] Created directory: ${IMAGE_UPLOAD_DIR}`);
}

// Main video generation function with enhanced timing
export const generateVideoWithSubtitles = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const {
      sessionId,
      backgroundVideoPath,
      device = 'cuda',
      generateAssOnly = false,
      imagePlan,
      userImages,
      approvedUserImagePlacements
    } = req.body;

    console.log('🎬 [CONTROLLER] Received video generation request for session:', sessionId);
    console.log('🎬 [CONTROLLER] Generate ASS only:', generateAssOnly);
    console.log('🎬 [CONTROLLER] User images provided:', userImages?.length || 0);
    console.log('🎬 [CONTROLLER] Approved user image placements:', approvedUserImagePlacements?.length || 0);

    // If we have an image plan, this is the final video generation with images
    if (imagePlan && !generateAssOnly) {
      console.log('🎨 [CONTROLLER] FINAL VIDEO GENERATION with embedded images');
      console.log('🎨 [CONTROLLER] Session ID:', sessionId);
      console.log('🎨 [CONTROLLER] Image plan has', imagePlan.imageRequirements?.length || 0, 'requirements');
      console.log('🎨 [CONTROLLER] Background video path:', backgroundVideoPath);

      // Use the new image embedding service
      const result = await ImageEmbeddingService.generateVideoWithEmbeddedImages(
        sessionId,
        backgroundVideoPath,
        imagePlan,
        device
      );

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(500).json(result);
      }
    }

    // Handle user-provided images for video generation
    if (userImages && userImages.length > 0 && !generateAssOnly) {
      console.log('🎨 [CONTROLLER] VIDEO GENERATION with user-provided images');
      console.log('🎨 [CONTROLLER] Session ID:', sessionId);
      console.log('🎨 [CONTROLLER] User images:', userImages.length);

      try {
        // Get session data to generate ASS content
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
          return res.status(404).json({ success: false, error: 'Session not found' });
        }

        // Generate dialogue hash for caching
        const dialogueHash = generateDialogueHash(session.dialogues);

        // Check if WhisperX ASS file already exists in cache
        const cachedAssPath = checkAssCache(sessionId, dialogueHash);

        let assFilePath: string;
        if (cachedAssPath) {
          console.log('✅ [CONTROLLER] Using cached WhisperX ASS file for image analysis');
          assFilePath = cachedAssPath;
        } else {
          console.log('🎯 [CONTROLLER] Generating accurate WhisperX ASS file for image analysis');

          // Import the video generator service functions
          const { getWhisperXAlignment, generateASSSubtitles } = await import('../service/videoGenerator');

          // Generate word-level timestamps using WhisperX for accurate timing
          const dialogueTimestamps: any[] = [];
          let cumulativeTime = 0;

          for (let i = 0; i < session.dialogues.length; i++) {
            const dialogue = session.dialogues[i];

            if (dialogue.audioFile) {
              console.log(`🎯 [CONTROLLER] Processing dialogue ${i + 1}/${session.dialogues.length}: "${dialogue.text.substring(0, 50)}..."`);

              // Get audio duration first
              const audioDuration = await new Promise<number>((resolve, reject) => {
                const ffmpeg = require('fluent-ffmpeg');
                if (!dialogue.audioFile) {
                  reject(new Error('Audio file not found for dialogue'));
                  return;
                }
                ffmpeg.ffprobe(dialogue.audioFile.filePath, (err: any, metadata: any) => {
                  if (err) reject(err);
                  else resolve(metadata.format.duration || 0);
                });
              });

              // Get word-level timestamps using WhisperX API
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
              console.log(`✅ [CONTROLLER] Processed dialogue ${i + 1}, cumulative time: ${cumulativeTime.toFixed(2)}s`);
            }
          }

          // Generate ASS subtitle file with accurate WhisperX timing
          const tempAssPath = path.join(TEMP_DIR, `${sessionId}_whisperx_subtitles.ass`);
          generateASSSubtitles(dialogueTimestamps, tempAssPath);

          // Read the generated ASS content
          const assContent = fs.readFileSync(tempAssPath, 'utf8');

          // Save ASS file to cache
          assFilePath = saveAssToCache(sessionId, dialogueHash, assContent);

          // Clean up temporary ASS file
          if (fs.existsSync(tempAssPath)) {
            fs.unlinkSync(tempAssPath);
          }

          console.log('✅ [CONTROLLER] WhisperX ASS file generated and cached for image analysis');
        }

        // Handle approved user image placements
        if (approvedUserImagePlacements && approvedUserImagePlacements.length > 0) {
          console.log('🎯 [CONTROLLER] Using approved user image placements for video generation');
          console.log('📊 [CONTROLLER] Approved placements:', approvedUserImagePlacements.length);

          // Load existing image plan to include AI-generated images
          let existingAiImages: any[] = [];
          const imagePlanFile = path.join(TEMP_DIR, `${sessionId}_image_plan.json`);
          if (fs.existsSync(imagePlanFile)) {
            try {
              const existingPlan = JSON.parse(fs.readFileSync(imagePlanFile, 'utf8'));
              existingAiImages = existingPlan.imageRequirements.filter((req: any) => req.uploaded && req.imagePath);
              console.log(`✅ [CONTROLLER] Found ${existingAiImages.length} AI-generated images to include`);
            } catch (error) {
              console.warn('⚠️ [CONTROLLER] Could not load existing image plan:', error);
            }
          }

          // Create a custom image plan with approved placements AND existing AI images
          const customImagePlan = {
            sessionId,
            totalDuration: 0, // Will be calculated
            imageRequirements: [
              // Include approved user image placements
              ...approvedUserImagePlacements.map((placement: any) => {
                const userImage = userImages.find((img: any) => img.id === placement.userImageId);
                console.log(`🎯 [CONTROLLER] Processing approved placement: ${placement.userImageId} -> ${placement.userImageLabel}`);
                console.log(`🎯 [CONTROLLER] Found user image: ${userImage ? userImage.imagePath : 'NOT FOUND'}`);
                return {
                  id: placement.userImageId,
                  timestamp: placement.suggestedTimestamp,
                  dialogueText: placement.dialogueText,
                  character: placement.character,
                  imageType: 'custom' as const,
                  title: placement.userImageLabel,
                  description: `User-provided image: ${placement.userImageLabel}`,
                  priority: 'high' as const,
                  uploaded: !!userImage?.imagePath,
                  imagePath: userImage?.imagePath
                };
              }),
              // Include existing AI-generated images
              ...existingAiImages
            ],
            userProvidedImages: userImages,
            summary: {
              totalImages: approvedUserImagePlacements.length + existingAiImages.length,
              highPriority: approvedUserImagePlacements.length + existingAiImages.length,
              mediumPriority: 0,
              lowPriority: 0,
              userProvidedUsed: approvedUserImagePlacements.length,
              estimatedProcessingTime: '2-3 minutes'
            }
          };

          // Use the image embedding service with custom plan
          const result = await ImageEmbeddingService.generateVideoWithEmbeddedImages(
            sessionId,
            backgroundVideoPath,
            customImagePlan,
            device
          );

          if (result.success) {
            return res.status(200).json({
              ...result,
              approvedPlacements: approvedUserImagePlacements.length,
              message: `Video generated successfully with ${approvedUserImagePlacements.length} approved user images!`
            });
          } else {
            return res.status(500).json(result);
          }
        }

        // Generate image plan with user-provided images (original logic)
        const topic = session.dialogues.length > 0 ? 'Technical conversation' : 'General topic';
        const imagePlan = await ImageEmbeddingService.generateImageEmbeddingPlan(
          sessionId,
          assFilePath,
          topic,
          userImages, // Pass user images to the service
          'ultra'
        );

        // Use the image embedding service for video generation
        const result = await ImageEmbeddingService.generateVideoWithEmbeddedImages(
          sessionId,
          backgroundVideoPath,
          imagePlan,
          device
        );

        if (result.success) {
          // Include user image decisions in the response for better feedback
          const enhancedResult = {
            ...result,
            userImageDecisions: imagePlan.userImageDecisions,
            userImagesSummary: {
              totalProvided: userImages.length,
              accepted: imagePlan.userImageDecisions?.filter(d => d.useImage).length || 0,
              rejected: imagePlan.userImageDecisions?.filter(d => !d.useImage).length || 0
            }
          };
          return res.status(200).json(enhancedResult);
        } else {
          return res.status(500).json(result);
        }

      } catch (error) {
        console.error('❌ [CONTROLLER] Error in user images video generation:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to generate video with user images',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // If generateAssOnly is true, generate ASS file for analysis
    if (generateAssOnly) {
      console.log('📝 [CONTROLLER] Generating ASS file for analysis ONLY (no video generation)');
      console.log('📝 [CONTROLLER] Session ID:', sessionId);
      console.log('📝 [CONTROLLER] Background video path:', backgroundVideoPath);

      try {
        // Get session data to generate ASS content
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
          return res.status(404).json({ success: false, error: 'Session not found' });
        }

        // Generate dialogue hash for caching
        const dialogueHash = generateDialogueHash(session.dialogues);

        // Check if WhisperX ASS file already exists in cache
        const cachedAssPath = checkAssCache(sessionId, dialogueHash);

        if (cachedAssPath) {
          console.log('✅ [CONTROLLER] Using cached WhisperX ASS file for analysis');
          return res.status(200).json({
            success: true,
            message: 'ASS file retrieved from cache',
            assFilePath: cachedAssPath,
            sessionId,
            cached: true
          });
        }

        console.log('🎯 [CONTROLLER] Generating accurate WhisperX ASS file for analysis');

        // Import the video generator service functions
        const { getWhisperXAlignment, generateASSSubtitles } = await import('../service/videoGenerator');

        // Generate word-level timestamps using WhisperX for accurate timing
        const dialogueTimestamps: any[] = [];
        let cumulativeTime = 0;

        for (let i = 0; i < session.dialogues.length; i++) {
          const dialogue = session.dialogues[i];

          if (dialogue.audioFile) {
            console.log(`🎯 [CONTROLLER] Processing dialogue ${i + 1}/${session.dialogues.length}: "${dialogue.text.substring(0, 50)}..."`);

            // Get audio duration first
            const audioDuration = await new Promise<number>((resolve, reject) => {
              const ffmpeg = require('fluent-ffmpeg');
              if (!dialogue.audioFile) {
                reject(new Error('Audio file not found for dialogue'));
                return;
              }
              ffmpeg.ffprobe(dialogue.audioFile.filePath, (err: any, metadata: any) => {
                if (err) reject(err);
                else resolve(metadata.format.duration || 0);
              });
            });

            // Get word-level timestamps using WhisperX API
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
            console.log(`✅ [CONTROLLER] Processed dialogue ${i + 1}, cumulative time: ${cumulativeTime.toFixed(2)}s`);
          }
        }

        // Generate ASS subtitle file with accurate WhisperX timing
        const tempAssPath = path.join(TEMP_DIR, `${sessionId}_whisperx_subtitles.ass`);
        generateASSSubtitles(dialogueTimestamps, tempAssPath);

        // Read the generated ASS content
        const assContent = fs.readFileSync(tempAssPath, 'utf8');

        // Save ASS file to cache
        const assFilePath = saveAssToCache(sessionId, dialogueHash, assContent);

        // Clean up temporary ASS file
        if (fs.existsSync(tempAssPath)) {
          fs.unlinkSync(tempAssPath);
        }

        console.log('✅ [CONTROLLER] WhisperX ASS file generated and cached for analysis');

        return res.status(200).json({
          success: true,
          message: 'ASS file generated with WhisperX API and cached successfully',
          assFilePath: assFilePath,
          sessionId,
          cached: false,
          wordTimestampsGenerated: dialogueTimestamps.length,
          totalDuration: cumulativeTime.toFixed(2) + 's'
        });

      } catch (error) {
        console.error('❌ [CONTROLLER] Error generating ASS file with WhisperX:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to generate ASS file with WhisperX API',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Normal video generation without image embedding
    console.log('🎬 [CONTROLLER] NORMAL VIDEO GENERATION (with subtitles and images)');
    console.log('🎬 [CONTROLLER] Session ID:', sessionId);
    console.log('🎬 [CONTROLLER] Background video path:', backgroundVideoPath);
    console.log('🎬 [CONTROLLER] Device:', device);

    // Create a minimal image plan for videos without specific image requirements
    const minimalImagePlan = {
      sessionId,
      totalDuration: 0, // Will be calculated by the service
      imageRequirements: [],
      userProvidedImages: [],
      summary: {
        totalImages: 0,
        highPriority: 0,
        mediumPriority: 0,
        lowPriority: 0,
        userProvidedUsed: 0,
        estimatedProcessingTime: '1-2 minutes'
      }
    };

    const result = await ImageEmbeddingService.generateVideoWithEmbeddedImages(
      sessionId,
      backgroundVideoPath,
      minimalImagePlan,
      device
    );

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
    }

  } catch (error) {
    console.error('💥 [CONTROLLER] Video generation controller error:', error);

    const totalDuration = (Date.now() - startTime) / 1000;
    return res.status(500).json({
      success: false,
      error: 'Failed to generate video',
      details: error instanceof Error ? error.message : 'Unknown error',
      processingTime: totalDuration
    });
  }
};

// Keep your existing export functions (downloadVideo, getGeneratedVideos, deleteVideo, cleanupVideoFiles)
export const downloadVideo = async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const filePath = path.join(VIDEO_OUTPUT_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Error downloading video:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to download video file'
    });
  }
};

export const getGeneratedVideos = async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
      return res.status(200).json({ success: true, videos: [] });
    }

    const videoFiles = fs.readdirSync(VIDEO_OUTPUT_DIR)
      .filter(file => file.endsWith('.mp4'))
      .map(filename => {
        const filePath = path.join(VIDEO_OUTPUT_DIR, filename);
        const stats = fs.statSync(filePath);
        const sessionId = filename.split('_')[0];

        return {
          filename,
          path: filePath,
          fileSize: stats.size,
          createdAt: stats.birthtime,
          sessionId
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return res.status(200).json({ success: true, videos: videoFiles });

  } catch (error) {
    console.error('Error getting generated videos:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get generated videos'
    });
  }
};

export const deleteVideo = async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const filePath = path.join(VIDEO_OUTPUT_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    fs.unlinkSync(filePath);

    return res.status(200).json({
      success: true,
      message: `Video ${filename} deleted successfully`
    });

  } catch (error) {
    console.error('Error deleting video:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete video file'
    });
  }
};

export const cleanupVideoFiles = async (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
      return res.status(200).json({
        success: true,
        message: 'Video directory does not exist',
        deletedCount: 0
      });
    }

    let deletedCount = 0;
    const files = fs.readdirSync(VIDEO_OUTPUT_DIR);

    for (const file of files) {
      const filePath = path.join(VIDEO_OUTPUT_DIR, file);
      const stats = fs.statSync(filePath);

      // Delete files older than 24 hours
      const ageInHours = (Date.now() - stats.birthtime.getTime()) / (1000 * 60 * 60);

      if (ageInHours > 24) {
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`Deleted old video file: ${file}`);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Cleaned up ${deletedCount} old video files`,
      deletedCount
    });

  } catch (error) {
    console.error('Error cleaning up video files:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to clean up video files'
    });
  }
};

export const getTemplateVideos = async (req: Request, res: Response) => {
  try {
    const TEMPLATE_DIR = path.join(process.cwd(), 'video_template');

    if (!fs.existsSync(TEMPLATE_DIR)) {
      return res.status(200).json({ success: true, videos: [] });
    }

    const videoFiles = fs.readdirSync(TEMPLATE_DIR)
      .filter(file => file.endsWith('.mp4') || file.endsWith('.mov') || file.endsWith('.avi') || file.endsWith('.mkv') || file.endsWith('.webm'))
      .map(filename => {
        const filePath = path.join(TEMPLATE_DIR, filename);
        const stats = fs.statSync(filePath);

        return {
          filename,
          path: filePath,
          fileSize: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return res.status(200).json({ success: true, videos: videoFiles });

  } catch (error) {
    console.error('Error getting template videos:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get template videos'
    });
  }
};

export const uploadTemplateVideo = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const TEMPLATE_DIR = path.join(process.cwd(), 'video_template');

    // Ensure directory exists
    if (!fs.existsSync(TEMPLATE_DIR)) {
      fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
    }

    const originalName = file.originalname;
    const fileExtension = path.extname(originalName);
    const baseName = path.basename(originalName, fileExtension);

    // Create a unique filename if file already exists
    let finalFilename = originalName;
    let counter = 1;
    while (fs.existsSync(path.join(TEMPLATE_DIR, finalFilename))) {
      finalFilename = `${baseName}_${counter}${fileExtension}`;
      counter++;
    }

    const finalPath = path.join(TEMPLATE_DIR, finalFilename);

    // Move file from temp to template directory
    fs.renameSync(file.path, finalPath);

    const stats = fs.statSync(finalPath);

    return res.status(200).json({
      success: true,
      message: 'Video uploaded successfully',
      video: {
        filename: finalFilename,
        path: finalPath,
        fileSize: stats.size,
        createdAt: stats.birthtime
      }
    });

  } catch (error) {
    console.error('Error uploading template video:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to upload video'
    });
  }
};

// 🎯 IMAGE EMBEDDING ENDPOINTS

// Analyze ASS file and generate image embedding plan
export const analyzeAssForImages = async (req: Request, res: Response) => {
  try {
    const { sessionId, assFilePath, topic, forceFreshAss = false } = req.body;

    if (!sessionId || !topic) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: sessionId, topic'
      });
    }

    console.log('🎨 [CONTROLLER] Starting ASS analysis for session:', sessionId);
    console.log('🎨 [CONTROLLER] Force fresh ASS generation:', forceFreshAss);

    // Clean up old session files before starting new image plan generation
    console.log('🧹 [CONTROLLER] Cleaning up old session files before image plan generation...');
    cleanupOldUserImageFiles();

    let finalAssFilePath = assFilePath;

    // If forceFreshAss is true or no assFilePath provided, generate fresh ASS with WhisperX
    if (forceFreshAss || !assFilePath) {
      console.log('🎯 [CONTROLLER] Generating fresh ASS file with WhisperX API for analysis');

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
        return res.status(404).json({ success: false, error: 'Session not found' });
      }

      // Import the video generator service functions
      const { getWhisperXAlignment, generateASSSubtitles } = await import('../service/videoGenerator');

      // Generate word-level timestamps using WhisperX for accurate timing
      const dialogueTimestamps: any[] = [];
      let cumulativeTime = 0;

      for (let i = 0; i < session.dialogues.length; i++) {
        const dialogue = session.dialogues[i];

        if (dialogue.audioFile) {

          // Get audio duration first
          const audioDuration = await new Promise<number>((resolve, reject) => {
            const ffmpeg = require('fluent-ffmpeg');
            if (!dialogue.audioFile) {
              reject(new Error('Audio file not found for dialogue'));
              return;
            }
            ffmpeg.ffprobe(dialogue.audioFile.filePath, (err: any, metadata: any) => {
              if (err) reject(err);
              else resolve(metadata.format.duration || 0);
            });
          });

          // Get word-level timestamps using WhisperX API
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

      // Generate ASS subtitle file with accurate WhisperX timing
      const freshAssPath = path.join(TEMP_DIR, `${sessionId}_fresh_whisperx_subtitles.ass`);
      generateASSSubtitles(dialogueTimestamps, freshAssPath);

      finalAssFilePath = freshAssPath;
      console.log('✅ [CONTROLLER] Fresh ASS file generated with WhisperX API for analysis');
    }

    // Generate image embedding plan
    const imagePlan = await ImageEmbeddingService.generateImageEmbeddingPlan(
      sessionId,
      finalAssFilePath,
      topic
    );

    // Clean up temporary ASS file if we generated it
    if (forceFreshAss || !assFilePath) {
      try {
        if (fs.existsSync(finalAssFilePath) && finalAssFilePath.includes('_fresh_whisperx_subtitles.ass')) {
          fs.unlinkSync(finalAssFilePath);
        }
      } catch (cleanupError) {
        console.warn('⚠️ [CONTROLLER] Could not clean up temporary ASS file:', cleanupError);
      }
    }

    // Format response for user
    const formattedPlan = ImageEmbeddingService.formatPlanForUser(imagePlan);

    return res.status(200).json({
      success: true,
      message: 'Image embedding plan generated successfully with fresh WhisperX ASS',
      imagePlan,
      formattedPlan,
      assGeneratedWithWhisperX: forceFreshAss || !assFilePath,
      nextSteps: [
        'Upload the required images using the image titles as filenames',
        'Use high-quality images (minimum 1024x1024px recommended)',
        'Once all images are uploaded, proceed with final video generation'
      ]
    });

  } catch (error) {
    console.error('❌ [CONTROLLER] Error analyzing ASS file:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze ASS file for image embedding',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get current image plan status
export const getImagePlanStatus = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    const planFilePath = path.join(TEMP_DIR, `${sessionId}_image_plan.json`);

    if (!fs.existsSync(planFilePath)) {
      return res.status(404).json({
        success: false,
        error: 'Image plan not found. Please analyze ASS file first.'
      });
    }

    const imagePlan = ImageEmbeddingAnalyzer.loadImagePlan(planFilePath);
    const progress = ImageEmbeddingAnalyzer.getUploadProgress(imagePlan);
    const formattedPlan = ImageEmbeddingService.formatPlanForUser(imagePlan);

    return res.status(200).json({
      success: true,
      imagePlan,
      progress,
      formattedPlan,
      isComplete: progress.percentage === 100
    });

  } catch (error) {
    console.error('❌ [CONTROLLER] Error getting image plan status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get image plan status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Upload image for specific requirement
export const uploadImageForRequirement = async (req: MulterRequest, res: Response) => {
  try {
    const { sessionId, imageId } = req.body;
    const file = req.file;

    if (!sessionId || !imageId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: sessionId, imageId'
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    console.log('📤 [CONTROLLER] Uploading image for requirement:', imageId);

    // Load current image plan
    const planFilePath = path.join(TEMP_DIR, `${sessionId}_image_plan.json`);
    if (!fs.existsSync(planFilePath)) {
      return res.status(404).json({
        success: false,
        error: 'Image plan not found'
      });
    }

    const imagePlan = ImageEmbeddingAnalyzer.loadImagePlan(planFilePath);

    // Find the requirement
    const requirement = imagePlan.imageRequirements.find(req => req.id === imageId);
    if (!requirement) {
      return res.status(404).json({
        success: false,
        error: 'Image requirement not found'
      });
    }

    // Create session-specific image directory
    const sessionImageDir = path.join(IMAGE_UPLOAD_DIR, sessionId);
    if (!fs.existsSync(sessionImageDir)) {
      fs.mkdirSync(sessionImageDir, { recursive: true });
    }

    // Generate filename based on requirement title
    const fileExtension = path.extname(file.originalname);
    const safeTitle = requirement.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const imageFilename = `${safeTitle}_${imageId}${fileExtension}`;
    const imagePath = path.join(sessionImageDir, imageFilename);

    // Move uploaded file to final location
    fs.renameSync(file.path, imagePath);

    // Update image plan with upload status
    const updatedPlan = ImageEmbeddingAnalyzer.updateImageUploadStatus(
      imagePlan,
      imageId,
      true,
      imagePath
    );

    // Save updated plan
    await ImageEmbeddingAnalyzer.saveImagePlan(updatedPlan, TEMP_DIR);

    const progress = ImageEmbeddingAnalyzer.getUploadProgress(updatedPlan);

    return res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      imageId,
      imagePath,
      progress,
      isComplete: progress.percentage === 100,
      nextSteps: progress.percentage === 100
        ? ['All images uploaded! Ready for final video generation.']
        : [`${progress.total - progress.uploaded} images remaining to upload.`]
    });

  } catch (error) {
    console.error('❌ [CONTROLLER] Error uploading image:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to upload image',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// 🎯 USER-PROVIDED IMAGE UPLOAD ENDPOINT
export const uploadUserProvidedImage = async (req: MulterRequest, res: Response) => {
  try {
    const { sessionId, label, description, preferredTimestamp, priority } = req.body;
    const file = req.file;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    if (!label || !label.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Image label is required'
      });
    }

    console.log('📤 [CONTROLLER] Uploading user-provided image:', label);

    // Create session-specific user images directory
    const userImagesDir = path.join(IMAGE_UPLOAD_DIR, sessionId, 'user_provided');
    if (!fs.existsSync(userImagesDir)) {
      fs.mkdirSync(userImagesDir, { recursive: true });
    }

    // Generate unique filename
    const fileExtension = path.extname(file.originalname);
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const safeLabel = label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const imageFilename = `user_${safeLabel}_${timestamp}_${randomId}${fileExtension}`;
    const imagePath = path.join(userImagesDir, imageFilename);

    // Move uploaded file to final location
    fs.renameSync(file.path, imagePath);

    // Create user image metadata
    const userImage: UserProvidedImage = {
      id: `user_${timestamp}_${randomId}`,
      imagePath: imagePath,
      label: label.trim(),
      description: description ? description.trim() : undefined,
      preferredTimestamp: preferredTimestamp ? parseFloat(preferredTimestamp) : undefined,
      priority: (priority as 'high' | 'medium' | 'low') || 'medium'
    };

    // Save user image metadata to file
    const userImagesFile = path.join(TEMP_DIR, `${sessionId}_user_images.json`);
    let existingImages: UserProvidedImage[] = [];

    if (fs.existsSync(userImagesFile)) {
      try {
        existingImages = JSON.parse(fs.readFileSync(userImagesFile, 'utf8'));
      } catch (error) {
        console.warn('⚠️ [CONTROLLER] Could not parse existing user images file, starting fresh');
      }
    }

    existingImages.push(userImage);
    fs.writeFileSync(userImagesFile, JSON.stringify(existingImages, null, 2));

    console.log('✅ [CONTROLLER] User-provided image uploaded and saved:', userImage.id);

    return res.status(200).json({
      success: true,
      message: 'User-provided image uploaded successfully',
      userImage,
      totalUserImages: existingImages.length
    });

  } catch (error) {
    console.error('❌ [CONTROLLER] Error uploading user-provided image:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to upload user-provided image',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get user-provided images for a session
export const getUserProvidedImages = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    const userImagesFile = path.join(TEMP_DIR, `${sessionId}_user_images.json`);

    if (!fs.existsSync(userImagesFile)) {
      return res.status(200).json({
        success: true,
        userImages: []
      });
    }

    const userImages: UserProvidedImage[] = JSON.parse(fs.readFileSync(userImagesFile, 'utf8'));

    return res.status(200).json({
      success: true,
      userImages
    });

  } catch (error) {
    console.error('❌ [CONTROLLER] Error getting user-provided images:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user-provided images',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Delete user-provided image
export const deleteUserProvidedImage = async (req: Request, res: Response) => {
  try {
    const { sessionId, imageId } = req.params;

    if (!sessionId || !imageId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and image ID are required'
      });
    }

    const userImagesFile = path.join(TEMP_DIR, `${sessionId}_user_images.json`);

    if (!fs.existsSync(userImagesFile)) {
      return res.status(404).json({
        success: false,
        error: 'User images file not found'
      });
    }

    const userImages: UserProvidedImage[] = JSON.parse(fs.readFileSync(userImagesFile, 'utf8'));
    const imageToDelete = userImages.find(img => img.id === imageId);

    if (!imageToDelete) {
      return res.status(404).json({
        success: false,
        error: 'User image not found'
      });
    }

    // Delete the actual image file
    if (fs.existsSync(imageToDelete.imagePath)) {
      fs.unlinkSync(imageToDelete.imagePath);
    }

    // Remove from metadata
    const updatedImages = userImages.filter(img => img.id !== imageId);
    fs.writeFileSync(userImagesFile, JSON.stringify(updatedImages, null, 2));

    return res.status(200).json({
      success: true,
      message: 'User-provided image deleted successfully',
      imageId
    });

  } catch (error) {
    console.error('❌ [CONTROLLER] Error deleting user-provided image:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete user-provided image',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get list of uploaded images for a session
export const getUploadedImages = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    const sessionImageDir = path.join(IMAGE_UPLOAD_DIR, sessionId);

    if (!fs.existsSync(sessionImageDir)) {
      return res.status(200).json({
        success: true,
        images: []
      });
    }

    const imageFiles = fs.readdirSync(sessionImageDir)
      .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
      .map(filename => {
        const filePath = path.join(sessionImageDir, filename);
        const stats = fs.statSync(filePath);

        return {
          filename,
          path: filePath,
          fileSize: stats.size,
          uploadedAt: stats.birthtime
        };
      })
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

    return res.status(200).json({
      success: true,
      images: imageFiles
    });

  } catch (error) {
    console.error('❌ [CONTROLLER] Error getting uploaded images:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get uploaded images',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Delete uploaded image
export const deleteUploadedImage = async (req: Request, res: Response) => {
  try {
    const { sessionId, filename } = req.params;

    if (!sessionId || !filename) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and filename are required'
      });
    }

    const imagePath = path.join(IMAGE_UPLOAD_DIR, sessionId, filename);

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        error: 'Image file not found'
      });
    }

    // Update image plan to mark as not uploaded
    const planFilePath = path.join(TEMP_DIR, `${sessionId}_image_plan.json`);
    if (fs.existsSync(planFilePath)) {
      const imagePlan = ImageEmbeddingAnalyzer.loadImagePlan(planFilePath);

      // Find requirement by filename pattern
      const requirement = imagePlan.imageRequirements.find(req =>
        req.imagePath && req.imagePath.includes(filename)
      );

      if (requirement) {
        const updatedPlan = ImageEmbeddingAnalyzer.updateImageUploadStatus(
          imagePlan,
          requirement.id,
          false,
          undefined
        );
        await ImageEmbeddingAnalyzer.saveImagePlan(updatedPlan, TEMP_DIR);
      }
    }

    // Delete the file
    fs.unlinkSync(imagePath);

    return res.status(200).json({
      success: true,
      message: 'Image deleted successfully',
      filename
    });

  } catch (error) {
    console.error('❌ [CONTROLLER] Error deleting uploaded image:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete uploaded image',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Upload ASS file for analysis (temporary storage)
export const uploadAssFile = async (req: MulterRequest, res: Response) => {
  try {
    const { sessionId } = req.body;
    const file = req.file;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No ASS file uploaded'
      });
    }

    // Validate file extension
    if (!file.originalname.endsWith('.ass')) {
      return res.status(400).json({
        success: false,
        error: 'Only .ass files are allowed'
      });
    }

    // Read file content to generate hash for caching
    const fileContent = fs.readFileSync(file.path, 'utf8');
    const crypto = require('crypto');
    const contentHash = crypto.createHash('md5').update(fileContent).digest('hex').substring(0, 8);

    // Check if this ASS file already exists in cache
    const cacheKey = getAssCacheKey(sessionId, contentHash);
    const cachePath = getAssCachePath(cacheKey);

    if (fs.existsSync(cachePath)) {
      console.log('✅ [ASS UPLOAD] Using existing cached ASS file');

      // Clean up the uploaded temp file
      fs.unlinkSync(file.path);

      return res.status(200).json({
        success: true,
        message: 'ASS file already exists in cache',
        filePath: cachePath,
        filename: cacheKey,
        sessionId,
        cached: true
      });
    }

    // Save to cache with hash-based filename
    fs.writeFileSync(cachePath, fileContent, 'utf8');

    // Clean up the uploaded temp file
    fs.unlinkSync(file.path);

    console.log('💾 [ASS UPLOAD] Saved ASS file to cache:', cacheKey);

    return res.status(200).json({
      success: true,
      message: 'ASS file uploaded and cached successfully',
      filePath: cachePath,
      filename: cacheKey,
      sessionId,
      cached: false
    });

  } catch (error) {
    console.error('❌ [CONTROLLER] Error uploading ASS file:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to upload ASS file',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Update user-provided image metadata
export const updateUserProvidedImage = async (req: Request, res: Response) => {
  try {
    const { sessionId, imageId } = req.params;
    const { label, description, priority, preferredTimestamp } = req.body;

    if (!sessionId || !imageId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and image ID are required'
      });
    }

    const userImagesFile = path.join(TEMP_DIR, `${sessionId}_user_images.json`);

    if (!fs.existsSync(userImagesFile)) {
      return res.status(404).json({
        success: false,
        error: 'User images file not found'
      });
    }

    const userImages: UserProvidedImage[] = JSON.parse(fs.readFileSync(userImagesFile, 'utf8'));
    const imageIndex = userImages.findIndex(img => img.id === imageId);

    if (imageIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'User image not found'
      });
    }

    // Update the image metadata
    userImages[imageIndex] = {
      ...userImages[imageIndex],
      label: label || userImages[imageIndex].label,
      description: description !== undefined ? description : userImages[imageIndex].description,
      priority: (priority as 'high' | 'medium' | 'low') || userImages[imageIndex].priority,
      preferredTimestamp: preferredTimestamp !== undefined ? preferredTimestamp : userImages[imageIndex].preferredTimestamp
    };

    // Save updated metadata
    fs.writeFileSync(userImagesFile, JSON.stringify(userImages, null, 2));

    console.log(`✅ [CONTROLLER] Updated user image metadata: ${imageId}`);

    return res.status(200).json({
      success: true,
      message: 'User image metadata updated successfully',
      userImage: userImages[imageIndex]
    });

  } catch (error) {
    console.error('❌ [CONTROLLER] Error updating user-provided image:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update user-provided image',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get user image placement suggestions
export const getUserImagePlacementSuggestions = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { topic } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    // Get user images
    const userImagesFile = path.join(TEMP_DIR, `${sessionId}_user_images.json`);
    if (!fs.existsSync(userImagesFile)) {
      return res.status(200).json({
        success: true,
        suggestions: []
      });
    }

    const userImages: UserProvidedImage[] = JSON.parse(fs.readFileSync(userImagesFile, 'utf8'));

    // Get ASS file for analysis
    const assFilePath = path.join(TEMP_DIR, `${sessionId}_subtitles.ass`);
    if (!fs.existsSync(assFilePath)) {
      return res.status(404).json({
        success: false,
        error: 'ASS subtitle file not found. Please analyze ASS first.'
      });
    }

    // Import the image embedder service
    const { ImageEmbeddingService } = await import('../service/imageEmbedder');

    // Get placement suggestions
    const suggestions = await ImageEmbeddingService.getUserImagePlacementSuggestions(
      sessionId,
      assFilePath,
      topic || 'educational content',
      userImages
    );

    console.log(`✅ [CONTROLLER] Generated ${suggestions.length} user image placement suggestions`);

    return res.status(200).json({
      success: true,
      suggestions
    });

  } catch (error) {
    console.error('❌ [CONTROLLER] Error getting user image placement suggestions:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user image placement suggestions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// 🎯 NEW: Analyze user images for relevance and suggest placements
export const analyzeUserImages = async (req: Request, res: Response) => {
  try {
    const { sessionId, topic = 'educational content' } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    console.log('🔍 [CONTROLLER] Analyzing user images for session:', sessionId);
    console.log('🔍 [CONTROLLER] Topic:', topic);

    // Get conversation data for this session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        dialogues: {
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Get user images for this session
    const userImagesPath = path.join(TEMP_DIR, `${sessionId}_user_images.json`);
    
    if (!fs.existsSync(userImagesPath)) {
      console.log('❌ [CONTROLLER] User images file not found:', userImagesPath);
      return res.status(400).json({
        success: false,
        error: 'No user images found for this session'
      });
    }

    const allUserImages = JSON.parse(fs.readFileSync(userImagesPath, 'utf8'));
    
    // ANALYZE ALL user images and return top 3 suggestions
    const userImages = allUserImages; // Analyze all user images to find the best ones
    
    console.log('📊 [CONTROLLER] Total user images in file:', allUserImages.length);
    console.log('📊 [CONTROLLER] Analyzing all user images to find the best one:', userImages.length);
    console.log('📋 [CONTROLLER] Image details:', userImages.map((img: any) => ({ id: img.id, label: img.label, imagePath: img.imagePath })));

    if (!userImages || userImages.length === 0) {
      console.log('❌ [CONTROLLER] No user images to analyze');
      return res.status(400).json({
        success: false,
        error: 'No user images to analyze'
      });
    }

    // Generate ASS file for timing analysis
    const tempAssPath = path.join(TEMP_DIR, `${sessionId}_subtitles.ass`);
    
    if (!fs.existsSync(tempAssPath)) {
      // Generate ASS file ONLY for analysis (not full video generation)
      console.log('🎯 [CONTROLLER] Generating ASS file for timing analysis');
      
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
        return res.status(404).json({ success: false, error: 'Session not found' });
      }

      // Generate dialogue hash for caching
      const dialogueHash = generateDialogueHash(session.dialogues);

      // Check if WhisperX ASS file already exists in cache
      const cachedAssPath = checkAssCache(sessionId, dialogueHash);

      if (cachedAssPath) {
        console.log('✅ [CONTROLLER] Using cached WhisperX ASS file for analysis');
        // Copy cached file to expected location
        fs.copyFileSync(cachedAssPath, tempAssPath);
      } else {
        console.log('🎯 [CONTROLLER] Generating accurate WhisperX ASS file for analysis');

        // Import the video generator service functions
        const { getWhisperXAlignment, generateASSSubtitles } = await import('../service/videoGenerator');

        // Generate word-level timestamps using WhisperX for accurate timing
        const dialogueTimestamps: any[] = [];
        let cumulativeTime = 0;

        for (let i = 0; i < session.dialogues.length; i++) {
          const dialogue = session.dialogues[i];

          if (dialogue.audioFile) {
            console.log(`🎯 [CONTROLLER] Processing dialogue ${i + 1}/${session.dialogues.length} for ASS analysis`);

            // Get audio duration first
            const audioDuration = await new Promise<number>((resolve, reject) => {
              const ffmpeg = require('fluent-ffmpeg');
              if (!dialogue.audioFile) {
                reject(new Error('Audio file not found for dialogue'));
                return;
              }
              ffmpeg.ffprobe(dialogue.audioFile.filePath, (err: any, metadata: any) => {
                if (err) reject(err);
                else resolve(metadata.format.duration || 0);
              });
            });

            // Get word-level timestamps using WhisperX API
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

        // Generate ASS subtitle file with accurate WhisperX timing
        generateASSSubtitles(dialogueTimestamps, tempAssPath);

        // Save to cache as well
        const assContent = fs.readFileSync(tempAssPath, 'utf8');
        saveAssToCache(sessionId, dialogueHash, assContent);

        console.log('✅ [CONTROLLER] WhisperX ASS file generated for analysis');
      }
    }

    // Use the image embedder service to get suggestions
    const suggestions = await ImageEmbeddingService.getUserImagePlacementSuggestions(
      sessionId,
      tempAssPath,
      topic,
      userImages
    );

    // Save analysis results
    const analysisPath = path.join(TEMP_DIR, `${sessionId}_image_analysis.json`);
    fs.writeFileSync(analysisPath, JSON.stringify({
      sessionId,
      topic,
      analysisDate: new Date().toISOString(),
      userImages,
      suggestions,
      totalSuggestions: suggestions.length,
      highRelevance: suggestions.filter(s => s.relevanceScore >= 0.8).length,
      mediumRelevance: suggestions.filter(s => s.relevanceScore >= 0.6 && s.relevanceScore < 0.8).length,
      lowRelevance: suggestions.filter(s => s.relevanceScore < 0.6).length
    }, null, 2));

    console.log('✅ [CONTROLLER] Image analysis completed:', suggestions.length, 'suggestions generated');
    console.log('📊 [CONTROLLER] Analysis summary:');
    console.log(`   - High relevance (>0.8): ${suggestions.filter(s => s.relevanceScore > 0.8).length}`);
    console.log(`   - Medium relevance (0.6-0.8): ${suggestions.filter(s => s.relevanceScore >= 0.6 && s.relevanceScore <= 0.8).length}`);
    console.log(`   - Low relevance (<0.6): ${suggestions.filter(s => s.relevanceScore < 0.6).length}`);
    console.log(`   - Total images analyzed: ${allUserImages.length}`);

    // CRITICAL FIX: Apply suggestions back to user images
    // This ensures timestamps are saved for video generation
    if (suggestions.length > 0) {
      console.log('🔄 [CONTROLLER] Applying suggestion timestamps back to user images...');
      
      let updatedCount = 0;
      suggestions.forEach(suggestion => {
        // Update the specific image that was analyzed
        const userImageIndex = allUserImages.findIndex((img: any) => img.id === suggestion.userImageId);
        if (userImageIndex >= 0) {
          allUserImages[userImageIndex].preferredTimestamp = suggestion.suggestedTimestamp;
          allUserImages[userImageIndex].suggestionReasoning = suggestion.reasoning;
          allUserImages[userImageIndex].relevanceScore = suggestion.relevanceScore;
          updatedCount++;
          console.log(`📍 [CONTROLLER] Updated "${suggestion.userImageLabel}" -> ${suggestion.suggestedTimestamp}s (score: ${suggestion.relevanceScore})`);
        }
        
        // ALSO update any other images with the same label (duplicates)
        allUserImages.forEach((img: any, index: number) => {
          if (index !== userImageIndex && 
              img.label.toLowerCase() === suggestion.userImageLabel.toLowerCase() && 
              !img.preferredTimestamp) {
            img.preferredTimestamp = suggestion.suggestedTimestamp;
            img.suggestionReasoning = `Same as ${suggestion.userImageLabel} (duplicate)`;
            img.relevanceScore = suggestion.relevanceScore;
            updatedCount++;
            console.log(`📍 [CONTROLLER] Updated duplicate "${img.label}" -> ${suggestion.suggestedTimestamp}s (same label)`);
          }
        });
      });
      
      // Save updated user images back to file
      fs.writeFileSync(userImagesPath, JSON.stringify(allUserImages, null, 2));
      console.log(`✅ [CONTROLLER] Updated ${updatedCount} user images with timestamps`);
    }

    return res.status(200).json({
      success: true,
      message: 'User images analyzed successfully',
      analysis: {
        sessionId,
        topic,
        totalImages: userImages.length,
        suggestions,
        summary: {
          totalSuggestions: suggestions.length,
          highRelevance: suggestions.filter(s => s.relevanceScore >= 0.8).length,
          mediumRelevance: suggestions.filter(s => s.relevanceScore >= 0.6 && s.relevanceScore < 0.8).length,
          lowRelevance: suggestions.filter(s => s.relevanceScore < 0.6).length,
          averageRelevance: suggestions.length > 0 
            ? (suggestions.reduce((sum, s) => sum + s.relevanceScore, 0) / suggestions.length).toFixed(2)
            : '0.00'
        }
      }
    });

  } catch (error) {
    console.error('💥 [CONTROLLER] Error analyzing user images:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze user images',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// 🎯 NEW: Get image analysis results
export const getImageAnalysis = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    const analysisPath = path.join(TEMP_DIR, `${sessionId}_image_analysis.json`);
    
    if (!fs.existsSync(analysisPath)) {
      return res.status(404).json({
        success: false,
        error: 'No image analysis found for this session'
      });
    }

    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));

    return res.status(200).json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('💥 [CONTROLLER] Error getting image analysis:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get image analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// ASS Cache cleanup function
export const cleanupAssCache = async (req: Request, res: Response) => {
  try {
    console.log('🧹 [ASS CACHE] Starting cleanup of expired ASS files');

    const deletedCount = cleanupExpiredAssFiles();

    // Also cleanup old ASS files in temp directory
    let tempCleanupCount = 0;
    if (fs.existsSync(TEMP_DIR)) {
      const files = fs.readdirSync(TEMP_DIR);

      for (const file of files) {
        if (file.endsWith('_subtitles.ass')) {
          const filePath = path.join(TEMP_DIR, file);
          const stats = fs.statSync(filePath);
          const ageInHours = (Date.now() - stats.birthtime.getTime()) / (1000 * 60 * 60);

          if (ageInHours > ASS_CACHE_DURATION_HOURS) {
            fs.unlinkSync(filePath);
            tempCleanupCount++;
            console.log(`🗑️ [ASS CACHE] Cleaned up old temp ASS file: ${file}`);
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Cleaned up ${deletedCount} expired cached ASS files and ${tempCleanupCount} old temp ASS files`,
      cacheDeleted: deletedCount,
      tempDeleted: tempCleanupCount
    });

  } catch (error) {
    console.error('❌ [ASS CACHE] Error during cleanup:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to cleanup ASS cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
