import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  CallMapView,
  type TechnicianLocation,
} from "@/components/calls/CallMapView";
import { TechnicianDistrictsSummary } from "@/components/calls/TechnicianDistrictsSummary";
import { AutoLocationControl } from "@/components/calls/AutoLocationControl";
import { timed } from "@/lib/timing";
import type { CallRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CallsMapPage() {
  const tPageStart = Date.now();
  const user = await timed("/calls/map auth", requireUser());
  const supabase = createClient();

  const canSeeTechnicians =
    user.profile.role === "admin" || user.profile.role === "dispatcher";

  // 기사 위치는 admin/dispatcher만 조회 (RLS는 모두 허용하지만 운영 정책상 컬럼 노출 차단)
  // CallMapView가 실제 사용하는 9개 컬럼만 select (payload 70% 축소)
  // technicians 분기는 두 다른 thenable 타입 → timed wrap을 conditional 안에서 분리
  const techPromise = canSeeTechnicians
    ? timed(
        "/calls/map fetch.technicians",
        supabase
          .from("profiles")
          .select("id, name, current_lat, current_lng, location_updated_at")
          .eq("role", "technician")
          .eq("is_active", true)
          .not("current_lat", "is", null)
          .not("current_lng", "is", null),
      )
    : Promise.resolve({ data: [] as TechnicianLocation[] });

  // 기사별 진행 콜 지역 요약용 — 활성/승인 기사 전체 profile (위치 무관).
  // role/is_active/approval_status 정책: 신규 콜 푸시 대상과 동일 기준.
  const techProfilesPromise = timed(
    "/calls/map fetch.tech-profiles",
    supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "technician")
      .eq("is_active", true)
      .eq("approval_status", "approved"),
  );

  const [{ data: callsData }, techResult, { data: techProfilesData }] =
    await Promise.all([
      timed(
        "/calls/map fetch.calls",
        supabase
          .from("calls")
          .select(
            "id,customer_name,district,address,symptom," +
              "status,assigned_to," +
              "latitude,longitude",
          )
          // soft delete 가드 #1: 삭제된 콜은 지도에 표시 X
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(200),
      ),
      techPromise,
      techProfilesPromise,
    ]);
  console.log(`[timing] /calls/map TOTAL: ${Date.now() - tPageStart}ms`);

  const calls = (callsData ?? []) as unknown as CallRow[];
  const technicians = ((techResult as { data: TechnicianLocation[] | null }).data ?? [])
    .filter(
      (t): t is TechnicianLocation =>
        typeof t.current_lat === "number" && typeof t.current_lng === "number",
    );
  const techProfiles = (techProfilesData ?? []) as Array<{
    id: string;
    name: string;
  }>;

  const isTechnician = user.profile.role === "technician";

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">콜 지도</h1>
        <p className="mt-2 text-sm text-slate-500">
          {canSeeTechnicians
            ? "콜 위치와 기사의 현재 위치를 함께 확인하세요. 콜 마커 클릭 시 가까운 기사 거리가 표시됩니다."
            : "좌표가 있는 콜을 카카오맵에서 확인하세요."}
        </p>
      </div>

      {/* 기사만 자동 위치 갱신 컨트롤 노출 (admin/dispatcher 는 본인 위치 추적 무의미). */}
      {isTechnician ? <AutoLocationControl /> : null}

      <CallMapView
        calls={calls}
        technicians={technicians}
        showTechnicians={canSeeTechnicians}
      />

      {/* admin/dispatcher/technician 모두 노출.
          기사 본인은 다른 기사 진행 현황도 참고용으로 보임. */}
      <TechnicianDistrictsSummary
        technicians={techProfiles}
        calls={calls}
      />
    </section>
  );
}
