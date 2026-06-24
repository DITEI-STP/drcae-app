/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<Record<string, unknown>>;
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/storage/'),
  new CacheFirst({
    cacheName: 'drcae-storage-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  }),
);

registerRoute(new NavigationRoute(
  createHandlerBoundToURL('/app/index.html'),
  { denylist: [/^\/api\//] },
));

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event.data?.text());
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/app/img/icon-192.png',
      badge: '/app/img/icon-192.png',
      data: {
        url: payload.url || '/app/?realtimeSync=1',
        pendingSync: true,
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/app/?realtimeSync=1';
  event.waitUntil(openOrFocus(targetUrl));
});

async function openOrFocus(url: string) {
  const absoluteUrl = new URL(url, self.location.origin).href;
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    if ('focus' in client && client.url.startsWith(self.location.origin)) {
      client.postMessage({ pendingSync: true });
      return client.focus();
    }
  }
  await self.clients.openWindow(absoluteUrl);
}

function parsePushPayload(text?: string) {
  try {
    const parsed = text ? JSON.parse(text) : {};
    return {
      title: parsed.title || 'DRCAE: actualização disponível',
      body: parsed.body || 'Abra o app para sincronizar.',
      url: parsed.url || '/app/?realtimeSync=1',
    };
  } catch {
    return {
      title: 'DRCAE: actualização disponível',
      body: 'Abra o app para sincronizar.',
      url: '/app/?realtimeSync=1',
    };
  }
}
