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

  // "좌표 없는 콜" 섹션 제거 (운영 정책):
  //   기사별 진행 콜 지역 요약 (TechnicianDistrictsSummary) 으로 대체.
  //   미좌표 콜은 더 이상 운영상 표시 불필요 (geocoding backfill 흐름이 안정화됨).

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
    </div>
  );
}
