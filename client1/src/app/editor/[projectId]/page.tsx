'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { API_ENDPOINTS } from '../../../config/api';
import { makeMockProject } from '../../../features/editor/mock';
import EditorLayout from '../../components/editor/EditorLayout';
import type { EditorProject } from '../../../features/editor/types';
import { editorProjectFromApi } from '../../../features/editor/mapApiProject';

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

      const response = await fetch(API_ENDPOINTS.getProject(projectId), { cache: 'no-store' });
      
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
        const editorProject = editorProjectFromApi(data.project);
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

