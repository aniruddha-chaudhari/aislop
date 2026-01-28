/**
 * Redis service for caching and queueing using Bun's native Redis client
 */

// @ts-expect-error Bun global is provided by Bun runtime
import { redis, RedisClient } from 'bun';

// Create a dedicated Redis client instance
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = new RedisClient(redisUrl);

// Track connection state
let isConnecting = false;
let connectionAttempted = false;

// Initialize connection (will connect on first use if not connected)
async function ensureConnection(): Promise<boolean> {
  if (redisClient.connected) {
    return true;
  }
  
  if (isConnecting) {
    // Wait for ongoing connection attempt
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (redisClient.connected) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (!isConnecting) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  }
  
  if (!connectionAttempted) {
    connectionAttempted = true;
    isConnecting = true;
    try {
      await redisClient.connect();
      console.log(`[Redis] ✅ Connected successfully to ${redisUrl}`);
      isConnecting = false;
      return true;
    } catch (error) {
      isConnecting = false;
      console.warn(`[Redis] ⚠️ Connection failed to ${redisUrl}:`, error);
      console.warn('[Redis] 💡 Make sure Redis is running. Install Redis or use: docker run -d -p 6379:6379 redis:alpine');
      return false;
    }
  }
  
  return false;
}

// Try to connect on module load (non-blocking)
ensureConnection().catch(() => {
  // Connection will be attempted on first use
});

// Cache key prefixes
const CACHE_PREFIXES = {
  ASS: 'ass:cache:',
  SESSION: 'session:',
  FILE: 'file:',
  QUEUE: 'queue:',
} as const;

// Cache TTLs (in seconds)
const CACHE_TTLS = {
  ASS: 24 * 60 * 60, // 24 hours
  SESSION: 24 * 60 * 60, // 24 hours
  FILE: 7 * 24 * 60 * 60, // 7 days
} as const;

/**
 * Redis Cache Service
 */
export class RedisCache {
  /**
   * Get cached value
   */
  static async get<T = string>(key: string): Promise<T | null> {
    try {
      await ensureConnection();
      const value = await redisClient.get(key);
      if (!value) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      console.error(`[Redis] Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cached value with optional TTL
   */
  static async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    try {
      await ensureConnection();
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttl) {
        await redisClient.set(key, serialized);
        await redisClient.expire(key, ttl);
      } else {
        await redisClient.set(key, serialized);
      }
      return true;
    } catch (error) {
      console.error(`[Redis] Error setting key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete cached value
   */
  static async delete(key: string): Promise<boolean> {
    try {
      await ensureConnection();
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error(`[Redis] Error deleting key ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  static async exists(key: string): Promise<boolean> {
    try {
      await ensureConnection();
      return await redisClient.exists(key);
    } catch (error) {
      console.error(`[Redis] Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get TTL for a key
   */
  static async ttl(key: string): Promise<number> {
    try {
      await ensureConnection();
      return await redisClient.ttl(key);
    } catch (error) {
      console.error(`[Redis] Error getting TTL for key ${key}:`, error);
      return -1;
    }
  }

  /**
   * Cache ASS file content
   */
  static async cacheAss(sessionId: string, dialogueHash: string, assContent: string): Promise<string> {
    const key = `${CACHE_PREFIXES.ASS}${sessionId}:${dialogueHash}`;
    await this.set(key, assContent, CACHE_TTLS.ASS);
    return key;
  }

  /**
   * Get cached ASS file content
   */
  static async getCachedAss(sessionId: string, dialogueHash: string): Promise<string | null> {
    const key = `${CACHE_PREFIXES.ASS}${sessionId}:${dialogueHash}`;
    const cached = await this.get<string>(key);
    if (cached) {
      const ttl = await this.ttl(key);
      if (ttl > 0) {
        return cached;
      }
      // Expired, delete it
      await this.delete(key);
    }
    return null;
  }

  /**
   * Cache file metadata
   */
  static async cacheFileMetadata(fileId: string, metadata: {
    path: string;
    filename: string;
    size?: number;
    generatedAt: number;
  }): Promise<void> {
    const key = `${CACHE_PREFIXES.FILE}${fileId}`;
    await this.set(key, metadata, CACHE_TTLS.FILE);
  }

  /**
   * Get cached file metadata
   */
  static async getFileMetadata(fileId: string): Promise<{
    path: string;
    filename: string;
    size?: number;
    generatedAt: number;
  } | null> {
    const key = `${CACHE_PREFIXES.FILE}${fileId}`;
    return await this.get(key);
  }
}

/**
 * Redis Queue Service
 */
export class RedisQueue {
  /**
   * Add job to queue
   */
  static async enqueue(queueName: string, job: unknown, priority: number = 0): Promise<string> {
    try {
      const jobId = `job:${Date.now()}:${Math.random().toString(36).substring(7)}`;
      const jobData = {
        id: jobId,
        data: job,
        priority,
        createdAt: Date.now(),
      };
      
      const serialized = JSON.stringify(jobData);
      
      if (priority > 0) {
        // Use sorted set for priority queue
        await redisClient.send('ZADD', [`${CACHE_PREFIXES.QUEUE}${queueName}`, priority.toString(), serialized]);
      } else {
        // Use list for FIFO queue
        await redisClient.send('LPUSH', [`${CACHE_PREFIXES.QUEUE}${queueName}`, serialized]);
      }
      
      return jobId;
    } catch (error) {
      console.error(`[Redis] Error enqueueing job to ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Get next job from queue (blocking)
   */
  static async dequeue(queueName: string, timeout: number = 0): Promise<{ id: string; data: unknown; priority: number; createdAt: number } | null> {
    try {
      // Try priority queue first
      const priorityResult = await redisClient.send('ZPOPMAX', [`${CACHE_PREFIXES.QUEUE}${queueName}`]);
      if (priorityResult && Array.isArray(priorityResult) && priorityResult.length > 0) {
        const serialized = priorityResult[0] as string;
        return JSON.parse(serialized);
      }
      
      // Fall back to regular queue
      if (timeout > 0) {
        const result = await redisClient.send('BRPOP', [`${CACHE_PREFIXES.QUEUE}${queueName}`, timeout.toString()]);
        if (result && Array.isArray(result) && result.length > 1) {
          const serialized = result[1] as string;
          return JSON.parse(serialized);
        }
      } else {
        const result = await redisClient.send('RPOP', [`${CACHE_PREFIXES.QUEUE}${queueName}`]);
        if (result) {
          return JSON.parse(result as string);
        }
      }
      
      return null;
    } catch (error) {
      console.error(`[Redis] Error dequeueing job from ${queueName}:`, error);
      return null;
    }
  }

  /**
   * Get queue length
   */
  static async length(queueName: string): Promise<number> {
    try {
      const listLength = await redisClient.send('LLEN', [`${CACHE_PREFIXES.QUEUE}${queueName}`]);
      const setLength = await redisClient.send('ZCARD', [`${CACHE_PREFIXES.QUEUE}${queueName}`]);
      return (listLength as number || 0) + (setLength as number || 0);
    } catch (error) {
      console.error(`[Redis] Error getting queue length for ${queueName}:`, error);
      return 0;
    }
  }

  /**
   * Clear queue
   */
  static async clear(queueName: string): Promise<void> {
    try {
      await redisClient.del(`${CACHE_PREFIXES.QUEUE}${queueName}`);
    } catch (error) {
      console.error(`[Redis] Error clearing queue ${queueName}:`, error);
    }
  }
}

/**
 * Redis Pub/Sub Service for real-time updates
 */
export class RedisPubSub {
  private static publisher: RedisClient;

  /**
   * Initialize publisher client
   */
  static async initialize(): Promise<void> {
    if (!this.publisher) {
      this.publisher = await redisClient.duplicate();
      await this.publisher.connect();
    }
  }

  /**
   * Publish message to channel
   */
  static async publish(channel: string, message: unknown): Promise<void> {
    try {
      await ensureConnection();
      if (!this.publisher) {
        await this.initialize();
      }
      const serialized = typeof message === 'string' ? message : JSON.stringify(message);
      await this.publisher.publish(channel, serialized);
    } catch (error) {
      console.error(`[Redis] Error publishing to channel ${channel}:`, error);
    }
  }

  /**
   * Create a dedicated subscriber for a specific connection
   * Each SSE connection should use its own subscriber to avoid conflicts
   */
  static async createSubscriber(): Promise<{
    subscribe: (channel: string, callback: (message: string, channel: string) => void) => Promise<void>;
    unsubscribe: (channel?: string) => Promise<void>;
    close: () => Promise<void>;
  }> {
    await ensureConnection();
    const subscriber = await redisClient.duplicate();
    await subscriber.connect();
    
    return {
      subscribe: async (channel: string, callback: (message: string, channel: string) => void) => {
        try {
          await subscriber.subscribe(channel, callback);
        } catch (error) {
          console.error(`[Redis] Error subscribing to channel ${channel}:`, error);
          throw error;
        }
      },
      unsubscribe: async (channel?: string) => {
        try {
          if (channel) {
            await subscriber.unsubscribe(channel);
          } else {
            await subscriber.unsubscribe();
          }
        } catch (error: unknown) {
          // Ignore errors if already unsubscribed or connection closed
          const err = error as { code?: string; message?: string };
          if (err.code !== 'ERR_REDIS_INVALID_STATE') {
            console.error(`[Redis] Error unsubscribing from channel ${channel}:`, error);
          }
        }
      },
      close: async () => {
        try {
          await subscriber.quit();
        } catch (error) {
          // Ignore errors on close
          console.warn(`[Redis] Error closing subscriber:`, error);
        }
      }
    };
  }

  /**
   * Publish file generation update
   */
  static async publishFileUpdate(sessionId: string, update: {
    type: 'started' | 'progress' | 'completed' | 'error';
    fileId?: string;
    filename?: string;
    path?: string;
    progress?: number;
    total?: number;
    error?: string;
    status?: string;
    completedCount?: number;
    allSuccessful?: boolean;
    message?: string;
    [key: string]: unknown; // Allow additional fields
  }): Promise<void> {
    const channel = `session:${sessionId}:files`;
    await this.publish(channel, update);
  }
}

// Initialize pub/sub on module load (non-blocking)
RedisPubSub.initialize().catch((error) => {
  console.warn('[Redis] Pub/Sub initialization failed, will retry on first use:', error);
});

// Export the Redis client for direct access if needed
export { redisClient };
