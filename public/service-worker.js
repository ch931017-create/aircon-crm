// =========================================================
// aircon-crm Service Worker
// =========================================================
// 정책 요약:
//   1) Navigation request(HTML) → network-only + navigation preload, 실패 시
//      offline.html. SW 캐시에 HTML 절대 저장하지 않음 → "캐시 꼬임" 회피.
//   2) /_next/static/* → SW 통과(브라우저 기본 HTTP 캐시에 위임).
//      Next.js의 immutable Cache-Control 헤더가 자동으로 최적화.
//      SW가 끼어들지 않으므로 stale chunk 반환 불가.
//   3) API / auth → network-first, 200 OK + non-HTML만 캐싱.
//   4) 이미지/폰트 → cache-first.
//   5) 그 외 → stale-while-revalidate, 200 OK + non-HTML만 캐싱.
//   6) Push, notificationclick → 알림용.
//
// 안전:
//   - 모든 cache.put 전 isCacheable() 통과 (200 OK + basic + non-HTML)
//   - activate 시 CACHE_ALLOWLIST 외 oldcache 모두 삭제
//   - install 즉시 skipWaiting → 새 SW 즉시 활성화
//   - activate에서 clients.claim → 기존 탭도 새 SW 제어
//   - navigation preload 활성화 (지원 브라우저)
// =========================================================

const CACHE_NAME = "aircon-crm-v3";
const DYNAMIC_CACHE = "aircon-crm-dynamic-v3";
const CACHE_ALLOWLIST = [CACHE_NAME, DYNAMIC_CACHE];

// install 시 precache할 정적 자원 (HTML 제외)
const STATIC_ASSETS = [
  "/manifest.json",
  "/offline.html",
  "/icon-192x192.png",
];

const CACHE_FIRST_ASSETS_REGEX = /\.(?:png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/;

// =========================================================
// install — precache + skipWaiting (waitUntil 안에서 보장)
// =========================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(STATIC_ASSETS);
      } catch (err) {
        console.warn("[SW] precache failed:", err);
      }
      await self.skipWaiting();
    })(),
  );
});

// =========================================================
// activate — allowlist 외 oldcache 정리 + navigation preload + clients.claim
// =========================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // aircon-crm-* prefix 중 allowlist에 없는 모든 캐시 삭제
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(
            (name) =>
              name.startsWith("aircon-crm-") && !CACHE_ALLOWLIST.includes(name),
          )
          .map((name) => {
            console.log("[SW] deleting old cache:", name);
            return caches.delete(name);
          }),
      );

      // Navigation preload — 지원 브라우저에서 navigation 응답을 미리 fetch 시작
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (err) {
          console.warn("[SW] navigationPreload.enable failed:", err);
        }
      }

      await self.clients.claim();
    })(),
  );
});

// =========================================================
// fetch
// =========================================================
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;
  if (!request.url.startsWith("http")) return;

  // (a) /_next/static/* → SW 통과. Next.js immutable 헤더가 브라우저 캐시 최적화.
  if (request.url.includes("/_next/static/")) {
    return;
  }

  // (b) Navigation(HTML) → network-only + preload, 실패 시 offline.html
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }

  // (c) API / auth → network-first
  if (request.url.includes("/api/") || request.url.includes("/auth")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // (d) 이미지/폰트 → cache-first
  if (CACHE_FIRST_ASSETS_REGEX.test(request.url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // (e) 그 외 → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// =========================================================
// 핸들러
// =========================================================

async function handleNavigation(event) {
  try {
    // navigation preload 응답 우선 (이미 fetch 시작됨, 더 빠름)
    const preload = await event.preloadResponse;
    if (preload) return preload;
    return await fetch(event.request);
  } catch {
    // offline fallback (HTML 캐시 X — offline.html만 노출)
    const cache = await caches.open(CACHE_NAME);
    const offline = await cache.match("/offline.html");
    return (
      offline ||
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const clone = response.clone();
      caches
        .open(DYNAMIC_CACHE)
        .then((c) => c.put(request, clone))
        .catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch {
    return new Response("Offline asset", { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (isCacheable(response)) {
        const clone = response.clone();
        caches
          .open(DYNAMIC_CACHE)
          .then((c) => c.put(request, clone))
          .catch(() => {});
      }
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

// 캐싱 가능 응답 판정:
//   - response.ok && status === 200 (4xx/5xx 차단)
//   - response.type === "basic" (cross-origin opaque 등 차단)
//   - Content-Type이 text/html이 아님 (HTML 캐싱 절대 금지)
function isCacheable(response) {
  if (!response || !response.ok) return false;
  if (response.status !== 200) return false;
  if (response.type !== "basic") return false;
  const ct = response.headers.get("Content-Type") || "";
  if (ct.includes("text/html")) return false;
  return true;
}

// =========================================================
// Push 알림 (Web Push)
// =========================================================
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
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";

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

// (배경 동기화 기능 — 기존 유지)
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-calls") {
    event.waitUntil(
      fetch("/api/calls/sync")
        .then((response) => {
          if (response.ok) {
            console.log("[SW] synced calls successfully");
          }
        })
        .catch((err) => {
          console.warn("[SW] sync failed:", err);
        }),
    );
  }
});
