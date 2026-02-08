import fs from 'fs';
import path from 'path';
import { Project, ProjectSchema, Timeline } from '../schema/project';

const PROJECTS_DIR = path.join(process.cwd(), 'storage', 'projects');
const REMOTION_ANIMATION_DIR = path.join(process.cwd(), 'storage', 'remotion-animation');
const RENDERED_ANIMATIONS_DIR = path.join(process.cwd(), 'storage', 'rendered-animations');

// Ensure projects directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

/**
 * Generate a unique project ID
 */
function generateProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get the file path for a project
 */
function getProjectPath(projectId: string): string {
  return path.join(PROJECTS_DIR, `${projectId}.json`);
}

function getAnimationFolderName(projectId: string): string {
  if (!projectId) return 'proj_unknown';
  const safe = projectId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!safe) return 'proj_unknown';
  return safe.startsWith('proj_') ? safe : `proj_${safe}`;
}

function removeDirIfExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  fs.rmSync(dirPath, { recursive: true, force: true });
}

/**
 * Create a new project
 */
export async function createProject(
  name: string,
  audioSessionId: string,
  templatePath: string,
  templateLabel: string,
  templateType: 'video' | 'image' = 'video',
  format: '9:16' | '16:9' | '1:1' = '9:16',
  /** When set, timeline duration is set from audio session so template is "cut to audio size" from the start */
  initialDuration?: number
): Promise<Project> {
  const projectId = generateProjectId();
  const now = new Date().toISOString();
  const duration = typeof initialDuration === 'number' && initialDuration > 0 ? initialDuration : 0;

  const project: Project = {
    id: projectId,
    name,
    format,
    template: {
      type: templateType,
      label: templateLabel,
      path: templatePath,
      videoStart: 0,
    },
    audioSessionId,
    timeline: {
      duration,
      tracks: [],
    },
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };

  // Validate with schema
  const validated = ProjectSchema.parse(project);

  // Save to filesystem
  const projectPath = getProjectPath(projectId);
  fs.writeFileSync(projectPath, JSON.stringify(validated, null, 2), 'utf8');

  return validated;
}

/**
 * Get a project by ID
 */
export async function getProject(projectId: string): Promise<Project | null> {
  const projectPath = getProjectPath(projectId);

  if (!fs.existsSync(projectPath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(projectPath, 'utf8');
    const project = JSON.parse(data);
    return ProjectSchema.parse(project);
  } catch (error) {
    return null;
  }
}

/**
 * List all projects
 */
export async function listProjects(): Promise<Project[]> {
  const files = fs.readdirSync(PROJECTS_DIR);
  const projects: Project[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    try {
      const data = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf8');
      const project = JSON.parse(data);
      projects.push(ProjectSchema.parse(project));
    } catch (error) {
      // skip invalid project file
    }
  }

  // Sort by updatedAt (most recent first)
  projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return projects;
}

/**
 * Update a project
 */
export async function updateProject(
  projectId: string,
  updates: Partial<Omit<Project, 'id' | 'createdAt'>>
): Promise<Project | null> {
  const project = await getProject(projectId);

  if (!project) {
    return null;
  }

  const updated: Project = {
    ...project,
    ...updates,
    id: project.id, // Ensure ID doesn't change
    createdAt: project.createdAt, // Ensure createdAt doesn't change
    updatedAt: new Date().toISOString(),
  };

  // Validate with schema
  const validated = ProjectSchema.parse(updated);

  // Save to filesystem
  const projectPath = getProjectPath(projectId);
  fs.writeFileSync(projectPath, JSON.stringify(validated, null, 2), 'utf8');

  return validated;
}

/**
 * Update project timeline
 */
export async function updateTimeline(
  projectId: string,
  timeline: Timeline
): Promise<Project | null> {
  return updateProject(projectId, { timeline });
}

/**
 * Update project status
 */
export async function updateStatus(
  projectId: string,
  status: 'draft' | 'ready' | 'exporting' | 'exported'
): Promise<Project | null> {
  return updateProject(projectId, { status });
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<boolean> {
  const projectPath = getProjectPath(projectId);

  if (!fs.existsSync(projectPath)) {
    return false;
  }

  try {
    fs.unlinkSync(projectPath);
    const folder = getAnimationFolderName(projectId);
    removeDirIfExists(path.join(REMOTION_ANIMATION_DIR, folder));
    removeDirIfExists(path.join(RENDERED_ANIMATIONS_DIR, folder));
    return true;
  } catch (error) {
    return false;
  }
}
