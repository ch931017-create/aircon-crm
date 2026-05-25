import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToProfiles } from "@/lib/web-push";

// =========================================================
// admin 전용 테스트 푸시 — 콜 등록과 분리해서 푸시 자체 점검.
//
// 사용:
//   POST /api/push/test-technicians  (body 없음)
//   → 활성/승인 technician 전체에게 "🚨 테스트 콜++" 푸시 발송.
//
// 권한:
//   admin only. DB / 콜 데이터 변경 0 (read + push 발송만).
//
// 로그:
//   [push-test] 진입/대상 조회/발송 호출 흐름.
//   sendPushToProfiles 내부의 [send-push] 로그와 함께 확인.
// =========================================================

export async function POST() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (me.profile.role !== "admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  console.log(`[push-test] start by adminId=${me.id}`);

  const admin = createAdminClient();
  const { data: techs, error: techsError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "technician")
    .eq("is_active", true)
    .eq("approval_status", "approved");

  if (techsError) {
    console.warn(`[push-test] technicians query failed: ${techsError.message}`);
    return NextResponse.json({ error: techsError.message }, { status: 500 });
  }

  const techIds = (techs ?? []).map((t) => t.id as string);
  console.log(`[push-test] technicians eligible count=${techIds.length}`);

  if (techIds.length === 0) {
    return NextResponse.json({
      success: 0,
      targets: 0,
      message: "활성/승인 technician 없음 — 사용자 관리에서 확인 필요",
    });
  }

  try {
    await sendPushToProfiles(techIds, {
      title: "🚨 테스트 콜++",
      body: "푸시 테스트입니다.",
      url: "/calls",
      tag: `push-test-${Date.now()}`,
      requireInteraction: true,
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      actions: [
        { action: "open", title: "콜 보기" },
        { action: "dismiss", title: "닫기" },
      ],
    });
    console.log(
      `[push-test] sendPushToProfiles returned targets=${techIds.length} (실발송 결과는 [send-push] 로그 참조)`,
    );
  } catch (err) {
    console.warn("[push-test] sendPushToProfiles exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "push send failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    targets: techIds.length,
    message:
      "발송 시도 완료. 실제 디바이스 도착은 Vercel Logs '[send-push] summary' 와 디바이스 SW 콘솔 '[SW push] received' 확인",
  });
}
