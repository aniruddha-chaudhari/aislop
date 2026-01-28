'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, Music, ImageIcon, Users, ChevronRight } from 'lucide-react';
import type { EditorProject } from '../../../features/editor/types';

export type SidebarTab = 'assets' | 'audio' | 'images' | 'chars';

type Props = {
  project: EditorProject;
  width: number;
  onWidthChange: (width: number) => void;
};

const tabs: { id: SidebarTab; icon: React.ReactNode; label: string }[] = [
  { id: 'assets', icon: <FolderOpen size={16} />, label: 'Assets' },
  { id: 'audio', icon: <Music size={16} />, label: 'Audio Session' },
  { id: 'images', icon: <ImageIcon size={16} />, label: 'Images' },
  { id: 'chars', icon: <Users size={16} />, label: 'Chars' },
];

export default function EditorSidebar({ project, width, onWidthChange }: Props) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('assets');
  const [isOpen, setIsOpen] = useState(true);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      onWidthChange(Math.max(150, e.clientX));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  return (
    <div className="flex h-full">
      {/* Tab bar */}
      <div className="bg-surface border-r border-border flex flex-col py-3 px-2 gap-2 w-auto shrink-0">
        <div className="flex flex-col gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === tab.id
                  ? 'bg-accent text-card'
                  : 'text-foreground hover:bg-muted'
              }`}
              title={tab.label}
            >
              {tab.icon}
            </button>
          ))}
        </div>
        <div className="border-t border-border pt-2 mt-2">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex justify-center p-2 rounded hover:bg-muted transition text-muted-foreground"
            title={isOpen ? 'Hide Sidebar' : 'Show Sidebar'}
          >
            <ChevronRight size={16} className={`transition ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content panel */}
      {isOpen && (
        <div
          style={{ width: `${width}px` }}
          className="bg-card border-r border-border flex flex-col p-4 overflow-y-auto relative"
        >
          <div
            onMouseDown={handleMouseDown}
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-accent transition z-10"
            style={{ cursor: 'col-resize' }}
          />

          <h3 className="text-sm font-semibold mb-4">{tabs.find((t) => t.id === activeTab)?.label}</h3>

          <div className="space-y-3 text-muted-foreground text-xs">
            {activeTab === 'assets' && (
              <p>Project assets and uploaded files. (WIP)</p>
            )}
            {activeTab === 'audio' && (
              <p>Audio session — recorded or generated audio. (WIP)</p>
            )}
            {activeTab === 'images' && (
              <p>Images for overlays and thumbnails. (WIP)</p>
            )}
            {activeTab === 'chars' && (
              <p>Characters / avatars. (WIP)</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
