"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  subscribeUserToPush,
  unsubscribeUserFromPush,
  getPushPermissionState,
  isPushSupported,
} from "@/lib/push-client";
import type { UserRole } from "@/types/database";

interface Props {
  role: UserRole;
  notifyCompletion: boolean;
}

type PermissionState = NotificationPermission | "unsupported";

const REASON_MESSAGE: Record<string, string> = {
  ssr: "지원되지 않는 환경입니다",
  unsupported:
    "이 브라우저는 푸시 알림을 지원하지 않습니다 (iPhone은 홈 화면에 추가된 PWA에서만 가능)",
  no_key: "VAPID 키가 설정되지 않았습니다 (관리자 문의)",
  denied: "알림 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요",
  server: "서버 구독 등록 실패",
  timeout_sw_ready:
    "Service Worker 준비 시간 초과 — 페이지를 새로고침 후 다시 시도해주세요",
  timeout_permission: "권한 응답 시간 초과 — 다시 시도해주세요",
  timeout_subscribe:
    "푸시 구독 시간 초과 — 네트워크 확인 후 다시 시도해주세요",
  timeout_server: "서버 응답 시간 초과 — 잠시 후 다시 시도해주세요",
  exception: "알 수 없는 오류가 발생했습니다",
};

export function SettingsClient({ role, notifyCompletion }: Props) {
  const router = useRouter();
  const [permission, setPermission] = useState<PermissionState>("default");
  const [supported, setSupported] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);
  const [completionEnabled, setCompletionEnabled] = useState(notifyCompletion);

  // (제거됨) callNotifEnabled / callSoundEnabled — 운영 정책 변경. 앱 내부 알림 통째 제거.

  // 동기화 상태 진단:
  //   - localSubEndpoint   : 브라우저 PushSubscription.endpoint
  //   - serverEndpoints    : 서버 DB 에 등록된 본인 endpoint 목록
  //   - mismatch           : 로컬에는 있는데 서버엔 없음 → 재등록 필요
  // 로컬/서버 둘 다 확인되어야 정확한 동기화 안내 가능.
  const [localSubEndpoint, setLocalSubEndpoint] = useState<string | null>(null);
  const [serverEndpoints, setServerEndpoints] = useState<string[] | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // 로컬 + 서버 상태 fetch. 마운트 시 + enable/disable 후 호출.
  async function refetchPushStatus() {
    setStatusLoading(true);
    try {
      // 1) 브라우저 로컬 subscription
      let localEp: string | null = null;
      if (
        typeof navigator !== "undefined" &&
        "serviceWorker" in navigator &&
        typeof window !== "undefined" &&
        "PushManager" in window
      ) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          localEp = sub?.endpoint ?? null;
        } catch (err) {
          console.warn("[settings] local subscription fetch failed:", err);
        }
      }
      setLocalSubEndpoint(localEp);

      // 2) 서버 DB 등록 endpoint 목록
      try {
        const res = await fetch("/api/push/status");
        if (res.ok) {
          const data = (await res.json()) as {
            endpoints?: Array<{ endpoint: string }>;
          };
          setServerEndpoints((data.endpoints ?? []).map((e) => e.endpoint));
        } else {
          setServerEndpoints([]);
        }
      } catch (err) {
        console.warn("[settings] /api/push/status fetch failed:", err);
        setServerEndpoints([]);
      }
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    setPermission(getPushPermissionState());
    setSupported(isPushSupported());
    void refetchPushStatus();
  }, []);

  // 상태 derive
  const localExists = localSubEndpoint !== null;
  // 서버측 본인 등록이 "현재 디바이스의 endpoint" 와 매칭되어야 진짜 동기화 상태.
  // 다른 디바이스 row 만 있는 경우는 currentDeviceServerExists=false 로 본다.
  const currentDeviceServerExists =
    serverEndpoints !== null &&
    localSubEndpoint !== null &&
    serverEndpoints.includes(localSubEndpoint);
  // 서버에 본인 row 가 하나라도 있는지 (다른 디바이스 포함). 운영 안내용 표시.
  const anyServerRecord =
    serverEndpoints !== null && serverEndpoints.length > 0;
  // 재등록 필요 조건: permission=granted + 로컬 있음 + 현재 디바이스가 서버 미등록.
  const mismatch =
    permission === "granted" &&
    localExists &&
    !currentDeviceServerExists &&
    !statusLoading;

  // (제거됨) toggleCallNotif / toggleCallSound — 운영 정책 변경.

  // mismatch 일 때도 동일 함수 호출. subscribeUserToPush 는 로컬 sub 가 있으면
  // step3/4 (permission/subscribe) 스킵하고 step5 (서버 upsert) 만 실행 →
  // 서버 push_subscriptions 에 row 가 새로 등록 (onConflict: endpoint).
  async function handleEnablePush() {
    setBusy(true);
    const wasMismatch = mismatch;
    try {
      const result = await subscribeUserToPush();
      if (result.ok) {
        toast.success(
          wasMismatch ? "푸시가 재등록되었습니다" : "알림이 활성화되었습니다",
        );
      } else {
        const reason = result.reason ?? "";
        const friendly =
          REASON_MESSAGE[reason] ?? `알림 활성화 실패 (${reason || "unknown"})`;
        // reason을 함께 노출 → 운영 디버깅 (사용자가 캡쳐해서 보내면 단계 식별 가능)
        toast.error(`${friendly}\n[${reason || "unknown"}]`);
      }
    } catch (err) {
      // subscribeUserToPush 자체가 throw하지 않도록 설계됐지만, 만일 case 대비
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[settings] handleEnablePush exception:", err);
      toast.error(`알림 활성화 중 오류: ${msg}`);
    } finally {
      // 어떤 경로로든 busy 해제 보장 (iPhone PWA에서 멈춤 방지)
      setBusy(false);
      setPermission(getPushPermissionState());
      // 서버/로컬 상태 재확인 → UI 동기화 표시 즉시 반영
      await refetchPushStatus();
    }
  }

  async function handleDisablePush() {
    setBusy(true);
    const ok = await unsubscribeUserFromPush();
    // Optimistic state update — refetch 결과 늦거나 race 있어도 UI 즉시 일관성 유지.
    //   unsubscribeUserFromPush 가 success(true) 반환 → 로컬/서버 모두 정리되었다고 간주.
    //   refetchPushStatus 가 별개로 한 번 더 동기화해서 실제 상태 보강.
    setLocalSubEndpoint(null);
    setServerEndpoints([]);
    setBusy(false);
    setPermission(getPushPermissionState());
    // 보강 동기화 — 만약 optimistic 과 실제가 다르면 진짜 상태로 정정.
    await refetchPushStatus();
    if (ok) {
      toast.success(
        "알림 구독이 해제되었습니다 (브라우저 권한은 별도로 끄세요)",
      );
    } else {
      // unsubscribeUserFromPush 가 정책적으로 거의 항상 true → false 면 catastrophic.
      toast.error(
        "알림 해제 중 문제가 발생했습니다. 페이지 새로고침 후 다시 시도해주세요",
      );
    }
  }

  async function toggleCompletion(next: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/notification-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify_completion: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setCompletionEnabled(next);
      toast.success(next ? "완료 알림이 켜졌습니다" : "완료 알림이 꺼졌습니다");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setBusy(false);
    }
  }

  const permissionBadge = (() => {
    switch (permission) {
      case "granted":
        return { label: "활성화", cls: "bg-emerald-100 text-emerald-700" };
      case "denied":
        return { label: "차단됨", cls: "bg-rose-100 text-rose-700" };
      case "unsupported":
        return { label: "지원 안 함", cls: "bg-slate-100 text-slate-600" };
      default:
        return { label: "비활성화", cls: "bg-amber-100 text-amber-700" };
    }
  })();

  return (
    <section className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">알림 설정</h1>
        <p className="mt-1 text-sm text-slate-500">
          PWA 푸시 알림은 홈 화면에 설치된 앱에서만 동작합니다.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              브라우저 푸시 알림
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              앱이 닫혀있을 때도 콜 배정·일정 변경·완료 알림을 받습니다.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${permissionBadge.cls}`}
          >
            {permissionBadge.label}
          </span>
        </div>

        {/* 동기화 상태 디버그 — 운영 진단 + 사용자 안내 동시 목적.
            로컬과 서버 둘 다 표시해서 mismatch 케이스를 사용자가 인지 가능. */}
        <div className="mt-4 space-y-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <div>
            브라우저 권한:{" "}
            <strong>
              {permission === "granted"
                ? "허용"
                : permission === "denied"
                  ? "차단"
                  : permission === "unsupported"
                    ? "지원 안 함"
                    : "미허용"}
            </strong>
          </div>
          <div>
            로컬 구독:{" "}
            <strong>
              {statusLoading ? "확인중..." : localExists ? "있음" : "없음"}
            </strong>
          </div>
          <div>
            서버 등록(현재 디바이스):{" "}
            <strong>
              {statusLoading
                ? "확인중..."
                : currentDeviceServerExists
                  ? "있음"
                  : "없음"}
            </strong>
            {!statusLoading && !localExists && anyServerRecord && (
              <span className="ml-2 text-slate-500">
                (다른 디바이스 등록만 있음)
              </span>
            )}
          </div>
          {mismatch && (
            <div className="mt-1 rounded-lg bg-amber-100 px-2 py-1 text-amber-800">
              로컬 구독은 있지만 서버에 등록되지 않았습니다. 아래
              &quot;푸시 재등록&quot; 버튼으로 동기화하세요.
            </div>
          )}
        </div>

        {/* 버튼 분기 정책 (위에서부터 우선):
              1. 미지원                           → 안내 텍스트
              2. 권한 차단                        → 차단 안내
              3. mismatch (local✓ + serverDevice✗) → "푸시 재등록"
              4. local✓ + serverDevice✓           → "알림 구독 해제"
              5. 그 외 (local✗ 등)                → "알림 켜기"
            permission === "granted" 단독 분기 X → 해제 후에도 버튼이 안 바뀌는 버그 회피. */}
        <div className="mt-4">
          {!supported ? (
            <p className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              이 브라우저는 푸시 알림을 지원하지 않습니다.
            </p>
          ) : permission === "denied" ? (
            <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
              알림 권한이 차단되어 있습니다. 브라우저 주소창 좌측 자물쇠 아이콘
              → 사이트 설정 → 알림 허용 후 다시 시도하세요.
            </p>
          ) : mismatch ? (
            // 로컬 sub 있는데 서버 없음 → 재등록 (subscribeUserToPush 가 upsert만 수행)
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={busy}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
            >
              {busy ? "재등록 중..." : "푸시 재등록"}
            </button>
          ) : localExists && currentDeviceServerExists ? (
            // 진짜 동기화된 상태에서만 해제 버튼 노출
            <button
              type="button"
              onClick={handleDisablePush}
              disabled={busy}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {busy ? "해제 중..." : "알림 구독 해제"}
            </button>
          ) : (
            // local 없음 또는 server에 본인 row 없음 → 켜기/재등록
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={busy}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? "활성화 중..." : "알림 켜기"}
            </button>
          )}
        </div>

        {role === "technician" && (
          <p className="mt-4 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            기사 계정은 새 콜 배정·일정 변경 알림이 운영상 필수입니다. 반드시
            알림을 허용해주세요.
          </p>
        )}
      </div>

      {/* (제거됨) "새 콜 알림 (앱 열림 시)" 섹션 — 운영 정책 변경:
            앱 내부 sound / browser Notification / 5분 미배정 재알림 모두 제거됨.
            신규 콜 알림은 Web Push 1 채널로 단일화. (CallList INSERT toast 는 시각 컨펌으로만 유지) */}

      {(role === "admin" || role === "dispatcher") && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                기사 완료 처리 알림
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                기사가 콜을 완료 처리하면 푸시 알림을 받습니다. 끄면 받지
                않습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleCompletion(!completionEnabled)}
              disabled={busy}
              className={
                completionEnabled
                  ? "rounded-full bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                  : "rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              }
            >
              {completionEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
