// Sierra Myco Lab - Service Worker
// Provides offline capability by precaching the app shell and runtime-caching
// static assets (CSS, JS, and CDN libraries).

// Bump this version whenever app shell files change: the activate handler
// deletes every cache with an older name, so stale JS (e.g. js/db.js with
// outdated plan-badge logic) is never served from cache-first lookups.
const CACHE_NAME = 'sierra-myco-lab-v10';

// Critical shell — the app is unusable offline without these, so a failure to
// cache any one of them should fail the install and retry later.
const CRITICAL_SHELL = [
  './',
  './index.html',
  './build.css',
  './js/app.js',
  './js/config.js',
  './js/utils.js',
  './js/db.js',
  './js/camera.js',
  './js/modals.js',
  './manifest.json'
];

// Nice-to-have shell — cache best-effort; a 404 here must not abort the install
// (e.g. fonts that may not be present on every deploy).
const OPTIONAL_SHELL = [
  './css/styles.css',
  './css/print.css',
  './privacy.html',
  './fonts/geist/Geist-Variable.woff2',
  './fonts/geist/GeistMono-Variable.woff2'
];

// Install: precache the application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(CRITICAL_SHELL);
        await Promise.allSettled(OPTIONAL_SHELL.map((url) => cache.add(url)));
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up any outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
//  - Page navigations: network-first (always get latest, fall back to cache offline)
//  - Static assets (CSS/JS/images/CDN): cache-first with runtime caching
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Never intercept Supabase API traffic (auth / REST / realtime) so cloud
  // sync and authentication always hit the network and are never served stale.
  try {
    const url = new URL(request.url);
    if (url.pathname.includes('/auth/v1/') || url.pathname.includes('/rest/v1/') || url.pathname.includes('/realtime/v1/')) {
      return;
    }
  } catch (e) { /* malformed URL: fall through to default handling */ }

  // Network-first for navigations. Deep-link URLs that only resolve to the SPA
  // shell are always answered from './index.html' so we never cache a per-route
  // URL that would then be served stale.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => Response.error());
    })
  );
});
