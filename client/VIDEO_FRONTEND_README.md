# Video Generation Frontend

## Overview
The video generation frontend provides a user-friendly interface to create professional 9:16 videos with synchronized subtitles and character overlays from your AI-generated conversations.

## Features

### 🎬 Video Generator
- **Session Selection**: Choose from existing audio sessions with generated audio files
- **Background Video**: Provide a background video file path (server-side file)
- **Real-time Progress**: Monitor video generation progress
- **Error Handling**: Clear error messages and validation

### 🎥 Video Browser
- **Video Library**: View all generated videos
- **Download Videos**: Download generated videos to your device
- **Delete Videos**: Remove unwanted video files
- **Cleanup Tool**: Automatically remove videos older than 24 hours

## How to Use

### 1. Prepare Your Assets
Before generating videos, ensure you have:

- **Audio Session**: Generate conversations with audio using the Audio page
- **Background Video**: Place your background video file on the server
- **Character Images**: Ensure `stewie.png` and `peter.png` are in the project root

### 2. Generate a Video

1. **Navigate to Video Page**: Go to `/video` in your application
2. **Select Session**: Choose an audio session from the dropdown
3. **Provide Background Video**: Enter the full file path to your background video
4. **Generate**: Click "Generate Video with Subtitles"
5. **Monitor Progress**: Watch the progress indicator
6. **Download**: Once complete, download your video

### 3. Manage Videos

- **View Videos**: All generated videos are listed in the Video Browser
- **Download**: Click the download button next to any video
- **Delete**: Remove videos you no longer need
- **Cleanup**: Use the cleanup tool to remove old videos automatically

## File Path Format

When providing background video paths, use the full absolute path:

```
Windows: F:\Aniruddha\videos\background.mp4
Linux/Mac: /home/user/videos/background.mp4
```

## Video Specifications

### Output Format
- **Resolution**: 1080x1920 (9:16 aspect ratio)
- **Format**: MP4 (H.264 video, AAC audio)
- **Frame Rate**: 30 FPS
- **Video Bitrate**: 2000kbps
- **Audio Bitrate**: 128kbps

### Features Included
- **Synchronized Subtitles**: 3-4 words displayed at once
- **Word Highlighting**: Currently spoken word highlighted in yellow
- **Character Overlays**: Stewie (left) and Peter (right) appear when speaking
- **Professional Styling**: White text with black borders for readability

## Requirements

### Backend Dependencies
```json
{
  "fluent-ffmpeg": "^2.1.3",
  "ffmpeg-static": "^5.2.0"
}
```

### Character Images
Place these files in your project root:
- `stewie.png` (150x150px recommended)
- `peter.png` (150x150px recommended)

### FFmpeg
The backend automatically uses the bundled FFmpeg binary, so no system installation is required.

## API Endpoints

### Video Generation
```javascript
POST /api/video/generate
{
  "sessionId": "string",
  "backgroundVideoPath": "string"
}
```

### List Videos
```javascript
GET /api/video/list
```

### Download Video
```javascript
GET /api/video/download/:filename
```

### Delete Video
```javascript
DELETE /api/video/delete/:filename
```

### Cleanup Videos
```javascript
DELETE /api/video/cleanup
```

## Troubleshooting

### Common Issues

1. **"Session not found"**
   - Ensure the selected session has successfully generated audio files
   - Try refreshing the session list

2. **"Background video path invalid"**
   - Verify the file path exists on the server
   - Use absolute paths
   - Ensure the file is accessible by the backend process

3. **"Character image missing"**
   - Place `stewie.png` and `peter.png` in the project root
   - Ensure files are readable by the backend

4. **Video generation fails**
   - Check server logs for FFmpeg errors
   - Ensure background video is a valid video format
   - Verify audio session has complete audio files

### File Upload Limitations

Currently, the frontend only supports file path input for background videos. To use a video file:

1. Upload your video file to the server manually
2. Provide the full absolute path in the file path field
3. The backend will process the video from that location

## Performance Notes

- **Video Generation Time**: Depends on video length and complexity
- **File Sizes**: Generated videos are typically 10-50MB for 1-2 minute conversations
- **Storage**: Videos are stored in the `generated_videos/` directory
- **Cleanup**: Old videos (24h+) can be automatically removed

## Future Enhancements

- [ ] Direct file upload from browser
- [ ] Video preview before generation
- [ ] Custom subtitle styling options
- [ ] Multiple character support
- [ ] Background video library
- [ ] Video editing tools
