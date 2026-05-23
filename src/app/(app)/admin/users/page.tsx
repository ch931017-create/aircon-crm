import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UsersClient } from "./UsersClient";
import type { ProfileRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireRole("admin");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id,name,phone,role,is_active,created_at,approval_status,approved_at,approved_by",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-bold">사용자 관리</h1>
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          조회 실패: {error.message}
        </p>
      </section>
    );
  }

  const profiles = (data ?? []) as Pick<
    ProfileRow,
    | "id"
    | "name"
    | "phone"
    | "role"
    | "is_active"
    | "created_at"
    | "approval_status"
    | "approved_at"
    | "approved_by"
  >[];

  return <UsersClient initialProfiles={profiles} />;
}
