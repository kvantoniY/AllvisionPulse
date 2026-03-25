import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { BACKEND_URL } from '@/shared/config/env';
import { COOKIE_NAMES, cookieOptions } from '@/shared/lib/authCookies';

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

export async function GET() {
  const c = cookies();
  const refresh = c.get(COOKIE_NAMES.refresh)?.value;
  let access = c.get(COOKIE_NAMES.access)?.value;

  if (shouldRefreshAccessToken(access)) access = undefined;

  if (!access && refresh) {
    const nextAccess = await refreshAccess(refresh);
    if (nextAccess) {
      access = nextAccess;
      c.set(COOKIE_NAMES.access, access, cookieOptions);
    }
  }

  if (!access) return NextResponse.json({ access: null }, { status: 401 });
  return NextResponse.json({ access });
}
