// Backend base URL for server-side Next.js route handlers.
// Use localhost by default for local dev.
export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

// Client-side usage (e.g. socket.io). Set NEXT_PUBLIC_BACKEND_URL in .env
export const PUBLIC_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? BACKEND_URL;
