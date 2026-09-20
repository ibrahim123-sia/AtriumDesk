// Rev 5 §14 — PWA. "Installable, push-capable, one codebase, no app store
// process... roughly 90% of the benefit" of a native app. This covers the
// installable + basic-offline-resilience half; push notifications are not
// wired here (a separate VAPID/subscription feature, not required for
// installability — Phase 10's digest/reminder emails already cover the
// notification need).
//
// Strategy, deliberately simple (app-shell caching, not exhaustive route
// precaching):
//   - API calls (/api/*) — always network, never cached. Student/admin
//     data must never be served stale.
//   - Navigations — network-first, falling back to the cached app shell
//     ("/") so a dropped connection shows the app, not a browser error page.
//   - Same-origin static assets (JS/CSS/images) — cache-first, populated
//     opportunistically as they're requested (Vite's hashed build output
//     isn't known ahead of time, so this can't be a fixed precache list).

const CACHE_NAME = "uniassist-shell-v2";
const APP_SHELL = ["/", "/manifest.json", "/graduation.png", "/logo-mark.svg", "/logo-lockup.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept writes

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (API server, CDN) pass through untouched
  if (url.pathname.startsWith("/api/")) return; // never cache API responses

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
