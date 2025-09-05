import dotenv from 'dotenv';
import express, { Express } from 'express';
import cors from 'cors';
import assistantRoutes from './routes/assistantRoutes';
import audioRoutes from './routes/audioRoutes';
import videoRoutes from './routes/videoRoutes';

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
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], // Add specific origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(cors(corsOptions));

// Additional CORS middleware for preflight requests and Brave browser compatibility
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Additional headers for browser compatibility
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request for:', req.path);
    res.sendStatus(200);
  } else {
    next();
  }
});

// Routes
app.use('/api/assistant', assistantRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/video', videoRoutes);

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
  console.log(`CORS enabled for origins: http://localhost:3000, http://127.0.0.1:3000`);
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
