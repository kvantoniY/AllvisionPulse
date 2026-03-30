import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIES, ROUTES } from '@/shared/config/app';

const PUBLIC_FILE = /\.(.*)$/;

function normalizeProtocol(value?: string | null) {
  return String(value ?? '').replace(/:$/, '').trim().toLowerCase();
}

function normalizeHost(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}

function getCanonicalTarget(req: NextRequest): URL | null {
  const raw = (process.env.PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  if (!raw) return null;

  try {
    const canonical = new URL(raw);
    const currentHost = normalizeHost(req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host);
    const currentProto = normalizeProtocol(req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol);
    const canonicalHost = normalizeHost(canonical.host);
    const canonicalProto = normalizeProtocol(canonical.protocol);

    if (currentHost === canonicalHost && currentProto === canonicalProto) return null;

    const target = new URL(req.url);
    target.protocol = canonical.protocol;
    target.host = canonical.host;
    return target;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/uploads') ||
    pathname === '/favicon.ico' ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const canonicalTarget = getCanonicalTarget(req);
  if (canonicalTarget) {
    return NextResponse.redirect(canonicalTarget, 307);
  }

  const hasRefresh = Boolean(req.cookies.get(COOKIES.refresh)?.value);
  const hasAccess = Boolean(req.cookies.get(COOKIES.access)?.value);

  if (pathname.startsWith('/auth')) {
    if (hasRefresh && hasAccess) {
      const url = req.nextUrl.clone();
      url.pathname = ROUTES.app.home;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!hasRefresh) {
    const url = req.nextUrl.clone();
    url.pathname = ROUTES.auth.login;
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!.*\.).*)'],
};
