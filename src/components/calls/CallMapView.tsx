"use client";

import { useMemo } from "react";
import type { CallRow } from "@/types/database";
import { KakaoMap, type CallMarker, type TechnicianMarker } from "./KakaoMap";

export interface TechnicianLocation {
  id: string;
  name: string;
  current_lat: number;
  current_lng: number;
  location_updated_at: string | null;
}

interface CallMapViewProps {
  calls: CallRow[];
  technicians?: TechnicianLocation[];
  showTechnicians?: boolean;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function CallMapView({
  calls,
  technicians = [],
  showTechnicians = false,
}: CallMapViewProps) {
  const callMarkers = useMemo<CallMarker[]>(
    () =>
      calls
        .filter((c) => c.latitude != null && c.longitude != null)
        .map((c) => ({
          id: c.id,
          lat: c.latitude as number,
          lng: c.longitude as number,
          label: c.customer_name,
          popupHtml: `<b>${escapeHtml(c.customer_name)}</b><br/><span style="color:#475569">${escapeHtml(c.district ?? "")} ${escapeHtml(c.address)}</span>${c.symptom ? `<br/><span style="color:#64748b;font-size:11px">${escapeHtml(c.symptom)}</span>` : ""}`,
        })),
    [calls],
  );

  const technicianMarkers = useMemo<TechnicianMarker[]>(
    () =>
      showTechnicians
        ? technicians.map((t) => ({
            id: t.id,
            lat: t.current_lat,
            lng: t.current_lng,
            name: t.name,
          }))
        : [],
    [technicians, showTechnicians],
  );

  const noCoordCalls = calls.filter(
    (c) => c.latitude == null || c.longitude == null,
  );

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">콜 지도</h2>
            <p className="text-sm text-slate-500">
              빨강 핀: 콜 위치 · 녹색 라벨: 기사 현재 위치
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
              콜 {callMarkers.length}건
            </span>
            {showTechnicians && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                기사 {technicianMarkers.length}명
              </span>
            )}
            {noCoordCalls.length > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                좌표 없음 {noCoordCalls.length}건
              </span>
            )}
          </div>
        </div>

        <KakaoMap
          callMarkers={callMarkers}
          technicianMarkers={technicianMarkers}
          height={520}
        />

        {showTechnicians && (
          <p className="mt-3 text-xs text-slate-500">
            콜 마커를 클릭하면 가까운 기사 TOP 3와 거리(km)가 표시됩니다.
          </p>
        )}
      </div>

      {noCoordCalls.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            좌표 없는 콜 ({noCoordCalls.length})
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            주소 geocoding이 실패했거나, migration 015 적용 전에 등록된 콜입니다.
          </p>
          <div className="mt-3 space-y-2">
            {noCoordCalls.slice(0, 20).map((call) => (
              <div
                key={call.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm"
              >
                <p className="font-medium text-slate-900">
                  {call.customer_name}{" "}
                  <span className="text-xs text-slate-500">
                    {call.district ?? "지역 미정"}
                  </span>
                </p>
                <p className="text-xs text-slate-500">{call.address}</p>
              </div>
            ))}
            {noCoordCalls.length > 20 && (
              <p className="text-xs text-slate-500">
                + {noCoordCalls.length - 20}건 더 있음
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
