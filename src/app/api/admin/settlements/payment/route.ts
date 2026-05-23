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
  const action = body?.action === "unpaid" ? "unpaid" : "paid";

  if (callIds.length === 0) {
    return NextResponse.json(
      { error: "call_ids가 비어 있습니다." },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const nowIso = new Date().toISOString();

  const update =
    action === "paid"
      ? { payment_status: "paid" as const, paid_at: nowIso }
      : {
          payment_status: "unpaid" as const,
          paid_at: null,
          // 미수로 되돌리면 정산도 자동 취소
          settlement_status: "pending" as const,
          settled_at: null,
          settled_by: null,
        };

  const { data, error } = await supabase
    .from("calls")
    .update(update)
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
