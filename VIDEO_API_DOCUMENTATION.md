# Video Generation API Documentation

## Overview
The video generation API creates 9:16 aspect ratio videos with subtitles, character overlays, and synchronized audio from existing audio sessions.

## Endpoints

### 1. Generate Video with Subtitles
**POST** `/api/video/generate`

Creates a video with background video, character images, and synchronized subtitles with word highlighting.

#### Request Body
```json
{
  "sessionId": "string", // Required: Session ID with generated audio files
  "backgroundVideoPath": "string" // Required: Path to background video file
}
```

#### Response
```json
{
  "success": true,
  "message": "Video with subtitles generated successfully",
  "videoPath": "path/to/generated/video.mp4",
  "videoFile": {
    "filename": "sessionId_with_subtitles.mp4",
    "path": "absolute/path/to/video.mp4",
    "fileSize": 1234567,
    "sessionId": "sessionId"
  },
  "stats": {
    "totalDialogues": 8,
    "videoDuration": "Generated",
    "aspectRatio": "9:16"
  }
}
```

### 2. List Generated Videos
**GET** `/api/video/list`

Returns all generated video files.

#### Response
```json
{
  "success": true,
  "videos": [
    {
      "filename": "sessionId_with_subtitles.mp4",
      "path": "absolute/path/to/video.mp4",
      "fileSize": 1234567,
      "createdAt": "2025-09-03T10:00:00.000Z",
      "sessionId": "sessionId"
    }
  ]
}
```

### 3. Download Video
**GET** `/api/video/download/:filename`

Downloads a specific video file.

#### Parameters
- `filename` (string): Name of the video file to download

#### Response
- Streams the video file as `video/mp4`

### 4. Delete Video
**DELETE** `/api/video/delete/:filename`

Deletes a specific video file.

#### Parameters
- `filename` (string): Name of the video file to delete

#### Response
```json
{
  "success": true,
  "message": "Video filename deleted successfully"
}
```

### 5. Cleanup Old Videos
**DELETE** `/api/video/cleanup`

Deletes video files older than 24 hours.

#### Response
```json
{
  "success": true,
  "message": "Cleaned up X old video files",
  "deletedCount": 5
}
```

## Video Features

### 1. Aspect Ratio
- **Format**: 9:16 (1080x1920) - Perfect for mobile/social media
- **Background**: Automatically resized and cropped to fit

### 2. Character Overlays
- **Stewie**: Appears on the left side (150x150px)
- **Peter**: Appears on the right side (150x150px)
- **Timing**: Characters appear only when speaking
- **Images Required**: 
  - `stewie.png` in project root
  - `peter.png` in project root

### 3. Synchronized Subtitles
- **Word Grouping**: 3-4 words displayed at once
- **Highlighting**: Currently spoken word highlighted in yellow
- **Style**: White text with black border for readability
- **Position**: Bottom center of video
- **Font Size**: 60px

### 4. Audio Processing
- **Concatenation**: All dialogue audio files combined seamlessly
- **Sync**: Perfect synchronization with subtitles and character overlays
- **Quality**: High-quality audio processing

## Requirements

### System Dependencies
```json
{
  "dependencies": {
    "fluent-ffmpeg": "^2.1.3",
    "ffmpeg-static": "^5.2.0"
  },
  "devDependencies": {
    "@types/fluent-ffmpeg": "^2.1.27"
  }
}
```

### File Requirements
1. **Audio Session**: Must have successful audio files generated
2. **Background Video**: Any format supported by FFmpeg
3. **Character Images**: PNG format recommended
   - `stewie.png` in project root
   - `peter.png` in project root

### Directory Structure
```
project_root/
├── generated_videos/        # Auto-created for output videos
├── generated_audio/         # Existing audio session files
├── stewie.png              # Character image
└── peter.png               # Character image
```

## Usage Flow

1. **Generate Audio Session** (using existing audio API)
2. **Prepare Assets**:
   - Background video file
   - Character images (stewie.png, peter.png)
3. **Call Video Generation**:
   ```javascript
   const response = await fetch('/api/video/generate', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       sessionId: 'your-session-id',
       backgroundVideoPath: 'path/to/background.mp4'
     })
   });
   ```
4. **Download Generated Video**:
   ```javascript
   window.open(`/api/video/download/${filename}`);
   ```

## Error Handling

### Common Errors
- **400**: Missing sessionId or invalid background video path
- **404**: Session not found or video file not found
- **500**: FFmpeg processing error or missing character images

### Example Error Response
```json
{
  "success": false,
  "error": "Character image missing for Stewie: path/to/stewie.png"
}
```
