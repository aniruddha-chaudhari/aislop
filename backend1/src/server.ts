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
import { handleRequest, type BunServer } from './router';
// Redis removed - using in-memory event emitter for SSE

const port = Number(process.env.PORT) || 5000;
const ASS_CACHE_DIR = path.join(process.cwd(), 'storage', 'temp', 'ass_cache');
const ASS_CACHE_DURATION_HOURS = 24;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

// @ts-expect-error Bun global is provided by Bun runtime (bun-types may not resolve in all environments)
const server = Bun.serve({
  port,
  hostname: '0.0.0.0',
  idleTimeout: 255, // Maximum allowed: 255 seconds (~4.25 minutes) for SSE connections
  async fetch(request: Request, srv: BunServer): Promise<Response> {
    return handleRequest(request, srv);
  },
});

console.log(`\n🚀 Backend server listening on http://localhost:${port}`);
console.log('   Image plan logs: watch this terminal when you click "Image Plan" in the editor.\n');

setInterval(() => {
  try {
    if (!fs.existsSync(ASS_CACHE_DIR)) return;
    const files = fs.readdirSync(ASS_CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith('.ass')) continue;
      const filePath = path.join(ASS_CACHE_DIR, file);
      const stats = fs.statSync(filePath);
      const ageInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
      if (ageInHours > ASS_CACHE_DURATION_HOURS) fs.unlinkSync(filePath);
    }
  } catch (_) {}
}, CLEANUP_INTERVAL_MS);
