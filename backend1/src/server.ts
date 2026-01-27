// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import * as fs from 'fs';
import path from 'path';

if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
}
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
}

import './routes/register';
import { handleRequest } from './router';

const port = Number(process.env.PORT) || 5000;
const ASS_CACHE_DIR = path.join(process.cwd(), 'temp', 'ass_cache');
const ASS_CACHE_DURATION_HOURS = 24;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

const server = Bun.serve({
  port,
  hostname: '0.0.0.0',
  async fetch(request, srv) {
    return handleRequest(request, srv);
  },
});

console.log(`Server is running on http://0.0.0.0:${port}`);
console.log(`Server is also available on http://localhost:${port}`);
console.log(`Backend API available at http://localhost:${port}/api/assistant`);
console.log(
  `CORS enabled for origins: http://localhost:5376, http://127.0.0.1:5376, http://localhost:3000, http://127.0.0.1:3000, http://192.168.56.1:5376, http://192.168.56.1:3000, and all localhost/127.0.0.1/192.168.x.x origins`
);

setInterval(() => {
  try {
    console.log('🧹 [SCHEDULED] Running ASS cache cleanup...');
    if (!fs.existsSync(ASS_CACHE_DIR)) return;
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
        console.log(`🗑️ [SCHEDULED] Cleaned up expired ASS file: ${file} (${ageInHours.toFixed(2)}h old)`);
      }
    }
    if (deletedCount > 0) {
      console.log(`🗑️ [SCHEDULED] Cleaned up ${deletedCount} expired ASS files`);
    }
  } catch (error) {
    console.error('❌ [SCHEDULED] Error during ASS cache cleanup:', error);
  }
}, CLEANUP_INTERVAL_MS);

console.log(`🧹 ASS cache cleanup scheduled every ${CLEANUP_INTERVAL_MS / (60 * 60 * 1000)} hours`);

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
