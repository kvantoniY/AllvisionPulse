const DEFAULT_TITLE = 'Allvision Pulse';
const DEFAULT_ICON = '/brand-eye-192.png';
const DEFAULT_BADGE = '/brand-eye-192.png';
const PUSH_PUBLIC_KEY_URL = '/api/backend/notifications/push/public-key';
const PUSH_SUBSCRIBE_URL = '/api/backend/notifications/push/subscribe';
const VISIBLE_NOTIFICATION_CLOSE_DELAY_MS = 1200;

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

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = self.atob(normalized);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function fetchPushPublicKey() {
  const response = await fetch(PUSH_PUBLIC_KEY_URL, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    return { enabled: false, publicKey: null };
  }

  const data = await response.json().catch(() => null);
  return {
    enabled: Boolean(data?.enabled && typeof data?.publicKey === 'string' && data.publicKey.trim()),
    publicKey: typeof data?.publicKey === 'string' ? data.publicKey.trim() : null,
  };
}

async function saveSubscription(subscription) {
  const response = await fetch(PUSH_SUBSCRIBE_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription }),
  });

  if (!response.ok) {
    throw new Error(`Push subscribe failed with status ${response.status}`);
  }
}

async function closeNotificationsByTagAfterDelay(tag, delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const notifications = await self.registration.getNotifications({ tag });
  notifications.forEach((notification) => notification.close());
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

      const visibleClient = await hasVisibleClient();
      const notificationTag = visibleClient ? `vis-${Date.now()}` : payload.tag;

      await self.registration.showNotification(payload.title, {
        body: payload.message,
        icon: payload.iconUrl,
        badge: DEFAULT_BADGE,
        tag: notificationTag,
        renotify: visibleClient ? false : payload.renotify,
        requireInteraction: visibleClient ? false : payload.requireInteraction,
        silent: visibleClient,
        data: {
          href: payload.href,
          kind: payload.kind,
          meta: payload.meta,
        },
        actions: payload.actions,
      });

      if (visibleClient) {
        await closeNotificationsByTagAfterDelay(notificationTag, VISIBLE_NOTIFICATION_CLOSE_DELAY_MS);
      }
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const pushKey = await fetchPushPublicKey();
        if (!pushKey.enabled || !pushKey.publicKey) return;

        let subscription = event.newSubscription ?? null;
        if (!subscription) {
          subscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(pushKey.publicKey),
          });
        }

        const serialized = subscription.toJSON();
        if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) return;

        await saveSubscription(serialized);
      } catch (error) {
        console.error('[push:subscriptionchange-error]', error);
      }
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
