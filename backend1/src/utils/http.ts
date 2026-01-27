/**
 * HTTP context and helpers for Bun-based request handling.
 */

export interface HttpContext {
  method: string;
  url: string;
  path: string;
  pathname: string;
  query: Record<string, string>;
  params: Record<string, string>;
  body: unknown;
  headers: Headers;
  formData?: FormData;
  file?: { path: string; originalname: string; mimetype: string; size: number };
}

export type JsonResult = { status: number; json: object; headers?: Record<string, string> };
export type StreamResult = { status: number; body: ReadableStream | Blob; headers: Record<string, string> };
export type HandlerResult = Response | JsonResult | StreamResult;

export function jsonResponse(status: number, json: object, headers?: Record<string, string>): JsonResult {
  return { status, json, headers };
}

export function toResponse(result: HandlerResult): Response {
  if (result instanceof Response) return result;
  if ('json' in result) {
    const r = result as JsonResult;
    return new Response(JSON.stringify(r.json), {
      status: r.status,
      headers: { 'Content-Type': 'application/json', ...r.headers },
    });
  }
  const s = result as StreamResult;
  return new Response(s.body, { status: s.status, headers: s.headers });
}

export function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  const q = search?.startsWith('?') ? search.slice(1) : search ?? '';
  new URLSearchParams(q).forEach((v, k) => { out[k] = v; });
  return out;
}

export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const parts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (parts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) {
      params[parts[i].slice(1)] = pathParts[i];
    } else if (parts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}
