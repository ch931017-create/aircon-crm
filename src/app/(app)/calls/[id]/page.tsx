import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CallDetail } from "@/components/calls/CallDetail";
import type { CallRow, ProfileRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CallDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  const supabase = createClient();

  const [{ data: callData }, { data: technicianData }] = await Promise.all([
    supabase.from("calls").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("profiles").select("id, name").eq("role", "technician"),
  ]);

  if (!callData) notFound();

  const technicians = (technicianData ?? []) as Array<Pick<ProfileRow, "id" | "name">>;
  const assigneeName = callData.assigned_to
    ? technicians.find((tech) => tech.id === callData.assigned_to)?.name ?? null
    : null;

  return (
    <section className="space-y-6">
      <CallDetail
        call={callData as CallRow}
        currentUserId={user.id}
        currentUserRole={user.profile.role}
        technicians={technicians}
        assigneeName={assigneeName}
      />
    </section>
  );
}
