import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// =========================================================
// 본인 push_subscriptions 등록 상태 조회.
//
// 용도:
//   /settings 페이지에서 로컬 PushSubscription.endpoint 가 서버 DB 에 실제 등록되어
//   있는지 확인 → 브라우저 로컬 상태와 서버 DB 의 동기화 점검.
//
// 권한:
//   인증 사용자 본인 record 만 (RLS push_subscriptions_select_self 정책 적용).
//
// 응답:
//   { count, endpoints: [{ endpoint, created_at, user_agent }] }
//
// 비고:
//   endpoint 는 본인 정보라 RLS 허용. 다른 사용자 endpoint 는 절대 노출 X.
// =========================================================

export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, created_at, user_agent")
    .eq("profile_id", me.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    endpoint: string;
    created_at: string;
    user_agent: string | null;
  }>;

  return NextResponse.json({
    count: rows.length,
    endpoints: rows.map((r) => ({
      endpoint: r.endpoint,
      created_at: r.created_at,
      user_agent: r.user_agent,
    })),
  });
}
