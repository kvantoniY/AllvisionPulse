import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIES, ROUTES } from '@/shared/config/app';

const PUBLIC_FILE = /\.(.*)$/;

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

  const hasRefresh = Boolean(req.cookies.get(COOKIES.refresh)?.value);
  const hasAccess = Boolean(req.cookies.get(COOKIES.access)?.value);

  if (pathname.startsWith('/auth')) {
    // If we only have refresh (or it's stale), allow visiting /auth to recover.
    // We'll redirect away from /auth only when both tokens exist.
    if (hasRefresh && hasAccess) {
      const url = req.nextUrl.clone();
      url.pathname = ROUTES.app.home;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Protected area
  if (!hasRefresh) {
    const url = req.nextUrl.clone();
    url.pathname = ROUTES.auth.login;
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!.*\\.).*)'],
};
