export function normalizeOrigin(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .replace(/\/+$/, '');
}

export function getAllowedOrigins(rawValue: string): string[] {
  const values = rawValue
    .split(',')
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);

  return Array.from(new Set(values));
}

export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return true;
  return allowedOrigins.includes(normalizeOrigin(origin));
}
