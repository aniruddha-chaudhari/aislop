/**
 * Bun route registration. Import for side effects before starting the server.
 */
import { register } from '../router';
import { jsonResponse } from '../utils/http';

register([
  {
    method: 'GET',
    pattern: '/',
    handler: async () =>
      jsonResponse(200, {
        message: 'Hello World!',
        server: 'AI Slope Backend',
        status: 'Running',
      }),
  },
  {
    method: 'GET',
    pattern: '/api/test',
    handler: async (ctx) =>
      jsonResponse(200, {
        message: 'Backend connection successful!',
        timestamp: new Date().toISOString(),
        headers: Object.fromEntries(ctx.headers.entries()),
      }),
  },
]);
