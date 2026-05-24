const CACHE_NAME = "aircon-crm-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/offline.html",
  "/icon-192x192.png",
];

const DYNAMIC_CACHE = "aircon-crm-dynamic-v1";
const NETWORK_FIRST_PATHS = ["/api/", "/auth"];
const CACHE_FIRST_ASSETS = [
  /\.(?:png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/,
];

self.addEventListener("install", (event) => {
  console.log("[ServiceWorker] Installing...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[ServiceWorker] Caching static assets");
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[ServiceWorker] Failed to cache some assets:", err);
      });
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[ServiceWorker] Activating...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName !== CACHE_NAME &&
            cacheName !== DYNAMIC_CACHE &&
            cacheName.startsWith("aircon-crm-")
          ) {
            console.log("[ServiceWorker] Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const { url, method } = request;

  // Skip non-GET requests
  if (method !== "GET") {
    return;
  }

  // Skip chrome extensions and external schemes
  if (url.includes("chrome-extension://") || url.startsWith("file://")) {
    return;
  }

  // Network-first for API and auth
  if (NETWORK_FIRST_PATHS.some((path) => url.includes(path))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const cache = caches.open(DYNAMIC_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          return caches
            .match(request)
            .then(
              (response) =>
                response || new Response("Offline - No cached response", { status: 503 }),
            );
        }),
    );
    return;
  }

  // Network-first for CSS/JS to avoid stale styles in development
  if (url.includes("/_next/static/") && (url.endsWith(".css") || url.endsWith(".js"))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const cache = caches.open(DYNAMIC_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(
            (response) =>
              response || new Response("Offline - CSS/JS not cached", { status: 503 }),
          );
        }),
    );
    return;
  }

  // Cache-first for static assets
  if (CACHE_FIRST_ASSETS.some((pattern) => pattern.test(url))) {
    event.respondWith(
      caches
        .match(request)
        .then((response) => response || fetch(request))
        .catch(() => {
          return new Response("Offline - Asset not cached", { status: 503 });
        }),
    );
    return;
  }

  // Network-first for HTML pages to ensure fresh content
  if (url.includes(".html") || !url.includes(".")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200 && response.type === "basic") {
            const responseToCache = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches
            .match(request)
            .then(
              (response) =>
                response || new Response("Offline - Page not cached", { status: 503 }),
            );
        }),
    );
    return;
  }

  // Stale-while-revalidate for other resources
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const responseToCache = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      });

      return cachedResponse || fetchPromise;
    }),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-calls") {
    event.waitUntil(
      fetch("/api/calls/sync")
        .then((response) => {
          if (response.ok) {
            console.log("[ServiceWorker] Synced calls successfully");
          }
        })
        .catch((err) => {
          console.warn("[ServiceWorker] Sync failed:", err);
        }),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    // payload가 JSON이 아니면 빈 객체로 fallback
  }
  const title = data.title || "출장시민";
  const targetUrl = typeof data.url === "string" ? data.url : "/";
  const options = {
    body: data.body || "새 알림이 있습니다.",
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    tag: data.tag || "default",
    data: { url: targetUrl },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // 이미 열려있는 같은 경로 탭이 있으면 포커스
      const matched = allClients.find(
        (client) => client.url.includes(targetUrl) && "focus" in client,
      );
      if (matched) {
        await matched.focus();
        return;
      }

      // 같은 origin의 다른 탭이 있으면 그 탭으로 navigate
      const sameOrigin = allClients.find((client) =>
        client.url.startsWith(self.location.origin),
      );
      if (sameOrigin && "navigate" in sameOrigin) {
        await sameOrigin.navigate(targetUrl);
        await sameOrigin.focus();
        return;
      }

      // 새 탭 열기
      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })(),
  );
});
