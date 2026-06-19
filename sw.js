// ---------- Vision Board Service Worker ----------
// Bump CACHE_VERSION any time you change cached files (index.html, css, js, icons, etc).
// On activate, any cache whose name doesn't match the current version is deleted automatically.

const CACHE_VERSION = 'v1'; // <-- bump this number to force an update and clear old caches
const CACHE_NAME = `vision-board-${CACHE_VERSION}`;

// Files to cache for offline use. Update this list if you add more assets.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// ---------- Install: cache app shell ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // activate new SW immediately, don't wait for old tabs to close
  );
});

// ---------- Activate: delete any caches that aren't the current version ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('vision-board-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim()) // take control of open pages right away
  );
});

// ---------- Fetch: cache-first, falling back to network, then updating cache ----------
self.addEventListener('fetch', (event) => {
  // Only handle GET requests; let everything else (POST, etc.) pass through untouched.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Serve from cache if we have it, but still fetch in the background to keep it fresh.
      const networkFetch = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => cachedResponse); // offline and not cached: nothing we can do

      return cachedResponse || networkFetch;
    })
  );
});
