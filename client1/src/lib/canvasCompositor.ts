// client1/src/lib/canvasCompositor.ts
import type { EditorProject, OverlayClip, CharacterClip, SubtitleClip } from '@/features/editor/types';
import { MediaEngine } from './mediaEngine';
import { API_ENDPOINTS } from '@/config/api';

type CachedImage = { img: HTMLImageElement; loaded: boolean };

export class CanvasCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: MediaEngine;
  private imageCache = new Map<string, CachedImage>();
  private width = 360;
  private height = 640;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = canvas.getContext('2d')!;
    this.engine = new MediaEngine();
  }

  async loadTemplate(videoUrl: string): Promise<void> {
    await this.engine.load(videoUrl);
  }

  /** Preload overlay and character images into cache */
  preloadImages(project: EditorProject): void {
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.kind === 'overlay') {
          const oc = clip as OverlayClip;
          const url = API_ENDPOINTS.serveProjectImage(project.id, oc.assetId);
          this.cacheImage(oc.assetId, url);
        }
        if (clip.kind === 'character') {
          const cc = clip as CharacterClip;
          const key = `char_${cc.character}_${cc.emotion || 'neutral'}`;
          // Character images served from backend static path
          const url = `/api/character-image/${cc.character}/${cc.emotion || 'neutral'}`;
          this.cacheImage(key, url);
        }
      }
    }
  }

  private cacheImage(key: string, url: string): void {
    if (this.imageCache.has(key)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const entry: CachedImage = { img, loaded: false };
    img.onload = () => { entry.loaded = true; };
    img.src = url;
    this.imageCache.set(key, entry);
  }

  /** Render a single composited frame at the given timeline time */
  async renderFrame(
    project: EditorProject,
    timeSeconds: number,
    options: { drawTemplate?: boolean } = {}
  ): Promise<void> {
    const { drawTemplate = true } = options;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. Clear canvas
    ctx.clearRect(0, 0, w, h);

    // 2. Draw template video frame (GPU-decoded via MediaBunny) when this canvas owns the background.
    if (drawTemplate) {
      await this.engine.getFrameAtTime(timeSeconds, ctx, w, h);
    }

    // 3. Draw overlays active at this time
    this.drawOverlays(project, timeSeconds, ctx, w, h);

    // 4. Draw characters active at this time
    this.drawCharacters(project, timeSeconds, ctx, w, h);

    // 5. Draw subtitle text active at this time
    this.drawSubtitles(project, timeSeconds, ctx, w, h);
  }

  private drawOverlays(
    project: EditorProject, t: number,
    ctx: CanvasRenderingContext2D, w: number, h: number
  ): void {
    for (const track of project.tracks) {
      if (track.type !== 'overlay') continue;
      for (const clip of track.clips) {
        const oc = clip as OverlayClip;
        if (t < oc.start || t > oc.start + oc.duration) continue;
        if (oc.planStatus === 'draft') continue;

        const cached = this.imageCache.get(oc.assetId);
        if (!cached?.loaded) continue;

        if (oc.displayMode === 'replace') {
          // Full-frame replacement
          ctx.drawImage(cached.img, 0, 0, w, h);
        } else {
          // Positioned overlay
          const scale = oc.scale || 0.5;
          const ow = Math.floor(w * scale);
          const oh = Math.floor(h * scale * 0.75);
          const ox = Math.floor(oc.x * w - ow / 2);
          const oy = Math.floor(oc.y * h - oh / 2);
          ctx.drawImage(cached.img, ox, oy, ow, oh);
        }
      }
    }
  }

  private drawCharacters(
    project: EditorProject, t: number,
    ctx: CanvasRenderingContext2D, w: number, h: number
  ): void {
    const SCALE = h / 1920;
    const charGeom: Record<string, { x: number; y: number; w: number; h: number }> = {
      Stewie: { x: Math.floor(300 * SCALE), y: Math.floor(1350 * SCALE), w: Math.floor(500 * SCALE), h: Math.floor(600 * SCALE) },
      Peter:  { x: Math.floor(300 * SCALE), y: Math.floor(1250 * SCALE), w: Math.floor(580 * SCALE), h: Math.floor(720 * SCALE) },
    };
    const defaultGeom = { x: Math.floor(260 * SCALE), y: Math.floor(1160 * SCALE), w: Math.floor(560 * SCALE), h: Math.floor(760 * SCALE) };

    for (const track of project.tracks) {
      if (track.type !== 'character') continue;
      for (const clip of track.clips) {
        const cc = clip as CharacterClip;
        if (t < cc.start || t > cc.start + cc.duration) continue;

        const key = `char_${cc.character}_${cc.emotion || 'neutral'}`;
        const cached = this.imageCache.get(key);
        if (!cached?.loaded) continue;

        const geom = charGeom[cc.character] || defaultGeom;
        ctx.drawImage(cached.img, geom.x, geom.y, geom.w, geom.h);
      }
    }
  }

  private drawSubtitles(
    project: EditorProject, t: number,
    ctx: CanvasRenderingContext2D, w: number, h: number
  ): void {
    // Match backend ASS style: 1920-based scale, Fontsize=48, MarginV=700, Alignment=2 (bottom-center)
    const SCALE = h / 1920;
    const fontSize = Math.max(14, Math.floor(48 * SCALE));
    const marginV = Math.floor(700 * SCALE); // distance from bottom to text baseline
    // Alignment=2 (bottom-center): text baseline sits at h - marginV
    const baseY = h - marginV;

    for (const track of project.tracks) {
      if (track.type !== 'subtitle') continue;
      for (const clip of track.clips) {
        const sc = clip as SubtitleClip;
        if (t < sc.start || t > sc.start + sc.duration) continue;

        const relTime = t - sc.start;
        const words = sc.words && sc.words.length > 0 
          ? sc.words 
          : (sc.text ? sc.text.split(' ').map((word, i, arr) => {
              const wDuration = Math.max(0.1, sc.duration / arr.length);
              return { word, start: i * wDuration, end: (i + 1) * wDuration };
            }) : []);

        // Find currently spoken word index
        let activeWordIdx = -1;
        for (let i = 0; i < words.length; i++) {
          if (relTime >= words[i].start && relTime < words[i].end) {
            activeWordIdx = i;
            break;
          }
        }

        ctx.save();
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.font = `bold ${fontSize}px "Arial Black", Arial, sans-serif`;

        if (words.length > 0) {
          // Show 3-word group containing active word (or last group if none active)
          const groupStart = Math.floor((activeWordIdx >= 0 ? activeWordIdx : Math.max(0, words.length - 1)) / 3) * 3;
          const groupWords = words.slice(groupStart, Math.min(groupStart + 3, words.length));

          // Measure total line width
          const spaceW = ctx.measureText(' ').width;
          let totalW = 0;
          const wordWidths: number[] = [];
          for (let i = 0; i < groupWords.length; i++) {
            const ww = ctx.measureText(groupWords[i].word).width;
            wordWidths.push(ww);
            totalW += ww;
            if (i < groupWords.length - 1) totalW += spaceW;
          }

          // Draw semi-transparent background box (matches ASS BackColour alpha)
          const pad = fontSize * 0.25;
          const boxX = w / 2 - totalW / 2 - pad;
          const boxY = baseY - fontSize - pad;
          const boxW = totalW + pad * 2;
          const boxH = fontSize + pad * 2;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(boxX, boxY, boxW, boxH);

          // Draw each word with outline then fill (ASS BorderStyle=1, Outline=3)
          let curX = w / 2 - totalW / 2;
          for (let i = 0; i < groupWords.length; i++) {
            const isActive = (groupStart + i) === activeWordIdx;
            const wordText = groupWords[i].word;

            // Outline (black)
            ctx.lineWidth = fontSize * 0.15;
            ctx.strokeStyle = '#000000';
            ctx.lineJoin = 'round';
            ctx.strokeText(wordText, curX, baseY);

            // Fill: yellow for active word, white for others
            ctx.fillStyle = isActive ? '#FFFF00' : '#FFFFFF';
            ctx.fillText(wordText, curX, baseY);

            curX += wordWidths[i] + (i < groupWords.length - 1 ? spaceW : 0);
          }
        } else if (sc.text) {
          // Fallback: plain text, centered
          const textW = ctx.measureText(sc.text).width;
          const pad = fontSize * 0.25;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(w / 2 - textW / 2 - pad, baseY - fontSize - pad, textW + pad * 2, fontSize + pad * 2);

          ctx.lineWidth = fontSize * 0.15;
          ctx.strokeStyle = '#000000';
          ctx.lineJoin = 'round';
          ctx.strokeText(sc.text, w / 2 - textW / 2, baseY);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(sc.text, w / 2 - textW / 2, baseY);
        }

        ctx.restore();
        break; // Only one subtitle at a time
      }
    }
  }

  dispose(): void {
    this.engine.dispose();
    this.imageCache.clear();
  }
}
