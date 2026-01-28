'use client';

import { useState, useEffect } from 'react';
import { Grid2X2, Film, Music, ImageIcon, Grid3x3, Zap, ChevronRight } from 'lucide-react';

type MediaCategory = 'all' | 'video' | 'audio' | 'images' | 'shapes' | 'effects';

type Props = {
  width: number;
  onWidthChange: (width: number) => void;
};

export default function MediaSidebar({ width, onWidthChange }: Props) {
  const [activeCategory, setActiveCategory] = useState<MediaCategory>('all');
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

  const categories: { id: MediaCategory; icon: React.ReactNode; label: string }[] = [
    { id: 'all', icon: <Grid2X2 size={16} />, label: 'All Media' },
    { id: 'video', icon: <Film size={16} />, label: 'Videos' },
    { id: 'audio', icon: <Music size={16} />, label: 'Audio' },
    { id: 'images', icon: <ImageIcon size={16} />, label: 'Images' },
    { id: 'shapes', icon: <Grid3x3 size={16} />, label: 'Shapes' },
    { id: 'effects', icon: <Zap size={16} />, label: 'Effects' },
  ];

  return (
    <div className="flex h-full">
      {/* Media Navbar - Sort/Filter Buttons */}
      <div className="bg-surface border-r border-border flex flex-col py-3 px-2 gap-2 w-auto shrink-0">
        <div className="flex flex-col gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition ${
                activeCategory === category.id
                  ? 'bg-accent text-card'
                  : 'text-foreground hover:bg-muted'
              }`}
              title={category.label}
            >
              {category.icon}
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

      {/* Media Content Panel */}
      {isOpen && (
        <div 
          style={{ width: `${width}px` }} 
          className="bg-card border-r border-border flex flex-col p-4 overflow-y-auto relative"
        >
          {/* Resize Handle */}
          <div
            onMouseDown={handleMouseDown}
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-accent transition z-10"
            style={{ cursor: 'col-resize' }}
          />
          
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Media</h3>
          </div>

          {/* Media Items */}
          <div className="space-y-3">
            {(activeCategory === 'all' || activeCategory === 'images') && (
              <>
                <div className="aspect-video bg-gradient-to-br from-orange-600 to-orange-900 rounded-lg cursor-pointer hover:ring-2 ring-accent transition"></div>
                <div className="aspect-video bg-gradient-to-br from-blue-600 to-blue-900 rounded-lg cursor-pointer hover:ring-2 ring-accent transition"></div>
              </>
            )}
            {(activeCategory === 'all' || activeCategory === 'video') && (
              <div className="aspect-video bg-gradient-to-br from-purple-600 to-purple-900 rounded-lg cursor-pointer hover:ring-2 ring-accent transition"></div>
            )}
            {(activeCategory === 'all' || activeCategory === 'audio') && (
              <div className="aspect-video bg-gradient-to-br from-cyan-600 to-cyan-900 rounded-lg flex items-center justify-center text-xs text-muted-foreground cursor-pointer hover:bg-border transition">
                <span className="text-xs text-white">🎵 Audio</span>
              </div>
            )}
          </div>

          {(activeCategory === 'all' || activeCategory === 'shapes') && (
            <div className="mt-6 pt-6 border-t border-border">
              <h4 className="text-sm font-semibold mb-3">Shapes</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="aspect-square bg-muted rounded-lg flex items-center justify-center text-xs text-muted-foreground cursor-pointer hover:bg-border transition">+</div>
                <div className="aspect-square bg-muted rounded-lg flex items-center justify-center text-xs text-muted-foreground cursor-pointer hover:bg-border transition">+</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
