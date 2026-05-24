import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// 로그인 사용자가 자기 push 구독을 등록.
// service-role(admin) 클라이언트로 upsert하는 이유:
//   - 같은 endpoint가 다른 사용자에게 등록되어 있을 수 있음 (브라우저 공유 등).
//     이 경우 RLS의 select_self/insert_self로는 봐도 못 보고 insert도 UNIQUE 충돌.
//     service-role + onConflict: endpoint 로 안전하게 재할당.
//   - 본인 인증은 getCurrentUser()에서 이미 검증되므로 안전.
export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.p256dh === "string" ? body.p256dh : "";
  const auth = typeof body?.auth === "string" ? body.auth : "";
  const userAgent =
    typeof body?.user_agent === "string" ? body.user_agent.slice(0, 500) : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "INVALID_SUBSCRIPTION" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        profile_id: me.id,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
