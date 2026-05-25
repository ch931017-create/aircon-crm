import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CallList } from "@/components/calls/CallList";
import type { CallRow, ProfileRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function MyCallsPage() {
  const user = await requireRole("technician", "admin");
  const supabase = createClient();

  // CallList가 실제 사용하는 18개 컬럼만 select (payload 절반 축소)
  const [{ data: callsData }, { data: profilesData }] = await Promise.all([
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
    supabase.from("profiles").select("id, name, role"),
  ]);

  const calls = (callsData ?? []) as unknown as CallRow[];
  const profiles = (profilesData ?? []) as Array<Pick<ProfileRow, "id" | "name" | "role">>;

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
