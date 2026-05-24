"use client";

import { useEffect, useRef } from "react";
import { loadKakaoMap } from "@/lib/kakao-map";

export interface CallMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  popupHtml?: string;
}

export interface TechnicianMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
}

interface KakaoMapProps {
  callMarkers: CallMarker[];
  technicianMarkers?: TechnicianMarker[];
  height?: number;
}

function getDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const r = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 카카오맵 SDK는 전역 객체. 최소한의 타입만 정의 (any 회피).
type LatLng = { getLat(): number; getLng(): number };
type Map = {
  setBounds(bounds: LatLngBounds): void;
};
type LatLngBounds = {
  extend(latlng: LatLng): void;
  isEmpty(): boolean;
};
type Marker = unknown;

type KakaoMapsNs = {
  Map: new (
    el: HTMLElement,
    opts: { center: LatLng; level: number },
  ) => Map;
  LatLng: new (lat: number, lng: number) => LatLng;
  LatLngBounds: new () => LatLngBounds;
  Marker: new (opts: { map: Map; position: LatLng; title?: string }) => Marker;
  InfoWindow: new (opts: { content: string; removable?: boolean }) => {
    open(map: Map, marker: Marker): void;
  };
  CustomOverlay: new (opts: {
    map: Map;
    position: LatLng;
    content: HTMLElement | string;
    yAnchor?: number;
  }) => unknown;
  event: {
    addListener(target: unknown, type: string, handler: () => void): void;
  };
};

export function KakaoMap({
  callMarkers,
  technicianMarkers = [],
  height = 500,
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    loadKakaoMap()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const kakao = (window as unknown as { kakao: { maps: KakaoMapsNs } })
          .kakao;
        if (!kakao?.maps) return;

        const fallback = { lat: 37.5665, lng: 126.978 }; // 서울시청
        const seed = callMarkers[0] ?? technicianMarkers[0] ?? fallback;

        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(seed.lat, seed.lng),
          level: 7,
        });

        const bounds = new kakao.maps.LatLngBounds();

        // 콜 마커 (기본 빨간 핀)
        callMarkers.forEach((m) => {
          const pos = new kakao.maps.LatLng(m.lat, m.lng);
          const marker = new kakao.maps.Marker({
            map,
            position: pos,
            title: m.label,
          });
          bounds.extend(pos);

          // 가까운 기사 TOP 3 (admin/dispatcher가 보는 경우만 technicianMarkers가 채워짐)
          const nearby = technicianMarkers
            .map((t) => ({
              ...t,
              distance: getDistanceKm(m.lat, m.lng, t.lat, t.lng),
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 3);

          const nearbyHtml = nearby.length
            ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:11px;color:#475569;line-height:1.5"><b style="color:#0f172a">가까운 기사 TOP ${nearby.length}</b><br/>${nearby
                .map(
                  (t) =>
                    `${escapeHtml(t.name)} <span style="color:#0284c7;font-weight:600">${t.distance.toFixed(1)}km</span>`,
                )
                .join("<br/>")}</div>`
            : "";

          const baseHtml = m.popupHtml ?? escapeHtml(m.label ?? "콜");
          const iw = new kakao.maps.InfoWindow({
            content: `<div style="padding:10px;font-size:12px;min-width:180px;max-width:240px;line-height:1.5">${baseHtml}${nearbyHtml}</div>`,
            removable: true,
          });

          kakao.maps.event.addListener(marker, "click", () => {
            iw.open(map, marker);
          });
        });

        // 기사 마커 (CustomOverlay로 다른 모양 — 녹색 라벨)
        technicianMarkers.forEach((t) => {
          const pos = new kakao.maps.LatLng(t.lat, t.lng);
          const content = document.createElement("div");
          content.style.cssText =
            "background:#10b981;color:#fff;padding:4px 10px;border-radius:9999px;font-size:11px;font-weight:600;box-shadow:0 2px 6px rgba(0,0,0,0.25);white-space:nowrap;transform:translateY(-50%)";
          content.textContent = `🛠 ${t.name}`;
          new kakao.maps.CustomOverlay({
            map,
            position: pos,
            content,
            yAnchor: 1,
          });
          bounds.extend(pos);
        });

        const totalMarkers = callMarkers.length + technicianMarkers.length;
        if (totalMarkers > 1 && !bounds.isEmpty()) {
          map.setBounds(bounds);
        }
      })
      .catch((err) => {
        // 콘솔에만 남기고 UI는 빈 지도 유지
        console.warn("[KakaoMap] load failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [callMarkers, technicianMarkers]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: `${height}px` }}
      className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100"
    />
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
