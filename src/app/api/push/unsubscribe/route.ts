import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// 본인 구독 삭제. RLS delete_self 정책이 추가 보호.
// 동기화 정책: idempotent.
//   - endpoint 가 비어있어도 success (removed=0)
//   - 매칭되는 row 가 없어도 success (removed=0)
//   - 클라이언트는 "이미 없음" 케이스를 실패로 보지 않게.
export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";

  // endpoint 누락은 입력 오류이지만 동기화 흐름에서 안전 → success(removed=0).
  if (!endpoint) {
    return NextResponse.json({ success: true, removed: 0, reason: "no_endpoint" });
  }

  const supabase = createClient();
  // .select() 추가 → DELETE 된 row 반환받아 removed count 명시
  const { data, error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("profile_id", me.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    removed: data?.length ?? 0,
  });
}
