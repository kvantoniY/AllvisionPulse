import { COOKIES } from '@/shared/config/app';

const secureOverride = process.env.AUTH_COOKIE_SECURE;
const secure = secureOverride === 'true' || (process.env.NODE_ENV === 'production' && secureOverride !== 'false');

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure,
  path: '/',
};

export const COOKIE_NAMES = COOKIES;
