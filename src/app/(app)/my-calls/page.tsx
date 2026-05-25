import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CallList } from "@/components/calls/CallList";
import { timed } from "@/lib/timing";
import { getProfilesList } from "@/lib/profiles-cache";
import type { CallRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function MyCallsPage() {
  const tPageStart = Date.now();
  const user = await timed("/my-calls auth", requireRole("technician", "admin"));
  const supabase = createClient();

  // CallList가 실제 사용하는 18개 컬럼만 select (payload 절반 축소)
  // profiles는 unstable_cache(60s, tag:"profiles")로 nav당 DB 왕복 제거
  const [{ data: callsData }, profiles] = await Promise.all([
    timed(
      "/my-calls fetch.calls",
      supabase
        .from("calls")
        .select(
          "id,customer_name,phone,address,district,symptom," +
            "preferred_time,memo," +
            "estimated_amount,paid_amount,customer_amount," +
            "happy_call_checked," +
            "status,assigned_to,created_at," +
            "scheduled_date," +
            "latitude,longitude",
        )
        .eq("assigned_to", user.id)
        .order("created_at", { ascending: false })
        .limit(400),
    ),
    timed("/my-calls fetch.profiles", getProfilesList()),
  ]);
  console.log(`[timing] /my-calls TOTAL: ${Date.now() - tPageStart}ms`);

  const calls = (callsData ?? []) as unknown as CallRow[];

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">내 콜</h1>
        <p className="text-xs text-slate-500">내게 배정된 콜 {calls.length}건</p>
      </div>

      <CallList
        currentUserId={user.id}
        currentUserRole={user.profile.role}
        initialCalls={calls}
        profiles={profiles}
        filterMine
      />
    </section>
  );
}
