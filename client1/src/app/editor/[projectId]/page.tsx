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

  const fetchProject = async () => {
    console.log('[EditorPage] fetchProject called for projectId:', projectId);
    const isRefresh = !!project;
    try {
      if (!isRefresh) setLoading(true);
      setError('');

      const response = await fetch(API_ENDPOINTS.getProject(projectId));
      
      if (!response.ok) {
        // Fallback to mock data if project doesn't exist
        if (response.status === 404) {
          console.log('Project not found, using mock data');
          setProject(makeMockProject(projectId));
          setLoading(false);
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      console.log('[EditorPage] fetchProject response data:', {
        success: data.success,
        hasProject: !!data.project,
        rawProject: data.project,
        audioSessionId: data.project?.audioSessionId,
        templatePath: data.project?.template?.path,
        timelineTracksCount: data.project?.timeline?.tracks?.length,
        timelineDuration: data.project?.timeline?.duration,
        timelineTracks: data.project?.timeline?.tracks
      });
      
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
        
        console.log('[EditorPage] Setting editorProject state:', {
          projectId: editorProject.id,
          audioSessionId: editorProject.audioSessionId,
          templateSrc: editorProject.template?.src,
          templateLabel: editorProject.template?.label,
          duration: editorProject.duration,
          tracksCount: editorProject.tracks.length,
          tracks: editorProject.tracks.map(t => ({
            id: t.id,
            name: t.name,
            type: t.type,
            clipsCount: t.clips.length,
            clips: t.clips.map(c => ({
              id: c.id,
              kind: c.kind,
              start: c.start,
              duration: c.duration,
              label: c.kind === 'subtitle' ? c.speaker : c.kind === 'character' ? c.character : c.kind === 'overlay' ? c.label : c.label
            }))
          }))
        });
        setProject(editorProject);
      } else {
        throw new Error(data.error || 'Failed to fetch project');
      }
    } catch (err) {
      console.error('Error fetching project:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch project');
      // Fallback to mock data on error
      setProject(makeMockProject(projectId));
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

