import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TrashClient } from "./TrashClient";
import type { CallRow, ProfileRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  // admin / dispatcher만 접근. technician은 자동으로 /로 리다이렉트.
  // 영구삭제는 admin 전용이라 client에 role 전달.
  const me = await requireRole("admin", "dispatcher");

  const supabase = createClient();

  // RLS calls_select_deleted_admin_dispatcher 정책으로 삭제된 콜만 통과
  const [{ data: callsData }, { data: profilesData }] = await Promise.all([
    supabase
      .from("calls")
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("id, name, role"),
  ]);

  const calls = (callsData ?? []) as CallRow[];
  const profiles = (profilesData ?? []) as Array<
    Pick<ProfileRow, "id" | "name" | "role">
  >;

  return (
    <TrashClient
      calls={calls}
      profiles={profiles}
      isAdmin={me.profile.role === "admin"}
    />
  );
}
