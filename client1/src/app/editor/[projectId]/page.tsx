'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { makeMockProject } from '../../../features/editor/mock';
import EditorLayout from '../../components/editor/EditorLayout';

export default function EditorPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = String(params?.projectId ?? 'demo-001');

  const project = useMemo(() => makeMockProject(projectId), [projectId]);

  return <EditorLayout project={project} />;
}

