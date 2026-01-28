'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, ClipRef, EditorProject } from '../../../features/editor/types';
import { useRouter } from 'next/navigation';
import EditorSidebar from './EditorSidebar';
import CanvasPreview from './CanvasPreview';
import TextPropertiesPanel from './TextPropertiesPanel';
import VideoTimelinePanel from './VideoTimelinePanel';

type Props = {
  project: EditorProject;
};

export default function EditorLayout({ project }: Props) {
  const router = useRouter();
  const [draftProject, setDraftProject] = useState<EditorProject>(project);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(45.0);
  const [volume, setVolume] = useState(75);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [timelineHeight, setTimelineHeight] = useState(260);
  const [rightPanelWidth, setRightPanelWidth] = useState(224);
  const [selected, setSelected] = useState<ClipRef | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  // When the route changes to a new project, reset local draft state.
  useEffect(() => {
    setDraftProject(project);
    setSelected(null);
    setPlayheadTime(0);
    setIsPlaying(false);
  }, [project]);

  const selectedClip: Clip | null = useMemo(() => {
    if (!selected) return null;
    const t = draftProject.tracks.find((x) => x.id === selected.trackId);
    if (!t) return null;
    return t.clips.find((c) => c.id === selected.clipId) ?? null;
  }, [draftProject.tracks, selected]);

  const updateClip = (ref: ClipRef, patch: Partial<Clip>) => {
    setDraftProject((p) => {
      const tracks = p.tracks.map((t) => {
        if (t.id !== ref.trackId) return t;
        return {
          ...t,
          clips: t.clips.map((c) => (c.id === ref.clipId ? ({ ...c, ...patch } as Clip) : c)),
        };
      });
      return { ...p, tracks };
    });
  };

  // Phase 2 playback clock: advances playhead while playing.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }

    const tick = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      lastTsRef.current = ts;
      const dt = (ts - last) / 1000;

      setPlayheadTime((t) => {
        const next = Math.min(draftProject.duration, Math.max(0, t + dt));
        // stop at end
        if (next >= draftProject.duration) {
          setIsPlaying(false);
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [isPlaying, draftProject.duration]);

  const handleExport = () => {
    console.log('Export clicked');
    // TODO: Implement export functionality
  };

  return (
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden flex-col">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Canvas and Properties Row */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Assets, Audio Session, Images, Chars */}
          <EditorSidebar
            project={draftProject}
            width={sidebarWidth}
            onWidthChange={setSidebarWidth}
          />

          {/* Canvas Preview */}
          <CanvasPreview
            project={draftProject}
            isPlaying={isPlaying}
            playheadTime={playheadTime}
            duration={draftProject.duration}
            volume={volume}
            onPlayPause={() => setIsPlaying(!isPlaying)}
            onPlayheadChange={setPlayheadTime}
            onVolumeChange={setVolume}
            selected={selected}
            onSelectClip={setSelected}
            onUpdateClip={updateClip}
          />

          {/* Right Properties Panel */}
          <TextPropertiesPanel
            width={rightPanelWidth}
            onWidthChange={setRightPanelWidth}
            selected={selectedClip}
            selectedRef={selected}
            onUpdateClip={(patch) => {
              if (!selected) return;
              updateClip(selected, patch);
            }}
          />
        </div>

        {/* Timeline Section */}
        <VideoTimelinePanel
          project={draftProject}
          height={timelineHeight}
          isPlaying={isPlaying}
          playheadTime={playheadTime}
          timelineZoom={timelineZoom}
          projectName={`${draftProject.name}.fn`}
          onBack={() => router.push('/projects')}
          onExport={handleExport}
          onHeightChange={setTimelineHeight}
          onPlayPause={() => setIsPlaying(!isPlaying)}
          onPlayheadChange={setPlayheadTime}
          onZoomChange={setTimelineZoom}
          selected={selected}
          onSelectClip={setSelected}
          onUpdateClip={updateClip}
        />
      </div>
    </div>
  );
}
