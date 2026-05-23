import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminSettlementsClient } from "./AdminSettlementsClient";
import { SettlementSettings } from "@/components/settlement/SettlementSettings";
import type { CallRow, ProfileRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminSettlementsPage() {
  await requireRole("admin");
  const supabase = createClient();

  const [{ data: callsData }, { data: profilesData }, { data: settingsData }] =
    await Promise.all([
      supabase
        .from("calls")
        .select("*")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(2000),
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "technician"),
      supabase
        .from("settlement_settings")
        .select("invoice_processing_fee")
        .eq("id", "default")
        .maybeSingle(),
    ]);

  const calls = (callsData ?? []) as CallRow[];
  const technicians = (profilesData ?? []) as ProfileRow[];
  const invoiceProcessingFee =
    (settingsData as { invoice_processing_fee?: number } | null)
      ?.invoice_processing_fee ?? 5000;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">기사별 정산 현황</h1>
        <p className="text-xs text-slate-500">
          전체 기사 정산 합계와 콜별 상세 내역을 확인하고 정산완료 처리할 수
          있습니다.
        </p>
      </div>

      <AdminSettlementsClient
        calls={calls}
        technicians={technicians}
        invoiceProcessingFee={invoiceProcessingFee}
      />

      <SettlementSettings
        profiles={technicians}
        invoiceProcessingFee={invoiceProcessingFee}
      />
    </section>
  );
}
