// Rev 5 §14 — PWA. "Installable, push-capable, one codebase, no app store
// process... roughly 90% of the benefit" of a native app. This covers the
// installable + basic-offline-resilience half, and browser notifications
// (web push — server/services/push.js sends, the handlers at the end show
// them and open the right page on click).
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

const CACHE_NAME = "atriumdesk-shell-v4";
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

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "AtriumDesk", {
      body: data.body || "",
      icon: "/graduation.png",
      badge: "/graduation.png",
      data: { url: data.url || "/" },
    })
  );
});

// Opens the notification's page — in an open tab of the app if there is
// one. Only this app's own pages: anything else opens the home page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL(event.notification.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) target = new URL("/", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.navigate(target.href).then((w) => (w || open).focus());
      return self.clients.openWindow(target.href);
    })
  );
});
