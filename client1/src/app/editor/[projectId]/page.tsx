'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { API_ENDPOINTS } from '../../../config/api';
import { makeMockProject } from '../../../features/editor/mock';
import EditorLayout from '../../components/editor/EditorLayout';
import type { EditorProject, Track } from '../../../features/editor/types';

/**
 * Sort tracks in the correct order:
 * 1. Overlay (template) - always first
 * 2. Audio - always second
 * 3. Everything else (subtitle, character, etc.) - after
 */
function sortTracks(tracks: Track[]): Track[] {
  const overlayTracks = tracks.filter(t => t.type === 'overlay');
  const audioTracks = tracks.filter(t => t.type === 'audio');
  const otherTracks = tracks.filter(t => t.type !== 'overlay' && t.type !== 'audio');
  
  return [...overlayTracks, ...audioTracks, ...otherTracks];
}

export default function EditorPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = String(params?.projectId ?? 'demo-001');
  
  const [project, setProject] = useState<EditorProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async (): Promise<EditorProject | undefined> => {
    const isRefresh = !!project;
    try {
      if (!isRefresh) setLoading(true);
      setError('');

      const response = await fetch(API_ENDPOINTS.getProject(projectId));
      
      if (!response.ok) {
        // Fallback to mock data if project doesn't exist
        if (response.status === 404) {
          const mock = makeMockProject(projectId);
          setProject(mock);
          setLoading(false);
          return mock;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.project) {
        // Transform backend project to EditorProject format
        const backendProject = data.project;
        const editorProject: EditorProject = {
          id: backendProject.id,
          name: backendProject.name,
          format: backendProject.format,
          duration: backendProject.timeline.duration,
          audioSessionId: backendProject.audioSessionId,
          template: {
            type: backendProject.template.type,
            label: backendProject.template.label,
            src: backendProject.template.path,
            posterSrc: backendProject.template.posterSrc,
            videoStart: backendProject.template.videoStart ?? 0,
          },
          tracks: sortTracks(backendProject.timeline.tracks.map((track: any) => ({
            id: track.id,
            type: track.type,
            name: track.name,
            clips: track.clips,
            locked: track.locked,
            muted: track.muted,
          }))),
        };

        setProject(editorProject);
        return editorProject;
      } else {
        throw new Error(data.error || 'Failed to fetch project');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch project');
      // Fallback to mock data on error
      const mock = makeMockProject(projectId);
      setProject(mock);
      return mock;
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-[var(--editor-muted)]">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-red-500">{error || 'Project not found'}</div>
      </div>
    );
  }

  return <EditorLayout project={project} onProjectUpdate={fetchProject} />;
}

