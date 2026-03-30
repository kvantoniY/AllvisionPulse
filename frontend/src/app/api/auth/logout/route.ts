import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { BACKEND_URL } from '@/shared/config/env';
import { COOKIE_NAMES, expiredCookieOptions } from '@/shared/lib/authCookies';

export async function POST() {
  const c = cookies();
  const access = c.get(COOKIE_NAMES.access)?.value;

  if (access) {
    await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${access}` },
    }).catch(() => null);
  }

  c.set(COOKIE_NAMES.access, '', expiredCookieOptions);
  c.set(COOKIE_NAMES.refresh, '', expiredCookieOptions);

  return NextResponse.json({ ok: true });
}
