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
      // No real mp4 checked in yet; use poster so <video> still renders.
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

