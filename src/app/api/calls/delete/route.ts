import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// 콜 soft delete.
// 권한: admin / dispatcher만 (technician 거부)
// 완료콜(status='completed') 거부 — DB 트리거에서도 이중 차단되지만 API에서 친절한 에러
export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (me.profile.role !== "admin" && me.profile.role !== "dispatcher") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const callId = typeof body?.call_id === "string" ? body.call_id : "";
  const reasonRaw = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!callId) {
    return NextResponse.json({ error: "MISSING_CALL_ID" }, { status: 400 });
  }

  const supabase = createClient();

  const { data: call, error: fetchError } = await supabase
    .from("calls")
    .select("id, status, deleted_at")
    .eq("id", callId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 400 });
  }
  if (!call) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (call.deleted_at) {
    return NextResponse.json({ error: "ALREADY_DELETED" }, { status: 400 });
  }
  if (call.status === "completed") {
    return NextResponse.json(
      { error: "COMPLETED_CALL_CANNOT_BE_DELETED" },
      { status: 400 },
    );
  }

  const { error: updateError } = await supabase
    .from("calls")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: me.id,
      delete_reason: reasonRaw || null,
    })
    .eq("id", callId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
