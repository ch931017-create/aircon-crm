import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// 휴지통 복원.
// 권한: admin / dispatcher만 (technician은 휴지통 조회 자체가 RLS로 차단)
// 복원 시 deleted_at / deleted_by / delete_reason 모두 NULL
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

  if (!callId) {
    return NextResponse.json({ error: "MISSING_CALL_ID" }, { status: 400 });
  }

  const supabase = createClient();

  // 존재 + 실제 삭제된 콜인지 확인 (RLS calls_select_deleted_admin_dispatcher 통과 필요)
  const { data: call, error: fetchError } = await supabase
    .from("calls")
    .select("id, deleted_at")
    .eq("id", callId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 400 });
  }
  if (!call) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!call.deleted_at) {
    return NextResponse.json({ error: "NOT_DELETED" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("calls")
    .update({
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
    })
    .eq("id", callId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
