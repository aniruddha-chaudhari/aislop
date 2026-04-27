export type TrackType = 'audio' | 'music' | 'sfx' | 'subtitle' | 'overlay' | 'character';

export type BaseClip = {
  id: string;
  start: number; // seconds on timeline
  duration: number; // seconds
};

export type AudioClip = BaseClip & {
  kind: 'audio';
  label: string;
};

export type MusicClip = BaseClip & {
  kind: 'music';
  path: string;
  volume?: number;
};

export type SfxClip = BaseClip & {
  kind: 'sfx';
  path: string;
  volume?: number;
};

export type WordTimestamp = { word: string; start: number; end: number };

export type SubtitleClip = BaseClip & {
  kind: 'subtitle';
  speaker: string;
  text: string;
  /** Word-level timestamps for karaoke effect */
  words?: WordTimestamp[];
};

export type OverlayClip = BaseClip & {
  kind: 'overlay';
  assetId: string;
  label: string;
  x: number;
  y: number;
  scale: number;
  /** `replace` means full-frame B-roll replacement for the clip time range. */
  displayMode?: 'overlay' | 'replace';
  /** When set, export uses this path instead of storage/images/{sessionId}/{assetId}.png */
  path?: string;
  planStatus?: 'draft' | 'approved';
  promptText?: string;
  promptEdited?: boolean;
  animationMomentId?: string;
  animationType?: string;
  animationContent?: string;
  animationSubtitle?: string;
  animationContextSummary?: string;
  fullDialogueContext?: string;
  researchContext?: string;
  generationHistory?: string[];
};

export type CharacterClip = BaseClip & {
  kind: 'character';
  character: string;
  /** Backend maps this to portrait variants (e.g. happy → peter_happy.png). */
  emotion?: string;
  x: number;
  y: number;
  scale: number;
};

export type Clip = AudioClip | MusicClip | SfxClip | SubtitleClip | OverlayClip | CharacterClip;

export type ClipRef = {
  trackId: string;
  clipId: string;
};

export type Track = {
  id: string;
  type: TrackType;
  name: string;
  clips: Clip[];
  locked?: boolean;
  muted?: boolean;
  /** When true, this track was auto-created (e.g. by dragging a clip over another); empty tracks with this flag are removed when the clip is moved. User-added tracks are not removed when empty. */
  isAutoCreated?: boolean;
};

export type EditorProject = {
  id: string;
  name: string;
  format: '9:16';
  duration: number;
  audioSessionId?: string;
  template: {
    type: 'video' | 'image';
    label: string;
    /**
     * Optional URL/path for preview rendering.
     * Phase-2 preview can still render with fallbacks when absent.
     */
    src?: string;
    /** Optional poster (for video templates). */
    posterSrc?: string;
    /** Start time (seconds) into the background video; 0 = play from beginning. Only for video templates. */
    videoStart?: number;
  };
  tracks: Track[];
};
