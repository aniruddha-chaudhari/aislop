'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, Music, ImageIcon, Users, ChevronRight, Upload, Mic, Film, Volume2 } from 'lucide-react';
import type { EditorProject } from '../../../features/editor/types';
import { API_ENDPOINTS } from '../../../config/api';

export type SidebarTab = 'audioSession' | 'template' | 'assets' | 'audio' | 'sfx' | 'images' | 'chars';

type TemplateVideo = {
  filename: string;
  path: string;
  fileSize: number;
};

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

type AudioAsset = {
  filename: string;
  path: string;
  size: number;
  updatedAt: string;
};

type Props = {
  project: EditorProject;
  width: number;
  onWidthChange: (width: number) => void;
  /** Passed from parent so sidebar updates immediately after add/upload without reload */
  templates?: TemplateVideo[];
  audioSessions?: AudioSession[];
  onChangeAudioSession?: (sessionId: string) => void;
  onChangeTemplate?: (path: string, label: string) => void;
  onUploadTemplate?: (file: File) => void;
  uploadingTemplate?: boolean;
  /** Called when user switches to template or audio session tab so parent can refetch lists */
  onTabFocus?: (tab: 'audioSession' | 'template') => void;
  /** Add selected background music to timeline */
  onAddBackgroundMusic?: (asset: AudioAsset) => void;
  /** Add selected SFX to timeline */
  onAddSfx?: (asset: AudioAsset) => void;
};

/** Audio Session + Template buttons (in tab bar); Assets kept separate below. */
const projectButtons: { id: 'audioSession' | 'template'; icon: React.ReactNode; label: string }[] = [
  { id: 'audioSession', icon: <Mic size={16} />, label: 'Audio Session' },
  { id: 'template', icon: <Film size={16} />, label: 'Template' },
];

const assetTabs: { id: SidebarTab; icon: React.ReactNode; label: string }[] = [
  { id: 'assets', icon: <FolderOpen size={16} />, label: 'Assets' },
  { id: 'audio', icon: <Music size={16} />, label: 'Audio' },
  { id: 'sfx', icon: <Volume2 size={16} />, label: 'SFX' },
  { id: 'images', icon: <ImageIcon size={16} />, label: 'Images' },
  { id: 'chars', icon: <Users size={16} />, label: 'Chars' },
];

export default function EditorSidebar({ 
  project, 
  width, 
  onWidthChange, 
  templates: templatesProp,
  audioSessions: audioSessionsProp,
  onChangeAudioSession, 
  onChangeTemplate,
  onUploadTemplate,
  uploadingTemplate,
  onTabFocus,
  onAddBackgroundMusic,
  onAddSfx,
}: Props) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('audioSession');
  const [isOpen, setIsOpen] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  
  // Local data when parent doesn't pass lists (e.g. standalone usage)
  const [audioSessionsLocal, setAudioSessionsLocal] = useState<AudioSession[]>([]);
  const [templatesLocal, setTemplatesLocal] = useState<TemplateVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [musicAssets, setMusicAssets] = useState<AudioAsset[]>([]);
  const [loadingMusic, setLoadingMusic] = useState(false);
  const [sfxAssets, setSfxAssets] = useState<AudioAsset[]>([]);
  const [loadingSfx, setLoadingSfx] = useState(false);

  // Use parent's lists when provided so UI updates without reload after add/upload
  const audioSessions = audioSessionsProp ?? audioSessionsLocal;
  const templates = templatesProp ?? templatesLocal;

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'template' || activeTab === 'audioSession') fetchData();
    if (activeTab === 'audio') fetchMusicAssets();
    if (activeTab === 'sfx') fetchSfxAssets();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch audio sessions (only update local when parent doesn't pass props)
      const audioResponse = await fetch(API_ENDPOINTS.audio);
      const audioData = await audioResponse.json();
      const sessions = audioData.success ? audioData.sessions : audioData.sessions || [];
      setAudioSessionsLocal(sessions);

      // Fetch templates
      const templateResponse = await fetch(API_ENDPOINTS.templateVideos);
      const templateData = await templateResponse.json();
      const temps = templateData.templates || templateData.videos || [];
      setTemplatesLocal(temps);

      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const fetchMusicAssets = async () => {
    try {
      setLoadingMusic(true);
      const response = await fetch(API_ENDPOINTS.audioAssetsMusic);
      const data = await response.json();
      setMusicAssets(data.assets || []);
    } catch (error) {
      setMusicAssets([]);
    } finally {
      setLoadingMusic(false);
    }
  };

  const fetchSfxAssets = async () => {
    try {
      setLoadingSfx(true);
      const response = await fetch(API_ENDPOINTS.audioAssetsSfx);
      const data = await response.json();
      setSfxAssets(data.assets || []);
    } catch (error) {
      setSfxAssets([]);
    } finally {
      setLoadingSfx(false);
    }
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

  const handleTemplateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadTemplate) {
      onUploadTemplate(file);
    }
  };

  const panelLabel = projectButtons.find((b) => b.id === activeTab)?.label
    ?? assetTabs.find((t) => t.id === activeTab)?.label
    ?? '';

  return (
    <div className="flex h-full">
      {/* Tab bar (icon strip) */}
      <div className="bg-surface border-r border-border flex flex-col py-3 px-2 gap-2 w-auto shrink-0">
        {/* Audio Session + Template buttons */}
        <div className="flex flex-col gap-2">
          {projectButtons.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setActiveTab(b.id);
                if (b.id === 'audioSession' || b.id === 'template') onTabFocus?.(b.id);
              }}
              className={`flex items-center justify-center px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === b.id ? 'bg-accent text-card' : 'text-foreground hover:bg-muted'
              }`}
              title={b.label}
            >
              {b.icon}
            </button>
          ))}
        </div>
        {/* Separator */}
        <div className="border-t border-border my-1" />
        {/* Assets (and other tabs) – kept separate */}
        <div className="flex flex-col gap-2">
          {assetTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center px-3 py-2 rounded text-xs font-medium transition ${
                activeTab === tab.id ? 'bg-accent text-card' : 'text-foreground hover:bg-muted'
              }`}
              title={tab.label}
            >
              {tab.icon}
            </button>
          ))}
        </div>
        <div className="border-t border-border pt-2 mt-auto">
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

          <h3 className="text-sm font-semibold mb-4">{panelLabel}</h3>

          {/* Audio Session panel */}
          {activeTab === 'audioSession' && (
            <div className="max-h-[calc(100vh-12rem)] overflow-y-auto space-y-2">
              {loading ? (
                <div className="text-xs text-muted-foreground text-center py-6">Loading...</div>
              ) : audioSessions.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-6">
                  No audio sessions found.
                </div>
              ) : (
                audioSessions.map((session) => {
                  const isSelected = project.audioSessionId === session.sessionId;
                  return (
                  <button
                    key={session.sessionId}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onChangeAudioSession?.(session.sessionId);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md text-xs transition border ${
                      isSelected
                        ? 'bg-accent/20 border-accent'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <div className="font-medium truncate">{session.name || session.sessionId}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {session.stats.totalDialogues} dialogues • {session.stats.audioFilesGenerated} files
                    </div>
                  </button>
                  );
                })
              )}
            </div>
          )}

          {/* Template panel */}
          {activeTab === 'template' && (
            <div className="flex flex-col gap-3">
              <div className="p-2 border border-border rounded-md bg-accent/5">
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleTemplateFileChange}
                  className="hidden"
                  id="template-upload"
                />
                <label
                  htmlFor={uploadingTemplate ? undefined : 'template-upload'}
                  className={`flex items-center justify-center gap-2 w-full px-3 py-2 text-xs font-medium rounded-md transition ${
                    uploadingTemplate
                      ? 'bg-muted text-muted-foreground cursor-not-allowed pointer-events-none'
                      : 'bg-accent hover:bg-accent/90 text-white cursor-pointer'
                  }`}
                >
                  <Upload size={12} />
                  {uploadingTemplate ? 'Uploading...' : 'Upload Template'}
                </label>
              </div>
              <div className="max-h-[calc(100vh-18rem)] overflow-y-auto space-y-1">
                {loading ? (
                  <div className="text-xs text-muted-foreground text-center py-6">Loading...</div>
                ) : templates.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-6">
                    No templates found. Upload one above.
                  </div>
                ) : (
                  templates.map((template) => {
                    const isSelected = project.template?.src === template.path;
                    return (
                    <button
                      key={template.path}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onChangeTemplate?.(template.path, template.filename);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs transition border ${
                        isSelected
                          ? 'bg-accent/20 border-accent'
                          : 'border-border hover:bg-muted'
                      }`}
                    >
                      <div className="font-medium truncate">{template.filename}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {(template.fileSize / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Assets / Audio / SFX / Images / Chars – kept separate */}
          {(activeTab === 'assets' || activeTab === 'audio' || activeTab === 'sfx' || activeTab === 'images' || activeTab === 'chars') && (
            <div className="space-y-3 text-muted-foreground text-xs">
              {activeTab === 'assets' && <p>Project assets and uploaded files. (WIP)</p>}
              {activeTab === 'audio' && (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    Background music from storage/audio_assets/music
                  </div>
                  {loadingMusic ? (
                    <div className="text-xs text-muted-foreground text-center py-6">Loading...</div>
                  ) : musicAssets.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-6">
                      No music files found. Add .mp3, .wav, .ogg, .m4a, .aac, or .flac to
                      backend1/storage/audio_assets/music.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {musicAssets.map((asset) => (
                        <div
                          key={asset.path}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-foreground">
                              {asset.filename}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {asset.path}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              console.log('[EditorSidebar] Add music clicked', {
                                filename: asset.filename,
                                path: asset.path,
                              });
                              onAddBackgroundMusic?.(asset);
                            }}
                            className="shrink-0 rounded-md bg-accent px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-accent/90 transition"
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'sfx' && (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    Sound effects – add to SFX track on the timeline
                  </div>
                  {loadingSfx ? (
                    <div className="text-xs text-muted-foreground text-center py-6">Loading...</div>
                  ) : sfxAssets.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-6">
                      No SFX found. Add files to backend storage/audio_assets/sfx or run seed:sfx.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[calc(100vh-14rem)] overflow-y-auto">
                      {sfxAssets.map((asset) => (
                        <div
                          key={asset.path}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-foreground">
                              {asset.filename}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {asset.path}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onAddSfx?.(asset)}
                            className="shrink-0 rounded-md bg-accent px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-accent/90 transition"
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'images' && <p>Images for overlays and thumbnails. (WIP)</p>}
              {activeTab === 'chars' && <p>Characters / avatars. (WIP)</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
