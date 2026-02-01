import type { HttpContext, HandlerResult } from '../utils/http';
import { jsonResponse } from '../utils/http';
import * as projectService from '../service/projectService';
import { generateSubtitlesAndCharacters, generateImagePlan } from '../service/aiDraftService';
import type { Track } from '../schema/project';
import { compileTimeline } from '../service/timelineCompiler';
import { generatePreview, generateTimelinePreview } from '../service/previewGenerator';
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

    const project = await projectService.createProject(
      name,
      finalAudioSessionId,
      finalTemplatePath,
      finalTemplateLabel,
      templateType || 'video',
      format || '9:16'
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

    const project = await projectService.getProject(projectId);

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

    // Merge overlay track into existing timeline (replace t_imgs, keep others)
    const existing = project.timeline;
    const existingTracks = (existing?.tracks ?? []) as Track[];
    const otherOverlays = existingTracks.filter((t) => t.type === 'overlay' && t.id !== 't_imgs');
    const nonOverlays = existingTracks.filter((t) => t.type !== 'overlay');
    const tracks: Track[] = [...otherOverlays, result.overlayTrack, ...nonOverlays];
    const timeline = {
      duration: existing?.duration ?? 60,
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

    // Update status to exporting
    await projectService.updateStatus(projectId, 'exporting');

    // Start export in background (don't await)
    compileTimeline(project)
      .then(async (result) => {
        if (result.success) {
          await projectService.updateStatus(projectId, 'exported');
        } else {
          await projectService.updateStatus(projectId, 'ready');
        }
      })
      .catch(async () => {
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
    const assetId = ctx.body?.assetId || `asset_${Date.now()}`;

    // Save image to storage/images/{sessionId}/
    const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'images');
    const sessionDir = path.join(IMAGE_UPLOAD_DIR, project.audioSessionId);

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const imageFilename = `${assetId}.png`;
    const imagePath = path.join(sessionDir, imageFilename);

    // Save file
    await file.arrayBuffer().then((buffer) => {
      fs.writeFileSync(imagePath, Buffer.from(buffer));
    });

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

    // Use timeline-aware preview (includes subtitles, overlays, characters when present)
    const result = await generateTimelinePreview(project);

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
 * Serve preview video
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

    const buf = await fs.promises.readFile(previewPath);
    return new Response(new Blob([buf]), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(buf.length),
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

