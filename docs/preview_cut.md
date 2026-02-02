# Real-Time Preview Feature

## Overview

The real-time preview feature provides instant visual feedback when editing video timelines, allowing users to see changes immediately without waiting for full video renders. This is achieved through a hybrid approach combining fast segment previews with progressive HLS (HTTP Live Streaming) generation.

## Goals

1. **Fast Feedback**: Show preview changes within ~500ms after timeline edits
2. **Continuous Playback**: Enable smooth, uninterrupted video playback
3. **Real-Time Updates**: Automatically regenerate preview when timeline content changes
4. **Performance**: Use GPU acceleration for faster encoding

## Architecture

### Hybrid Preview Approach

The system uses a two-phase preview generation strategy:

#### Phase 1: Fast Segment Preview (Immediate)
- Generates a **3-second MP4 segment** around the current playhead position
- Uses GPU-accelerated encoding (NVENC) for speed
- Starts playing **immediately** when ready (~1-2 seconds)
- Provides instant visual feedback for timeline changes

#### Phase 2: Full HLS Preview (Background)
- Generates a **complete HLS playlist** with 3-second segments
- Runs **asynchronously** in the background
- Uses GPU-accelerated encoding
- Automatically swaps in when ready for continuous playback

### Timeline Change Detection

- **Automatic Regeneration**: Detects when clips are moved, edited, or deleted
- **Debounced Updates**: Waits 500ms after user stops making changes before regenerating
- **Smart Hashing**: Uses content hash to detect actual timeline changes (not just playhead movement)
- **Playhead-Aware**: Regenerates preview around current playhead position

## User Flow

### Scenario 1: Initial Playback

1. User clicks **Play** button
2. System generates 3-second segment around playhead (e.g., 7.84s → 10.84s)
3. Segment starts playing **immediately** from position 0 (local segment time)
4. Playhead shows global timeline position (7.84s)
5. Background HLS generation starts
6. When HLS ready (~10-30 seconds), seamlessly swaps to full preview
7. Playback continues from same global position

### Scenario 2: Timeline Editing

1. User **moves an image clip** in timeline
2. System detects timeline change (via content hash)
3. After 500ms debounce, regenerates 3-second segment around current playhead
4. Preview video updates to show new clip position
5. Background HLS generation starts for updated timeline
6. User can continue editing while preview updates

### Scenario 3: Scrubbing Timeline

1. User **drags playhead** to different position (e.g., 12s)
2. Preview shows frame at that position (if segment covers it)
3. When user clicks **Play**, generates new segment around 12s
4. Plays immediately from segment start

## Technical Implementation

### Frontend Components

#### `EditorLayout.tsx`
- Orchestrates preview generation and playback
- Handles timeline change detection
- Manages segment ↔ HLS swap logic
- Tracks playhead position and segment boundaries

#### `CanvasPreview.tsx`
- Video player component with HLS.js support
- Handles time conversion between global timeline and local segment time
- Syncs playhead with video position
- Manages playback state

### Backend Services

#### `previewGenerator.ts`
- `generateTimelineSegmentPreview()`: Generates 3-second MP4 segment
- `generateTimelinePreviewHls()`: Generates full HLS playlist
- GPU-accelerated encoding using `h264_nvenc`
- Post-processes HLS playlist to rewrite segment URLs

#### `projectController.ts`
- API endpoints for preview generation
- Serves HLS manifests and segments
- Status endpoint for HLS readiness polling

### Key Algorithms

#### Time Conversion
```typescript
// Global timeline time → Local segment time (0-3s)
localTime = globalTime - segmentStartTime

// Local segment time → Global timeline time
globalTime = segmentStartTime + localTime
```

#### Timeline Change Detection
```typescript
// Hash includes: clip positions, durations, properties
timelineHash = JSON.stringify({
  tracks: tracks.map(t => ({
    id: t.id,
    clips: t.clips.map(c => ({
      id: c.id,
      start: round(c.start, 3),
      duration: round(c.duration, 3),
      // ... other properties
    }))
  }))
})

// Only regenerate if hash changed
if (previousHash !== timelineHash) {
  regeneratePreview()
}
```

## API Endpoints

### Preview Generation
- `POST /api/project/:id/preview` - Generate segment or full preview
  - Body: `{ playheadTime?: number }` - If provided, generates 3s segment
- `POST /api/project/:id/preview/hls` - Generate full HLS preview
- `GET /api/project/:id/preview/hls/status` - Check HLS readiness

### Preview Serving
- `GET /api/project/:id/preview` - Serve MP4 preview file
- `GET /api/project/:id/preview/hls/:version/index.m3u8` - Serve HLS manifest
- `GET /api/project/:id/preview/hls/:version/:segment` - Serve HLS segment

## Performance Optimizations

1. **GPU Encoding**: Uses NVENC hardware encoder for 5-10x faster encoding
2. **Segment Caching**: Reuses segments when timeline hasn't changed
3. **Debouncing**: Prevents excessive regeneration during rapid edits
4. **Background Processing**: HLS generation doesn't block UI
5. **Progressive Loading**: HLS segments load on-demand as video plays

## Edge Cases Handled

1. **Segment Boundaries**: Handles playhead at segment edges (0s, 3s)
2. **Video Source Changes**: Prevents sync conflicts when video src updates
3. **Playback State**: Maintains play/pause state during segment swaps
4. **Timeline Scrubbing**: Converts between global and local time correctly
5. **Concurrent Edits**: Debounces rapid timeline changes

## Future Improvements

1. **Progressive Segment Generation**: Generate segments on-demand as user scrubs
2. **Thumbnail Preview**: Show thumbnails on timeline scrub
3. **Preview Caching**: Cache segments by timeline hash for instant replay
4. **Multi-GPU Support**: Parallel encoding for even faster generation
5. **Quality Levels**: Adaptive bitrate based on network conditions

## Configuration

- **Segment Duration**: 3 seconds (configurable)
- **Debounce Delay**: 500ms (configurable)
- **HLS Segment Duration**: 3 seconds
- **GPU Encoder**: `h264_nvenc` (NVENC)
- **Preview Bitrate**: 750kbps

## Dependencies

- **Frontend**: `hls.js` for HLS playback
- **Backend**: `fluent-ffmpeg` with GPU acceleration
- **Encoding**: FFmpeg with NVENC support
