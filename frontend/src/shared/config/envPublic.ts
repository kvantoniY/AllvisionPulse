// Client-safe env.
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';
export const TURN_URLS = (process.env.NEXT_PUBLIC_TURN_URLS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
export const TURN_USERNAME = process.env.NEXT_PUBLIC_TURN_USERNAME ?? '';
export const TURN_PASSWORD = process.env.NEXT_PUBLIC_TURN_PASSWORD ?? '';
