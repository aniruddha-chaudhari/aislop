'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, Music, ImageIcon, Users, ChevronRight, Upload, Mic, Film, Volume2, Trash2, Video, Sparkles } from 'lucide-react';
import type { EditorProject } from '../../../features/editor/types';
import { API_ENDPOINTS } from '../../../config/api';
import { pathLooksLikeVideo } from '../../../features/editor/overlayMedia';

export type SidebarTab = 'audioSession' | 'template' | 'assets' | 'animation' | 'audio' | 'sfx' | 'images' | 'video' | 'chars';

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

type ProjectImageAsset = {
  assetId: string;
  filename: string;
  path: string;
  size: number;
  createdAt: string;
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
  /** Add a project image from library directly to timeline */
  onAddProjectImage?: (asset: ProjectImageAsset) => void;
  /** Add a video from library directly to timeline */
  onAddProjectVideo?: (asset: TemplateVideo) => void;
  /** Delete generated animation plan + cache */
  onDeleteAnimationPlan?: () => void;
  /** True when project currently has generated animation clips */
  hasAnimationPlan?: boolean;
  /** Disable delete action while request is in progress */
  deletingAnimationPlan?: boolean;
  /** Current scrub/playhead time for inserting animation clips. */
  playheadTime?: number;
  /** Create a draft HyperFrames animation clip at the current scrub position. */
  onCreateAnimationAtPlayhead?: (prompt: string, duration: number) => Promise<void> | void;
  creatingAnimationClip?: boolean;
};

/** Audio Session + Template buttons (in tab bar); Assets kept separate below. */
const projectButtons: { id: 'audioSession' | 'template'; icon: React.ReactNode; label: string }[] = [
  { id: 'audioSession', icon: <Mic size={16} />, label: 'Audio Session' },
  { id: 'template', icon: <Film size={16} />, label: 'Template' },
];

const assetTabs: { id: SidebarTab; icon: React.ReactNode; label: string }[] = [
  { id: 'assets', icon: <FolderOpen size={16} />, label: 'Assets' },
  { id: 'animation', icon: <Sparkles size={16} />, label: 'Animation' },
  { id: 'audio', icon: <Music size={16} />, label: 'Audio' },
  { id: 'sfx', icon: <Volume2 size={16} />, label: 'SFX' },
  { id: 'images', icon: <ImageIcon size={16} />, label: 'Images' },
  { id: 'video', icon: <Video size={16} />, label: 'Video' },
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
  onAddProjectImage,
  onAddProjectVideo,
  onDeleteAnimationPlan,
  hasAnimationPlan,
  deletingAnimationPlan,
  playheadTime = 0,
  onCreateAnimationAtPlayhead,
  creatingAnimationClip,
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
  const [projectImages, setProjectImages] = useState<ProjectImageAsset[]>([]);
  const [loadingProjectImages, setLoadingProjectImages] = useState(false);
  const [uploadingProjectImage, setUploadingProjectImage] = useState(false);
  const [brokenProjectImageThumbs, setBrokenProjectImageThumbs] = useState<Record<string, true>>({});
  const [uploadingLibraryVideo, setUploadingLibraryVideo] = useState(false);
  const [animationPrompt, setAnimationPrompt] = useState('');
  const [animationDuration, setAnimationDuration] = useState(3);

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
    if (activeTab === 'images') fetchProjectImages();
    if (activeTab === 'video') fetchTemplatesOnly();
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

  const fetchTemplatesOnly = async () => {
    try {
      const templateResponse = await fetch(API_ENDPOINTS.templateVideos);
      const templateData = await templateResponse.json();
      const temps = templateData.templates || templateData.videos || [];
      setTemplatesLocal(temps);
    } catch (_error) {
      setTemplatesLocal([]);
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

  const fetchProjectImages = async () => {
    try {
      setLoadingProjectImages(true);
      const response = await fetch(API_ENDPOINTS.projectImages(project.id));
      const data = await response.json();
      setProjectImages(data.images || []);
    } catch (_error) {
      setProjectImages([]);
    } finally {
      setLoadingProjectImages(false);
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

  const handleProjectImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingProjectImage(true);
      const formData = new FormData();
      formData.append('image', file);
      formData.append('assetId', `lib_${Date.now()}`);
      const response = await fetch(API_ENDPOINTS.uploadProjectImage(project.id), {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await fetchProjectImages();
    } catch (_error) {
      // no-op for now; keep sidebar resilient
    } finally {
      setUploadingProjectImage(false);
      e.target.value = '';
    }
  };

  const handleLibraryVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLibraryVideo(true);
      const formData = new FormData();
      formData.append('video', file);
      const response = await fetch(API_ENDPOINTS.uploadTemplate, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await fetchTemplatesOnly();
      onTabFocus?.('template');
    } catch (_error) {
      // no-op for now; keep sidebar resilient
    } finally {
      setUploadingLibraryVideo(false);
      e.target.value = '';
    }
  };

  const panelLabel = projectButtons.find((b) => b.id === activeTab)?.label
    ?? assetTabs.find((t) => t.id === activeTab)?.label
    ?? '';

  const handleCreateAnimation = async () => {
    const prompt = animationPrompt.trim();
    if (!prompt || creatingAnimationClip) return;
    await onCreateAnimationAtPlayhead?.(prompt, animationDuration);
    setAnimationPrompt('');
  };

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
            type="button"
            onClick={() => onDeleteAnimationPlan?.()}
            disabled={!hasAnimationPlan || deletingAnimationPlan}
            className={`mb-2 w-full flex justify-center p-2 rounded transition ${
              !hasAnimationPlan || deletingAnimationPlan
                ? 'text-muted-foreground/50 cursor-not-allowed'
                : 'text-red-500 hover:bg-red-500/10'
            }`}
            title={
              deletingAnimationPlan
                ? 'Deleting animation plan...'
                : hasAnimationPlan
                  ? 'Delete Animation Plan'
                  : 'No Animation Plan To Delete'
            }
          >
            <Trash2 size={16} />
          </button>
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
          {(activeTab === 'assets' || activeTab === 'animation' || activeTab === 'audio' || activeTab === 'sfx' || activeTab === 'images' || activeTab === 'video' || activeTab === 'chars') && (
            <div className="space-y-3 text-muted-foreground text-xs">
              {activeTab === 'assets' && <p>Project assets and uploaded files. (WIP)</p>}
              {activeTab === 'animation' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-accent/30 bg-accent/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-foreground">Add HyperFrames Clip</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          Punch lands at scrub {playheadTime.toFixed(2)}s.
                        </div>
                      </div>
                      <Sparkles size={16} className="text-accent" />
                    </div>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-muted-foreground">Prompt</span>
                    <textarea
                      value={animationPrompt}
                      onChange={(event) => setAnimationPrompt(event.target.value)}
                      placeholder="Paste the animation idea here, e.g. glowing sandbox breach timed to the word escaped..."
                      rows={7}
                      className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-muted-foreground">Duration</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      step={0.25}
                      value={animationDuration}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setAnimationDuration(Number.isFinite(value) ? Math.max(1, Math.min(8, value)) : 3);
                      }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleCreateAnimation}
                    disabled={!animationPrompt.trim() || creatingAnimationClip || !onCreateAnimationAtPlayhead}
                    className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                      !animationPrompt.trim() || creatingAnimationClip || !onCreateAnimationAtPlayhead
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-accent text-white hover:bg-accent/90'
                    }`}
                  >
                    <Sparkles size={13} />
                    {creatingAnimationClip ? 'Adding...' : 'Add Clip'}
                  </button>

                  <div className="rounded-lg border border-border bg-muted/30 p-2 text-[10px] leading-relaxed text-muted-foreground">
                    Adds a draft clip with a tiny lead-in so the main animation hits the scrubbed dialogue moment. Use the right sidebar to generate.
                  </div>
                </div>
              )}
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
              {activeTab === 'images' && (
                <div className="space-y-3">
                  <div className="p-2 border border-border rounded-md bg-accent/5">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProjectImageFileChange}
                      className="hidden"
                      id="project-image-upload"
                    />
                    <label
                      htmlFor={uploadingProjectImage ? undefined : 'project-image-upload'}
                      className={`flex items-center justify-center gap-2 w-full px-3 py-2 text-xs font-medium rounded-md transition ${
                        uploadingProjectImage
                          ? 'bg-muted text-muted-foreground cursor-not-allowed pointer-events-none'
                          : 'bg-accent hover:bg-accent/90 text-white cursor-pointer'
                      }`}
                    >
                      <Upload size={12} />
                      {uploadingProjectImage ? 'Uploading...' : 'Import Image'}
                    </label>
                  </div>
                  {loadingProjectImages ? (
                    <div className="text-xs text-muted-foreground text-center py-6">Loading...</div>
                  ) : projectImages.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-6">
                      No images in library. Import one above.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[calc(100vh-18rem)] overflow-y-auto">
                      {projectImages.map((asset) => (
                        <div
                          key={asset.assetId}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-10 w-10 shrink-0 rounded-md bg-muted overflow-hidden border border-border">
                              {!brokenProjectImageThumbs[asset.assetId] ? (
                                pathLooksLikeVideo(asset.filename) ? (
                                  <video
                                    src={`${API_ENDPOINTS.serveProjectImage(project.id, asset.assetId)}?t=${encodeURIComponent(String(asset.createdAt ?? Date.now()))}`}
                                    className="h-full w-full object-cover"
                                    muted
                                    playsInline
                                    preload="metadata"
                                    onError={() => {
                                      setBrokenProjectImageThumbs((prev) => ({ ...prev, [asset.assetId]: true }));
                                    }}
                                  />
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={`${API_ENDPOINTS.serveProjectImage(project.id, asset.assetId)}?t=${encodeURIComponent(String(asset.createdAt ?? Date.now()))}`}
                                    alt={asset.filename}
                                    className="h-full w-full object-cover"
                                    onError={() => {
                                      setBrokenProjectImageThumbs((prev) => ({ ...prev, [asset.assetId]: true }));
                                    }}
                                  />
                                )
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                  <ImageIcon size={16} />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-foreground">{asset.filename}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{asset.assetId}</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onAddProjectImage?.(asset)}
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
              {activeTab === 'video' && (
                <div className="space-y-3">
                  <div className="p-2 border border-border rounded-md bg-accent/5">
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleLibraryVideoFileChange}
                      className="hidden"
                      id="library-video-upload"
                    />
                    <label
                      htmlFor={uploadingLibraryVideo ? undefined : 'library-video-upload'}
                      className={`flex items-center justify-center gap-2 w-full px-3 py-2 text-xs font-medium rounded-md transition ${
                        uploadingLibraryVideo
                          ? 'bg-muted text-muted-foreground cursor-not-allowed pointer-events-none'
                          : 'bg-accent hover:bg-accent/90 text-white cursor-pointer'
                      }`}
                    >
                      <Upload size={12} />
                      {uploadingLibraryVideo ? 'Uploading...' : 'Import Video'}
                    </label>
                  </div>
                  {templates.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-6">
                      No videos in library. Import one above.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[calc(100vh-18rem)] overflow-y-auto">
                      {templates.map((videoAsset) => (
                        <div
                          key={videoAsset.path}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-foreground">{videoAsset.filename}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {(videoAsset.fileSize / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onAddProjectVideo?.(videoAsset)}
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
              {activeTab === 'chars' && <p>Characters / avatars. (WIP)</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
