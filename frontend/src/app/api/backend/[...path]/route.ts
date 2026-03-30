import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { BACKEND_URL } from '@/shared/config/env';
import { COOKIE_NAMES, cookieOptions } from '@/shared/lib/authCookies';


function normalizeAppMediaUrl(value?: string | null): string | null {
  if (typeof value !== 'string') return value ?? null;
  const source = value.trim();
  if (!source) return null;

  if (source.startsWith('/uploads/')) return source;
  if (source.startsWith('uploads/')) return `/${source}`;

  try {
    const parsed = new URL(source);
    if (parsed.pathname.startsWith('/uploads/')) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return source;
  } catch {
    const uploadIndex = source.indexOf('/uploads/');
    if (uploadIndex >= 0) return source.slice(uploadIndex);
    return source;
  }
}

function normalizeAppMediaUrlsDeep<T>(input: T): T {
  if (typeof input === 'string') {
    return normalizeAppMediaUrl(input) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => normalizeAppMediaUrlsDeep(item)) as T;
  }

  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>).map(([key, value]) => [key, normalizeAppMediaUrlsDeep(value)]);
    return Object.fromEntries(entries) as T;
  }

  return input;
}

function shouldRefreshAccessToken(token?: string | null) {
  if (!token) return true;
  const parts = token.split('.');
  if (parts.length !== 3) return true;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    const expMs = Number(payload?.exp) * 1000;
    if (!Number.isFinite(expMs)) return true;
    return expMs <= Date.now() + 30_000;
  } catch {
    return true;
  }
}

async function refreshAccess(refreshToken: string): Promise<string | null> {
  const r = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh: refreshToken }),
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  const access = data?.tokens?.access;
  return typeof access === 'string' ? access : null;
}

async function forward(req: Request, path: string[]) {
  const c = cookies();
  const refresh = c.get(COOKIE_NAMES.refresh)?.value;
  let access = c.get(COOKIE_NAMES.access)?.value;

  if (shouldRefreshAccessToken(access) && refresh) {
    const nextAccess = await refreshAccess(refresh);
    if (nextAccess) {
      access = nextAccess;
      c.set(COOKIE_NAMES.access, access, cookieOptions);
    } else if (access) {
      access = undefined;
      c.set(COOKIE_NAMES.access, '', { ...cookieOptions, maxAge: 0 });
    }
  }

  const url = `${BACKEND_URL}/api/${path.join('/')}${new URL(req.url).search}`;

  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');
  headers.delete('origin');
  headers.delete('referer');
  headers.delete('sec-fetch-site');
  headers.delete('sec-fetch-mode');
  headers.delete('sec-fetch-dest');

  const requestUrl = new URL(req.url);
  const forwardedHost = req.headers.get('x-forwarded-host') ?? requestUrl.host;
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? requestUrl.protocol.replace(':', '');
  if (forwardedHost) headers.set('x-forwarded-host', forwardedHost);
  if (forwardedProto) headers.set('x-forwarded-proto', forwardedProto);

  if (access) headers.set('authorization', `Bearer ${access}`);

  const method = req.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const doFetch = (token?: string) =>
    fetch(url, {
      method,
      headers: token ? new Headers({ ...Object.fromEntries(headers), authorization: `Bearer ${token}` }) : headers,
      body: hasBody ? body : undefined,
    });

  let r: Response;
  try {
    r = await doFetch();
  } catch (e: any) {
    return NextResponse.json(
      { message: 'Backend fetch failed', detail: String(e?.message ?? e) },
      { status: 502 },
    );
  }

  if (r.status === 401 && refresh) {
    const nextAccess = await refreshAccess(refresh);
    if (nextAccess) {
      access = nextAccess;
      c.set(COOKIE_NAMES.access, access, cookieOptions);
      try {
        r = await doFetch(access);
      } catch (e: any) {
        return NextResponse.json(
          { message: 'Backend fetch failed after refresh', detail: String(e?.message ?? e) },
          { status: 502 },
        );
      }
    } else {
      // refresh invalid — clear cookies
      c.set(COOKIE_NAMES.access, '', { ...cookieOptions, maxAge: 0 });
      c.set(COOKIE_NAMES.refresh, '', { ...cookieOptions, maxAge: 0 });
    }
  }

  const contentType = r.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const data = await r.json().catch(() => ({}));
    const normalized = normalizeAppMediaUrlsDeep(data);
    if (r.status >= 500) {
      console.error('[api-proxy:backend-error]', { method, url, status: r.status, data: normalized });
    }
    return NextResponse.json(normalized, { status: r.status });
  }

  const blob = await r.blob();
  return new NextResponse(blob, { status: r.status, headers: { 'content-type': contentType } });
}

export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}
export async function POST(req: Request, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}
export async function PUT(req: Request, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}
export async function PATCH(req: Request, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}
export async function DELETE(req: Request, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}
