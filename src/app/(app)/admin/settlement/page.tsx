import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettlementDashboard } from "@/components/settlement/SettlementDashboard";
import { SettlementSettings } from "@/components/settlement/SettlementSettings";
import type { CallRow, ProfileRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminSettlementPage() {
  await requireRole("admin");
  const supabase = createClient();

  const responses = await Promise.all([
    supabase.from("calls").select("*").order("completed_at", { ascending: false }),
    supabase.from("profiles").select("id, name, role, cash_ratio, invoice_ratio, card_ratio"),
    supabase
      .from("settlement_settings")
      .select("invoice_processing_fee")
      .eq("id", "default")
      .maybeSingle(),
  ]);

  const calls = (responses[0].data ?? []) as CallRow[];
  const profiles = (responses[1].data ?? []) as ProfileRow[];
  const settingsData = responses[2].data as { invoice_processing_fee?: number } | null;
  const invoiceProcessingFee = settingsData?.invoice_processing_fee ?? 5000;

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">정산 관리</h1>
            <p className="text-sm text-slate-500">기사 정산 비율과 완료된 콜 기반 정산 현황을 확인할 수 있습니다.</p>
          </div>
        </div>
      </div>

      <SettlementDashboard
        calls={calls}
        profiles={profiles.filter((p) => p.role === "technician")}
        invoiceProcessingFee={invoiceProcessingFee}
      />

      <SettlementSettings
        profiles={profiles.filter((p) => p.role === "technician")}
        invoiceProcessingFee={invoiceProcessingFee}
      />
    </section>
  );
}
