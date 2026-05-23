import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TaxInvoicesClient } from "./TaxInvoicesClient";
import type { CallRow, ProfileRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function TaxInvoicesPage() {
  const user = await requireRole("admin", "dispatcher");
  const supabase = createClient();

  const [{ data: callsData }, { data: profilesData }] = await Promise.all([
    supabase
      .from("calls")
      .select("*")
      .eq("status", "completed")
      .eq("payment_method", "tax_invoice")
      .order("completed_at", { ascending: false })
      .limit(1000),
    supabase.from("profiles").select("id, name, role"),
  ]);

  const calls = (callsData ?? []) as CallRow[];
  const profiles = (profilesData ?? []) as Array<
    Pick<ProfileRow, "id" | "name" | "role">
  >;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">세금계산서 관리</h1>
        <p className="text-xs text-slate-500">
          결제방식이 세금계산서인 완료 콜만 표시됩니다. 발행 처리는 관리자만
          가능합니다.
        </p>
      </div>

      <TaxInvoicesClient
        calls={calls}
        profiles={profiles}
        currentUserRole={user.profile.role}
      />
    </section>
  );
}
