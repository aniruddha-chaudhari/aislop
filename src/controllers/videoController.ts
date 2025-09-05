import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../generated/prisma';
import { generateVideoWithSubtitles as generateVideoService } from '../service/videoGenerator';

// Initialize Prisma client
const prisma = new PrismaClient();

// Video generation configuration
const VIDEO_OUTPUT_DIR = path.join(process.cwd(), 'generated_videos');

// Ensure directories exist
if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
  fs.mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });
  console.log(`📁 [INIT] Created directory: ${VIDEO_OUTPUT_DIR}`);
}

// Main video generation function with enhanced timing
export const generateVideoWithSubtitles = async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { sessionId, backgroundVideoPath, device = 'cuda' } = req.body;

    console.log('🎬 [CONTROLLER] Received video generation request for session:', sessionId);

    // Call the video generator service
    const result = await generateVideoService(sessionId, backgroundVideoPath, device);

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
