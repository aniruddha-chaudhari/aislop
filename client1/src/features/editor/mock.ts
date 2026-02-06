import type { EditorProject } from './types';

export function makeMockProject(id: string): EditorProject {
  return {
    id,
    name: id === 'demo-001' ? 'FamilyGuy_TechChat_Edit' : `Project_${id}`,
    format: '9:16',
    duration: 60,
    template: {
      type: 'video',
      label: 'Minecraft (9:16)',
      src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      posterSrc: '/next.svg',
    },
    tracks: [
      {
        id: 't_audio',
        type: 'audio',
        name: 'Audio',
        clips: [{ id: 'a1', kind: 'audio', start: 0, duration: 60, label: 'Session_abc' }],
        locked: true,
      },
      {
        id: 't_music',
        type: 'music',
        name: 'Music',
        clips: [
          { id: 'm1', kind: 'music', start: 0, duration: 60, path: 'audio_assets/music/chill_bed.mp3', volume: 0.35 },
        ],
      },
      {
        id: 't_sfx',
        type: 'sfx',
        name: 'SFX',
        clips: [
          { id: 'sfx1', kind: 'sfx', start: 6, duration: 1.2, path: 'audio_assets/sfx/whoosh.wav', volume: 0.8 },
          { id: 'sfx2', kind: 'sfx', start: 18, duration: 0.6, path: 'audio_assets/sfx/pop.wav', volume: 0.7 },
        ],
      },
      {
        id: 't_subs',
        type: 'subtitle',
        name: 'Subtitles',
        clips: [
          { id: 's1', kind: 'subtitle', start: 1.2, duration: 2.4, speaker: 'Stewie', text: 'Hey Peter, check this out.' },
          { id: 's2', kind: 'subtitle', start: 4.2, duration: 2.8, speaker: 'Peter', text: 'Heh… alright, what is it now?' },
          { id: 's3', kind: 'subtitle', start: 8.0, duration: 3.1, speaker: 'Stewie', text: 'We can edit like a real studio now.' },
        ],
      },
      {
        id: 't_imgs',
        type: 'overlay',
        name: 'Images',
        clips: [
          { id: 'o1', kind: 'overlay', start: 6, duration: 8, assetId: 'img_01', label: 'Diagram.png', x: 0.16, y: 0.20, scale: 0.52 },
          { id: 'o2', kind: 'overlay', start: 18, duration: 10, assetId: 'img_02', label: 'Code.png', x: 0.62, y: 0.26, scale: 0.46 },
        ],
      },
      {
        id: 't_chars',
        type: 'character',
        name: 'Characters',
        clips: [
          { id: 'c1', kind: 'character', start: 1.2, duration: 2.4, character: 'Stewie', x: 0.78, y: 0.70, scale: 0.60 },
          { id: 'c2', kind: 'character', start: 4.2, duration: 2.8, character: 'Peter', x: 0.16, y: 0.70, scale: 0.62 },
          { id: 'c3', kind: 'character', start: 8.0, duration: 3.1, character: 'Stewie', x: 0.78, y: 0.70, scale: 0.60 },
        ],
      },
    ],
  };
}
