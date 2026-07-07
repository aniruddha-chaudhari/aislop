// client1/src/lib/audioEngine.ts
// Web Audio API orchestrator for local timeline playback.
// Loads and schedules all audio clips (dialogue, music, SFX) from the project timeline.

import type { EditorProject, MusicClip, SfxClip } from '@/features/editor/types';
import { API_BASE_URL, API_ENDPOINTS } from '@/config/api';

type ScheduledNode = {
  node: AudioBufferSourceNode;
  gainNode: GainNode;
};

/** Resolve a backend-relative path to an absolute URL for fetching. */
function resolveAudioUrl(assetPath: string): string {
  if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) return assetPath;
  const normalized = assetPath.replace(/\\/g, '/');
  // Library music/SFX under `storage/audio_assets` — not Prisma session downloads.
  if (normalized.startsWith('audio_assets/')) {
    return API_ENDPOINTS.downloadAudioAsset(normalized);
  }
  if (normalized.startsWith('storage/audio_assets/')) {
    return API_ENDPOINTS.downloadAudioAsset(normalized.slice('storage/'.length));
  }
  const filename = normalized.split(/[/\\]/).pop();
  if (filename) {
    return `${API_BASE_URL}/api/audio/download/${encodeURIComponent(filename)}`;
  }
  return `${API_BASE_URL}/${assetPath}`;
}

function downloadAudioUrl(filename: string, sessionId?: string): string {
  const base = API_ENDPOINTS.downloadAudio(filename);
  return sessionId ? `${base}?sessionId=${encodeURIComponent(sessionId)}` : base;
}

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  /** Wall-clock AudioContext time when timeline position 0 began. */
  private startAudioTime = 0;
  /** Timeline position we started playback from. */
  private startTimelineOffset = 0;
  private playing = false;
  private scheduledNodes: ScheduledNode[] = [];
  /** Cache decoded buffers so re-plays don't re-fetch. */
  private bufferCache = new Map<string, AudioBuffer>();
  private sessionDialogues: any[] | null = null;
  /** Fade-out at end of music clips only (seconds, capped by remaining clip length). */
  private musicFadeOutSeconds = 1.0;

  /** Current playback position in seconds along the project timeline. */
  getCurrentTime(): number {
    if (!this.playing || !this.audioContext) return this.startTimelineOffset;
    return (this.audioContext.currentTime - this.startAudioTime) + this.startTimelineOffset;
  }

  /** Pre-fetch and decode all audio assets referenced in the project timeline.
   *  Call this before `play()` so playback starts immediately. */
  async preload(project: EditorProject): Promise<void> {
    const urls = new Set<string>();

    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.kind === 'music') {
          urls.add(resolveAudioUrl((clip as MusicClip).path));
        } else if (clip.kind === 'sfx') {
          urls.add(resolveAudioUrl((clip as SfxClip).path));
        }
      }
    }

    // Load session dialogues for audio fallback
    if (project.audioSessionId && project.audioSessionId !== 'no-session') {
      try {
        const res = await fetch(API_ENDPOINTS.audioSession(project.audioSessionId));
        if (res.ok) {
          const data = await res.json();
          const session = data?.session ?? data;
          if (session?.dialogues) {
            this.sessionDialogues = session.dialogues;
            for (const d of session.dialogues) {
              if (d.audioFile?.filename) {
                urls.add(downloadAudioUrl(d.audioFile.filename, project.audioSessionId));
              }
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load session dialogues:', e);
      }
    }

    await Promise.all(
      [...urls].map(async (url) => {
        if (this.bufferCache.has(url)) return;
        try {
          const ctx = this.getOrCreateContext();
          const res = await fetch(url);
          if (!res.ok) return;
          const ab = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(ab);
          this.bufferCache.set(url, buf);
        } catch {
          // Non-fatal: audio clip simply won't play
        }
      })
    );
  }

  /** Start playback from `timelineOffset` seconds into the project. */
  play(project: EditorProject, timelineOffset = 0): void {
    this.stop();
    const ctx = this.getOrCreateContext();

    this.startAudioTime = ctx.currentTime;
    this.startTimelineOffset = timelineOffset;
    this.playing = true;

    for (const track of project.tracks) {
      if (track.muted) continue;

      for (const clip of track.clips) {
        if (clip.kind !== 'music' && clip.kind !== 'sfx') continue;

        const typedClip = clip as MusicClip | SfxClip;
        const url = resolveAudioUrl(typedClip.path);
        const buffer = this.bufferCache.get(url);
        if (!buffer) continue;

        const clipEnd = typedClip.start + typedClip.duration;
        if (clipEnd <= timelineOffset) continue;

        const gainNode = ctx.createGain();
        const clipVolume = typedClip.volume ?? 1.0;
        gainNode.gain.value = clipVolume;
        gainNode.connect(ctx.destination);

        const sourceNode = ctx.createBufferSource();
        sourceNode.buffer = buffer;

        const sourceOffset = typedClip.sourceOffset ?? 0;
        const clipElapsed = Math.max(0, timelineOffset - typedClip.start);
        const whenToStart = Math.max(0, typedClip.start - timelineOffset);
        const readOffset = sourceOffset + clipElapsed;
        const remaining = typedClip.duration - clipElapsed;
        const bufferRemaining = Math.max(0, buffer.duration - readOffset);
        const playFor = Math.max(0, Math.min(remaining, bufferRemaining));

        sourceNode.connect(gainNode);
        const startAt = this.startAudioTime + whenToStart;
        const endAt = startAt + playFor;

        if (playFor > 0 && clip.kind === 'music') {
          const fade = Math.max(0.03, Math.min(this.musicFadeOutSeconds, playFor));
          const fadeStart = Math.max(startAt, endAt - fade);
          try {
            gainNode.gain.cancelScheduledValues(startAt);
            gainNode.gain.setValueAtTime(clipVolume, startAt);
            gainNode.gain.setValueAtTime(Math.max(0.0001, clipVolume), fadeStart);
            gainNode.gain.setTargetAtTime(0.0001, fadeStart, Math.max(0.03, fade / 3));
          } catch {
            // Non-fatal
          }
        }

        sourceNode.start(startAt, readOffset, playFor);
        this.scheduledNodes.push({ node: sourceNode, gainNode });
      }
    }

    // Schedule dialogues
    if (this.sessionDialogues) {
      let cumulativeTime = 0;
      for (const dialogue of this.sessionDialogues) {
        const duration = dialogue.audioFile?.duration || 3;
        if (dialogue.audioFile?.filename) {
          const url = downloadAudioUrl(dialogue.audioFile.filename, project.audioSessionId);
          const buffer = this.bufferCache.get(url);
          if (buffer) {
            const clipStart = cumulativeTime;
            const clipEnd = clipStart + duration;
            if (clipEnd > timelineOffset) {
              const gainNode = ctx.createGain();
              gainNode.gain.value = 1.0;
              gainNode.connect(ctx.destination);
              const sourceNode = ctx.createBufferSource();
              sourceNode.buffer = buffer;

              const clipElapsed = Math.max(0, timelineOffset - clipStart);
              const whenToStart = Math.max(0, clipStart - timelineOffset);
              const remaining = duration - clipElapsed;
              const readOffset = clipElapsed;
              const bufferRemaining = Math.max(0, buffer.duration - readOffset);
              const playFor = Math.max(0, Math.min(remaining, bufferRemaining));

              sourceNode.connect(gainNode);
              const startAt = this.startAudioTime + whenToStart;
              sourceNode.start(startAt, readOffset, playFor);
              this.scheduledNodes.push({ node: sourceNode, gainNode });
            }
          }
        }
        cumulativeTime += duration;
      }
    }
  }

  /** Stop all playing sources and reset. */
  stop(): void {
    this.playing = false;
    const ctx = this.audioContext;
    const fade = 0.12;
    const nodes = this.scheduledNodes;
    this.scheduledNodes = [];

    for (const { node, gainNode } of nodes) {
      if (ctx) {
        const now = ctx.currentTime;
        const stopAt = now + fade;
        try {
          const current = gainNode.gain.value;
          gainNode.gain.cancelScheduledValues(now);
          gainNode.gain.setValueAtTime(current, now);
          gainNode.gain.linearRampToValueAtTime(0.0001, stopAt);
        } catch {}
        try {
          node.stop(stopAt);
        } catch {
          /* already stopped */
        }
        setTimeout(() => {
          try {
            node.disconnect();
          } catch {}
          try {
            gainNode.disconnect();
          } catch {}
        }, Math.ceil((fade + 0.02) * 1000));
      } else {
        try {
          node.stop();
        } catch {}
        try {
          node.disconnect();
        } catch {}
        try {
          gainNode.disconnect();
        } catch {}
      }
    }
  }

  dispose(): void {
    this.stop();
    this.bufferCache.clear();
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
  }

  private getOrCreateContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }
}
