// Service Worker for Push Notifications
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

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
