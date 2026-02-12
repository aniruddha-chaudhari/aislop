// Configuration for TTS service
export const TTS_CONFIG = {
  // GPT-SoVITS API base URL
  apiBaseUrl: 'http://127.0.0.1:9880',
  
  // Character model configurations
  characters: {
    Stewie: {
        gpt: 'F:\\Aniruddha\\AI\\gptsovits\\GPT_weights_v2ProPlus\\stewienew-e15.ckpt',
        sovits: 'F:\\Aniruddha\\AI\\gptsovits\\SoVITS_weights_v2ProPlus\\stewienew_e8_s280.pth',
      // TODO: Update these dummy values with actual paths and content
      referenceAudio: 'F:\\Aniruddha\\AI\\testdata\\STWIESMALL.mp3',
      promptText: "Oh, I know it hurts now, Brian, but look at the bright side. You have some new material for that novel you've been writing. You know, the novel you've been working on? ",
      promptLang: 'en'
    },
    Peter: {
      gpt: 'F:\\Aniruddha\\AI\\gptsovits\\GPT_weights_v2ProPlus\\peter1-e15.ckpt',
      sovits: 'F:\\Aniruddha\\AI\\gptsovits\\SoVITS_weights_v2ProPlus\\peter1_e8_s280.pth',
      // TODO: Update these dummy values with actual paths and content
      referenceAudio: 'F:\\Aniruddha\\AI\\testdata\\petersmall.ogg',
      promptText: "Oh, this seems like it'd be a great place to work. But I. I didn't go to college. When I set my mind to something, I am not easily deterred. Like when I tried out to be an Olympic gymnast.",
      promptLang: 'en'
    },
    Narrator: {
      // Placeholder model paths for single-voice style; replace with actual narrator weights when available.
      gpt: 'F:\\Aniruddha\\AI\\gptsovits\\GPT_weights_v2ProPlus\\peter1-e15.ckpt',
      sovits: 'F:\\Aniruddha\\AI\\gptsovits\\SoVITS_weights_v2ProPlus\\peter1_e8_s280.pth',
      // Updated to use the curated narrator reference audio stored in the backend storage directory.
      referenceAudio: 'F:\\Aniruddha\\code\\webdev\\PROJECTS\\aislop\\backend1\\storage\\reference_audio\\final.wav',
      promptText: 'Today we are breaking down a technical topic in a clear and practical way for an Instagram reel audience.',
      promptLang: 'en'
    }
  },
  
  // TTS generation settings
  settings: {
    mediaType: 'wav',
    streamingMode: false,
    textLang: 'en',
    delayBetweenCalls: 1000, // milliseconds
  },
  
  // Audio output directory (relative to project root)
  // Kept in central storage so all generated assets live under one folder.
  audioOutputDir: 'storage/audio'
};

export type CharacterName = keyof typeof TTS_CONFIG.characters;
