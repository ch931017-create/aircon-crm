import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CallList } from "@/components/calls/CallList";
import type { CallRow, ProfileRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function MyCallsPage() {
  const user = await requireRole("technician", "admin");
  const supabase = createClient();

  const [{ data: callsData }, { data: profilesData }] = await Promise.all([
    supabase
      .from("calls")
      .select("*")
      .eq("assigned_to", user.id)
      .order("created_at", { ascending: false })
      .limit(400),
    supabase.from("profiles").select("id, name, role"),
  ]);

  const calls = (callsData ?? []) as CallRow[];
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
