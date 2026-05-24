"use client";

import { useEffect, useRef } from "react";
import { subscribeUserToPush, getPushPermissionState } from "@/lib/push-client";

// 자동 재구독 일시 비활성화 (PC 콜 등록 화면에서 client-side exception 회귀 디버깅 중).
// /settings 화면의 "알림 켜기" 버튼이 단일 진입점.
// 원인 식별 후 true로 되돌리면 모든 페이지 진입 시 자동 재구독 동작.
const ENABLE_AUTO_RESUBSCRIBE = false;

// 어떤 예외도 throw하지 않게 완전 방어. layout 전체 렌더링을 깨뜨리지 않음.
export function PushManager() {
  const triedRef = useRef(false);

  useEffect(() => {
    if (!ENABLE_AUTO_RESUBSCRIBE) return;
    if (triedRef.current) return;
    triedRef.current = true;

    // setTimeout으로 페이지 hydration / 다른 컴포넌트 마운트와 분리.
    // 1.5s 후 idle 시점에 시도.
    const timer = setTimeout(() => {
      try {
        const state = getPushPermissionState();
        if (state !== "granted") return;
        subscribeUserToPush().catch((err) => {
          console.warn("[PushManager] auto resubscribe rejected:", err);
        });
      } catch (err) {
        console.warn("[PushManager] auto effect exception:", err);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
