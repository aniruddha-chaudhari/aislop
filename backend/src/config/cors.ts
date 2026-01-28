/**
 * CORS configuration matching the original Express corsOptions.
 */

const ALLOWED_ORIGINS = [
  'http://localhost:5376',
  'http://127.0.0.1:5376',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://192.168.56.1:5376',
  'http://192.168.56.1:3000',
  'http://192.168.0.106:5376',
  'http://192.168.0.106:3000',
];

const LOCALHOST_ORIGIN = /^http:\/\/localhost:\d+$/;
const LOCALHOST_127 = /^http:\/\/127\.0\.0\.1:\d+$/;
const LOCAL_NET = /^http:\/\/192\.168\.\d+\.\d+:\d+$/;

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  if (LOCALHOST_ORIGIN.test(origin) || LOCALHOST_127.test(origin)) return true;
  if (LOCAL_NET.test(origin)) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return false;
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
  'Access-Control-Allow-Credentials': 'true',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
};

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { ...CORS_HEADERS };
  if (origin && isOriginAllowed(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}
