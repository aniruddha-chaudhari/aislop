// client1/src/lib/mediaEngine.ts
import {
  Input,
  ALL_FORMATS,
  UrlSource,
  VideoSampleSink,
} from 'mediabunny';

export class MediaEngine {
  private input: Input | null = null;
  private videoSink: VideoSampleSink | null = null;
  private ready = false;
  private durationSeconds = 0;

  /** Load a template video from a URL (served by backend) */
  async load(videoUrl: string): Promise<void> {
    this.dispose();
    this.input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(videoUrl),
    });
    const videoTrack = await this.input.getPrimaryVideoTrack();
    if (!videoTrack || !(await videoTrack.canDecode())) {
      throw new Error('Video track not decodable via WebCodecs');
    }
    this.durationSeconds =
      (await videoTrack.getDurationFromMetadata({ skipLiveWait: true })) ??
      (await videoTrack.computeDuration({ skipLiveWait: true }));
    this.videoSink = new VideoSampleSink(videoTrack);
    this.ready = true;
  }

  /** Get a decoded VideoFrame at a specific timestamp (GPU-accelerated) */
  async getFrameAtTime(
    timeSeconds: number,
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): Promise<boolean> {
    if (!this.videoSink || !this.ready) return false;
    const sampleTime =
      this.durationSeconds > 0
        ? Math.max(0, timeSeconds % this.durationSeconds)
        : Math.max(0, timeSeconds);
    const sample = await this.videoSink.getSample(sampleTime);
    if (sample) {
      sample.draw(ctx, 0, 0, width, height);
      sample.close();
      return true;
    }
    return false;
  }

  /** Check if WebCodecs is available in this browser */
  static isSupported(): boolean {
    return typeof VideoDecoder !== 'undefined'
      && typeof VideoEncoder !== 'undefined';
  }

  dispose(): void {
    this.videoSink = null;
    this.input = null;
    this.ready = false;
    this.durationSeconds = 0;
  }
}
