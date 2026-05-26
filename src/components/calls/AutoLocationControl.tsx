"use client";

import { useEffect, useRef } from "react";

// =========================================================
// 기사 자동 위치 갱신 — invisible hook 컴포넌트.
//
// 운영 정책 (변경):
//   - UI 카드 / 시작·중지 버튼 없음. mount 시 자동 시작 시도.
//   - 권한 상태 사전 확인:
//       · 'granted' → 즉시 watchPosition 시작
//       · 'prompt'  → 시작 (브라우저가 1회 OS 권한 팝업)
//       · 'denied'  → 아무것도 안 함 (반복 팝업/로그 방지)
//   - navigator.permissions 미지원 브라우저 (iOS Safari 일부) → 시도 후
//     watchPosition error callback 에서 자연스럽게 중지.
//   - 에러 발생 시 자동 중지 (반복 팝업/배터리 drain 방지).
//   - 페이지 이탈/unmount 시 clearWatch.
//
// Throttle:
//   - 마지막 저장 후 30s 경과 또는 100m 이상 이동 시에만 저장.
//   - 첫 콜백은 무조건 저장.
//
// PWA 한계:
//   - 백그라운드/잠금화면 상시 추적 불가 (브라우저 보안 정책).
//   - 앱이 활성 상태(visible)인 동안만 동작.
//
// 호출 위치: /calls/map 의 isTechnician 분기에서만 mount.
// =========================================================

const SAVE_THROTTLE_MS = 30_000;
const SAVE_MIN_DISTANCE_M = 100;
const WATCH_TIMEOUT_MS = 10_000;
const WATCH_MAX_AGE_MS = 20_000;

function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function AutoLocationControl() {
  const watchIdRef = useRef<number | null>(null);
  const lastSavedPosRef = useRef<{
    lat: number;
    lng: number;
    time: number;
  } | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    async function saveLocation(lat: number, lng: number) {
      try {
        const res = await fetch("/api/profile/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng }),
        });
        if (res.ok) {
          lastSavedPosRef.current = { lat, lng, time: Date.now() };
        }
      } catch {
        // network 실패는 다음 watch 콜백에서 자연스럽게 재시도됨
      }
    }

    function stop() {
      if (
        typeof navigator !== "undefined" &&
        watchIdRef.current !== null
      ) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
      stoppedRef.current = true;
    }

    function startWatch() {
      if (stoppedRef.current) return;
      if (watchIdRef.current !== null) return;

      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const last = lastSavedPosRef.current;
          const now = Date.now();

          let shouldSave = false;
          if (!last) {
            shouldSave = true;
          } else {
            const timeOk = now - last.time >= SAVE_THROTTLE_MS;
            const distOk =
              distanceMeters(last.lat, last.lng, lat, lng) >=
              SAVE_MIN_DISTANCE_M;
            shouldSave = timeOk || distOk;
          }
          if (shouldSave) void saveLocation(lat, lng);
        },
        (err) => {
          // 에러 발생 → 자동 중지 (반복 팝업/배터리 drain 방지).
          // 로그만 남기고 UI 알림은 띄우지 않음 (invisible 정책).
          console.warn(
            "[auto-location] error code=",
            err?.code,
            "— watch 중지",
          );
          stop();
        },
        {
          enableHighAccuracy: true,
          timeout: WATCH_TIMEOUT_MS,
          maximumAge: WATCH_MAX_AGE_MS,
        },
      );
      watchIdRef.current = id;
    }

    // 권한 상태 사전 확인 → granted/prompt 만 시작.
    // navigator.permissions 미지원 환경에선 직접 startWatch → error callback 에서
    // 자연스럽게 중지.
    const permissions = (
      navigator as Navigator & {
        permissions?: {
          query: (opts: {
            name: PermissionName;
          }) => Promise<PermissionStatus>;
        };
      }
    ).permissions;

    if (permissions?.query) {
      permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          if (status.state === "denied") {
            // 반복 팝업 절대 금지 — 조용히 미시작.
            console.log(
              "[auto-location] permission=denied — 자동 갱신 미시작",
            );
            return;
          }
          // granted | prompt 모두 시도. prompt 면 브라우저가 OS 팝업 1회 띄움.
          startWatch();
        })
        .catch(() => {
          // permissions API 자체 실패 → fallback 으로 시도
          startWatch();
        });
    } else {
      // permissions API 미지원 (iOS Safari 일부) → 직접 시도
      startWatch();
    }

    return () => {
      stop();
    };
  }, []);

  // invisible — DOM 요소 없음.
  return null;
}
