import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { BACKEND_URL } from '@/shared/config/env';
import { COOKIE_NAMES, cookieOptions } from '@/shared/lib/authCookies';

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
