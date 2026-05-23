"use client";

import { useMemo } from "react";
import type { CallRow } from "@/types/database";

interface CallMapViewProps {
  calls: CallRow[];
}

export function CallMapView({ calls }: CallMapViewProps) {
  const points = useMemo(
    () => calls.filter((call) => call.latitude != null && call.longitude != null),
    [calls],
  );

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    const lats = points.map((point) => point.latitude!);
    const lngs = points.map((point) => point.longitude!);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      minLat: minLat - 0.02,
      maxLat: maxLat + 0.02,
      minLng: minLng - 0.02,
      maxLng: maxLng + 0.02,
    };
  }, [points]);

  const markers = useMemo(() => {
    if (!bounds) return [];
    return points.map((call) => {
      const left = ((call.longitude! - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
      const top = 100 - ((call.latitude! - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;
      return { call, left: Math.min(96, Math.max(2, left)), top: Math.min(96, Math.max(2, top)) };
    });
  }, [bounds, points]);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">콜 지도</h2>
            <p className="text-sm text-slate-500">위치 좌표가 있는 콜을 간략한 지도 뷰에 표시합니다.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            표시된 콜 {points.length}건
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 p-6" style={{ minHeight: 420 }}>
          {!points.length ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              좌표가 있는 콜이 없습니다.
            </div>
          ) : (
            <div className="relative h-full w-full rounded-3xl bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100">
              <div className="absolute inset-0 opacity-30">
                <div className="h-full w-full bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.35),_transparent_35%)]" />
              </div>
              {markers.map((marker) => (
                <div
                  key={marker.call.id}
                  className="absolute flex flex-col items-center gap-1"
                  style={{ left: `${marker.left}%`, top: `${marker.top}%`, transform: "translate(-50%, -50%)" }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white shadow-lg">
                    {marker.call.district ? marker.call.district.slice(0, 2) : "콜"}
                  </div>
                  <div className="w-28 rounded-2xl border border-slate-200 bg-white/90 p-2 text-[11px] text-slate-700 shadow-sm">
                    <p className="font-semibold leading-4">{marker.call.customer_name}</p>
                    <p className="truncate leading-4 text-slate-500">{marker.call.symptom ?? "증상 없음"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">좌표가 있는 콜</h3>
          <div className="mt-4 space-y-3">
            {points.map((call) => (
              <div key={call.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-slate-900">{call.district ?? "지역 미정"}</p>
                <p className="text-sm text-slate-500">{call.address}</p>
                <p className="mt-2 text-xs text-slate-600">Lat {call.latitude?.toFixed(4)}, Lng {call.longitude?.toFixed(4)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">좌표 없는 콜</h3>
          <div className="mt-4 space-y-3">
            {calls.filter((call) => call.latitude == null || call.longitude == null).map((call) => (
              <div key={call.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-slate-900">{call.district ?? "지역 미정"}</p>
                <p className="text-sm text-slate-500">{call.address}</p>
                <p className="mt-2 text-xs text-slate-600">좌표 정보가 없습니다.</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
