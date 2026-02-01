/**
 * Streaming controller for Server-Sent Events (SSE)
 * Allows clients to receive real-time updates as files are generated
 */

import { HttpContext, HandlerResult } from '../utils/http';
import { subscribe, getRecentMessages } from '../service/eventEmitter';

/**
 * SSE endpoint for streaming file generation updates
 * GET /api/stream/:sessionId/files
 */
export async function streamFileUpdates(ctx: HttpContext): Promise<HandlerResult> {
  const sessionId = ctx.params?.sessionId;
  
  if (!sessionId) {
    return { status: 400, json: { error: 'Session ID is required' } };
  }
  
  // Create a readable stream for SSE
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let isConnected = false;
  let unsubscribe: (() => void) | null = null;
  
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      try {
        // Send initial connection message
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`));
        isConnected = true;
        
        // Send any recent messages that were published before connection
        const recent = getRecentMessages(sessionId);
        if (recent && recent.length > 0) {
          for (const msg of recent) {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg.data)}\n\n`));
            } catch (error) {
            }
          }
        }
        
        // Subscribe to events for this session
        unsubscribe = subscribe(sessionId, (data) => {
          try {
            
            // Send to connected client
            if (isConnected) {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              } catch (error) {
                isConnected = false;
              }
            }
          } catch (error) {
          }
        });
        
        
        // Keep connection alive with heartbeat
        heartbeatInterval = setInterval(() => {
          try {
            if (isConnected) {
              controller.enqueue(encoder.encode(`: heartbeat\n\n`));
            }
          } catch (error) {
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }
            isConnected = false;
          }
        }, 30000); // Every 30 seconds
      } catch (error) {
        isConnected = false;
      }
    },
    
    cancel() {
      isConnected = false;
      
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      
      // Unsubscribe from events
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    }
  });

  return {
    status: 200,
    body: stream,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering in nginx
    }
  };
}
