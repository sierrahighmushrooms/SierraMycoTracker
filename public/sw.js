// Tombstone service worker.
//
// The pre-Next.js static PWA registered a service worker at scope "/" (from this
// same URL) that precached an app shell and intercepted every same-origin GET.
// Returning visitors still have it installed, where it serves stale assets over
// the migrated site and can throw on failed fetches. When their browser
// re-checks this URL it picks up this version, which unregisters itself and
// deletes every cache the old worker left behind.
//
// The legacy PWA that still runs at /app/ registers its own worker scoped to
// /app/ — that one is untouched by this file.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (err) {
        // caches API may be unavailable; unregister regardless.
      }
      await self.registration.unregister();
    })(),
  );
});

// No fetch handler: this worker never intercepts requests.
