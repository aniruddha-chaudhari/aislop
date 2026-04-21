import type { EditorProject, Track } from './types';

/** Match EditorLayout: overlay, dialogue audio, music, SFX, then subtitle/character/etc. */
export function sortEditorTracks(tracks: Track[]): Track[] {
  const overlayTracks = tracks.filter((t) => t.type === 'overlay');
  const audioTracks = tracks.filter((t) => t.type === 'audio');
  const musicTracks = tracks.filter((t) => t.type === 'music');
  const sfxTracks = tracks.filter((t) => t.type === 'sfx');
  const otherTracks = tracks.filter(
    (t) => t.type !== 'overlay' && t.type !== 'audio' && t.type !== 'music' && t.type !== 'sfx'
  );
  return [...overlayTracks, ...audioTracks, ...musicTracks, ...sfxTracks, ...otherTracks];
}

/** Map GET / POST `project` JSON from the backend into `EditorProject`. */
export function editorProjectFromApi(backendProject: {
  id: string;
  name: string;
  format: EditorProject['format'];
  audioSessionId: string;
  template: {
    type: 'video' | 'image';
    label: string;
    path: string;
    posterSrc?: string;
    videoStart?: number;
  };
  timeline: { duration: number; tracks: any[] };
}): EditorProject {
  return {
    id: backendProject.id,
    name: backendProject.name,
    format: backendProject.format,
    duration: backendProject.timeline.duration,
    audioSessionId: backendProject.audioSessionId,
    template: {
      type: backendProject.template.type,
      label: backendProject.template.label,
      src: backendProject.template.path,
      posterSrc: backendProject.template.posterSrc,
      videoStart: backendProject.template.videoStart ?? 0,
    },
    tracks: sortEditorTracks(
      backendProject.timeline.tracks.map((track: any) => ({
        id: track.id,
        type: track.type,
        name: track.name,
        clips: track.clips,
        locked: track.locked,
        muted: track.muted,
      }))
    ),
  };
}
