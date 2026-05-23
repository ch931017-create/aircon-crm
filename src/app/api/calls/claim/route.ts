import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { insertMessageLog, buildAssignmentMessage } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const callId = body.call_id?.toString();
  if (!callId) {
    return NextResponse.json({ error: "call_id가 필요합니다." }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("claim_call", { p_call_id: callId } as any);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  try {
    // 현재 사용자(기사) 정보 조회
    const { data: userData } = await supabase.auth.getUser();
    const techId = userData?.user?.id ?? null;
    let techProfile: any = null;
    if (techId) {
      const { data: profile } = await supabase.from("profiles").select("name, phone").eq("id", techId).maybeSingle();
      techProfile = profile ?? null;
    }

    // 콜 정보 조회
    const { data: callRow } = await supabase.from("calls").select("id, customer_name, phone").eq("id", callId).maybeSingle();

    const msg = buildAssignmentMessage(callRow ?? {}, techProfile ?? {});
    await insertMessageLog(supabase, {
      call_id: callId,
      type: "notification",
      status: "pending",
      technician_id: techId,
      technician_name: msg.technician_name,
      technician_phone: msg.technician_phone,
      customer_name: msg.customer_name,
      customer_phone: msg.customer_phone,
      message_text: msg.message_text,
      payload: { source: "claim_api" },
    } as any);
  } catch (e) {
    // 로그 생성 실패는 실패 응답을 내지 않음
    console.warn('message log insert failed', e);
  }

  return NextResponse.json({ success: true });
}
