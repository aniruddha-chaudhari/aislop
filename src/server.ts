import dotenv from 'dotenv';
import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import assistantRoutes from './routes/assistantRoutes';
import audioRoutes from './routes/audioRoutes';
import videoRoutes from './routes/videoRoutes';
import imageRoutes from './routes/imageRoutes';

// Load environment variables
dotenv.config({ path: '.env.local' });

const app: Express = express();
const port = process.env.PORT || 5000;

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Middleware
app.use(express.json());

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost and 127.0.0.1 origins for development
    if (origin.match(/^http:\/\/localhost:\d+$/) || origin.match(/^http:\/\/127\.0\.0\.1:\d+$/)) {
      return callback(null, true);
    }
    
    // Allow 192.168.x.x origins for local network development
    if (origin.match(/^http:\/\/192\.168\.\d+\.\d+:\d+$/)) {
      return callback(null, true);
    }
    
    // Allow specific origins
    const allowedOrigins = [
      'http://localhost:5376', 
      'http://127.0.0.1:5376', 
      'http://localhost:3000', 
      'http://127.0.0.1:3000',
      'http://192.168.56.1:5376',
      'http://192.168.56.1:3000'
    ];
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(cors(corsOptions));

// Static files
app.use('/generated_images', express.static(path.join(process.cwd(), 'generated_images')));

// Additional CORS middleware for preflight requests and browser compatibility
app.use((req, res, next) => {
  // Let the cors middleware handle the origin
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Additional headers for browser compatibility
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

// Routes
app.use('/api/assistant', assistantRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/image', imageRoutes);

// Test endpoint for debugging connectivity
app.get('/api/test', (req, res) => {
  console.log('Test endpoint hit!');
  res.json({
    message: 'Backend connection successful!',
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: 'Hello World!',
    server: 'AI Slope Backend',
    status: 'Running'
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`Backend API available at http://localhost:${port}/api/assistant`);
  console.log(`CORS enabled for origins: http://localhost:5376, http://127.0.0.1:5376, http://localhost:3000, http://127.0.0.1:3000, http://192.168.56.1:5376, http://192.168.56.1:3000, and all localhost/127.0.0.1/192.168.x.x origins`);

  // Schedule ASS cache cleanup every 6 hours
  const cleanupInterval = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
  setInterval(async () => {
    try {
      console.log('🧹 [SCHEDULED] Running ASS cache cleanup...');

      // Import the cleanup function dynamically
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
      console.error('❌ [SCHEDULED] Error during ASS cache cleanup:', error);
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
