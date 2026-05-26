"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// =========================================================
// 기사 자동 위치 갱신 컨트롤.
//
// 운영 정책:
//   - 페이지 진입 시 자동 권한 요청 X. 사용자가 "시작" 버튼을 명시적으로 눌러야 작동.
//   - watchPosition 콜백마다 throttle:
//       · 마지막 저장 후 SAVE_THROTTLE_MS(30s) 경과
//       · 또는 마지막 저장 위치에서 SAVE_MIN_DISTANCE_M(100m) 이상 이동
//     둘 중 하나라도 만족하면 서버 저장. 첫 콜백은 무조건 저장.
//   - 권한 거부 / overlay 차단 / timeout 발생 시:
//       자동 갱신 즉시 중지 + 한글 안내. 반복 팝업/배터리 drain 방지.
//   - 페이지 이탈 / unmount 시 clearWatch.
//
// PWA 한계 (브라우저 보안 정책):
//   - 백그라운드/잠금화면 상시 추적 불가. 앱이 활성 상태(visible)인 동안만 watchPosition 동작.
//   - iOS/Android Chrome 모두 동일.
//   - 운영상 "출동 중인 기사"가 앱을 켜둔 상태에서만 의미 있음.
// =========================================================

const SAVE_THROTTLE_MS = 30_000; // 최소 30초 간격
const SAVE_MIN_DISTANCE_M = 100; // 또는 100m 이상 이동
const WATCH_TIMEOUT_MS = 10_000;
const WATCH_MAX_AGE_MS = 20_000; // 캐시된 위치 허용 최대

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
  const [active, setActive] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveCount, setSaveCount] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  const lastSavedPosRef = useRef<{
    lat: number;
    lng: number;
    time: number;
  } | null>(null);

  function stop() {
    if (typeof navigator !== "undefined" && watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setActive(false);
  }

  async function saveLocation(lat: number, lng: number) {
    try {
      const res = await fetch("/api/profile/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
      });
      if (res.ok) {
        const now = Date.now();
        setLastSavedAt(now);
        setSaveCount((c) => c + 1);
        lastSavedPosRef.current = { lat, lng, time: now };
      }
    } catch {
      // network 실패는 다음 watch 콜백에서 자연스럽게 재시도됨
    }
  }

  function start() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("브라우저가 위치 정보를 지원하지 않습니다.");
      return;
    }
    if (watchIdRef.current !== null) return; // 이미 동작 중

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const last = lastSavedPosRef.current;
        const now = Date.now();

        let shouldSave = false;
        if (!last) {
          shouldSave = true; // 첫 콜백
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
        // 자동 갱신 정책: 에러 시 즉시 중지 (반복 팝업 / 배터리 drain 방지).
        let msg: string;
        switch (err?.code) {
          case 1:
            msg = "위치 권한이 거부되어 자동 갱신을 중지합니다.";
            break;
          case 2:
            msg = "위치를 확인할 수 없어 자동 갱신을 중지합니다.";
            break;
          case 3:
            msg = "위치 요청 시간 초과로 자동 갱신을 중지합니다.";
            break;
          default:
            msg = "위치 요청이 차단되어 자동 갱신을 중지합니다.";
        }
        toast.error(msg);
        stop();
      },
      {
        enableHighAccuracy: true,
        timeout: WATCH_TIMEOUT_MS,
        maximumAge: WATCH_MAX_AGE_MS,
      },
    );
    watchIdRef.current = id;
    setActive(true);
    toast.message("자동 위치 갱신을 시작했습니다.");
  }

  // unmount cleanup — 페이지 이탈 시 watchPosition 해제.
  useEffect(() => {
    return () => stop();
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            자동 위치 갱신
            <span
              className={
                active
                  ? "ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                  : "ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600"
              }
            >
              {active ? "동작 중" : "중지됨"}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {lastSavedAt
              ? `마지막 갱신: ${new Date(lastSavedAt).toLocaleTimeString(
                  "ko-KR",
                )} · 누적 ${saveCount}회`
              : "시작을 누르면 30초/100m 단위로 위치가 자동 저장됩니다."}
          </p>
        </div>
        <div className="flex gap-2">
          {active ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              중지
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              시작
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        ※ 앱이 켜져 있고 화면이 활성 상태인 동안만 동작. 잠금화면/백그라운드
        추적은 브라우저 정책상 불가.
      </p>
    </div>
  );
}
