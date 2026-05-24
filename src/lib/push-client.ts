// 브라우저 Web Push 구독 / 해제 헬퍼.
// NEXT_PUBLIC_VAPID_PUBLIC_KEY만 사용 (서버 private 키는 사용 안 함).
// "use client" 표시 불필요 — 함수만 export하므로 caller에서 client component에서 호출.

export type SubscribeReason =
  | "ssr"
  | "unsupported"
  | "no_key"
  | "denied"
  | "server";

// 명시적 ArrayBuffer 반환 — TS 5.6 환경에서 Uint8Array 제네릭(ArrayBufferLike) 추론으로
// BufferSource 호환성 깨지는 것 회피
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) view[i] = rawData.charCodeAt(i);
  return buffer;
}

export async function subscribeUserToPush(): Promise<{
  ok: boolean;
  reason?: SubscribeReason;
}> {
  if (typeof window === "undefined") return { ok: false, reason: "ssr" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { ok: false, reason: "no_key" };

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    // 권한 요청은 사용자 제스처(클릭) 안에서만 동작 (iOS).
    // 호출자가 button onClick 등에서 이 함수를 호출하도록 설계.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKey),
    });
  }

  const json = subscription.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
    }),
  });
  if (!res.ok) return { ok: false, reason: "server" };

  return { ok: true };
}

export async function unsubscribeUserFromPush(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;

  const endpoint = subscription.endpoint;

  try {
    await subscription.unsubscribe();
  } catch {
    // 일부 브라우저에서 실패 가능, 서버 삭제는 계속 시도
  }

  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});

  return true;
}

export function getPushPermissionState():
  | NotificationPermission
  | "unsupported" {
  if (typeof window === "undefined") return "default";
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window;
}
