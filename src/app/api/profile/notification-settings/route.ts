import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// admin/dispatcher가 자기 notify_completion 토글.
// technician도 호출은 가능하지만 트리거 대상이 아니므로 의미 없음.
// 본인 update는 profiles_update_self RLS + 012 가드 트리거로 안전 (notify_completion은 보호 컬럼 아님).
export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const notifyCompletion =
    typeof body?.notify_completion === "boolean"
      ? body.notify_completion
      : null;

  if (notifyCompletion === null) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ notify_completion: notifyCompletion })
    .eq("id", me.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
