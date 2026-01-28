---
name: TimelineSchema_v1
overview: Upgrade the video workflow into an editor UI (client1) where AI proposes a first cut (template + audio + subtitles + image overlays) and you can micro-adjust on a timeline before backend export. Includes both frontend (client1) and backend (backend1) changes.
todos:
  - id: scaffold-client1-app
    content: Create client1/ Next app with Navbar (Audio Gen, Library, Projects links), dark theme, pnpm. Port api.ts config.
    status: completed
  - id: editor-shell-ui
    content: Build /editor/[projectId] with EditorLayout (sidebar, preview panel, timeline panel, properties panel). Mock data.
    status: completed
  - id: timeline-preview-panel
    content: Build PreviewPanel that renders template + subtitle/image/character overlays in HTML/canvas with playhead sync.
    status: completed
  - id: timeline-track-ui
    content: Build TimelinePanel with tracks, draggable clips, time ruler, playhead. Click to select, drag to move/resize.
    status: completed
  - id: port-audio-pages
    content: Port ConversationGenerator to /generate and AudioBrowser to /library pages. Wire to existing backend1 APIs.
    status: pending
  - id: projects-page
    content: Build /projects page with real project list from backend. Create New wizard (select template + audio session).
    status: pending
  - id: backend-project-api
    content: Add backend1 Project controller + service. CRUD endpoints, store in filesystem or Prisma.
    status: pending
  - id: backend-ai-draft
    content: Add AI draft generation endpoint that reuses existing image plan + subtitle logic, outputs Timeline JSON.
    status: pending
  - id: backend-timeline-compiler
    content: Implement timelineCompiler.ts that converts Timeline JSON to FFmpeg commands (reuse videoGenerator patterns).
    status: pending
  - id: backend-export-endpoint
    content: Add export endpoint that runs timeline compiler + emits SSE progress. Reuse existing stream controller.
    status: pending
  - id: wire-editor-to-backend
    content: Connect editor UI to real backend APIs (load project, save timeline edits, trigger export).
    status: pending
isProject: false
---

## Updated Workflow (unified app in client1)

client1 is a **single unified app** with everything: audio generation, audio library, and the new editor.

```
┌──────────────────────────────────────────────────────────────────┐
│  Navbar:  [Logo]    [Audio Gen]    [Library]    [Projects]       │
└──────────────────────────────────────────────────────────────────┘
                          │              │              │
                          ▼              ▼              ▼
                   ┌───────────┐  ┌───────────┐  ┌───────────┐
                   │ /generate │  │ /library  │  │ /projects │
                   │           │  │           │  │           │
                   │ Script +  │  │ All audio │  │ Project   │
                   │ Audio Gen │  │ sessions  │  │ list      │
                   └───────────┘  └─────┬─────┘  └─────┬─────┘
                                        │              │
                                        └──────┬───────┘
                                               ▼
                                      ┌─────────────────┐
                                      │ /editor/[id]    │
                                      │                 │
                                      │ Select template │
                                      │ + audio session │
                                      │       ▼         │
                                      │ AI Draft        │
                                      │       ▼         │
                                      │ Timeline Edit   │
                                      │       ▼         │
                                      │ Export          │
                                      └─────────────────┘
```

**Navigation:**

- **Audio Gen** (`/generate`) - Existing ConversationGenerator component (ported)
- **Library** (`/library`) - Browse all audio sessions (ported from AudioBrowser)
- **Projects** (`/projects`) - List of editor projects
- **Editor** (`/editor/[projectId]`) - The new timeline editor

## Phase 1: UI Shell (start here so you can see it)

### App Shell (all pages share this navbar)

```
┌──────────────────────────────────────────────────────────────────┐
│  [AI Slope]     [Audio Gen]     [Library]     [Projects]         │
└──────────────────────────────────────────────────────────────────┘
│                         Page Content                             │
└──────────────────────────────────────────────────────────────────┘
```

### Editor Layout (when on /editor/[projectId])

```
┌──────────────────────────────────────────────────────────────────┐
│  [AI Slope]  [Audio Gen]  [Library]  [Projects] │ "My Video" Save│
├────────────┬─────────────────────────────────┬───────────────────┤
│            │                                 │                   │
│  Sidebar   │       Preview Panel             │   Properties      │
│            │       (9:16 video frame)        │   Panel           │
│  - Assets  │       with overlays rendered    │                   │
│  - Audio   │       in HTML/canvas            │   (selected clip  │
│    Session │                                 │    properties)    │
│  - Images  │       Playhead time display     │                   │
│  - Chars   │                                 │                   │
│            │                                 │                   │
├────────────┴─────────────────────────────────┴───────────────────┤
│  Timeline Panel                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ [>] [||] [Export] ──o────────────────────── 00:00 / 02:34   │ │
│  ├─────────────────────────────────────────────────────────────┤ │
│  │ Audio     |=====================================|            │ │
│  │ Subs      |===|===|====|==|=====|===|======|==|              │ │
│  │ Images    |  ====  |    =====   |  ===  |                    │ │
│  │ Chars     |========|============|=======|                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Files to create (client1/)

**App shell + ported pages:**

- `client1/src/app/layout.tsx` - Root layout with Navbar
- `client1/src/app/components/Navbar.tsx` - Top nav with links
- `client1/src/app/generate/page.tsx` - Audio generation (port ConversationGenerator)
- `client1/src/app/library/page.tsx` - Audio sessions browser (port AudioBrowser)
- `client1/src/app/projects/page.tsx` - Project list / create new

**Editor pages + components:**

- `client1/src/app/editor/[projectId]/page.tsx` - Main editor
- `client1/src/app/components/editor/EditorLayout.tsx` - Editor shell with panels
- `client1/src/app/components/editor/PreviewPanel.tsx` - Video preview with overlays
- `client1/src/app/components/editor/TimelinePanel.tsx` - Tracks + clips
- `client1/src/app/components/editor/PropertiesPanel.tsx` - Selected item props
- `client1/src/app/components/editor/EditorSidebar.tsx` - Assets browser
- `client1/src/app/components/editor/TimelineTrack.tsx` - Single track row
- `client1/src/app/components/editor/TimelineClip.tsx` - Draggable clip

**Ported components (copy + adapt from client/):**

- `client1/src/app/components/ConversationGenerator.tsx`
- `client1/src/app/components/AudioBrowser.tsx`
- `client1/src/app/components/ImageUpload.tsx`
- `client1/src/app/components/FileUploader.tsx`

### Mock data structure (for UI dev)

```typescript
const mockProject = {
  id: "proj_123",
  name: "My Video",
  template: { type: "video", src: "/templates/minecraft.mp4" },
  audioSession: { id: "session_abc", duration: 154.5 },
  timeline: {
    duration: 154.5,
    tracks: [
      { id: "audio", type: "audio", clips: [{ start: 0, duration: 154.5 }] },
      { id: "subtitles", type: "subtitle", clips: [
        { id: "sub1", start: 0, duration: 2.5, text: "Hey Peter!", speaker: "Stewie" },
        { id: "sub2", start: 2.8, duration: 3.1, text: "What is it Stewie?", speaker: "Peter" },
      ]},
      { id: "images", type: "overlay", clips: [
        { id: "img1", start: 5, duration: 8, assetId: "img_abc", x: 0.1, y: 0.2, scale: 0.5 },
      ]},
      { id: "characters", type: "character", clips: [
        { id: "char1", start: 0, duration: 2.5, character: "Stewie", x: 0.8, y: 0.7 },
        { id: "char2", start: 2.8, duration: 3.1, character: "Peter", x: 0.2, y: 0.7 },
      ]},
    ]
  }
};
```

## Phase 2: Preview Panel (HTML/canvas overlay rendering)

The preview doesn't need ffmpeg yet. We render:

- Template video/image as `<video>` or `<img>` background
- Subtitles as positioned `<div>` with styling
- Image overlays as `<img>` with CSS transform (position, scale)
- Character images as `<img>` positioned

Playback: sync `<video>.currentTime` with timeline playhead; show/hide overlays based on their `start`/`duration`.

## Phase 3: Timeline Interaction

- Click clip to select (shows in Properties panel)
- Drag clip horizontally to change `start` time
- Drag clip edges to trim `duration`
- Drag overlay position in Preview to update `x`/`y`
- Properties panel for precise numeric input

## Phase 4: Backend Integration (backend1)

### Your Current Workflow (what backend already supports)

```
Audio Gen --> Audio Library --> Video Generator
                                     |
                         Select audio session
                                     |
                         Generate image plan (AI)
                                     |
                         Upload/adjust images
                                     |
                         Final video with subtitles + audio + images
```

**Existing endpoints we keep unchanged:**
- `/api/audio/*` - Audio generation, session management
- `/api/video/templates` - Template videos list
- `/api/video/generate-image-plan` - AI image plan generation (reuse)
- `/api/stream/:sessionId/files` - SSE progress (reuse)

### New Workflow (what we add)

```
Audio Gen --> Audio Library --> Projects --> Editor
                                     |            |
                         Create project    Select template + audio
                                     |            |
                                     +-----> AI Draft (subtitles + images + chars)
                                                  |
                                            Timeline editing
                                                  |
                                            Export (backend FFmpeg)
```

### Project Schema (shared between client1 and backend1)

```typescript
// backend1/src/schema/project.ts
import { z } from 'zod';

export const ClipSchema = z.object({
  id: z.string(),
  start: z.number(),           // seconds on timeline
  duration: z.number(),        // seconds
  // Type-specific fields (discriminated by track type)
  text: z.string().optional(),        // subtitle
  speaker: z.string().optional(),     // subtitle  
  assetId: z.string().optional(),     // overlay image
  character: z.string().optional(),   // character name
  x: z.number().optional(),           // position 0-1
  y: z.number().optional(),
  scale: z.number().optional(),
});

export const TrackSchema = z.object({
  id: z.string(),
  type: z.enum(['audio', 'subtitle', 'overlay', 'character']),
  name: z.string(),
  locked: z.boolean().optional(),
  clips: z.array(ClipSchema),
});

export const TimelineSchema = z.object({
  duration: z.number(),
  tracks: z.array(TrackSchema),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  format: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
  template: z.object({
    type: z.enum(['video', 'image']),
    path: z.string(),           // path to template file
    label: z.string(),
  }),
  audioSessionId: z.string(),
  timeline: TimelineSchema,
  status: z.enum(['draft', 'ready', 'exporting', 'exported']).default('draft'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Project = z.infer<typeof ProjectSchema>;
export type Timeline = z.infer<typeof TimelineSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Clip = z.infer<typeof ClipSchema>;
```

### Backend Endpoints (add to register.ts)

```typescript
// Project CRUD
{ method: 'POST', pattern: '/api/project/create', handler: project.createProject },
{ method: 'GET', pattern: '/api/project/list', handler: project.listProjects },
{ method: 'GET', pattern: '/api/project/:id', handler: project.getProject },
{ method: 'PUT', pattern: '/api/project/:id', handler: project.updateProject },
{ method: 'DELETE', pattern: '/api/project/:id', handler: project.deleteProject },

// AI Draft generation
{ method: 'POST', pattern: '/api/project/:id/ai-draft', handler: project.generateAiDraft },

// Timeline save (partial update)
{ method: 'PUT', pattern: '/api/project/:id/timeline', handler: project.saveTimeline },

// Export
{ method: 'POST', pattern: '/api/project/:id/export', handler: project.startExport },
{ method: 'GET', pattern: '/api/project/:id/export/status', handler: project.getExportStatus },
```

### New Backend Files

```
backend1/src/
├── schema/
│   └── project.ts              # Zod schemas (shared types)
├── controllers/
│   └── projectController.ts    # Route handlers
├── service/
│   ├── projectService.ts       # Project CRUD + storage
│   ├── aiDraftService.ts       # Generate timeline from audio session
│   └── timelineCompiler.ts     # Timeline JSON -> FFmpeg commands
└── routes/
    └── register.ts             # Add project routes
```

### AI Draft Generation (reuse existing logic)

The `aiDraftService.ts` will:

1. **Get audio session data** - Load from existing `/api/audio/session/:sessionId`
2. **Generate subtitles** - Reuse existing WhisperX timestamp logic from `videoGenerator.ts`
3. **Generate image plan** - Call existing `ImageEmbeddingService.generateImageEmbeddingPlanFromCleanTimestamps()`
4. **Generate character placements** - Based on speaker from dialogue timestamps
5. **Output Timeline JSON** - Convert all above into the Timeline schema format

```typescript
// backend1/src/service/aiDraftService.ts
export async function generateAiDraft(
  audioSessionId: string,
  templatePath: string,
): Promise<Timeline> {
  // 1. Load audio session (dialogue timestamps)
  const session = await loadAudioSession(audioSessionId);
  
  // 2. Generate subtitles track from dialogue
  const subtitleClips = session.dialogues.map(d => ({
    id: `sub_${d.index}`,
    start: d.startTime,
    duration: d.endTime - d.startTime,
    text: d.text,
    speaker: d.character,
  }));
  
  // 3. Generate image plan (reuse existing)
  const imagePlan = await ImageEmbeddingService.generateImageEmbeddingPlanFromCleanTimestamps(
    audioSessionId, session.dialogues, session.topic
  );
  const overlayClips = imagePlan.imageRequirements.map(img => ({
    id: `img_${img.id}`,
    start: img.timestamp,
    duration: img.duration || 8,
    assetId: img.id,
    x: 0.5, y: 0.3, scale: 0.5, // AI defaults
  }));
  
  // 4. Generate character placements based on speaker
  const characterClips = session.dialogues.map(d => ({
    id: `char_${d.index}`,
    start: d.startTime,
    duration: d.endTime - d.startTime,
    character: d.character,
    x: d.character === 'Stewie' ? 0.8 : 0.2,
    y: 0.7,
    scale: 0.6,
  }));
  
  return {
    duration: session.totalDuration,
    tracks: [
      { id: 't_audio', type: 'audio', name: 'Audio', locked: true, clips: [{ id: 'a1', start: 0, duration: session.totalDuration }] },
      { id: 't_subs', type: 'subtitle', name: 'Subtitles', clips: subtitleClips },
      { id: 't_imgs', type: 'overlay', name: 'Images', clips: overlayClips },
      { id: 't_chars', type: 'character', name: 'Characters', clips: characterClips },
    ],
  };
}
```

### Timeline Compiler (Timeline JSON -> FFmpeg)

The `timelineCompiler.ts` will convert Timeline JSON into FFmpeg commands:

```typescript
// backend1/src/service/timelineCompiler.ts
export async function compileTimeline(
  project: Project,
  outputPath: string,
): Promise<{ success: boolean; outputPath: string }> {
  const { timeline, template, audioSessionId } = project;
  
  // 1. Load audio session files
  const audioFiles = await getAudioSessionFiles(audioSessionId);
  
  // 2. Generate ASS subtitle file from timeline.tracks.subtitle
  const assPath = await generateAssFromTimeline(timeline);
  
  // 3. Build FFmpeg command
  // - Base: template video/image looped to duration
  // - Audio: concat audio session files
  // - Subtitles: burn in with ass filter
  // - Images: overlay filter with enable='between(t,start,end)'
  // - Characters: overlay filter
  
  // Reuse patterns from existing videoGenerator.ts and imageEmbedder.ts
  const ffmpegCommand = buildFfmpegCommand({
    templatePath: template.path,
    templateType: template.type,
    duration: timeline.duration,
    audioFiles,
    assPath,
    overlayClips: timeline.tracks.find(t => t.type === 'overlay')?.clips || [],
    characterClips: timeline.tracks.find(t => t.type === 'character')?.clips || [],
    outputPath,
  });
  
  return executeWithProgress(ffmpegCommand, project.id);
}
```

### Project Storage

For v1, store projects as JSON files in `backend1/storage/projects/`:

```
backend1/storage/projects/
├── proj_abc123.json           # Project metadata + timeline
├── proj_def456.json
└── ...
```

Later can migrate to Prisma if needed.

## Phase 5: Export Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Editor UI                                                      │
│                                                                 │
│  [Export] button clicked                                        │
│       │                                                         │
│       ▼                                                         │
│  POST /api/project/:id/export                                   │
│       │                                                         │
│       ▼                                                         │
│  Backend starts export job                                      │
│  Returns { jobId, streamEndpoint }                              │
│       │                                                         │
│       ▼                                                         │
│  Client connects to SSE: /api/stream/:jobId/files               │
│       │                                                         │
│       ▼                                                         │
│  Timeline Compiler runs:                                        │
│  - Load project + timeline                                      │
│  - Generate ASS from subtitle track                             │
│  - Build FFmpeg command                                         │
│  - Execute with progress events                                 │
│       │                                                         │
│       ▼                                                         │
│  SSE emits: { type: 'progress', percent: 45 }                   │
│  SSE emits: { type: 'progress', percent: 78 }                   │
│  SSE emits: { type: 'complete', videoPath: '/videos/...' }      │
│       │                                                         │
│       ▼                                                         │
│  Client shows download link                                     │
└─────────────────────────────────────────────────────────────────┘
```

Reuse existing SSE infrastructure from `streamController.ts` and `eventEmitter.ts`.

## Key Files Summary

### client1/ (new unified app) - PARTIALLY DONE

```
client1/
├── package.json
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout with Navbar [DONE]
│   │   ├── page.tsx                    # Redirect to /projects [DONE]
│   │   ├── generate/
│   │   │   └── page.tsx                # Audio generation [PLACEHOLDER - need to port]
│   │   ├── library/
│   │   │   └── page.tsx                # Audio sessions browser [PLACEHOLDER - need to port]
│   │   ├── projects/
│   │   │   └── page.tsx                # Project list [DONE - mock data]
│   │   ├── editor/
│   │   │   └── [projectId]/
│   │   │       └── page.tsx            # Main timeline editor [DONE - mock data]
│   │   ├── components/
│   │   │   ├── Navbar.tsx              # Top navigation bar [DONE]
│   │   │   ├── ConversationGenerator.tsx  # [TODO - port from client/]
│   │   │   ├── AudioBrowser.tsx           # [TODO - port from client/]
│   │   │   └── editor/
│   │   │       ├── EditorLayout.tsx    [DONE]
│   │   │       ├── PreviewPanel.tsx    [DONE]
│   │   │       ├── TimelinePanel.tsx   [DONE]
│   │   │       ├── PropertiesPanel.tsx [DONE]
│   │   │       └── EditorSidebar.tsx   [DONE]
│   │   └── globals.css                 [DONE]
│   ├── config/
│   │   └── api.ts                      # [TODO - copy from client/]
│   └── features/
│       └── editor/
│           ├── types.ts                [DONE]
│           └── mock.ts                 [DONE]
```

### backend1/ (additions) - TODO

```
backend1/src/
├── schema/
│   └── project.ts                      # NEW - Zod schemas for Project/Timeline
├── controllers/
│   └── projectController.ts            # NEW - Route handlers
├── service/
│   ├── projectService.ts               # NEW - Project CRUD + filesystem storage
│   ├── aiDraftService.ts               # NEW - Generate timeline from audio session
│   └── timelineCompiler.ts             # NEW - Timeline JSON -> FFmpeg commands
└── routes/
    └── register.ts                     # ADD project routes

storage/
└── projects/                           # NEW - Project JSON files
    └── proj_*.json
```

## Execution Order (remaining work)

### Frontend (client1)
1. **Port audio pages** - Copy ConversationGenerator + AudioBrowser, wire to existing backend1 APIs
2. **Wire projects page** - Replace mock data with real backend calls
3. **Wire editor** - Load real projects, save timeline edits, trigger export

### Backend (backend1)
4. **Schema** - Create `backend1/src/schema/project.ts` with Zod types
5. **Project service** - Create `projectService.ts` for CRUD + filesystem storage
6. **AI draft service** - Create `aiDraftService.ts` reusing existing image plan + subtitle logic
7. **Timeline compiler** - Create `timelineCompiler.ts` reusing videoGenerator + imageEmbedder patterns
8. **Project controller** - Create handlers for all project endpoints
9. **Register routes** - Add project routes to `register.ts`
10. **Test end-to-end** - Create project, generate draft, edit, export

## What stays unchanged

- `/api/audio/*` - All audio generation endpoints
- `/api/video/templates` - Template listing
- `/api/video/generate-image-plan` - Can still be used standalone
- `/api/stream/:sessionId/files` - SSE infrastructure (reused for export)
- `videoGenerator.ts` - Core FFmpeg logic (reused by timeline compiler)
- `imageEmbedder.ts` - Image overlay logic (reused by timeline compiler)