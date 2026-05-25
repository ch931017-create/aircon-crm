import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MySettlementsClient } from "./MySettlementsClient";
import { timed } from "@/lib/timing";
import type { CallRow, ProfileRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function MySettlementsPage() {
  // 기사 전용 페이지. admin은 별도 /admin/settlements로 전체 조회.
  const tPageStart = Date.now();
  const user = await timed("/my-settlements auth", requireRole("technician"));
  const supabase = createClient();

  // MySettlementsClient + computeCallSettlement/summarizeSettlements 사용 13개 컬럼만 select
  // payload 약 60% 축소 (500건 × 30+ col → 500건 × 13 col)
  const [{ data: callsData }, { data: profileData }, { data: settingsData }] =
    await Promise.all([
      timed(
        "/my-settlements fetch.calls",
        supabase
          .from("calls")
          .select(
            "id,customer_name,district,address," +
              "completed_at," +
              "payment_method,payment_status,settlement_status," +
              "status,assigned_to," +
              "paid_amount,technician_amount,tax_included",
          )
          .eq("assigned_to", user.id) // 1차 가드: 서버 쿼리에서 본인 콜만
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(500),
      ),
      timed(
        "/my-settlements fetch.profile",
        supabase
          .from("profiles")
          .select("id, name, cash_ratio, invoice_ratio, card_ratio")
          .eq("id", user.id)
          .maybeSingle(),
      ),
      timed(
        "/my-settlements fetch.settings",
        supabase
          .from("settlement_settings")
          .select("invoice_processing_fee")
          .eq("id", "default")
          .maybeSingle(),
      ),
    ]);
  console.log(`[timing] /my-settlements TOTAL: ${Date.now() - tPageStart}ms`);

  // 2차 가드: RLS의 calls_select_all 정책으로 다른 콜이 섞일 여지가 0이지만,
  // defense-in-depth로 클라이언트에 넘기기 직전에 본인 콜만 한 번 더 필터.
  const calls = ((callsData ?? []) as unknown as CallRow[]).filter(
    (call) => call.assigned_to === user.id,
  );
  const profile = (profileData ?? null) as Pick<
    ProfileRow,
    "id" | "name" | "cash_ratio" | "invoice_ratio" | "card_ratio"
  > | null;
  const invoiceProcessingFee =
    (settingsData as { invoice_processing_fee?: number } | null)
      ?.invoice_processing_fee ?? 5000;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">내 정산</h1>
        <p className="text-xs text-slate-500">
          본인 완료 콜만 표시됩니다. 정산 비율과 처리비는 관리자가 설정합니다.
        </p>
      </div>

      <MySettlementsClient
        calls={calls}
        profile={profile}
        invoiceProcessingFee={invoiceProcessingFee}
      />
    </section>
  );
}
