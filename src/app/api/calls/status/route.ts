import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { insertMessageLog, buildHappyCallMessage } from "@/lib/notifications";
import { sendPushToProfiles } from "@/lib/web-push";

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

  // 작업완료 시 push 알림 + 해피콜 로그 생성
  if (status === "completed") {
    // notify_completion=true인 admin/dispatcher에게 push (운영 정책: opt-out 가능)
    try {
      const { data: receivers } = await supabase
        .from("profiles")
        .select("id")
        .in("role", ["admin", "dispatcher"])
        .eq("notify_completion", true)
        .eq("is_active", true);

      if (receivers && receivers.length > 0) {
        const { data: call } = await supabase
          .from("calls")
          .select("customer_name, district")
          .eq("id", callId)
          .maybeSingle();
        const body = call
          ? `${call.district ?? "지역미정"} · ${call.customer_name} 완료 처리됨`
          : "콜이 완료되었습니다";
        await sendPushToProfiles(
          receivers.map((r) => r.id as string),
          {
            title: "콜 완료",
            body,
            url: `/calls/${callId}`,
            tag: `call-${callId}-complete`,
          },
        );
      }
    } catch {
      // push 실패는 무시 — 완료 처리 자체는 성공
    }

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
