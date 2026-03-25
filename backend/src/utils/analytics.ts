import { prisma } from '../db/prisma';

export type AnalyticsEventInput = {
  userId: string;
  sessionKey?: string | null;
  type: 'PAGE_VIEW' | 'PAGE_LEAVE' | 'HEARTBEAT' | 'ACTION';
  path: string;
  pageLabel?: string | null;
  referrerPath?: string | null;
  actionKey?: string | null;
  durationSec?: number | null;
  metadata?: unknown;
};

export function normalizePath(input?: string | null) {
  const value = (input ?? '').trim();
  if (!value) return '/unknown';
  if (!value.startsWith('/')) return `/${value}`;
  return value.slice(0, 240) || '/unknown';
}

function normalizeSessionKey(input?: string | null) {
  const value = (input ?? '').trim();
  return value.slice(0, 120) || 'action';
}

export async function trackAnalyticsEvent(input: AnalyticsEventInput) {
  const sessionKey = normalizeSessionKey(input.sessionKey);
  const path = normalizePath(input.path);
  const durationSec = typeof input.durationSec === 'number' && Number.isFinite(input.durationSec)
    ? Math.max(0, Math.min(24 * 60 * 60, Math.round(input.durationSec)))
    : null;

  const shouldPersistSession = !(input.type === 'ACTION' && !input.sessionKey);
  const session = shouldPersistSession
    ? await prisma.analyticsSession.upsert({
        where: {
          userId_sessionKey: {
            userId: input.userId,
            sessionKey,
          },
        },
        create: {
          userId: input.userId,
          sessionKey,
          landingPath: path,
          exitPath: input.type === 'PAGE_LEAVE' ? path : null,
          pageViews: input.type === 'PAGE_VIEW' ? 1 : 0,
          totalDurationSec: durationSec ?? 0,
          startedAt: new Date(),
          lastSeenAt: new Date(),
          endedAt: input.type === 'PAGE_LEAVE' ? new Date() : null,
          isActive: input.type !== 'PAGE_LEAVE',
        },
        update: {
          lastSeenAt: new Date(),
          pageViews: input.type === 'PAGE_VIEW' ? { increment: 1 } : undefined,
          totalDurationSec: durationSec ? { increment: durationSec } : undefined,
          exitPath: input.type === 'PAGE_LEAVE' ? path : undefined,
          endedAt: input.type === 'PAGE_LEAVE' ? new Date() : undefined,
          isActive: input.type === 'PAGE_LEAVE' ? false : true,
        },
        select: { id: true },
      })
    : null;

  await prisma.analyticsEvent.create({
    data: {
      userId: input.userId,
      sessionId: session?.id ?? null,
      sessionKey,
      type: input.type,
      path,
      pageLabel: input.pageLabel?.trim() ? input.pageLabel.trim().slice(0, 120) : null,
      referrerPath: input.referrerPath?.trim() ? normalizePath(input.referrerPath) : null,
      actionKey: input.actionKey?.trim() ? input.actionKey.trim().slice(0, 120) : null,
      durationSec,
      metadata: input.metadata === undefined ? undefined : input.metadata,
    },
  });
}

export async function refreshAnalyticsPresence(userId: string, sessionKey: string, path?: string | null) {
  await prisma.analyticsSession.upsert({
    where: {
      userId_sessionKey: {
        userId,
        sessionKey: normalizeSessionKey(sessionKey),
      },
    },
    create: {
      userId,
      sessionKey: normalizeSessionKey(sessionKey),
      landingPath: normalizePath(path),
      lastSeenAt: new Date(),
      isActive: true,
    },
    update: {
      lastSeenAt: new Date(),
      isActive: true,
    },
  });
}
