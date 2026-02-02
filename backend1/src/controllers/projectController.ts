import type { HttpContext, HandlerResult } from '../utils/http';
import { jsonResponse } from '../utils/http';
import * as projectService from '../service/projectService';
import { generateSubtitlesAndCharacters, generateImagePlan } from '../service/aiDraftService';
import { getSessionDuration } from '../service/sessionDuration';
import type { Track } from '../schema/project';
import { compileTimeline } from '../service/timelineCompiler';
import { generatePreview, generateTimelinePreview, generateTimelineSegmentPreview, generateTimelinePreviewHls } from '../service/previewGenerator';
import { ProjectSchema, TimelineSchema } from '../schema/project';
import fs from 'fs';
import path from 'path';

/**
 * Create a new project
 * POST /api/project/create
 */
export async function createProject(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const body = ctx.body as any;
    const { name, audioSessionId, templatePath, templateLabel, templateType, format } = body;

    if (!name) {
      return jsonResponse(400, { 
        success: false, 
        error: 'Missing required field: name' 
      });
    }

    // Audio session + template are optional at creation time.
    // The editor flow can attach these later.
    const finalAudioSessionId = audioSessionId || 'no-session';
    const finalTemplatePath = templatePath || 'placeholder.mp4';
    const finalTemplateLabel = templateLabel || 'No Template';

    // Set timeline duration from audio session so template is "cut to audio size" from the start
    let initialDuration: number | undefined;
    if (finalAudioSessionId && finalAudioSessionId !== 'no-session') {
      const sessionDur = await getSessionDuration(finalAudioSessionId);
      if (sessionDur > 0) initialDuration = sessionDur;
    }

    const project = await projectService.createProject(
      name,
      finalAudioSessionId,
      finalTemplatePath,
      finalTemplateLabel,
      templateType || 'video',
      format || '9:16',
      initialDuration
    );

    return jsonResponse(200, {
      success: true,
      project,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create project',
    });
  }
}

/**
 * List all projects
 * GET /api/project/list
 */
export async function listProjects(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projects = await projectService.listProjects();

    return jsonResponse(200, {
      success: true,
      projects,
      count: projects.length,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list projects',
    });
  }
}

/**
 * Get a specific project
 * GET /api/project/:id
 */
export async function getProject(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    let project = await projectService.getProject(projectId);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    // If timeline duration is wrong (0 or longer than session), fix from session so editor shows "template cut to session size"
    const timelineDuration = project.timeline?.duration;
    const hasSession = project.audioSessionId && project.audioSessionId !== 'no-session';

    if (hasSession) {
      const sessionDur = await getSessionDuration(project.audioSessionId);
      const wrongDuration =
        typeof timelineDuration !== 'number' ||
        timelineDuration <= 0 ||
        timelineDuration > sessionDur;
      if (sessionDur > 0 && wrongDuration) {
        const targetDur = sessionDur;
        const tracks = (project.timeline?.tracks ?? []).map((track: any) => ({
          ...track,
          clips: (track.clips ?? []).map((clip: any) => {
            const start = clip.start ?? 0;
            const duration = clip.duration ?? 0;
            const end = start + duration;
            if (end <= targetDur) return clip;
            return { ...clip, duration: Math.max(0.01, targetDur - start) };
          }),
        }));
        project = {
          ...project,
          timeline: {
            ...project.timeline,
            duration: targetDur,
            tracks,
          },
        };
      }
    }

    return jsonResponse(200, {
      success: true,
      project,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get project',
    });
  }
}

/**
 * Update a project
 * PUT /api/project/:id
 */
export async function updateProject(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;
    const body = ctx.body as any;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    const project = await projectService.updateProject(projectId, body);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    return jsonResponse(200, {
      success: true,
      project,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update project',
    });
  }
}

/**
 * Delete a project
 * DELETE /api/project/:id
 */
export async function deleteProject(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    const deleted = await projectService.deleteProject(projectId);

    if (!deleted) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    return jsonResponse(200, {
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete project',
    });
  }
}

/**
 * Generate subtitles and character clips for a project (local WhisperX)
 * POST /api/project/:id/ai-draft
 */
export async function generateAiDraftForProject(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;
    const body = ctx.body as any;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    const project = await projectService.getProject(projectId);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    if (!project.audioSessionId || project.audioSessionId === 'no-session') {
      return jsonResponse(400, {
        success: false,
        error: 'Audio session is required',
      });
    }

    const topic = body.topic || project.name || 'Technical conversation';

    const result = await generateSubtitlesAndCharacters(project.audioSessionId, topic);

    // Merge with existing timeline (keep overlay tracks: template, t_imgs)
    const existing = project.timeline;
    const existingTracks = (existing?.tracks ?? []) as Track[];
    const overlayTracks = existingTracks.filter((t) => t.type === 'overlay');
    const tracks: Track[] = [
      ...overlayTracks,
      result.audioTrack,
      result.subtitleTrack,
      result.characterTrack,
    ];
    const timeline = {
      duration: Math.max(result.duration, existing?.duration ?? 0),
      tracks,
    };

    const updatedProject = await projectService.updateTimeline(projectId, timeline);

    return jsonResponse(200, {
      success: true,
      project: updatedProject,
      timeline,
      message: 'Subtitles & characters generated successfully',
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate AI draft',
    });
  }
}

/**
 * Generate image plan overlay clips for a project
 * POST /api/project/:id/image-plan
 */
export async function generateImagePlanForProject(ctx: HttpContext): Promise<HandlerResult> {
  // Log immediately so you see output in the terminal where the backend is running (not browser console)
  process.stdout.write('[IMAGE PLAN] POST /api/project/:id/image-plan hit\n');

  try {
    const projectId = ctx.params?.id;
    const body = ctx.body as any;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    const project = await projectService.getProject(projectId);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    if (!project.audioSessionId || project.audioSessionId === 'no-session') {
      return jsonResponse(400, {
        success: false,
        error: 'Audio session is required',
      });
    }

    const topic = body.topic || project.name || 'Technical conversation';
    const result = await generateImagePlan(project.audioSessionId, topic);

    // Merge overlay track into existing timeline: replace t_imgs in place to preserve track order
    const existing = project.timeline;
    const existingTracks = (existing?.tracks ?? []) as Track[];
    const hasImagesTrack = existingTracks.some((t) => t.id === 't_imgs');
    const tracks: Track[] = hasImagesTrack
      ? existingTracks.map((t) => (t.id === 't_imgs' ? result.overlayTrack : t))
      : [...existingTracks, result.overlayTrack];
    // Keep existing duration if set; otherwise use audio session duration so template stays "cut to audio size"
    const existingDuration = existing?.duration;
    const duration =
      typeof existingDuration === 'number' && existingDuration > 0
        ? existingDuration
        : (await getSessionDuration(project.audioSessionId)) || 60;
    const timeline = {
      duration,
      tracks,
    };

    const updatedProject = await projectService.updateTimeline(projectId, timeline);

    return jsonResponse(200, {
      success: true,
      project: updatedProject,
      timeline,
      message: 'Image plan generated successfully',
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate image plan',
    });
  }
}

/**
 * Save timeline edits
 * PUT /api/project/:id/timeline
 */
export async function saveTimeline(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;
    const body = ctx.body as any;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    if (!body.timeline) {
      return jsonResponse(400, {
        success: false,
        error: 'Timeline data is required',
      });
    }

    // Validate timeline with schema
    const timeline = TimelineSchema.parse(body.timeline);

    const project = await projectService.updateTimeline(projectId, timeline);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    return jsonResponse(200, {
      success: true,
      project,
      message: 'Timeline saved successfully',
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save timeline',
    });
  }
}

/**
 * Start video export
 * POST /api/project/:id/export
 */
export async function startExport(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    const project = await projectService.getProject(projectId);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    if (!project.timeline || project.timeline.tracks.length === 0) {
      return jsonResponse(400, {
        success: false,
        error: 'Project has no timeline to export. Generate AI draft first.',
      });
    }

    const body = (ctx.body as { step?: number }) ?? {};
    const exportStep = Math.min(4, Math.max(1, Number(body.step ?? ctx.query?.step ?? 4))) as 1 | 2 | 3 | 4;

    // Update status to exporting
    await projectService.updateStatus(projectId, 'exporting');

    // Start export in background (don't await)
    compileTimeline(project, { exportStep })
      .then(async (result) => {
        const success = result && typeof result === 'object' && result.success;
        if (success) {
          await projectService.updateStatus(projectId, 'exported');
        } else {
          await projectService.updateStatus(projectId, 'ready');
          console.error('[EXPORT] Export failed', { projectId, error: result?.error });
        }
      })
      .catch(async (err) => {
        console.error('[EXPORT] Export error', { projectId, error: err?.message ?? err });
        await projectService.updateStatus(projectId, 'ready');
      });

    // Return immediately with job info
    return jsonResponse(200, {
      success: true,
      jobId: projectId,
      streamEndpoint: `/api/stream/${projectId}/files`,
      message: 'Export started. Connect to stream endpoint for progress updates.',
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start export',
    });
  }
}

/**
 * Get export status
 * GET /api/project/:id/export/status
 */
export async function getExportStatus(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    const project = await projectService.getProject(projectId);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    return jsonResponse(200, {
      success: true,
      status: project.status,
      projectId: project.id,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get export status',
    });
  }
}

/**
 * Upload image for an overlay clip
 * POST /api/project/:id/upload-image
 */
export async function uploadImageForClip(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    const project = await projectService.getProject(projectId);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    // Get uploaded file from multipart form
    const file = ctx.file;
    if (!file) {
      return jsonResponse(400, {
        success: false,
        error: 'No image file provided',
      });
    }

    // Get assetId from form data (which clip this image is for)
    const body = ctx.body as { assetId?: string } | undefined;
    const assetId = body?.assetId || `asset_${Date.now()}`;

    // Save image to storage/images/{sessionId}/
    const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'images');
    const sessionDir = path.join(IMAGE_UPLOAD_DIR, project.audioSessionId);

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const imageFilename = `${assetId}.png`;
    const imagePath = path.join(sessionDir, imageFilename);

    // Copy from upload temp path to final location
    await fs.promises.copyFile(file.path, imagePath);

    return jsonResponse(200, {
      success: true,
      assetId,
      imagePath,
      filename: imageFilename,
      message: 'Image uploaded successfully',
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload image',
    });
  }
}

/**
 * List uploaded images for a project
 * GET /api/project/:id/images
 */
export async function listProjectImages(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    const project = await projectService.getProject(projectId);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'images');
    const sessionDir = path.join(IMAGE_UPLOAD_DIR, project.audioSessionId);

    if (!fs.existsSync(sessionDir)) {
      return jsonResponse(200, {
        success: true,
        images: [],
        count: 0,
      });
    }

    const files = fs.readdirSync(sessionDir);
    const images = files
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .map(filename => {
        const filePath = path.join(sessionDir, filename);
        const stats = fs.statSync(filePath);
        const assetId = filename.replace(/\.(png|jpg|jpeg)$/, '');

        return {
          assetId,
          filename,
          path: filePath,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
        };
      });

    return jsonResponse(200, {
      success: true,
      images,
      count: images.length,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list images',
    });
  }
}

/**
 * Serve a single project overlay image by assetId
 * GET /api/project/:id/image/:assetId
 */
export async function serveProjectImage(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;
    const assetId = ctx.params?.assetId;

    if (!projectId || !assetId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID and assetId are required',
      });
    }

    const project = await projectService.getProject(projectId);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'images');
    const sessionDir = path.join(IMAGE_UPLOAD_DIR, project.audioSessionId);

    const extensions = ['.png', '.jpg', '.jpeg'];
    let filePath: string | null = null;
    for (const ext of extensions) {
      const candidate = path.join(sessionDir, `${assetId}${ext}`);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        filePath = candidate;
        break;
      }
    }

    if (!filePath) {
      return jsonResponse(404, {
        success: false,
        error: 'Image not found',
      });
    }

    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const contentType = mime[ext] ?? 'application/octet-stream';

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to serve image',
    });
  }
}

/**
 * Generate preview video for a project
 * POST /api/project/:id/preview
 */
export async function generateProjectPreview(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    const project = await projectService.getProject(projectId);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    if (!project.template?.path) {
      return jsonResponse(400, {
        success: false,
        error: 'Project has no template assigned',
      });
    }

    if (!project.audioSessionId || project.audioSessionId === 'no-session') {
      return jsonResponse(400, {
        success: false,
        error: 'Project has no audio session assigned',
      });
    }

    const overlayTrack = project.timeline?.tracks?.find((t: { type: string; id: string }) => t.type === 'overlay' && t.id === 't_imgs');
    const overlayClips = overlayTrack?.clips?.filter((c: { kind?: string }) => c.kind === 'overlay') ?? [];

    // Optional: playhead time from client so we can render a short segment preview.
    const body = (ctx.body as any) || {};
    const playheadTime =
      typeof body?.playheadTime === 'number' && Number.isFinite(body.playheadTime)
        ? body.playheadTime
        : undefined;

    // If client provides a playheadTime, generate a short segment preview starting there.
    // Otherwise, fall back to the full-length timeline-aware preview.
    const result = playheadTime !== undefined
      ? await generateTimelineSegmentPreview(project, playheadTime, 3)
      : await generateTimelinePreview(project);

    if (!result.success) {
      return jsonResponse(500, {
        success: false,
        error: result.error || 'Failed to generate preview',
      });
    }

    return jsonResponse(200, {
      success: true,
      previewPath: result.outputPath,
      message: 'Preview generated successfully',
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate preview',
    });
  }
}

/**
 * Generate (or reuse) an HLS preview for a project timeline.
 * POST /api/project/:id/preview/hls
 */
export async function generateProjectPreviewHls(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    const project = await projectService.getProject(projectId);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    if (!project.template?.path) {
      return jsonResponse(400, {
        success: false,
        error: 'Project has no template assigned',
      });
    }

    if (!project.audioSessionId || project.audioSessionId === 'no-session') {
      return jsonResponse(400, {
        success: false,
        error: 'Project has no audio session assigned',
      });
    }

    // Use updatedAt as a stable-ish version identifier for the current timeline.
    const rawVersion = project.updatedAt || new Date().toISOString();
    const safeVersion = rawVersion.replace(/[^a-zA-Z0-9_-]/g, '_');

    const result = await generateTimelinePreviewHls(project, safeVersion);

    if (!result.success || !result.playlistPath) {
      return jsonResponse(500, {
        success: false,
        error: result.error || 'Failed to generate HLS preview',
      });
    }

    // Return absolute URL for the playlist (frontend will prepend API_BASE_URL if needed)
    // The playlist itself contains absolute segment URLs after post-processing.
    const playlistUrl = `/api/project/${projectId}/preview/hls/${encodeURIComponent(safeVersion)}/index.m3u8`;

    return jsonResponse(200, {
      success: true,
      version: safeVersion,
      playlistUrl,
      message: 'HLS preview ready',
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate HLS preview',
    });
  }
}

/**
 * Check if HLS preview is ready for a project.
 * GET /api/project/:id/preview/hls/status
 */
export async function getProjectPreviewHlsStatus(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    const project = await projectService.getProject(projectId);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    // Use updatedAt as version identifier
    const rawVersion = project.updatedAt || new Date().toISOString();
    const safeVersion = rawVersion.replace(/[^a-zA-Z0-9_-]/g, '_');

    const manifestPath = path.join(process.cwd(), 'storage', 'previews', 'hls', projectId, safeVersion, 'index.m3u8');
    const isReady = fs.existsSync(manifestPath);

    if (isReady) {
      const playlistUrl = `/api/project/${projectId}/preview/hls/${encodeURIComponent(safeVersion)}/index.m3u8`;
      return jsonResponse(200, {
        success: true,
        ready: true,
        version: safeVersion,
        playlistUrl,
      });
    }

    return jsonResponse(200, {
      success: true,
      ready: false,
      version: safeVersion,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check HLS status',
    });
  }
}

/**
 * Serve HLS playlist for a project.
 * GET /api/project/:id/preview/hls/:version/index.m3u8
 */
export async function serveProjectPreviewHlsManifest(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;
    const version = ctx.params?.version;

    if (!projectId || !version) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID and version are required',
      });
    }

    const manifestPath = path.join(process.cwd(), 'storage', 'previews', 'hls', projectId, version, 'index.m3u8');

    if (!fs.existsSync(manifestPath)) {
      return jsonResponse(404, {
        success: false,
        error: 'HLS manifest not found. Generate it first using POST /api/project/:id/preview/hls',
      });
    }

    const buf = await fs.promises.readFile(manifestPath);
    return new Response(new Blob([buf]), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to serve HLS manifest',
    });
  }
}

/**
 * Serve individual HLS segment.
 * GET /api/project/:id/preview/hls/:version/:segment
 */
export async function serveProjectPreviewHlsSegment(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;
    const version = ctx.params?.version;
    const segment = ctx.params?.segment;

    if (!projectId || !version || !segment) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID, version and segment are required',
      });
    }

    // Basic safety: disallow path traversal via segment parameter.
    if (segment.includes('..') || segment.includes('/') || segment.includes('\\')) {
      return jsonResponse(400, {
        success: false,
        error: 'Invalid segment name',
      });
    }

    const segmentPath = path.join(process.cwd(), 'storage', 'previews', 'hls', projectId, version, segment);

    if (!fs.existsSync(segmentPath)) {
      return jsonResponse(404, {
        success: false,
        error: 'HLS segment not found',
      });
    }

    const buf = await fs.promises.readFile(segmentPath);
    return new Response(new Blob([buf]), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp2t',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to serve HLS segment',
    });
  }
}

/**
 * Serve preview video - CORRECTED VERSION
 * GET /api/project/:id/preview
 */
export async function serveProjectPreview(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;

    if (!projectId) {
      return jsonResponse(400, {
        success: false,
        error: 'Project ID is required',
      });
    }

    const project = await projectService.getProject(projectId);

    if (!project) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    if (!project.template?.path || !project.audioSessionId || project.audioSessionId === 'no-session') {
      return jsonResponse(400, {
        success: false,
        error: 'Project has no template or audio session',
      });
    }

    const previewPath = path.join(process.cwd(), 'storage', 'previews', `preview_${projectId}.mp4`);

    if (!fs.existsSync(previewPath)) {
      return jsonResponse(404, {
        success: false,
        error: 'Preview not found. Generate it first using POST /api/project/:id/preview',
      });
    }

    const stat = await fs.promises.stat(previewPath);
    const fileSize = stat.size;
    const rangeHeader = ctx.headers.get('range');

    // No range requested - send entire file
    if (!rangeHeader) {
      const buf = await fs.promises.readFile(previewPath);
      return new Response(new Blob([buf]), {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        },
      });
    }

    // Parse range header
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    // CRITICAL FIX: Calculate chunk size correctly
    const chunkSize = (end - start) + 1;

    // Validate range
    if (start >= fileSize || end >= fileSize || start > end) {
      return jsonResponse(416, {
        success: false,
        error: 'Range not satisfiable',
      });
    }

    // Read the requested chunk
    const fileHandle = await fs.promises.open(previewPath, 'r');
    const buffer = Buffer.alloc(chunkSize);
    await fileHandle.read(buffer, 0, chunkSize, start);
    await fileHandle.close();

    // Return 206 Partial Content with correct headers
    return new Response(new Blob([buffer]), {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to serve preview',
    });
  }
}

