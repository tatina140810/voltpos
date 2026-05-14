// Service Worker for VoltPos PWA.
// All same-origin requests use network-first so fresh deploys reach clients on the next load.
// Cache is used only as offline fallback. Bump CACHE_VERSION to force-clear all caches.
const CACHE_VERSION = "voltpos-v6";
const STATIC_ASSETS = ["/", "/index.html", "/manifest.json", "/logo.png", "/logo-180.png", "/logo-192.png", "/logo-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // POST/PUT/DELETE — passthrough (offline POST is handled by lib/offline.ts queue)

  const url = new URL(request.url);

  // SPA navigation: network-first, fallback to cached index.html when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Same-origin API: network-first with stale cache fallback (so /api/products etc. work offline).
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Same-origin static assets (hashed JS/CSS, fonts, images): network-first.
  // Always try the network first so fresh deploys propagate to clients automatically;
  // fall back to cache only when offline.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/assets/") || /\.(png|jpe?g|svg|ico|woff2?|webp)$/.test(url.pathname))
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Anything else: passthrough (no cache).
});

// === Web Push ===
// Полезная нагрузка приходит JSON-ом из app/services/push_service.py:build_payload.
// Если data пуст (тестовый ping без тела) — показываем общий заголовок.
self.addEventListener("push", (event) => {
  let payload = { title: "VoltPos", body: "" };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    payload.body = event.data ? event.data.text() : "";
  }
  const { title, body, icon, badge, tag, vibrate, url } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || "/logo.png",
      badge: badge || "/logo.png",
      tag,
      vibrate: vibrate || [200, 100, 200],
      data: { url: url || "/" },
    }),
  );
});

// Клик по уведомлению — фокусируем уже открытое окно VoltPos или открываем новое.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(targetUrl).catch(() => {});
          return w.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
