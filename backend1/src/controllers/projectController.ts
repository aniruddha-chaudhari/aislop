import type { HttpContext, HandlerResult } from '../utils/http';
import { jsonResponse } from '../utils/http';
import * as projectService from '../service/projectService';
import { generateSubtitlesAndCharacters, generateImagePlan } from '../service/aiDraftService';
import { getSessionDuration } from '../service/sessionDuration';
import type { Track, SubtitleClip, OverlayClip } from '../schema/project';
import { compileTimeline } from '../service/timelineCompiler';
import {
  buildSegmentPreviewOutputPath,
  buildTimelinePreviewOutputPath,
  generatePreview,
  generateTimelinePreview,
  generateTimelineSegmentPreview,
  generateTimelinePreviewHls,
} from '../service/previewGenerator';
import { getPreviewVersion } from '../service/previewVersion';
import { ProjectSchema, TimelineSchema } from '../schema/project';
import fs from 'fs';
import path from 'path';
import { generateSfxTrack } from '../service/sfxService';
import {
  cleanupAnimationCacheForProject,
  generateAnimationPlanAndRender,
  isAnimationOverlayTrack,
} from '../service/animationPlanService';

const ANIMATION_DEBUG_ENABLED = process.env.ANIMATION_DEBUG === '1';

function logPreviewTelemetry(event: string, data: Record<string, unknown> = {}): void {
  console.info('[PreviewTelemetry]', {
    event,
    timestamp: new Date().toISOString(),
    ...data,
  });
}

type PreviewJobMode = 'hls' | 'segment';
type PreviewJobState = 'idle' | 'queued' | 'rendering' | 'ready' | 'error';

type PreviewJobStatus = {
  mode: PreviewJobMode;
  state: PreviewJobState;
  timelineHash: string;
  progress?: number;
  url?: string;
  error?: string;
  updatedAt: number;
};

const previewJobs = new Map<string, PreviewJobStatus>();
const previewJobPromises = new Map<string, Promise<void>>();

function makePreviewJobKey(args: {
  projectId: string;
  timelineHash: string;
  mode: PreviewJobMode;
  playheadTime?: number;
  windowSeconds?: number;
}): string {
  if (args.mode === 'hls') return `hls:${args.projectId}:${args.timelineHash}`;
  const playhead = Number.isFinite(args.playheadTime) ? Number(args.playheadTime) : 0;
  const window = Number.isFinite(args.windowSeconds) ? Number(args.windowSeconds) : 3;
  return `segment:${args.projectId}:${args.timelineHash}:${playhead.toFixed(3)}:${window.toFixed(3)}`;
}

function getExistingPreviewJob(args: {
  projectId: string;
  timelineHash: string;
  mode: PreviewJobMode;
  playheadTime?: number;
  windowSeconds?: number;
}): PreviewJobStatus | undefined {
  return previewJobs.get(makePreviewJobKey(args));
}

function setPreviewJob(args: {
  projectId: string;
  timelineHash: string;
  mode: PreviewJobMode;
  playheadTime?: number;
  windowSeconds?: number;
  status: Omit<PreviewJobStatus, 'updatedAt'>;
}): void {
  const key = makePreviewJobKey(args);
  previewJobs.set(key, {
    ...args.status,
    updatedAt: Date.now(),
  });
}

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

const TEMP_DIR = path.join(process.cwd(), 'storage', 'temp');
const IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'images');

/**
 * Remove session-level image plan and uploaded images when no project uses this session.
 * Call after deleting a project so a new project with the same session gets a fresh plan.
 */
async function cleanupSessionFilesIfUnused(audioSessionId: string): Promise<void> {
  if (!audioSessionId || audioSessionId === 'no-session') return;
  const projects = await projectService.listProjects();
  const otherWithSession = projects.some((p) => p.audioSessionId === audioSessionId);
  if (otherWithSession) return;

  try {
    const planPath = path.join(TEMP_DIR, `${audioSessionId}_image_plan.json`);
    if (fs.existsSync(planPath)) {
      fs.unlinkSync(planPath);
    }
    const sessionImageDir = path.join(IMAGE_UPLOAD_DIR, audioSessionId);
    if (fs.existsSync(sessionImageDir)) {
      const files = fs.readdirSync(sessionImageDir);
      for (const file of files) {
        fs.unlinkSync(path.join(sessionImageDir, file));
      }
      fs.rmdirSync(sessionImageDir);
    }
  } catch {
    // Non-fatal: log and continue
  }
}


export async function deleteProject(ctx: HttpContext): Promise<HandlerResult> {
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

    const audioSessionId = project.audioSessionId;
    const deleted = await projectService.deleteProject(projectId);

    if (!deleted) {
      return jsonResponse(404, {
        success: false,
        error: 'Project not found',
      });
    }

    await cleanupSessionFilesIfUnused(audioSessionId ?? '');

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


    const existing = project.timeline;
    const existingTracks = (existing?.tracks ?? []) as Track[];
    const overlayTracks = existingTracks.filter((t) => t.type === 'overlay');
    const musicTracks = existingTracks.filter((t) => t.type === 'music');
    const sfxTracks = existingTracks.filter((t) => t.type === 'sfx');
    const tracks: Track[] = [
      ...overlayTracks,
      result.audioTrack,
      ...musicTracks,
      ...sfxTracks,
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
    console.error('[Project] generateAiDraftForProject error', {
      projectId: ctx.params?.id,
      body: ctx.body,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate AI draft',
    });
  }
}


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

    // Merge overlay tracks into existing timeline: replace all image overlay tracks (t_imgs, t_imgs_2, ...) in place
    const existing = project.timeline;
    const existingTracks = (existing?.tracks ?? []) as Track[];
    const isImageOverlayTrack = (t: Track) =>
      t.type === 'overlay' && (t.id === 't_imgs' || /^t_imgs_\d+$/.test(t.id));
    const firstImageIndex = existingTracks.findIndex((t) => isImageOverlayTrack(t));
    const before = firstImageIndex >= 0 ? existingTracks.slice(0, firstImageIndex) : existingTracks;
    const after =
      firstImageIndex >= 0
        ? existingTracks.slice(firstImageIndex).filter((t) => !isImageOverlayTrack(t))
        : [];
    const tracks: Track[] = [...before, ...result.overlayTracks, ...after];
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

export async function generateAnimationPlanForProject(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;
    const body = (ctx.body as any) || {};

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

    const subtitleTrack = project.timeline?.tracks?.find((t) => t.type === 'subtitle');
    const subtitleClips = (subtitleTrack?.clips ?? []).filter((c): c is SubtitleClip => c.kind === 'subtitle');
    if (subtitleClips.length === 0) {
      return jsonResponse(400, {
        success: false,
        error: 'Subtitles are required before generating animation plan',
      });
    }

    const existingDuration = project.timeline?.duration;
    const duration =
      typeof existingDuration === 'number' && existingDuration > 0
        ? existingDuration
        : (await getSessionDuration(project.audioSessionId)) || 60;

    const topic = body.topic || project.name || 'Educational short video';
    if (ANIMATION_DEBUG_ENABLED) {
      console.info('[Animation Plan] request received', {
        projectId,
        topic,
        subtitleClipCount: subtitleClips.length,
        duration,
        timestamp: new Date().toISOString(),
      });
    }

    const result = await generateAnimationPlanAndRender({
      projectId,
      topic,
      subtitleClips,
      videoDurationSeconds: duration,
    });

    const existingTracks = (project.timeline?.tracks ?? []) as Track[];
    const firstAnimIndex = existingTracks.findIndex((t) => isAnimationOverlayTrack(t));
    const isImageOverlayTrack = (t: Track) =>
      t.type === 'overlay' && (t.id === 't_imgs' || /^t_imgs_\d+$/.test(t.id));

    let tracks: Track[];
    if (firstAnimIndex >= 0) {
      const before = existingTracks.slice(0, firstAnimIndex).filter((t) => !isAnimationOverlayTrack(t));
      const after = existingTracks.slice(firstAnimIndex).filter((t) => !isAnimationOverlayTrack(t));
      tracks = [...before, ...result.overlayTracks, ...after];
    } else {
      const withoutAnim = existingTracks.filter((t) => !isAnimationOverlayTrack(t));
      const lastImageIndex = withoutAnim.reduce(
        (idx, track, i) => (isImageOverlayTrack(track) ? i : idx),
        -1
      );
      if (lastImageIndex >= 0) {
        tracks = [
          ...withoutAnim.slice(0, lastImageIndex + 1),
          ...result.overlayTracks,
          ...withoutAnim.slice(lastImageIndex + 1),
        ];
      } else {
        tracks = [...withoutAnim, ...result.overlayTracks];
      }
    }

    const timeline = { duration, tracks };
    const updatedProject = await projectService.updateTimeline(projectId, timeline);

    if (ANIMATION_DEBUG_ENABLED) {
      console.info('[Animation Plan] request completed', {
        projectId,
        generatedMoments: result.animationPlan.moments.length,
        overlayTrackCount: result.overlayTracks.length,
        remotionProjectDir: result.remotionProjectDir,
        renderedProjectDir: result.renderedProjectDir,
      });
    }

    return jsonResponse(200, {
      success: true,
      animationPlan: result.animationPlan,
      project: updatedProject,
      timeline,
      message: 'Animation plan generated successfully',
    });
  } catch (error) {
    console.error('[Animation Plan] request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate animation plan',
    });
  }
}

export async function deleteAnimationPlanForProject(ctx: HttpContext): Promise<HandlerResult> {
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

    const existing = project.timeline;
    const existingTracks = (existing?.tracks ?? []) as Track[];
    const tracks = existingTracks.filter((t) => !isAnimationOverlayTrack(t));
    const duration =
      typeof existing?.duration === 'number' && existing.duration > 0
        ? existing.duration
        : (await getSessionDuration(project.audioSessionId)) || 60;

    const timeline = { duration, tracks };
    const updatedProject = await projectService.updateTimeline(projectId, timeline);
    const cleanup = cleanupAnimationCacheForProject(projectId);

    return jsonResponse(200, {
      success: true,
      project: updatedProject,
      timeline,
      cacheCleared: cleanup,
      message: 'Animation plan deleted successfully',
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete animation plan',
    });
  }
}

/**
 * Generate SFX plan for a project (uses existing image plan overlay timings)
 * POST /api/project/:id/sfx-plan
 */
export async function generateSfxPlanForProject(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;
    const body = (ctx.body as any) || {};
    if (!projectId) {
      return jsonResponse(400, { success: false, error: 'Project ID is required' });
    }

    const project = await projectService.getProject(projectId);
    if (!project) {
      return jsonResponse(404, { success: false, error: 'Project not found' });
    }

    const timeline = project.timeline;
    if (!timeline || !timeline.tracks) {
      return jsonResponse(400, { success: false, error: 'Project has no timeline' });
    }

    const overlayTracks = timeline.tracks.filter((t: any) => t.type === 'overlay');
    const subtitleTrack = timeline.tracks.find((t: any) => t.type === 'subtitle');
    const overlayClips = overlayTracks.flatMap((t: any) => (t.clips ?? []).filter((c: any) => c.kind === 'overlay')) as OverlayClip[];
    const subtitleClips = (subtitleTrack?.clips ?? []).filter((c: any): c is SubtitleClip => c.kind === 'subtitle');

    const sfxTrack = await generateSfxTrack({
      topic: body.topic || project.name || 'Educational short video',
      overlayClips,
      subtitleClips,
      duration: timeline.duration ?? 0,
    });

    console.info('[SFX Plan] generating fresh', {
      projectId,
      timestamp: new Date().toISOString(),
      overlayClips: overlayClips.length,
      subtitleClips: subtitleClips.length,
    });

    const tracksWithoutSfx = timeline.tracks.filter((t: any) => t.type !== 'sfx');
    const nextTimeline = {
      ...timeline,
      tracks: [...tracksWithoutSfx, sfxTrack],
    };

    const updatedProject = await projectService.updateTimeline(projectId, nextTimeline);

    return jsonResponse(200, {
      success: true,
      project: updatedProject,
      timeline: nextTimeline,
      message: 'SFX plan generated successfully',
    }, {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate SFX plan',
    }, {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
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

    // Debug: log audio asset tracks being saved (music/sfx)
    const trackTypes = (timeline.tracks ?? []).map((t: any) => t.type);
    const musicTracks = (timeline.tracks ?? []).filter((t: any) => t.type === 'music');
    const sfxTracks = (timeline.tracks ?? []).filter((t: any) => t.type === 'sfx');
    console.info('[Timeline Save] Tracks', {
      projectId,
      trackTypes,
      musicTracks: musicTracks.length,
      sfxTracks: sfxTracks.length,
      musicClips: musicTracks.reduce((acc: number, t: any) => acc + (t.clips?.length || 0), 0),
      sfxClips: sfxTracks.reduce((acc: number, t: any) => acc + (t.clips?.length || 0), 0),
    });

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

    console.info('[EXPORT] Start requested', { projectId, exportStep });

    // Update status to exporting
    await projectService.updateStatus(projectId, 'exporting');

    // Start export in background (don't await)
    compileTimeline(project, { exportStep })
      .then(async (result) => {
        const success = result && typeof result === 'object' && result.success;
        if (success) {
          await projectService.updateStatus(projectId, 'exported');
          console.info('[EXPORT] Completed successfully', { projectId, videoPath: result.outputPath });
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
 * Delete overlay image for a project by assetId
 * DELETE /api/project/:id/image/:assetId
 */
export async function deleteProjectImage(ctx: HttpContext): Promise<HandlerResult> {
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

    if (!fs.existsSync(sessionDir)) {
      return jsonResponse(200, {
        success: true,
        message: 'Image already removed or not found',
      });
    }

    const extensions = ['.png', '.jpg', '.jpeg'];
    let removed = false;
    for (const ext of extensions) {
      const filePath = path.join(sessionDir, `${assetId}${ext}`);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
        removed = true;
        break;
      }
    }

    return jsonResponse(200, {
      success: true,
      message: removed ? 'Image removed' : 'Image already removed or not found',
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete image',
    });
  }
}

/**
 * Generate preview video for a project
 * POST /api/project/:id/preview
 */
export async function generateProjectPreview(ctx: HttpContext): Promise<HandlerResult> {
  const startedAt = Date.now();
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

    // Optional: playhead time from client so we can render a short segment preview.
    const body = (ctx.body as any) || {};
    const playheadTime =
      typeof body?.playheadTime === 'number' && Number.isFinite(body.playheadTime)
        ? body.playheadTime
        : undefined;
    const mode = playheadTime !== undefined ? 'segment' : 'timeline';
    const { timelineHash, shortVersion } = getPreviewVersion(project);
    logPreviewTelemetry('generate_preview_start', {
      projectId,
      mode,
      playheadTime,
      timelineHash,
    });

    // If client provides a playheadTime, generate a short segment preview starting there.
    // Otherwise, fall back to the full-length timeline-aware preview.
    const result = playheadTime !== undefined
      ? await generateTimelineSegmentPreview(project, playheadTime, 3, undefined, { versionTag: shortVersion })
      : await generateTimelinePreview(project, undefined, { versionTag: shortVersion });

    if (!result.success) {
      logPreviewTelemetry('generate_preview_error', {
        projectId,
        mode,
        timelineHash,
        duration_ms: Date.now() - startedAt,
        error: result.error || 'Failed to generate preview',
      });
      return jsonResponse(500, {
        success: false,
        error: result.error || 'Failed to generate preview',
      });
    }

    logPreviewTelemetry('generate_preview_success', {
      projectId,
      mode,
      timelineHash,
      duration_ms: Date.now() - startedAt,
      outputPath: result.outputPath,
    });

    return jsonResponse(200, {
      success: true,
      previewPath: result.outputPath,
      version: shortVersion,
      timelineHash,
      message: 'Preview generated successfully',
    });
  } catch (error) {
    logPreviewTelemetry('generate_preview_exception', {
      projectId: ctx.params?.id,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate preview',
    });
  }
}

/**
 * Queue generation of a timeline segment preview.
 * POST /api/project/:id/preview/segment
 */
export async function generateProjectPreviewSegment(ctx: HttpContext): Promise<HandlerResult> {
  const startedAt = Date.now();
  try {
    const projectId = ctx.params?.id;
    if (!projectId) return jsonResponse(400, { success: false, error: 'Project ID is required' });

    const project = await projectService.getProject(projectId);
    if (!project) return jsonResponse(404, { success: false, error: 'Project not found' });
    if (!project.template?.path) return jsonResponse(400, { success: false, error: 'Project has no template assigned' });
    if (!project.audioSessionId || project.audioSessionId === 'no-session') {
      return jsonResponse(400, { success: false, error: 'Project has no audio session assigned' });
    }

    const body = (ctx.body as any) || {};
    const playheadTimeRaw = Number(body?.playheadTime);
    if (!Number.isFinite(playheadTimeRaw)) {
      return jsonResponse(400, { success: false, error: 'playheadTime (number) is required' });
    }
    const playheadTime = Math.max(0, playheadTimeRaw);
    const windowSecondsRaw = Number(body?.windowSeconds);
    const windowSeconds = Number.isFinite(windowSecondsRaw) && windowSecondsRaw > 0 ? windowSecondsRaw : 3;

    const { timelineHash, shortVersion } = getPreviewVersion(project);
    const outputPath = buildSegmentPreviewOutputPath(projectId, playheadTime, windowSeconds, shortVersion);
    const url = `/api/project/${projectId}/preview?mode=segment&version=${encodeURIComponent(shortVersion)}&playheadTime=${encodeURIComponent(String(playheadTime))}&windowSeconds=${encodeURIComponent(String(windowSeconds))}`;

    if (fs.existsSync(outputPath)) {
      setPreviewJob({
        projectId,
        timelineHash,
        mode: 'segment',
        playheadTime,
        windowSeconds,
        status: { mode: 'segment', state: 'ready', timelineHash, progress: 100, url },
      });
      return jsonResponse(200, {
        success: true,
        mode: 'segment',
        state: 'ready',
        timelineHash,
        version: shortVersion,
        url,
      });
    }

    const jobKey = makePreviewJobKey({ projectId, timelineHash, mode: 'segment', playheadTime, windowSeconds });
    const running = previewJobPromises.get(jobKey);
    if (!running) {
      setPreviewJob({
        projectId,
        timelineHash,
        mode: 'segment',
        playheadTime,
        windowSeconds,
        status: { mode: 'segment', state: 'queued', timelineHash, progress: 5 },
      });

      const task = (async () => {
        try {
          setPreviewJob({
            projectId,
            timelineHash,
            mode: 'segment',
            playheadTime,
            windowSeconds,
            status: { mode: 'segment', state: 'rendering', timelineHash, progress: 25 },
          });
          const result = await generateTimelineSegmentPreview(
            project,
            playheadTime,
            windowSeconds,
            undefined,
            { versionTag: shortVersion }
          );
          if (!result.success) {
            setPreviewJob({
              projectId,
              timelineHash,
              mode: 'segment',
              playheadTime,
              windowSeconds,
              status: {
                mode: 'segment',
                state: 'error',
                timelineHash,
                progress: 100,
                error: result.error || 'Failed to generate segment preview',
              },
            });
            return;
          }
          setPreviewJob({
            projectId,
            timelineHash,
            mode: 'segment',
            playheadTime,
            windowSeconds,
            status: { mode: 'segment', state: 'ready', timelineHash, progress: 100, url },
          });
        } finally {
          previewJobPromises.delete(jobKey);
        }
      })();
      previewJobPromises.set(jobKey, task);
    }

    const current = getExistingPreviewJob({ projectId, timelineHash, mode: 'segment', playheadTime, windowSeconds });
    logPreviewTelemetry('generate_segment_preview_queued', {
      projectId,
      timelineHash,
      playheadTime,
      windowSeconds,
      duration_ms: Date.now() - startedAt,
    });
    return jsonResponse(202, {
      success: true,
      mode: 'segment',
      state: current?.state ?? 'queued',
      timelineHash,
      version: shortVersion,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to queue segment preview',
    });
  }
}

/**
 * Get status of a segment preview job.
 * GET /api/project/:id/preview/segment/status
 */
export async function getProjectPreviewSegmentStatus(ctx: HttpContext): Promise<HandlerResult> {
  try {
    const projectId = ctx.params?.id;
    if (!projectId) return jsonResponse(400, { success: false, error: 'Project ID is required' });

    const project = await projectService.getProject(projectId);
    if (!project) return jsonResponse(404, { success: false, error: 'Project not found' });

    const { timelineHash, shortVersion } = getPreviewVersion(project);
    const query = (ctx.query ?? {}) as Record<string, string | undefined>;
    const playheadTime = Number(query.playheadTime);
    const windowSecondsRaw = Number(query.windowSeconds);
    const windowSeconds = Number.isFinite(windowSecondsRaw) && windowSecondsRaw > 0 ? windowSecondsRaw : 3;

    if (!Number.isFinite(playheadTime)) {
      return jsonResponse(400, { success: false, error: 'playheadTime query param is required' });
    }

    const url = `/api/project/${projectId}/preview?mode=segment&version=${encodeURIComponent(shortVersion)}&playheadTime=${encodeURIComponent(String(playheadTime))}&windowSeconds=${encodeURIComponent(String(windowSeconds))}`;
    const outputPath = buildSegmentPreviewOutputPath(projectId, playheadTime, windowSeconds, shortVersion);
    if (fs.existsSync(outputPath)) {
      return jsonResponse(200, {
        success: true,
        mode: 'segment',
        state: 'ready',
        timelineHash,
        version: shortVersion,
        progress: 100,
        url,
      });
    }

    const current = getExistingPreviewJob({ projectId, timelineHash, mode: 'segment', playheadTime, windowSeconds });
    if (current) {
      return jsonResponse(200, {
        success: true,
        mode: 'segment',
        state: current.state,
        timelineHash,
        version: shortVersion,
        progress: current.progress,
        url: current.url,
        error: current.error,
      });
    }

    return jsonResponse(200, {
      success: true,
      mode: 'segment',
      state: 'idle',
      timelineHash,
      version: shortVersion,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check segment preview status',
    });
  }
}

/**
 * Generate (or reuse) an HLS preview for a project timeline.
 * POST /api/project/:id/preview/hls
 */
export async function generateProjectPreviewHls(ctx: HttpContext): Promise<HandlerResult> {
  const startedAt = Date.now();
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

    // Version preview assets by timeline hash so unchanged timelines are identifiable.
    const { timelineHash, shortVersion } = getPreviewVersion(project);
    const safeVersion = shortVersion;

    console.info('[HLS Preview] requested', { projectId, version: safeVersion });
    logPreviewTelemetry('generate_hls_preview_start', { projectId, version: safeVersion, timelineHash });

    const playlistUrl = `/api/project/${projectId}/preview/hls/${encodeURIComponent(safeVersion)}/index.m3u8`;
    const manifestPath = path.join(process.cwd(), 'storage', 'previews', 'hls', projectId, safeVersion, 'index.m3u8');
    if (fs.existsSync(manifestPath)) {
      setPreviewJob({
        projectId,
        timelineHash,
        mode: 'hls',
        status: { mode: 'hls', state: 'ready', timelineHash, progress: 100, url: playlistUrl },
      });
      return jsonResponse(200, {
        success: true,
        mode: 'hls',
        state: 'ready',
        version: safeVersion,
        timelineHash,
        playlistUrl,
        message: 'HLS preview ready',
      });
    }

    const jobKey = makePreviewJobKey({ projectId, timelineHash, mode: 'hls' });
    const running = previewJobPromises.get(jobKey);
    if (!running) {
      setPreviewJob({
        projectId,
        timelineHash,
        mode: 'hls',
        status: { mode: 'hls', state: 'queued', timelineHash, progress: 5 },
      });
      const task = (async () => {
        try {
          setPreviewJob({
            projectId,
            timelineHash,
            mode: 'hls',
            status: { mode: 'hls', state: 'rendering', timelineHash, progress: 25 },
          });
          const result = await generateTimelinePreviewHls(project, safeVersion);
          if (!result.success || !result.playlistPath) {
            setPreviewJob({
              projectId,
              timelineHash,
              mode: 'hls',
              status: {
                mode: 'hls',
                state: 'error',
                timelineHash,
                progress: 100,
                error: result.error || 'Failed to generate HLS preview',
              },
            });
            return;
          }
          setPreviewJob({
            projectId,
            timelineHash,
            mode: 'hls',
            status: { mode: 'hls', state: 'ready', timelineHash, progress: 100, url: playlistUrl },
          });
          logPreviewTelemetry('generate_hls_preview_success', {
            projectId,
            version: safeVersion,
            timelineHash,
            duration_ms: Date.now() - startedAt,
            playlistPath: result.playlistPath,
          });
        } finally {
          previewJobPromises.delete(jobKey);
        }
      })();
      previewJobPromises.set(jobKey, task);
    }

    const current = getExistingPreviewJob({ projectId, timelineHash, mode: 'hls' });
    return jsonResponse(202, {
      success: true,
      mode: 'hls',
      state: current?.state ?? 'queued',
      version: safeVersion,
      timelineHash,
      playlistUrl: current?.state === 'ready' ? playlistUrl : undefined,
      message: 'HLS preview queued',
    });
  } catch (error) {
    logPreviewTelemetry('generate_hls_preview_exception', {
      projectId: ctx.params?.id,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('[HLS Preview] controller error', {
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
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
  const startedAt = Date.now();
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

    // Version identifier derived from current timeline hash.
    const { timelineHash, shortVersion } = getPreviewVersion(project);
    const safeVersion = shortVersion;

    const playlistUrl = `/api/project/${projectId}/preview/hls/${encodeURIComponent(safeVersion)}/index.m3u8`;
    const manifestPath = path.join(process.cwd(), 'storage', 'previews', 'hls', projectId, safeVersion, 'index.m3u8');
    if (fs.existsSync(manifestPath)) {
      setPreviewJob({
        projectId,
        timelineHash,
        mode: 'hls',
        status: { mode: 'hls', state: 'ready', timelineHash, progress: 100, url: playlistUrl },
      });
    }

    const current = getExistingPreviewJob({ projectId, timelineHash, mode: 'hls' });
    const state: PreviewJobState = current?.state ?? (fs.existsSync(manifestPath) ? 'ready' : 'idle');
    const ready = state === 'ready';
    if (ready) {
      logPreviewTelemetry('hls_status_ready', {
        projectId,
        version: safeVersion,
        timelineHash,
        duration_ms: Date.now() - startedAt,
      });
    }

    return jsonResponse(200, {
      success: true,
      mode: 'hls',
      state,
      ready, // backward compatibility for existing frontend polling
      version: safeVersion,
      timelineHash,
      progress: current?.progress,
      playlistUrl: ready ? playlistUrl : undefined,
      error: current?.error,
    });
  } catch (error) {
    logPreviewTelemetry('hls_status_exception', {
      projectId: ctx.params?.id,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
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

    const query = (ctx.query ?? {}) as Record<string, string | undefined>;
    const { shortVersion } = getPreviewVersion(project);
    const requestedVersion = typeof query.version === 'string' && query.version.trim() ? query.version.trim() : shortVersion;
    const requestedMode = query.mode === 'segment' ? 'segment' : 'timeline';
    const playheadTime = query.playheadTime !== undefined ? Number(query.playheadTime) : NaN;
    const windowSeconds = query.windowSeconds !== undefined ? Number(query.windowSeconds) : 3;

    const candidatePaths: string[] = [];
    if (requestedMode === 'segment' && Number.isFinite(playheadTime)) {
      candidatePaths.push(
        buildSegmentPreviewOutputPath(projectId, playheadTime, Number.isFinite(windowSeconds) ? windowSeconds : 3, requestedVersion)
      );
    }
    candidatePaths.push(buildTimelinePreviewOutputPath(projectId, requestedVersion));
    // Legacy fallback path while frontend still uses plain /preview URL.
    candidatePaths.push(path.join(process.cwd(), 'storage', 'previews', `preview_${projectId}.mp4`));

    const previewPath = candidatePaths.find((p) => fs.existsSync(p));

    if (!previewPath) {
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
