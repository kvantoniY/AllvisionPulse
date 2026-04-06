const DEFAULT_TITLE = 'Allvision Pulse';
const DEFAULT_ICON = '/brand-eye-192.png';
const DEFAULT_BADGE = '/brand-eye-192.png';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function hasVisibleClient() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return clients.some((client) => client.visibilityState === 'visible');
}

function normalizePayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};

  return {
    kind: typeof payload.kind === 'string' ? payload.kind : 'notification',
    title: typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : DEFAULT_TITLE,
    message: typeof payload.message === 'string' ? payload.message : '',
    href: typeof payload.href === 'string' && payload.href.trim() ? payload.href.trim() : '/',
    iconUrl: typeof payload.iconUrl === 'string' && payload.iconUrl.trim() ? payload.iconUrl.trim() : DEFAULT_ICON,
    tag: typeof payload.tag === 'string' && payload.tag.trim() ? payload.tag.trim() : 'allvision-pulse',
    requireInteraction: Boolean(payload.requireInteraction),
    renotify: Boolean(payload.renotify),
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    meta: payload.meta && typeof payload.meta === 'object' ? payload.meta : {},
  };
}

function normalizeIncomingCallIntent(payload, timestamp = Date.now()) {
  const meta = payload?.meta && typeof payload.meta === 'object' ? payload.meta : {};
  const chatId = typeof meta.chatId === 'string' ? meta.chatId.trim() : '';
  const callId = typeof meta.callId === 'string' ? meta.callId.trim() : '';

  if (!chatId || !callId) {
    return null;
  }

  return {
    chatId,
    callId,
    fromUserId: typeof meta.fromUserId === 'string' ? meta.fromUserId.trim() : '',
    kind: meta.kind === 'group' ? 'group' : 'direct',
    receivedAt: timestamp,
  };
}

function buildTargetUrl(payload, timestamp = Date.now()) {
  const href = typeof payload?.href === 'string' && payload.href.trim() ? payload.href : '/';
  const targetUrl = new URL(href, self.location.origin);
  const intent = normalizeIncomingCallIntent(payload, timestamp);

  if (payload?.kind === 'incoming_call' && intent) {
    targetUrl.searchParams.set('incomingCall', '1');
    targetUrl.searchParams.set('chatId', intent.chatId);
    targetUrl.searchParams.set('callId', intent.callId);
    if (intent.fromUserId) targetUrl.searchParams.set('fromUserId', intent.fromUserId);
    targetUrl.searchParams.set('callKind', intent.kind);
    targetUrl.searchParams.set('callIntentAt', String(intent.receivedAt));
  }

  return targetUrl.toString();
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  await Promise.all(
    clients.map(async (client) => {
      if (!('postMessage' in client)) return;
      try {
        client.postMessage(message);
      } catch {}
    }),
  );
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let rawPayload = {};

      try {
        rawPayload = event.data ? event.data.json() : {};
      } catch {
        rawPayload = { message: event.data ? event.data.text() : '' };
      }

      const payload = normalizePayload(rawPayload);
      const incomingCallIntent = payload.kind === 'incoming_call' ? normalizeIncomingCallIntent(payload) : null;

      if (incomingCallIntent) {
        await notifyClients({
          type: 'incoming_call_push',
          intent: incomingCallIntent,
        });
      }

      if (await hasVisibleClient()) {
        return;
      }

      await self.registration.showNotification(payload.title, {
        body: payload.message,
        icon: payload.iconUrl,
        badge: DEFAULT_BADGE,
        tag: payload.tag,
        renotify: payload.renotify,
        requireInteraction: payload.requireInteraction,
        data: {
          href: payload.href,
          kind: payload.kind,
          meta: payload.meta,
        },
        actions: payload.actions,
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const rawData = event.notification.data && typeof event.notification.data === 'object' ? event.notification.data : {};
      const clickedAt = Date.now();
      const targetUrl = buildTargetUrl(rawData, clickedAt);
      const incomingCallIntent = rawData.kind === 'incoming_call'
        ? normalizeIncomingCallIntent({ meta: rawData.meta }, clickedAt)
        : null;
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const client of clients) {
        if (!('focus' in client)) continue;

        try {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(targetUrl);
          }
          if (incomingCallIntent && 'postMessage' in client) {
            client.postMessage({
              type: 'incoming_call_notification_click',
              intent: incomingCallIntent,
            });
          }
          return;
        } catch {}
      }

      const nextClient = await self.clients.openWindow(targetUrl);
      if (incomingCallIntent && nextClient && 'postMessage' in nextClient) {
        try {
          nextClient.postMessage({
            type: 'incoming_call_notification_click',
            intent: incomingCallIntent,
          });
        } catch {}
      }
    })(),
  );
});
