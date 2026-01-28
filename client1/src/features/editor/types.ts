export type TrackType = 'audio' | 'subtitle' | 'overlay' | 'character';

export type BaseClip = {
  id: string;
  start: number; // seconds on timeline
  duration: number; // seconds
};

export type AudioClip = BaseClip & {
  kind: 'audio';
  label: string;
};

export type SubtitleClip = BaseClip & {
  kind: 'subtitle';
  speaker: 'Stewie' | 'Peter' | 'Narrator';
  text: string;
};

export type OverlayClip = BaseClip & {
  kind: 'overlay';
  assetId: string;
  label: string;
  // normalized position in preview space [0..1]
  x: number;
  y: number;
  scale: number;
};

export type CharacterClip = BaseClip & {
  kind: 'character';
  character: 'Stewie' | 'Peter';
  x: number;
  y: number;
  scale: number;
};

export type Clip = AudioClip | SubtitleClip | OverlayClip | CharacterClip;

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
};

export type EditorProject = {
  id: string;
  name: string;
  format: '9:16';
  duration: number;
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
  };
  tracks: Track[];
};

