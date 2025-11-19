import dotenv from 'dotenv';
import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import assistantRoutes from './routes/assistantRoutes';
import audioRoutes from './routes/audioRoutes';
import videoRoutes from './routes/videoRoutes';
import imageRoutes from './routes/imageRoutes';

dotenv.config({ path: '.env.local' });

const app: Express = express();
const port = Number(process.env.PORT) || 5000;

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
  next();
});

app.use(express.json());

// Configure CORS
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin) return callback(null, true);
    
    if (origin.match(/^http:\/\/localhost:\d+$/) || origin.match(/^http:\/\/127\.0\.0\.1:\d+$/)) {
      return callback(null, true);
    }
    
    if (origin.match(/^http:\/\/192\.168\.\d+\.\d+:\d+$/)) {
      return callback(null, true);
    }
    
    const allowedOrigins = [
      'http://localhost:5376', 
      'http://127.0.0.1:5376', 
      'http://localhost:3000', 
      'http://127.0.0.1:3000',
      'http://192.168.56.1:5376',
      'http://192.168.56.1:3000',
      'http://192.168.0.104:5376',
      'http://192.168.0.104:3000'
    ];
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

app.use('/generated_images', express.static(path.join(process.cwd(), 'generated_images')));

// Additional CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request for:', req.path, 'from origin:', req.headers.origin);
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use('/api/assistant', assistantRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/image', imageRoutes);

// Test endpoint
app.get('/api/test', (req, res) => {
  console.log('Test endpoint hit!');
  res.json({
    message: 'Backend connection successful!',
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Hello World!',
    server: 'AI Slope Backend',
    status: 'Running'
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
  console.log(`Server is also available on http://localhost:${port}`);
  console.log(`Backend API available at http://localhost:${port}/api/assistant`);
  console.log(`CORS enabled for origins: http://localhost:5376, http://127.0.0.1:5376, http://localhost:3000, http://127.0.0.1:3000, http://192.168.56.1:5376, http://192.168.56.1:3000, and all localhost/127.0.0.1/192.168.x.x origins`);

  const cleanupInterval = 6 * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      console.log('🧹 [SCHEDULED] Running ASS cache cleanup...');

      const fs = require('fs');
      const path = require('path');

      const ASS_CACHE_DIR = path.join(process.cwd(), 'temp', 'ass_cache');
      const ASS_CACHE_DURATION_HOURS = 24;

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
      console.error(' [SCHEDULED] Error during ASS cache cleanup:', error);
    }
  }, cleanupInterval);

  console.log(`🧹 ASS cache cleanup scheduled every ${cleanupInterval / (60 * 60 * 1000)} hours`);
});

// Error handling
app.on('error', (error: any) => {
  console.error('Server error:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
