import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { BACKEND_URL } from '@/shared/config/env';
import { COOKIE_NAMES, cookieOptions } from '@/shared/lib/authCookies';

export async function POST() {
  const c = cookies();
  const access = c.get(COOKIE_NAMES.access)?.value;

  if (access) {
    await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${access}` },
    }).catch(() => null);
  }

  c.set(COOKIE_NAMES.access, '', { ...cookieOptions, maxAge: 0 });
  c.set(COOKIE_NAMES.refresh, '', { ...cookieOptions, maxAge: 0 });

  return NextResponse.json({ ok: true });
}
