// Notaku service worker — stale-while-revalidate untuk app shell.
// Strategi: cache instant utk first paint, fetch di background utk update.
// Bump CACHE_VERSION untuk invalidate cache saat deploy.
const CACHE_VERSION = "notaku-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

// Precache route HTML utama biar /, /buat, dll instan saat offline / koneksi jelek.
const PRECACHE_URLS = [
  "/",
  "/buat",
  "/riwayat",
  "/laporan",
  "/pengeluaran",
  "/pengaturan",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // addAll gagal kalau salah satu 404; jalankan satu-satu biar resilient.
      await Promise.all(
        PRECACHE_URLS.map((u) =>
          fetch(u, { cache: "reload" })
            .then((res) => (res.ok ? cache.put(u, res) : undefined))
            .catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Jangan pernah cache API / server-fn endpoints
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_server")) return;

  // Stale-While-Revalidate untuk HTML navigations.
  // Serve cache instan (≤ 1 round-trip), update di background biar deploy berikut fresh.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        const cached = await cache.match(req) || await caches.match(req) || await caches.match("/");

        const networkPromise = fetch(req)
          .then((fresh) => {
            if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => undefined);
            return fresh;
          })
          .catch(() => null);

        // Kalau ada cache → return langsung (instan). Update di background.
        if (cached) {
          event.waitUntil(networkPromise);
          return cached;
        }
        // Belum ada cache → tunggu network; fallback ke "/" kalau gagal total.
        const fresh = await networkPromise;
        return fresh || (await caches.match("/")) || Response.error();
      })(),
    );
    return;
  }

  // CacheFirst untuk static assets (hashed JS/CSS, images, fonts) — immutable.
  const dest = req.destination;
  if (["style", "script", "image", "font"].includes(dest)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req)
            .then((res) => {
              if (res.ok) {
                const copy = res.clone();
                caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
              }
              return res;
            })
            .catch(() => cached || Response.error()),
      ),
    );
  }
});
