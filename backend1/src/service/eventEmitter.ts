/**
 * In-memory event emitter for SSE streaming
 * Replaces Redis Pub/Sub with a simple in-memory solution
 */

type EventCallback = (data: unknown) => void;

// Store event listeners per session
const listeners = new Map<string, Set<EventCallback>>();

// Store recent messages per session to handle late SSE connections
const recentMessages = new Map<string, Array<{ timestamp: number; data: unknown }>>();
const MAX_RECENT_MESSAGES = 100;

/**
 * Publish an event to all listeners for a session
 */
export function publishFileUpdate(sessionId: string, update: {
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
  [key: string]: unknown;
}): void {
  const channel = `session:${sessionId}:files`;
  
  // Store message for late connections
  if (!recentMessages.has(sessionId)) {
    recentMessages.set(sessionId, []);
  }
  const messages = recentMessages.get(sessionId)!;
  messages.push({ timestamp: Date.now(), data: update });
  // Keep only recent messages
  if (messages.length > MAX_RECENT_MESSAGES) {
    messages.shift();
  }
  
  // Notify all listeners
  const sessionListeners = listeners.get(channel);
  if (sessionListeners) {
    sessionListeners.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
      }
    });
  }
  
}

/**
 * Subscribe to events for a session
 */
export function subscribe(sessionId: string, callback: EventCallback): () => void {
  const channel = `session:${sessionId}:files`;
  
  if (!listeners.has(channel)) {
    listeners.set(channel, new Set());
  }
  
  listeners.get(channel)!.add(callback);
  
  // Return unsubscribe function
  return () => {
    const sessionListeners = listeners.get(channel);
    if (sessionListeners) {
      sessionListeners.delete(callback);
      if (sessionListeners.size === 0) {
        listeners.delete(channel);
      }
    }
  };
}

/**
 * Get recent messages for a session (for late connections)
 */
export function getRecentMessages(sessionId: string): Array<{ timestamp: number; data: unknown }> {
  return recentMessages.get(sessionId) || [];
}

/**
 * Clean up old messages (optional, can be called periodically)
 */
export function cleanupOldMessages(maxAge: number = 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [sessionId, messages] of recentMessages.entries()) {
    const filtered = messages.filter(msg => now - msg.timestamp < maxAge);
    if (filtered.length === 0) {
      recentMessages.delete(sessionId);
    } else {
      recentMessages.set(sessionId, filtered);
    }
  }
}
