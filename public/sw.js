/* Online-only app: do not cache authenticated pages or queue writes. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("push", (event) => {
  let data = { title: "A part has a new revision.", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification("Partbook", {
      body: data.title,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  );
  const url =
    requested.origin === self.location.origin
      ? requested.href
      : self.location.origin;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            await client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
