import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { insertMessageLog, buildHappyCallMessage } from "@/lib/notifications";

const ALLOWED_STATUSES = ["new", "assigned", "completed", "cancelled"] as const;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const callId = body.call_id?.toString();
  const status = body.status?.toString();
  if (!callId || !status) {
    return NextResponse.json({ error: "call_id와 status가 필요합니다." }, { status: 400 });
  }

  if (!ALLOWED_STATUSES.includes(status as typeof ALLOWED_STATUSES[number])) {
    return NextResponse.json({ error: "허용되지 않은 상태값입니다." }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "completed") {
    updateData.completed_at = new Date().toISOString();
  } else {
    updateData.completed_at = null;
  }

  const supabase = createClient();
  const { error } = await supabase.from("calls").update(updateData).eq("id", callId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // 작업완료 시 해피콜 로그 생성 (비동기)
  if (status === "completed") {
    try {
      const { data: callRow } = await supabase.from("calls").select("id, customer_name, phone, assigned_to").eq("id", callId).maybeSingle();

      // 기술자 정보 (가능하면)
      let techProfile: any = null;
      if (callRow?.assigned_to) {
        const { data: profile } = await supabase.from("profiles").select("name, phone").eq("id", callRow.assigned_to).maybeSingle();
        techProfile = profile ?? null;
      }

      const msg = buildHappyCallMessage();
      await insertMessageLog(supabase, {
        call_id: callId,
        type: "happy_call",
        status: "pending",
        technician_id: callRow?.assigned_to ?? null,
        technician_name: techProfile?.name ?? null,
        technician_phone: techProfile?.phone ?? null,
        customer_name: callRow?.customer_name ?? null,
        customer_phone: callRow?.phone ?? null,
        message_text: msg.message_text,
        payload: { source: "status_api" },
      } as any);
    } catch (e) {
      console.warn("happy call log failed", e);
    }
  }

  return NextResponse.json({ success: true });
}
