import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (
    !user ||
    (user.profile.role !== "admin" && user.profile.role !== "dispatcher")
  ) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const callId = body?.call_id?.toString();
  if (!callId) {
    return NextResponse.json({ error: "call_id가 필요합니다." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body?.issued === "boolean") {
    update.tax_invoice_issued = body.issued;
    update.tax_invoice_issued_at = body.issued ? new Date().toISOString() : null;
    update.tax_invoice_issued_by = body.issued ? user.id : null;
  }

  if (typeof body?.memo === "string") {
    update.tax_invoice_memo = body.memo.trim() === "" ? null : body.memo;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "변경할 항목이 없습니다." },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("calls")
    .update(update)
    .eq("id", callId)
    .eq("payment_method", "tax_invoice");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
