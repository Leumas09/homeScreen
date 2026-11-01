// Service worker : notifications push et repli hors ligne de la coquille de l'app.
const SHELL = "maroubra-shell-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/icon.svg"]).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Navigation : réseau d'abord, dernière version connue si le réseau tombe.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok && !res.redirected) caches.open(SHELL).then((c) => c.put("/", res.clone()));
        return res;
      }).catch(() => caches.match("/")),
    );
    return;
  }
  if (new URL(req.url).pathname.startsWith("/assets/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
      return res;
    })));
  }
});

self.addEventListener("push", (e) => {
  let p = { title: "Maroubra", body: "" };
  try { p = e.data.json(); } catch { p.body = e.data ? e.data.text() : ""; }
  e.waitUntil(self.registration.showNotification(p.title, { body: p.body, tag: p.tag, icon: "/icon-192.png", badge: "/icon-192.png" }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow("/"))));
});
