import { PrismaClient } from '../../src/generated/prisma';
import fs from 'fs';
const ffmpeg = require('fluent-ffmpeg');

const prisma = new PrismaClient();

// Helper to compute WAV duration from header
function getWavDurationSeconds(filePath: string): number {
  try {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(128);
    fs.readSync(fd, header, 0, 128, 0);
    fs.closeSync(fd);

    // Validate RIFF/WAVE
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
      return 0;
    }

    let offset = 12;
    let byteRate = 0;
    let dataSize = 0;
    
    while (offset + 8 <= header.length) {
      const chunkId = header.toString('ascii', offset, offset + 4);
      const chunkSize = header.readUInt32LE(offset + 4);
      
      if (chunkId === 'fmt ') {
        const pos = offset + 8 + 8;
        if (pos + 4 <= header.length) {
          byteRate = header.readUInt32LE(pos);
        }
      } else if (chunkId === 'data') {
        dataSize = chunkSize;
      }
      
      offset += 8 + chunkSize;
      if (offset > header.length) break;
    }

    if (byteRate > 0 && dataSize > 0) {
      return dataSize / byteRate;
    }
    return 0;
  } catch {
    return 0;
  }
}

function getAudioDurationSeconds(filePath: string): Promise<number> {
  return new Promise<number>((resolve) => {
    if (!filePath || !fs.existsSync(filePath)) {
      resolve(0);
      return;
    }
    ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
      if (!err && typeof metadata?.format?.duration === 'number' && isFinite(metadata.format.duration) && metadata.format.duration > 0) {
        resolve(metadata.format.duration);
        return;
      }
      // Fallback for plain PCM wavs if ffprobe fails.
      resolve(getWavDurationSeconds(filePath));
    });
  });
}

/**
 * Calculate and update total duration for an audio session
 * This sums up all audio file durations in the session
 */
export async function updateSessionDuration(sessionId: string): Promise<number> {
  try {

    // Get all audio files for this session with their dialogues
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        dialogues: {
          include: {
            audioFile: true
          },
          orderBy: {
            order: 'asc'
          }
        }
      }
    });

    if (!session) {
      return 0;
    }

    // Calculate total duration from all audio files
    let totalDuration = 0;
    const durationUpdates: { id: string; duration: number }[] = [];

    for (const dialogue of session.dialogues) {
      if (!dialogue.audioFile || !dialogue.audioFile.filePath) {
        continue;
      }

      const audioFile = dialogue.audioFile;
      let duration = 0;

      if (fs.existsSync(audioFile.filePath)) {
        // Always re-probe from file metadata to avoid stale/short stored durations.
        duration = await getAudioDurationSeconds(audioFile.filePath);
      }
      // Fallback to stored value only if probing failed.
      if (duration <= 0 && typeof audioFile.duration === 'number' && isFinite(audioFile.duration) && audioFile.duration > 0) {
        duration = audioFile.duration;
      }
      // Store probed duration for future reads.
      if (duration > 0) {
        durationUpdates.push({ id: audioFile.id, duration });
      }

      totalDuration += duration;
    }

    // Update individual audio file durations if calculated
    for (const update of durationUpdates) {
      await prisma.audioFile.update({
        where: { id: update.id },
        data: { duration: update.duration }
      });
    }

    // Update session with total duration
    await prisma.session.update({
      where: { id: sessionId },
      data: { totalDuration }
    });

    return totalDuration;
  } catch (error) {
    return 0;
  }
}

/**
 * Get total duration for a session (from database)
 * Falls back to calculating if not stored
 */
export async function getSessionDuration(sessionId: string): Promise<number> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { totalDuration: true }
    });

    if (!session) {
      return 0;
    }

    // If duration is stored and valid, return it
    if (typeof session.totalDuration === 'number' && session.totalDuration > 0) {
      return session.totalDuration;
    }

    // Otherwise, calculate and store it
    return await updateSessionDuration(sessionId);
  } catch (error) {
    return 0;
  }
}
