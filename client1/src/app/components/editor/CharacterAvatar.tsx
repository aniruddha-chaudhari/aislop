import { useMemo } from 'react';
import type { EditorProject, OverlayClip } from '../../../features/editor/types';
import { voiceDisplayName } from '../../../features/editor/voiceDisplayName';
import { API_BASE_URL } from '../../../config/api';

type CharacterAvatarProps = {
  project: EditorProject;
  currentTime: number;
  className?: string;
};

export default function CharacterAvatar({ project, currentTime, className = '' }: CharacterAvatarProps) {
  // Find the current character clip at this time
  const currentCharacterClip = useMemo(() => {
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.kind === 'character' &&
            clip.start <= currentTime &&
            clip.start + clip.duration > currentTime) {
          return clip;
        }
      }
    }
    return null;
  }, [project.tracks, currentTime]);

  /** Full-frame replace B-roll: hide character portrait (matches export/preview). */
  const isReplaceOverlayActive = useMemo(() => {
    for (const track of project.tracks) {
      if (track.type !== 'overlay') continue;
      for (const clip of track.clips) {
        if (clip.kind !== 'overlay') continue;
        const o = clip as OverlayClip;
        if (o.displayMode !== 'replace') continue;
        if (o.planStatus === 'draft') continue;
        if (clip.start <= currentTime && clip.start + clip.duration > currentTime) return true;
      }
    }
    return false;
  }, [project.tracks, currentTime]);

  // Get character image URL from backend
  const characterImageUrl = useMemo(() => {
    if (!currentCharacterClip?.character) return null;

    const emotion = currentCharacterClip.emotion || 'neutral';
    const name = voiceDisplayName(currentCharacterClip.character);
    return `${API_BASE_URL}/api/character-image/${encodeURIComponent(name)}/${encodeURIComponent(emotion)}`;
  }, [currentCharacterClip]);

  if (!currentCharacterClip || !characterImageUrl || isReplaceOverlayActive) {
    return (
      <div className={`w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center ${className}`}>
        <span className="text-white text-sm">No Character</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <img
        src={characterImageUrl}
        alt={voiceDisplayName(currentCharacterClip.character)}
        className="w-24 h-24 rounded-full object-cover border-2 border-white shadow-lg"
      />
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 bg-black/70 text-white text-xs px-2 py-1 rounded">
        {currentCharacterClip.emotion || 'neutral'}
      </div>
    </div>
  );
}