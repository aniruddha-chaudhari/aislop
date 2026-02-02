/**
 * Script to update totalDuration for existing audio sessions
 * Run this once to populate the totalDuration field for all existing sessions
 */

import { updateSessionDuration } from '../service/sessionDuration';
import { PrismaClient } from '../../src/generated/prisma';

const prisma = new PrismaClient();

async function updateAllSessionDurations() {
  try {
    // Get all sessions
    const sessions = await prisma.session.findMany({
      select: {
        id: true,
        name: true,
        totalDuration: true
      }
    });

    for (const session of sessions) {
      await updateSessionDuration(session.id);
    }
  } catch (error) {
    console.error('❌ Error updating session durations:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
updateAllSessionDurations();
