import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.profile.role !== "admin") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const profileId = body?.profile_id?.toString();
  const cashRatio = Number(body?.cash_ratio ?? null);
  const invoiceRatio = Number(body?.invoice_ratio ?? null);
  const cardRatio = Number(body?.card_ratio ?? null);
  const invoiceProcessingFee = Number(body?.invoice_processing_fee ?? null);

  const supabase = createClient();

  if (profileId) {
    const update: Record<string, number> = {};
    if (Number.isFinite(cashRatio)) update.cash_ratio = cashRatio;
    if (Number.isFinite(invoiceRatio)) update.invoice_ratio = invoiceRatio;
    if (Number.isFinite(cardRatio)) update.card_ratio = cardRatio;

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", profileId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
  }

  if (Number.isFinite(invoiceProcessingFee)) {
    // settlement_settings 테이블은 src/types/database.ts에 명시되어 있지 않아
    // supabase-js가 row 타입을 추론하지 못합니다. 런타임 동작에는 영향 없음.
    const settlementTable = supabase.from("settlement_settings") as unknown as {
      upsert: (
        values: { id: string; invoice_processing_fee: number },
        options: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
    const { error } = await settlementTable.upsert(
      { id: "default", invoice_processing_fee: invoiceProcessingFee },
      { onConflict: "id" },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true });
}
