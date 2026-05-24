"use client";

import { useEffect, useRef } from "react";
import { subscribeUserToPush, getPushPermissionState } from "@/lib/push-client";

// 앱 진입 시 1회 자동 처리:
//   - 이미 브라우저 권한이 granted면 push 구독을 서버에 (재)등록 (idempotent)
//   - 권한이 default/denied면 아무 것도 안 함 (iOS는 사용자 클릭 안에서만 권한 요청 가능)
//     → /settings 의 "알림 켜기" 버튼이 fallback
// 모든 role에서 마운트되지만 권한이 없으면 effect 자체가 no-op.
export function PushManager() {
  const triedRef = useRef(false);

  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;

    if (getPushPermissionState() === "granted") {
      subscribeUserToPush().catch(() => {
        // 실패는 조용히 무시 (다음 진입 시 재시도)
      });
    }
  }, []);

  return null;
}
