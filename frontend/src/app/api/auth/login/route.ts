import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { BACKEND_URL } from '@/shared/config/env';
import { COOKIE_NAMES, accessCookieOptions, refreshCookieOptions } from '@/shared/lib/authCookies';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const r = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return NextResponse.json(data, { status: r.status });
  }

  const c = cookies();
  c.set(COOKIE_NAMES.access, data.tokens.access, accessCookieOptions);
  c.set(COOKIE_NAMES.refresh, data.tokens.refresh, refreshCookieOptions);

  return NextResponse.json({ user: data.user });
}
