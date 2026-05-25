// 클라이언트 컴포넌트에서 import하면 Next.js 빌드가 실패합니다.
// (VAPID_PRIVATE_KEY 가 client bundle에 들어가는 것을 차단)
import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !VAPID_SUBJECT) {
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  // 강화 옵션 (신규 콜 알림 같은 중요 알림용).
  // 미지정 시 service worker가 default 적용 → 기존 알림(완료/배정) 동작 변화 없음.
  // requireInteraction: 사용자가 닫을 때까지 알림 유지 (데스크톱/일부 모바일).
  // renotify       : 같은 tag 의 새 알림에서 다시 울림 (default: false = silent replace).
  // vibrate        : Android 진동 패턴 [on, off, on, ...] ms. iOS 무시 (시스템 햅틱).
  // actions        : 알림 액션 버튼. Chrome/Edge/Android 지원. iOS Safari PWA 일부.
  //                  service worker notificationclick 에서 event.action 으로 분기.
  requireInteraction?: boolean;
  renotify?: boolean;
  vibrate?: number[];
  actions?: Array<{ action: string; title: string }>;
}

interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// 지정된 profile_id 집합에 푸시 발송.
// - VAPID 미설정 / 구독 0건 → 조용히 종료
// - 발송 실패의 410/404(만료/무효) 응답은 자동으로 해당 구독 삭제
// - 일부 발송 실패는 throw하지 않음 (호출자 흐름 차단 방지)
export async function sendPushToProfiles(
  profileIds: string[],
  payload: PushPayload,
): Promise<void> {
  // [debug] 파이프라인 단계별 로그. Vercel Functions Logs 필터: "[send-push]"
  //   env exists → subscriptions count → per-send result → summary
  // 민감값(키/endpoint 전체)은 로그에 안 찍음. 존재 여부 boolean / endpoint 마스킹만.
  console.log(
    `[send-push] env exists public=${!!VAPID_PUBLIC} private=${!!VAPID_PRIVATE} subject=${!!VAPID_SUBJECT}`,
  );

  if (profileIds.length === 0) {
    console.log("[send-push] 0 profileIds — early return");
    return;
  }
  if (!ensureVapidConfigured()) {
    console.warn(
      "[send-push] VAPID env not configured (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT 누락) — skipping send",
    );
    return;
  }
  console.log(
    `[send-push] start profileIds=${profileIds.length} title="${payload.title}" tag="${payload.tag ?? ""}"`,
  );

  const admin = createAdminClient();
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("profile_id", profileIds);

  if (error) {
    console.warn("[send-push] failed to load subscriptions:", error.message);
    return;
  }
  const subCount = subs?.length ?? 0;
  console.log(
    `[send-push] subscriptions found for profileIds count=${subCount}`,
  );
  if (!subs || subs.length === 0) {
    console.warn(
      "[send-push] no subscriptions for given profileIds — 기사 디바이스가 /settings 에서 알림 구독 완료했는지 push_subscriptions 테이블에서 직접 확인 필요",
    );
    return;
  }

  const payloadStr = JSON.stringify(payload);
  const invalidIds: string[] = [];
  let okCount = 0;
  let failCount = 0;

  // endpoint 일부만 마스킹해서 로그에 노출 (전체는 PII).
  const maskEndpoint = (ep: string) =>
    ep.length > 50 ? `${ep.slice(0, 30)}...${ep.slice(-10)}` : ep;

  await Promise.allSettled(
    (subs as PushSubscriptionRecord[]).map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr,
        );
        okCount++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        const masked = maskEndpoint(sub.endpoint);
        if (status === 404 || status === 410) {
          // 만료/무효 구독 → 정리 대상
          invalidIds.push(sub.id);
          console.log(
            `[send-push] expired endpoint cleanup scheduled status=${status} endpoint=${masked}`,
          );
        } else {
          failCount++;
          console.warn(
            `[send-push] send failed status=${status} endpoint=${masked} body=`,
            (err as { body?: string })?.body,
          );
        }
      }
    }),
  );

  console.log(
    `[send-push] summary ok=${okCount} expired=${invalidIds.length} other_failed=${failCount} total=${subCount}`,
  );

  if (invalidIds.length > 0) {
    const { error: delError } = await admin
      .from("push_subscriptions")
      .delete()
      .in("id", invalidIds);
    if (delError) {
      console.warn(
        `[send-push] cleanup expired subs failed: ${delError.message}`,
      );
    } else {
      console.log(
        `[send-push] expired subs cleaned up count=${invalidIds.length}`,
      );
    }
  }
}

export async function sendPushToProfile(
  profileId: string,
  payload: PushPayload,
): Promise<void> {
  return sendPushToProfiles([profileId], payload);
}
