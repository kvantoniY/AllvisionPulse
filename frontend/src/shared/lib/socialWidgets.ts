import type { PulseShareWidgetPayload } from '@/shared/lib/pulseShare';

export type LegacyHealthWidgetPayload = {
  type: 'health';
  date?: string | null;
  todayScore?: number | null;
  pulse7Score?: number | null;
};

type ParsedWidgetsJson = Record<string, unknown> & {
  type?: string;
  replyToUsername?: string;
};

export function parseSocialWidgetsJson(value: unknown): ParsedWidgetsJson | null {
  if (!value) return null;

  let normalized = value;
  if (typeof normalized === 'string') {
    try {
      normalized = JSON.parse(normalized);
    } catch {
      return null;
    }
  }

  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return null;
  return normalized as ParsedWidgetsJson;
}

export function getPulseShareWidgetPayload(value: unknown): PulseShareWidgetPayload | null {
  const parsed = parseSocialWidgetsJson(value);
  return parsed?.type === 'pulse_share' ? (parsed as PulseShareWidgetPayload) : null;
}

export function getLegacyHealthWidgetPayload(value: unknown): LegacyHealthWidgetPayload | null {
  const parsed = parseSocialWidgetsJson(value);
  return parsed?.type === 'health' ? (parsed as LegacyHealthWidgetPayload) : null;
}

export function getReplyToUsernameFromWidgetsJson(value: unknown): string | null {
  const parsed = parseSocialWidgetsJson(value);
  return typeof parsed?.replyToUsername === 'string' && parsed.replyToUsername.trim() ? parsed.replyToUsername : null;
}
