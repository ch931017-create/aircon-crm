"use client";

import { useEffect, useRef } from "react";

// 기사 계정 진입 시 1회 자동 위치 저장.
// - navigator.geolocation 권한 거부 / 미지원 / 실패 시 조용히 무시
// - 같은 탭 세션 안에서 1회만 시도 (중복 호출 방지)
// - admin/dispatcher에게는 mount 안 됨 (layout에서 조건부 렌더링)
export function LocationUpdater() {
  const triedRef = useRef(false);

  useEffect(() => {
    if (triedRef.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    triedRef.current = true;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await fetch("/api/profile/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          });
        } catch {
          // network 실패는 무시 (다음 진입 시 재시도됨)
        }
      },
      () => {
        // 권한 거부 등은 조용히 무시. 수동 "내 위치 갱신" 버튼이 fallback.
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 },
    );
  }, []);

  return null;
}
