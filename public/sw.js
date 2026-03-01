// ═══════════════════════════════════════════════════════════════════
// SERVICE WORKER — RestoPro Push Notifications
// Fichier à placer dans : public/sw.js
// ═══════════════════════════════════════════════════════════════════

const CACHE_NAME = "restopro-v1";

// Installation du SW
self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(clients.claim());
});

// ── Réception d'une notification push ──────────────────────────────
self.addEventListener("push", (e) => {
  if (!e.data) return;

  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { title: "RestoPro", body: e.data.text() };
  }

  const options = {
    body: payload.body || "",
    icon: "/logo192.png",
    badge: "/logo192.png",
    vibrate: [200, 100, 200, 100, 200],
    tag: payload.tag || "restopro-notif",
    renotify: true,
    data: { url: payload.url || "/" },
    actions: [
      { action: "open", title: "Voir ma commande" },
      { action: "close", title: "Fermer" },
    ],
  };

  e.waitUntil(
    self.registration.showNotification(payload.title || "RestoPro 🍽️", options)
  );
});

// ── Clic sur la notification ────────────────────────────────────────
self.addEventListener("notificationclick", (e) => {
  e.notification.close();

  if (e.action === "close") return;

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Si une fenêtre est déjà ouverte, on la focus
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Sinon on ouvre l'app
      if (clients.openWindow) {
        return clients.openWindow(e.notification.data?.url || "/");
      }
    })
  );
});
