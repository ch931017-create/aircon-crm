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

  // 새 콜 알림(앱 열림 상태에서의 native Notification + sound).
  // CallList와 localStorage로 공유. 기본값: 알림 OFF, 알림음 ON.
  const [callNotifEnabled, setCallNotifEnabled] = useState<boolean>(false);
  const [callSoundEnabled, setCallSoundEnabled] = useState<boolean>(true);

  useEffect(() => {
    setPermission(getPushPermissionState());
    setSupported(isPushSupported());
    if (typeof window !== "undefined") {
      const n = window.localStorage.getItem("callNotificationEnabled");
      if (n !== null) setCallNotifEnabled(n === "true");
      const s = window.localStorage.getItem("callNotificationSoundEnabled");
      if (s !== null) setCallSoundEnabled(s === "true");
    }
  }, []);

  function toggleCallNotif(next: boolean) {
    setCallNotifEnabled(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "callNotificationEnabled",
        next ? "true" : "false",
      );
    }
    // ON으로 켤 때 브라우저 권한이 default면 요청 (사용자 클릭 컨텍스트 안)
    if (
      next &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().then((p) => setPermission(p));
    }
  }

  function toggleCallSound(next: boolean) {
    setCallSoundEnabled(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "callNotificationSoundEnabled",
        next ? "true" : "false",
      );
    }
  }

  async function handleEnablePush() {
    setBusy(true);
    try {
      const result = await subscribeUserToPush();
      if (result.ok) {
        toast.success("알림이 활성화되었습니다");
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
    }
  }

  async function handleDisablePush() {
    setBusy(true);
    const ok = await unsubscribeUserFromPush();
    setBusy(false);
    setPermission(getPushPermissionState());
    if (ok) {
      toast.success("알림 구독이 해제되었습니다 (브라우저 권한은 별도로 끄세요)");
    } else {
      toast.error("알림 비활성화 실패");
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

        <div className="mt-4">
          {!supported ? (
            <p className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              이 브라우저는 푸시 알림을 지원하지 않습니다.
            </p>
          ) : permission === "granted" ? (
            <button
              type="button"
              onClick={handleDisablePush}
              disabled={busy}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              알림 구독 해제
            </button>
          ) : permission === "denied" ? (
            <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
              알림 권한이 차단되어 있습니다. 브라우저 주소창 좌측 자물쇠 아이콘
              → 사이트 설정 → 알림 허용 후 다시 시도하세요.
            </p>
          ) : (
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={busy}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              알림 켜기
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

      {/* 신규: 앱 열림 시 새 콜 알림 (CallList realtime과 연동, localStorage) */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            새 콜 알림 (앱 열림 시)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            전체콜 화면이 열려있을 때 새 콜 등록·미선점 재알림을 받습니다.
            브라우저 native 알림과 알림음을 따로 끌 수 있습니다.
          </p>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div className="flex items-center justify-between gap-3">
            <span>브라우저 알림</span>
            <button
              type="button"
              onClick={() => toggleCallNotif(!callNotifEnabled)}
              className={
                callNotifEnabled
                  ? "rounded-full bg-brand-600 px-4 py-1 text-xs font-semibold text-white"
                  : "rounded-full border border-slate-300 bg-white px-4 py-1 text-xs text-slate-600"
              }
            >
              {callNotifEnabled ? "ON" : "OFF"}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span>알림음</span>
            <button
              type="button"
              onClick={() => toggleCallSound(!callSoundEnabled)}
              className={
                callSoundEnabled
                  ? "rounded-full bg-brand-600 px-4 py-1 text-xs font-semibold text-white"
                  : "rounded-full border border-slate-300 bg-white px-4 py-1 text-xs text-slate-600"
              }
            >
              {callSoundEnabled ? "ON" : "OFF"}
            </button>
          </div>
          {callNotifEnabled && permission === "denied" && (
            <p className="mt-3 text-xs text-rose-600">
              브라우저 알림 권한이 차단되어 있어 native 알림이 표시되지 않습니다.
              위 &quot;브라우저 푸시 알림&quot; 안내대로 권한을 허용해주세요.
            </p>
          )}
        </div>
      </div>

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
