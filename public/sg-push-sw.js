/*
 * SecureGraph Web Push service worker (served at the root of every app and the
 * Platform). Push messages come from the backend's notification service:
 *   { id, title, body, event_type, severity, url, tag }
 *
 * Browsers require every push to show a notification. When this app is already
 * open and in front, the in-app toast covers it, so the system notification is
 * closed straight away instead of showing twice.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: event.data ? event.data.text() : "" };
  }
  const tag = data.tag || `sg-${data.id || Date.now()}`;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Open tabs fetch the feed now instead of waiting for their next poll.
      windows.forEach((w) => w.postMessage({ type: "phantix:push", payload: data }));

      await self.registration.showNotification(data.title || "SecureGraph", {
        body: data.body || undefined,
        tag,
        icon: "/android-chrome-192x192.png",
        badge: "/favicon-48x48.png",
        data: { url: data.url || "/" },
        requireInteraction: data.severity === "critical",
      });

      if (windows.some((w) => w.visibilityState === "visible" && w.focused)) {
        const shown = await self.registration.getNotifications({ tag });
        shown.forEach((n) => n.close());
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Same app already open: bring it forward on the right page.
      const same = windows.find((w) => new URL(w.url).origin === target.origin);
      if (same) {
        await same.focus();
        if ("navigate" in same) await same.navigate(target.href).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
