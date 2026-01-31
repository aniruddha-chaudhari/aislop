/**
 * Script to update totalDuration for existing audio sessions
 * Run this once to populate the totalDuration field for all existing sessions
 */

import { updateSessionDuration } from '../service/sessionDuration';
import { PrismaClient } from '../../src/generated/prisma';

const prisma = new PrismaClient();

async function updateAllSessionDurations() {
  try {
    console.log('📊 Starting to update durations for all sessions...\n');

    // Get all sessions
    const sessions = await prisma.session.findMany({
      select: {
        id: true,
        name: true,
        totalDuration: true
      }
    });

    console.log(`Found ${sessions.length} sessions\n`);

    for (const session of sessions) {
      console.log(`Processing session: ${session.id} (${session.name || 'Unnamed'})`);
      console.log(`  Current stored duration: ${session.totalDuration ?? 'not set'}`);
      
      const duration = await updateSessionDuration(session.id);
      console.log(`  Updated duration: ${duration.toFixed(2)}s\n`);
    }

    console.log('✅ All session durations updated!');
  } catch (error) {
    console.error('❌ Error updating session durations:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
updateAllSessionDurations();
