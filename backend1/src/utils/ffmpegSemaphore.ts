/**
 * Simple semaphore to limit concurrent FFmpeg executions
 * Prevents system overload by allowing max N FFmpeg processes at once
 */

class AsyncSemaphore {
  private count: number;
  private waiters: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.count = maxConcurrent;
  }

  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    if (this.waiters.length > 0) {
      const next = this.waiters.shift();
      if (next) next();
    } else {
      this.count++;
    }
  }

  getAvailable(): number {
    return this.count;
  }

  getWaiting(): number {
    return this.waiters.length;
  }
}

// Default: allow 2-3 concurrent FFmpeg processes
// Can be overridden via environment variable
const MAX_CONCURRENT_FFMPEG = parseInt(process.env.MAX_CONCURRENT_FFMPEG || '3', 10);

export const ffmpegSemaphore = new AsyncSemaphore(MAX_CONCURRENT_FFMPEG);

/**
 * Wrap an async function to run with semaphore concurrency control
 */
export async function withSemaphore<T>(fn: () => Promise<T>): Promise<T> {
  await ffmpegSemaphore.acquire();
  try {
    return await fn();
  } finally {
    ffmpegSemaphore.release();
  }
}

/**
 * Wrap FFmpeg command execution with semaphore
 */
export function wrapFFmpegExecution<T>(
  command: any,
  executor: (resolve: (value: T) => void, reject: (error: Error) => void) => void
): Promise<T> {
  return withSemaphore(() => {
    return new Promise<T>((resolve, reject) => {
      executor(resolve, reject);
    });
  });
}
