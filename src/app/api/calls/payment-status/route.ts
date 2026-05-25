import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// 기사가 본인 콜의 입금 상태(payment_status)를 미수↔입금완료로 토글.
// admin/dispatcher도 이 API 통과 가능 (운영 편의), 단 admin은 기존
// /api/admin/settlements/payment를 사용하는 것이 일관.
//
// settlement_status는 절대 변경하지 않음 — 016 DB 트리거가 추가로 차단.
// 정산완료(settled)된 콜은 미수로 되돌릴 수 없음 (운영 정합성 가드).
export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const callId = typeof body?.call_id === "string" ? body.call_id : "";
  const action = body?.action === "unpaid" ? "unpaid" : "paid";

  if (!callId) {
    return NextResponse.json({ error: "MISSING_CALL_ID" }, { status: 400 });
  }

  const supabase = createClient();

  const { data: call, error: fetchError } = await supabase
    .from("calls")
    .select("id, status, assigned_to, settlement_status")
    .eq("id", callId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 400 });
  }
  if (!call) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (call.status !== "completed") {
    return NextResponse.json(
      { error: "ONLY_COMPLETED_CALL_ALLOWED" },
      { status: 400 },
    );
  }

  // technician은 본인 콜만 / admin·dispatcher는 모든 콜
  const isOwner = call.assigned_to === me.id;
  const isPrivileged =
    me.profile.role === "admin" || me.profile.role === "dispatcher";
  if (!isPrivileged && !isOwner) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // 정산완료된 콜은 미수로 되돌리기 금지 (admin에게 정산취소 요청 필요)
  if (action === "unpaid" && call.settlement_status === "settled") {
    return NextResponse.json(
      { error: "ALREADY_SETTLED_CANNOT_UNPAID" },
      { status: 400 },
    );
  }

  const update =
    action === "paid"
      ? { payment_status: "paid" as const, paid_at: new Date().toISOString() }
      : { payment_status: "unpaid" as const, paid_at: null };

  const { error: updateError } = await supabase
    .from("calls")
    .update(update)
    .eq("id", callId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, action });
}
