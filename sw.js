// ═══════════════════════════════════════════════════════
//  MeetPro Service Worker
//  Handles: caching, offline fallback, PWA install
// ═══════════════════════════════════════════════════════
const CACHE_NAME   = 'meetpro-v1';
const OFFLINE_URL  = '/offline';

// Assets to pre-cache on install
const PRECACHE = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js',
];

// ── Install: pre-cache shell ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE).catch(err => {
        console.warn('SW: Pre-cache failed for some items:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first with offline fallback ────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, WebSocket, and Socket.IO polling requests
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/socket.io')) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses for HTML, JS, CSS, images
        if (response.ok && (
          request.destination === 'document' ||
          request.destination === 'script'   ||
          request.destination === 'style'    ||
          request.destination === 'image'
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(request).then(cached => {
          if (cached) return cached;
          // For navigation, show offline page
          if (request.destination === 'document') {
            return caches.match(OFFLINE_URL);
          }
        });
      })
  );
});

// ── Push notification support (optional) ─────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const title   = data.title   || 'MeetPro';
  const options = {
    body:    data.body    || 'You have a meeting notification',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});
