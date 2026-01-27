// Video style presets configuration
export type VideoStyleId = 'standard' | 'reel_dynamic';

export interface VideoStylePreset {
  id: VideoStyleId;
  name: string;
  description: string;
  aspectRatio: {
    width: number;
    height: number;
    ratio: string; // e.g., "9:16", "16:9"
  };
  fps: number;
  targetDuration?: {
    min: number; // seconds
    max: number; // seconds
  };
  transitions?: {
    enabled: boolean;
    types: ('slide' | 'float' | 'zoom' | 'crossfade' | 'ken_burns')[];
    default: 'slide' | 'float' | 'zoom' | 'crossfade' | 'ken_burns';
  };
  audio?: {
    backgroundMusic: boolean;
    sfx: boolean;
    duckMusic: boolean; // Lower music volume when voice is present
  };
  textOverlays?: {
    enabled: boolean;
    position: 'top' | 'center' | 'bottom';
    style: 'minimal' | 'bold' | 'outlined';
  };
  videoSettings?: {
    bitrate: string;
    codec: 'h264' | 'h265';
    preset: 'fast' | 'medium' | 'slow';
  };
}

export const VIDEO_STYLE_PRESETS: Record<VideoStyleId, VideoStylePreset> = {
  standard: {
    id: 'standard',
    name: 'Standard Video',
    description: 'Traditional 9:16 vertical video with subtitles and character overlays',
    aspectRatio: {
      width: 1080,
      height: 1920,
      ratio: '9:16'
    },
    fps: 30,
    transitions: {
      enabled: false,
      types: ['crossfade'],
      default: 'crossfade'
    },
    audio: {
      backgroundMusic: false,
      sfx: false,
      duckMusic: false
    },
    textOverlays: {
      enabled: true,
      position: 'bottom',
      style: 'outlined'
    },
    videoSettings: {
      bitrate: '2000k',
      codec: 'h264',
      preset: 'medium'
    }
  },
  reel_dynamic: {
    id: 'reel_dynamic',
    name: 'Reel (Dynamic)',
    description: 'Vertical reel-style video with dynamic transitions, background music, and SFX (90-150s target)',
    aspectRatio: {
      width: 1080,
      height: 1920,
      ratio: '9:16'
    },
    fps: 30,
    targetDuration: {
      min: 90,
      max: 150
    },
    transitions: {
      enabled: true,
      types: ['slide', 'float', 'zoom', 'ken_burns', 'crossfade'],
      default: 'float'
    },
    audio: {
      backgroundMusic: true,
      sfx: true,
      duckMusic: true
    },
    textOverlays: {
      enabled: true,
      position: 'bottom',
      style: 'bold'
    },
    videoSettings: {
      bitrate: '2500k',
      codec: 'h264',
      preset: 'fast'
    }
  }
};

// Helper function to get a style preset
export function getVideoStylePreset(styleId: VideoStyleId | string): VideoStylePreset {
  const preset = VIDEO_STYLE_PRESETS[styleId as VideoStyleId];
  if (!preset) {
    console.warn(`Video style "${styleId}" not found, falling back to "standard"`);
    return VIDEO_STYLE_PRESETS.standard;
  }
  return preset;
}

// Helper function to get all available styles
export function getAllVideoStyles(): VideoStylePreset[] {
  return Object.values(VIDEO_STYLE_PRESETS);
}

