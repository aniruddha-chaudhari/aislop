# Family Guy Tech Chat Frontend

This is the frontend application for the Family Guy Tech Chat project. It provides a web interface to generate conversations between Peter and Stewie Griffin about technology topics, with optional Text-to-Speech (TTS) generation.

## Features

- **Conversation Generator**: Generate tech conversations between Peter and Stewie based on prompts
- **Audio Browser**: Browse and play previously generated audio files
- **Real-time Audio Playback**: Play generated audio directly in the browser
- **Download Support**: Download individual audio files
- **Responsive Design**: Works on desktop and mobile devices
- **Dark Mode Support**: Automatic dark mode based on system preference

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- pnpm (package manager)
- Backend server running on port 3000

### Installation

1. Navigate to the client directory:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm dev
   ```

4. Open [http://localhost:3001](http://localhost:3001) in your browser

### Configuration

The frontend is configured to connect to the backend API at `http://localhost:3000` by default. You can change this by setting the `NEXT_PUBLIC_API_URL` environment variable:

```bash
NEXT_PUBLIC_API_URL=http://your-backend-url:port
```

## Usage

### Generate Conversation

1. Go to the "Generate Conversation" tab
2. Enter a technology topic or question (e.g., "Explain microservices architecture")
3. Optionally check "Generate audio files (TTS)" to create voice files
4. Click "Generate Conversation"
5. View the generated dialogue between Peter and Stewie
6. If audio was generated, use the play/download buttons for each line

### Browse Audio Files

1. Go to the "Audio Browser" tab
2. Browse conversation sessions organized by timestamp
3. Expand sessions to see individual audio files
4. Play or download any audio file
5. Use the refresh button to update the list

## Technology Stack

- **Next.js 15** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **HTML5 Audio API** - Audio playback

## API Integration

The frontend communicates with the backend through these endpoints:

- `POST /api/assistant/conversation` - Generate new conversations
- `GET /api/assistant/audio` - List all audio sessions
- `GET /api/assistant/audio/:filename` - Download specific audio files

## Character Styling

- **Stewie Griffin** - Purple theme with sophisticated styling
- **Peter Griffin** - Green theme with casual styling
- **Audio Controls** - Blue play buttons, gray download buttons

## Troubleshooting

### Backend Connection Issues

If you see "Failed to connect to server" errors:

1. Ensure the backend server is running on port 3000
2. Check that CORS is properly configured in the backend
3. Verify the API_BASE_URL in the frontend configuration

### Audio Playback Issues

If audio files won't play:

1. Check browser console for errors
2. Ensure audio files exist in the backend
3. Verify the audio file format is supported (WAV)
4. Check browser permissions for audio playback

### Development Server Issues

If the development server won't start:

1. Clear node_modules and reinstall: `rm -rf node_modules && pnpm install`
2. Check for port conflicts (default port is 3001)
3. Ensure all dependencies are properly installed

## Building for Production

To build the application for production:

```bash
pnpm build
pnpm start
```

The optimized build will be created in the `.next` directory.
