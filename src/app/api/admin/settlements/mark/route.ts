import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.profile.role !== "admin") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const callIds = Array.isArray(body?.call_ids)
    ? (body.call_ids as unknown[])
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const action = body?.action === "unsettle" ? "unsettle" : "settle";

  if (callIds.length === 0) {
    return NextResponse.json(
      { error: "call_ids가 비어 있습니다." },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const nowIso = new Date().toISOString();

  if (action === "settle") {
    const { data, error } = await supabase
      .from("calls")
      .update({
        settlement_status: "settled" as const,
        settled_at: nowIso,
        settled_by: user.id,
      })
      .in("id", callIds)
      .eq("status", "completed")
      .eq("payment_status", "paid") // 입금 완료된 콜만 정산완료 가능
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const updated = data?.length ?? 0;
    const skipped = callIds.length - updated;
    return NextResponse.json({
      success: true,
      updated,
      skipped,
      action,
      ...(skipped > 0
        ? { warning: "미수건은 정산완료 처리에서 제외되었습니다." }
        : {}),
    });
  }

  // unsettle: 입금 상태 무관하게 되돌리기 허용
  const { data, error } = await supabase
    .from("calls")
    .update({
      settlement_status: "pending" as const,
      settled_at: null,
      settled_by: null,
    })
    .in("id", callIds)
    .eq("status", "completed")
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    updated: data?.length ?? 0,
    action,
  });
}
