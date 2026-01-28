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
        console.log(`[SSE] Client connected for session ${sessionId}`);
        
        // Send any recent messages that were published before connection
        const recent = getRecentMessages(sessionId);
        if (recent && recent.length > 0) {
          console.log(`[SSE] Sending ${recent.length} recent messages to client`);
          for (const msg of recent) {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg.data)}\n\n`));
            } catch (error) {
              console.error('[SSE] Error sending recent message:', error);
            }
          }
        }
        
        // Subscribe to events for this session
        unsubscribe = subscribe(sessionId, (data) => {
          try {
            console.log(`[SSE] Received message for session ${sessionId}:`, (data as { type?: string }).type);
            
            // Send to connected client
            if (isConnected) {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              } catch (error) {
                console.error('[SSE] Error sending message to client:', error);
                isConnected = false;
              }
            }
          } catch (error) {
            console.error('[SSE] Error processing message:', error);
          }
        });
        
        console.log(`[SSE] Subscribed to events for session ${sessionId}`);
        
        // Keep connection alive with heartbeat
        heartbeatInterval = setInterval(() => {
          try {
            if (isConnected) {
              controller.enqueue(encoder.encode(`: heartbeat\n\n`));
            }
          } catch (error) {
            console.error('[SSE] Error sending heartbeat:', error);
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }
            isConnected = false;
          }
        }, 30000); // Every 30 seconds
      } catch (error) {
        console.error(`[SSE] Error setting up stream for session ${sessionId}:`, error);
        isConnected = false;
      }
    },
    
    cancel() {
      console.log(`[SSE] Client disconnected for session ${sessionId}`);
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
