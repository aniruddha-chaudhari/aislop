'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../../config/api';

type Project = {
  id: string;
  name: string;
  format: '9:16' | '16:9' | '1:1';
  template: {
    type: 'video' | 'image';
    label: string;
    path: string;
  };
  audioSessionId: string;
  timeline: {
    duration: number;
    tracks: any[];
  };
  status: 'draft' | 'ready' | 'exporting' | 'exported';
  createdAt: string;
  updatedAt: string;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hr ago`;
  return 'Yesterday';
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch(API_ENDPOINTS.listProjects);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        setProjects(data.projects || []);
      } else {
        throw new Error(data.error || 'Failed to fetch projects');
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingId(projectId);
      setError('');
      
      const response = await fetch(API_ENDPOINTS.deleteProject(projectId), {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        // Remove the deleted project from the list
        setProjects(projects.filter(p => p.id !== projectId));
      } else {
        throw new Error(data.error || 'Failed to delete project');
      }
    } catch (err) {
      console.error('Error deleting project:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] px-3 py-6 sm:px-4">
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-[var(--editor-muted)]">Loading projects...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-6 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Projects</div>
          <div className="mt-1 text-xs text-[var(--editor-muted)]">
            {projects.length > 0 ? `${projects.length} project${projects.length !== 1 ? 's' : ''}` : 'No projects yet'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/create-project"
            className="studio-button-accent rounded-xl px-3 py-2 text-xs font-semibold shadow-[0_14px_32px_var(--shadow)]"
          >
            New Project
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {projects.length === 0 && !error && (
        <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center">
          <div className="text-sm text-[var(--editor-muted)]">
            No projects yet. Generate audio first, then create a project.
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {projects.map((p) => (
          <div
            key={p.id}
            className="group relative rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-[0_18px_40px_var(--shadow)] transition hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] hover:bg-[color-mix(in_srgb,var(--card)_85%,black)]"
          >
            <Link href={`/editor/${p.id}`} className="block">
              <div className="mb-2">
                <div className="text-xs font-medium tracking-tight truncate">{p.name}</div>
                <div className="mt-1 text-[10px] text-[var(--editor-muted)]">
                  {p.template.label}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] text-[var(--editor-muted)]">
                  {formatRelativeTime(p.updatedAt)}
                </div>
                <div className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                  {p.timeline.duration > 0 ? formatDuration(p.timeline.duration) : '--:--'}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1">
                <div className={`h-1.5 w-1.5 rounded-full ${
                  p.status === 'exported' ? 'bg-green-500' :
                  p.status === 'exporting' ? 'bg-yellow-500' :
                  p.status === 'ready' ? 'bg-blue-500' :
                  'bg-gray-500'
                }`} />
                <div className="text-[9px] capitalize text-[var(--editor-muted)]">{p.status}</div>
              </div>
            </Link>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDelete(p.id, p.name);
              }}
              disabled={deletingId === p.id}
              className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
              title="Delete project"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-red-500 hover:text-red-600"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

