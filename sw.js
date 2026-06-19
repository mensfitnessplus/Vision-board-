// ---------- Vision Board Service Worker ----------
// Two separate caches:
//   vision-board-app-vX   -> app shell (html, css, js, manifest, icons) — versioned
//   vision-board-images   -> remote/uploaded images (Unsplash, ImgBB, etc.) — NOT versioned
//
// HOW TO UPDATE THE APP (e.g. after pushing changes to GitHub):
//   1. Bump CACHE_VERSION below (e.g. 'v1' -> 'v2').
//   2. Push/deploy. On next load, the new SW installs, precaches fresh files
//      under the new cache name, and activate() deletes the old app-cache
//      version automatically. The image cache is left untouched, so cached
//      photos survive app updates.

const CACHE_VERSION = 'v1.1'; // <-- bump this on every deploy that changes app files
const APP_CACHE_NAME = `vision-board-app-${CACHE_VERSION}`;
const IMAGE_CACHE_NAME = 'vision-board-images';

// App shell files to precache. Adjust paths as needed for your deployment.
const APP_SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// Hosts whose responses should be routed into the image cache.
const IMAGE_HOSTS = [
  'images.unsplash.com',
  'i.ibb.co',
  'ibb.co',
  'image.ibb.co'
];

function isImageRequest(request, url) {
  if (request.destination === 'image') return true;
  if (IMAGE_HOSTS.some(host => url.hostname.includes(host))) return true;
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(url.pathname)) return true;
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE_NAME).then((cache) => {
      return Promise.all(
        APP_SHELL_FILES.map((file) =>
          cache.add(file).catch((err) => {
            // Don't fail install if an optional shell file is missing
            console.warn('[sw] Could not precache', file, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // Delete any old vision-board-app-* cache that isn't the current version.
          // Never touch vision-board-images — that persists across app updates.
          .filter((key) => key.startsWith('vision-board-app-') && key !== APP_CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  // Only handle http/https requests
  if (!url.protocol.startsWith('http')) return;

  if (isImageRequest(request, url)) {
    event.respondWith(handleImageRequest(request));
  } else if (url.origin === self.location.origin) {
    event.respondWith(handleAppRequest(request));
  }
  // Cross-origin, non-image requests (e.g. API calls) are left to the network.
});

async function handleImageRequest(request) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline and not cached — let it fail gracefully.
    return cached || Response.error();
  }
}

async function handleAppRequest(request) {
  const cache = await caches.open(APP_CACHE_NAME);
  const cached = await cache.match(request);

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

// Allow the page to request an immediate activation (e.g. after an update).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
