// 브라우저 Web Push 구독 / 해제 헬퍼.
// NEXT_PUBLIC_VAPID_PUBLIC_KEY만 사용 (서버 private 키는 사용 안 함).
// "use client" 표시 불필요 — 함수만 export하므로 caller에서 client component에서 호출.

export type SubscribeReason =
  | "ssr"
  | "unsupported"
  | "no_key"
  | "denied"
  | "server"
  | "timeout_sw_ready"
  | "timeout_permission"
  | "timeout_subscribe"
  | "timeout_server"
  | "exception";

// 단계별 timeout (ms). iPhone PWA는 SW 등록/구독 둘 다 느릴 수 있어 여유.
const TIMEOUT_SW_READY = 10_000;
const TIMEOUT_PERMISSION = 30_000;
const TIMEOUT_SUBSCRIBE = 15_000;
const TIMEOUT_SERVER = 10_000;

// promise + setTimeout race. 타임아웃 시 Error("TIMEOUT_<label>") throw.
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TIMEOUT_${label}`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

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
  console.log("[push] start subscribe");

  // 모든 브라우저 API 존재 검사 — 순서: window → navigator → serviceWorker → PushManager → Notification
  if (typeof window === "undefined") {
    console.log("[push] abort: ssr");
    return { ok: false, reason: "ssr" };
  }
  if (typeof navigator === "undefined") {
    console.log("[push] abort: navigator undefined");
    return { ok: false, reason: "unsupported" };
  }
  if (!("serviceWorker" in navigator)) {
    console.log("[push] abort: serviceWorker not in navigator");
    return { ok: false, reason: "unsupported" };
  }
  if (!("PushManager" in window)) {
    console.log("[push] abort: PushManager not in window");
    return { ok: false, reason: "unsupported" };
  }
  if (typeof Notification === "undefined") {
    console.log("[push] abort: Notification undefined");
    return { ok: false, reason: "unsupported" };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    console.log("[push] abort: no_key (NEXT_PUBLIC_VAPID_PUBLIC_KEY missing)");
    return { ok: false, reason: "no_key" };
  }

  try {
    // step 1: serviceWorker.ready (sw 활성화될 때까지 대기)
    console.log("[push] step 1: serviceWorker.ready ...");
    const registration = await withTimeout(
      navigator.serviceWorker.ready,
      TIMEOUT_SW_READY,
      "SW_READY",
    );
    console.log("[push] step 1 done");

    // step 2: 기존 구독 확인 (있으면 재사용)
    console.log("[push] step 2: getSubscription ...");
    let subscription = await registration.pushManager.getSubscription();
    console.log(
      "[push] step 2 done, hasExistingSubscription:",
      !!subscription,
    );

    if (!subscription) {
      // step 3: 권한 요청 — iOS는 사용자 제스처 안에서만 동작 (호출자가 onClick 안에서 호출)
      console.log("[push] step 3: Notification.requestPermission ...");
      const permission = await withTimeout(
        Notification.requestPermission(),
        TIMEOUT_PERMISSION,
        "PERMISSION",
      );
      console.log("[push] step 3 done, permission:", permission);
      if (permission !== "granted") {
        return { ok: false, reason: "denied" };
      }

      // step 4: pushManager.subscribe (push service에 endpoint 발급 요청)
      console.log("[push] step 4: pushManager.subscribe ...");
      subscription = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(publicKey),
        }),
        TIMEOUT_SUBSCRIBE,
        "SUBSCRIBE",
      );
      console.log("[push] step 4 done, endpoint length:", subscription.endpoint.length);
    }

    // step 5: 서버에 구독 정보 등록
    console.log("[push] step 5: POST /api/push/subscribe ...");
    const json = subscription.toJSON();
    const res = await withTimeout(
      fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          user_agent: navigator.userAgent,
        }),
      }),
      TIMEOUT_SERVER,
      "SERVER",
    );
    console.log("[push] step 5 done, status:", res.status);
    if (!res.ok) return { ok: false, reason: "server" };

    console.log("[push] subscribe success");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[push] subscribe failed:", msg);
    if (msg.startsWith("TIMEOUT_")) {
      const tag = msg.slice("TIMEOUT_".length).toLowerCase();
      // 매핑: SW_READY → timeout_sw_ready 등
      const reason = `timeout_${tag}` as SubscribeReason;
      return { ok: false, reason };
    }
    return { ok: false, reason: "exception" };
  }
}

export async function unsubscribeUserFromPush(): Promise<boolean> {
  // 동기화 정책: 가능한 한 success 반환 (false 는 진짜 catastrophic 케이스만).
  // 이유: "이미 해제됨" / "SW 미준비" 같은 케이스에서 사용자 의도는 "구독 해제" 이므로
  //       UX 상 success 로 처리. 서버는 idempotent.
  try {
    if (typeof window === "undefined") return true;
    if (typeof navigator === "undefined") return true;
    if (!("serviceWorker" in navigator)) return true;

    let registration: ServiceWorkerRegistration;
    try {
      registration = await withTimeout(
        navigator.serviceWorker.ready,
        TIMEOUT_SW_READY,
        "SW_READY",
      );
    } catch (err) {
      // SW 미준비 → 로컬엔 구독이 없는 셈. 사용자 의도(해제) 충족으로 간주.
      console.warn(
        "[push] SW not ready during unsubscribe (treating as success):",
        err,
      );
      return true;
    }

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    const endpoint = subscription.endpoint;

    try {
      await subscription.unsubscribe();
    } catch (err) {
      // 일부 브라우저에서 실패 가능 → 서버 삭제는 계속 시도
      console.warn(
        "[push] subscription.unsubscribe() failed (continuing):",
        err,
      );
    }

    try {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
    } catch (err) {
      console.warn(
        "[push] /api/push/unsubscribe fetch failed (continuing):",
        err,
      );
    }

    return true;
  } catch (err) {
    // 진짜 예상 못 한 catastrophic 케이스만 false.
    console.warn("[push] unsubscribe outer exception:", err);
    return false;
  }
}

// 어떤 환경에서도 throw하지 않음. 알 수 없는 브라우저는 "unsupported" 반환.
export function getPushPermissionState():
  | NotificationPermission
  | "unsupported" {
  try {
    if (typeof window === "undefined") return "default";
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission;
  } catch (err) {
    console.warn("[push] getPushPermissionState exception:", err);
    return "unsupported";
  }
}

// 어떤 환경에서도 throw하지 않음.
export function isPushSupported(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (typeof navigator === "undefined") return false;
    if (!("serviceWorker" in navigator)) return false;
    if (!("PushManager" in window)) return false;
    if (typeof Notification === "undefined") return false;
    return true;
  } catch (err) {
    console.warn("[push] isPushSupported exception:", err);
    return false;
  }
}
