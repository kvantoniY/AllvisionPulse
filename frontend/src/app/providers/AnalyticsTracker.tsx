'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useGetMeQuery } from '@/shared/api/usersApi';

const HEARTBEAT_MS = 60_000;

function getSessionKey() {
  if (typeof window === 'undefined') return 'server';
  const existing = window.sessionStorage.getItem('allvision.analytics.sessionKey');
  if (existing) return existing;
  const created = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem('allvision.analytics.sessionKey', created);
  return created;
}

function normalizeTrackedPath(pathname: string) {
  if (pathname === '/') return '/feed';
  if (pathname.startsWith('/profile/')) return '/profile/[username]';
  if (pathname.startsWith('/messages/')) return pathname === '/messages' ? '/messages' : '/messages/[chatId]';
  if (pathname.startsWith('/support/questions/')) return '/support/questions/[questionId]';
  return pathname;
}

function resolveLabel(pathname: string) {
  if (pathname === '/' || pathname.startsWith('/feed')) return 'Лента';
  if (pathname.startsWith('/health')) return 'Пульс';
  if (pathname.startsWith('/friends')) return 'Подписки';
  if (pathname.startsWith('/messages')) return 'Сообщения';
  if (pathname.startsWith('/support')) return 'Тех поддержка';
  if (pathname.startsWith('/admin')) return 'Админ панель';
  if (pathname.startsWith('/profile')) return 'Профиль';
  if (pathname.startsWith('/settings')) return 'Настройки';
  return pathname;
}

async function sendEvent(payload: Record<string, unknown>) {
  try {
    await fetch('/api/backend/analytics/events', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {}
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const { data } = useGetMeQuery();
  const me = data?.user;
  const sessionKey = useMemo(() => getSessionKey(), []);
  const currentPathRef = useRef(normalizeTrackedPath(pathname));
  const enteredAtRef = useRef(Date.now());
  const visibleRef = useRef(true);

  useEffect(() => {
    if (!me?.id) return;

    const trackedPath = normalizeTrackedPath(pathname);
    const previousPath = currentPathRef.current;
    const previousEnteredAt = enteredAtRef.current;

    if (previousPath !== trackedPath) {
      const durationSec = Math.max(1, Math.round((Date.now() - previousEnteredAt) / 1000));
      void sendEvent({
        sessionKey,
        type: 'PAGE_LEAVE',
        path: previousPath,
        pageLabel: resolveLabel(previousPath),
        durationSec,
        referrerPath: trackedPath,
      });
      currentPathRef.current = trackedPath;
      enteredAtRef.current = Date.now();
    }

    void sendEvent({
      sessionKey,
      type: 'PAGE_VIEW',
      path: trackedPath,
      pageLabel: resolveLabel(trackedPath),
      referrerPath: previousPath !== trackedPath ? previousPath : null,
      metadata: {
        viewport: typeof window !== 'undefined' ? { width: window.innerWidth, height: window.innerHeight } : null,
      },
    });
  }, [me?.id, pathname, sessionKey]);

  useEffect(() => {
    if (!me?.id) return;

    const sendHeartbeat = () => {
      if (!visibleRef.current) return;
      void sendEvent({
        sessionKey,
        type: 'HEARTBEAT',
        path: currentPathRef.current,
        pageLabel: resolveLabel(currentPathRef.current),
      });
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_MS);

    const onVisibility = () => {
      visibleRef.current = !document.hidden;
      if (!document.hidden) {
        enteredAtRef.current = Date.now();
        void sendEvent({
          sessionKey,
          type: 'HEARTBEAT',
          path: currentPathRef.current,
          pageLabel: resolveLabel(currentPathRef.current),
        });
        return;
      }

      const durationSec = Math.max(1, Math.round((Date.now() - enteredAtRef.current) / 1000));
      enteredAtRef.current = Date.now();
      void sendEvent({
        sessionKey,
        type: 'PAGE_LEAVE',
        path: currentPathRef.current,
        pageLabel: resolveLabel(currentPathRef.current),
        durationSec,
      });
    };

    const onBeforeUnload = () => {
      const durationSec = Math.max(1, Math.round((Date.now() - enteredAtRef.current) / 1000));
      void sendEvent({
        sessionKey,
        type: 'PAGE_LEAVE',
        path: currentPathRef.current,
        pageLabel: resolveLabel(currentPathRef.current),
        durationSec,
      });
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [me?.id, sessionKey]);

  return null;
}
