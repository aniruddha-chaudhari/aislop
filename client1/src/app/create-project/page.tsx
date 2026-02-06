'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_ENDPOINTS } from '../../config/api';

type AudioSession = {
  sessionId: string;
  name?: string;
  createdAt: string;
  stats: {
    totalDialogues: number;
    audioFilesGenerated: number;
    allSuccessful: boolean;
  };
};

type TemplateVideo = {
  filename: string;
  path: string;
  fileSize: number;
};

export default function CreateProjectPage() {
  const router = useRouter();
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!projectName) {
      setError('Please enter a project name');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const response = await fetch(API_ENDPOINTS.createProject, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          format: '9:16',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.project) {
        // Redirect to the editor with the new project
        router.push(`/editor/${data.project.id}`);
      } else {
        throw new Error(data.error || 'Failed to create project');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground transition"
          >
            ← Back
          </button>
        </div>

        <div className="bg-card rounded-lg border border-border p-6">
          <h1 className="text-2xl font-bold mb-2">Create New Project</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Just give your project a name. You'll choose the audio session and template inside the editor.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-medium mb-2">Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="My Awesome Video"
                autoFocus
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            {/* Create Button */}
            <button
              onClick={handleCreate}
              disabled={creating || !projectName}
              className="w-full mt-6 px-4 py-2 bg-accent text-card font-medium rounded-md hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create Project & Open Editor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
