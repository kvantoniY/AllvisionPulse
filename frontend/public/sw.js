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
      const href =
        typeof event.notification.data?.href === 'string' && event.notification.data.href.trim()
          ? event.notification.data.href
          : '/';
      const targetUrl = new URL(href, self.location.origin).toString();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const client of clients) {
        if (!('focus' in client)) continue;

        try {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(targetUrl);
          }
          return;
        } catch {}
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});
