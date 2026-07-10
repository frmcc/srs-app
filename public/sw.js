// Service Worker — push notifications + a minimal offline story (EM-8/MT-9/PP-8).
//
// Caching contract (deliberately conservative):
// - HTML navigations are network-first and NEVER cached — zero staleness risk;
//   offline they fall back to the precached branded /offline.html.
// - Only content-hashed immutable assets (/_next/static/, incl. fonts) and the
//   precached icons are served cache-first, so warm launches skip the network.
// - /api is never touched by the SW.
//
// Bump CACHE_NAME whenever the caching logic or precache list changes so
// stale caches are dropped on deploy (see the activate handler).
const CACHE_NAME = "srs-static-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-192.svg", "/icon-512.svg", "/manifest.json"];

self.addEventListener("push", (event) => {
  // A non-JSON payload (plain text, or malformed JSON) makes event.data.json()
  // throw synchronously — the notification would never show and Chrome may
  // revoke push permission after repeated silent pushes. Fall back to text.
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }
  const title = data.title || "SRS Quiz System";
  const options = {
    body: data.body || "Neue Benachrichtigung",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "srs-notification",
    data: { url: data.url || "/" },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Focus an existing app window AND navigate it to the target URL — the
        // old code focused the first window but never opened the deep link
        // (e.g. a /quiz/<id> from a "review due" notification).
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : c));
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API (incl. auth) stays strictly network — never cached, never faked offline.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first so HTML is never stale; offline → branded fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  // Immutable content-hashed assets (+ the precached icons): cache-first.
  const cacheable = url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname);
  if (!cacheable) return;
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
    )
  );
});
