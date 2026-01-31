import * as fs from 'fs';
import * as path from 'path';
import { HttpContext, HandlerResult, matchPath, parseQuery, toResponse } from './utils/http';
import { corsHeaders, isOriginAllowed } from './config/cors';

export type RouteHandler = (ctx: HttpContext) => Promise<HandlerResult>;

export interface Route {
  method: string;
  pattern: string;
  handler: RouteHandler;
  multipart?: 'single';
  multipartField?: string;
}

const routes: Route[] = [];

export function register(r: Route | Route[]): void {
  if (Array.isArray(r)) routes.push(...r);
  else routes.push(r);
}

// Public URL for images stays `/generated_images/*`, but files
// are now stored under `storage/images` for better organisation.
const GENERATED_IMAGES_DIR = path.join(process.cwd(), 'storage', 'images');
// Central temp directory lives under `storage/temp`.
const TEMP_DIR = path.join(process.cwd(), 'storage', 'temp');

function ensureTemp(): string {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  return TEMP_DIR;
}

async function parseBody(
  request: Request,
  ctx: HttpContext,
  multipart?: 'single',
  multipartField?: string
): Promise<void> {
  const ct = request.headers.get('content-type') ?? '';
  if (multipart === 'single' && multipartField && ct.includes('multipart/form-data')) {
    const formData = await request.formData();
    ctx.formData = formData;
    const file = formData.get(multipartField);
    if (file && file instanceof File) {
      const name = file.name || multipartField;
      const ext = path.extname(name) || '.bin';
      const base = path.join(ensureTemp(), `${multipartField}-${Date.now()}-${Math.round(Math.random() * 1e9)}`);
      const dest = base + ext;
      const buf = await file.arrayBuffer();
      fs.writeFileSync(dest, new Uint8Array(buf));
      ctx.file = {
        path: dest,
        originalname: name,
        mimetype: file.type,
        size: file.size,
      };
      const body: Record<string, string> = {};
      formData.forEach((v: FormDataEntryValue, k: string) => {
        if (typeof v === 'string') body[k] = v;
      });
      ctx.body = body;
    } else {
      const body: Record<string, string> = {};
      formData.forEach((v: FormDataEntryValue, k: string) => {
        if (typeof v === 'string') body[k] = v;
      });
      ctx.body = body;
    }
    return;
  }
  if (ct.includes('application/json')) {
    try {
      ctx.body = (await request.json()) as object;
    } catch {
      ctx.body = {};
    }
    return;
  }
  ctx.body = {};
}

function findRoute(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchPath(route.pattern, pathname);
    if (params !== null) {
      // Debug logging for project routes
      if (pathname.includes('/api/project/')) {
        console.log(`✅ [ROUTE MATCH] ${method} ${pathname} -> ${route.pattern}`);
      }
      return { route, params };
    }
  }
  // Debug logging for unmatched project routes
  if (pathname.includes('/api/project/')) {
    console.log(`❌ [ROUTE NOT FOUND] ${method} ${pathname} - Available project routes:`, 
      routes.filter(r => r.pattern.includes('/api/project/')).map(r => `${r.method} ${r.pattern}`));
  }
  return null;
}

async function serveStatic(pathname: string): Promise<Response | null> {
  if (!pathname.startsWith('/generated_images/')) return null;
  const rel = pathname.slice('/generated_images/'.length).replace(/\.\./g, '');
  const filePath = path.join(GENERATED_IMAGES_DIR, rel);
  if (!filePath.startsWith(GENERATED_IMAGES_DIR)) return null;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const contentType = mime[ext] ?? 'application/octet-stream';
  return new Response(buf, {
    status: 200,
    headers: { 'Content-Type': contentType, 'Content-Length': String(buf.length) },
  });
}

export type BunServer = { requestIP: (req: Request) => { address?: string } | null };

export async function handleRequest(request: Request, server?: BunServer): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method;
  const origin = request.headers.get('origin');

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: 'Not allowed by CORS' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  const cors = corsHeaders(origin);
  if (method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: cors });
  }

  const ip = server?.requestIP?.(request)?.address ?? 'unknown';
  console.log(`${new Date().toISOString()} - ${method} ${pathname} - ${ip}`);

  let staticRes: Response | null = null;
  try {
    staticRes = await serveStatic(pathname);
  } catch (_) {}
  if (staticRes) {
    const h = new Headers(staticRes.headers);
    Object.entries(cors).forEach(([k, v]) => h.set(k, v));
    return new Response(staticRes.body, { status: staticRes.status, headers: h });
  }

  const matched = findRoute(method, pathname);
  if (!matched) {
    return new Response(
      JSON.stringify({ error: 'Not found', path: pathname }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...cors } }
    );
  }

  const { route, params } = matched;
  const ctx: HttpContext = {
    method,
    url: request.url,
    path: pathname,
    pathname,
    query: parseQuery(url.search),
    params,
    body: {},
    headers: request.headers,
  };

  try {
    await parseBody(request, ctx, route.multipart, route.multipartField);
  } catch (e) {
    console.error('Parse body error:', e);
    return new Response(
      JSON.stringify({ error: 'Bad request', details: String(e) }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...cors } }
    );
  }

  let result: HandlerResult;
  try {
    result = await route.handler(ctx);
  } catch (e) {
    console.error('Handler error:', e);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...cors } }
    );
  }

  const res = toResponse(result);
  const outHeaders = new Headers(res.headers);
  Object.entries(cors).forEach(([k, v]) => outHeaders.set(k, v));
  return new Response(res.body, { status: res.status, headers: outHeaders });
}
