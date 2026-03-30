import { COOKIES } from '@/shared/config/app';

const secureOverride = process.env.AUTH_COOKIE_SECURE;
const secure = secureOverride === 'true' || (process.env.NODE_ENV === 'production' && secureOverride !== 'false');

const rawDomain = (process.env.AUTH_COOKIE_DOMAIN ?? '').trim();
const cookieDomain = rawDomain || undefined;

const accessTtlMinutes = Number(process.env.ACCESS_TTL_MIN ?? 15);
const refreshTtlDays = Number(process.env.REFRESH_TTL_DAYS ?? 30);

const accessMaxAge = Math.max(60, Math.floor((Number.isFinite(accessTtlMinutes) ? accessTtlMinutes : 15) * 60));
const refreshMaxAge = Math.max(accessMaxAge, Math.floor((Number.isFinite(refreshTtlDays) ? refreshTtlDays : 30) * 24 * 60 * 60));

const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure,
  path: '/',
  ...(cookieDomain ? { domain: cookieDomain } : {}),
};

export const accessCookieOptions = {
  ...baseCookieOptions,
  maxAge: accessMaxAge,
};

export const refreshCookieOptions = {
  ...baseCookieOptions,
  maxAge: refreshMaxAge,
};

export const expiredCookieOptions = {
  ...baseCookieOptions,
  maxAge: 0,
};

export const COOKIE_NAMES = COOKIES;
