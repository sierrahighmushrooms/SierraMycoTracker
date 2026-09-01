"use client";

import { useEffect } from "react";

/**
 * The pre-Next.js static site registered a service worker at scope "/" that
 * still lives in returning visitors' browsers, where it intercepts requests to
 * this site and serves stale assets. Unregister it on load and reload once so
 * assets come straight from the network.
 *
 * The legacy PWA that still runs at /app/ has its own worker scoped to /app/;
 * this only removes the root-scoped registration.
 */
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const rootScope = `${window.location.origin}/`;

    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        const stale = registrations.filter((r) => r.scope === rootScope);
        if (stale.length === 0) return;

        return Promise.all(stale.map((r) => r.unregister())).then((results) => {
          // If this page was being controlled by the worker we just removed,
          // reload once. After the reload there is no root-scoped registration
          // and no controller, so this branch cannot loop.
          if (results.some(Boolean) && navigator.serviceWorker.controller) {
            window.location.reload();
          }
        });
      })
      .catch(() => {
        // getRegistrations() can reject in private mode or on insecure origins.
      });
  }, []);

  return null;
}
