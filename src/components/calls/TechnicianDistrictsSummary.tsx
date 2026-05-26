"use client";

import { useMemo } from "react";
import type { CallRow } from "@/types/database";

// 기사별 현재 진행 중인 콜 지역 현황.
//
// 데이터 기준 (운영 정책):
//   - assigned_to IS NOT NULL (배정된 콜)
//   - status NOT IN ('completed', 'cancelled')
//   - deleted_at IS NULL (page query 에서 이미 필터되지만 client 방어)
//
// 지역 집계:
//   - district 우선 (district 없으면 '지역 미정' 으로)
//   - 같은 기사의 같은 지역은 count 합산
//   - 미완료 콜 없는 기사는 숨김
//   - 진행 콜 많은 기사 순으로 정렬
//
// 권한:
//   admin / dispatcher / technician 모두 노출. profiles SELECT RLS 가 다른
//   사용자 이름 조회를 허용해야 함 (CallList 와 동일 패턴이라 안전).

interface TechProfile {
  id: string;
  name: string;
}

interface Props {
  technicians: TechProfile[];
  calls: CallRow[];
}

const HIDDEN_STATUSES = new Set<string>(["completed", "cancelled"]);

export function TechnicianDistrictsSummary({ technicians, calls }: Props) {
  const groups = useMemo(() => {
    // 1) 미완료 + 배정된 콜만 추출
    const activeCalls = calls.filter(
      (c) =>
        c.assigned_to !== null &&
        !HIDDEN_STATUSES.has(c.status) &&
        !c.deleted_at,
    );

    // 2) 기사 ID 별 → 지역 별 count 집계
    const byTech = new Map<string, Map<string, number>>();
    for (const c of activeCalls) {
      const techId = c.assigned_to as string;
      const district = c.district?.trim() || "지역 미정";
      if (!byTech.has(techId)) byTech.set(techId, new Map());
      const distMap = byTech.get(techId)!;
      distMap.set(district, (distMap.get(district) ?? 0) + 1);
    }

    // 3) 기사 목록 기준으로 join + 진행 콜 없는 기사 제외 + 진행 콜 많은 순 정렬
    return technicians
      .map((t) => {
        const distMap = byTech.get(t.id);
        const districts = distMap
          ? Array.from(distMap.entries()).sort((a, b) => b[1] - a[1])
          : [];
        const total = districts.reduce((sum, [, n]) => sum + n, 0);
        return { id: t.id, name: t.name, districts, total };
      })
      .filter((g) => g.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [technicians, calls]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">기사별 진행 콜 지역</h2>
        <span className="text-xs text-slate-500">
          {groups.length}명 진행 중
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
          현재 진행 중인 기사 콜이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <div
              key={g.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900">{g.name}</p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {g.total}건
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {g.districts.map(([dist, n]) => (
                  <span
                    key={dist}
                    className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
                  >
                    {dist}
                    {n > 1 ? ` ${n}건` : ""}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
