import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// =========================================================
// admin 전용 사용자 hard delete.
//
// 권한 정책 (의도된 설계):
//   - admin 만 사용자 삭제 가능
//   - 본인 ID 거부 (CANNOT_DELETE_SELF) — 잠금 사고 방지
//   - 마지막 활성 admin(role=admin AND is_active AND approval_status=approved)
//     이 1명일 때 그 admin 삭제 거부 (CANNOT_DELETE_LAST_ADMIN)
//
// FK 영향 (사전 확인, 모두 안전):
//   - profiles                          : CASCADE (auth.users 삭제 시 자동)
//   - push_subscriptions.profile_id     : CASCADE (알림 구독 자동 정리)
//   - calls.assigned_to/created_by/deleted_by : SET NULL (콜 데이터 보존)
//   - profiles.approved_by              : SET NULL (다른 사용자의 승인 기록 보존)
//   - message_logs.technician_id        : SET NULL (해피콜 로그 보존)
//
// 삭제 흐름:
//   admin.auth.admin.deleteUser(user_id)
//     → auth.users 삭제 → profiles CASCADE 삭제 → push_subscriptions CASCADE 삭제
//     → 나머지 FK 들은 자동 SET NULL
//
// hard delete 이므로 복구 불가. UI 측 강한 confirm 필수.
// =========================================================

export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (me.profile.role !== "admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  if (!userId) {
    return NextResponse.json({ error: "MISSING_USER_ID" }, { status: 400 });
  }

  // 1. 본인 삭제 방지
  if (userId === me.id) {
    return NextResponse.json(
      { error: "CANNOT_DELETE_SELF" },
      { status: 400 },
    );
  }

  const supabase = createClient();

  // 2. 대상 사용자 존재 + role 확인
  const { data: target, error: fetchError } = await supabase
    .from("profiles")
    .select("id, role, name")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 400 });
  }
  if (!target) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // 3. 마지막 admin 가드 (대상이 admin일 때만)
  if (target.role === "admin") {
    const { count, error: countError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true)
      .eq("approval_status", "approved");

    if (countError) {
      return NextResponse.json(
        { error: countError.message },
        { status: 400 },
      );
    }
    // 대상이 active+approved admin 1명에 포함되면 count===1 → 삭제 시 0명 → 차단.
    // 대상이 비활성/미승인 admin이면 count===1이어도 대상이 카운트에 안 들어가 있어 OK.
    if ((count ?? 0) <= 1) {
      // 추가 검증: 대상 자신이 활성 카운트에 포함되어 있는지 다시 fetch
      const { data: targetFull } = await supabase
        .from("profiles")
        .select("is_active, approval_status")
        .eq("id", userId)
        .maybeSingle();
      const targetIsActiveAdmin =
        targetFull?.is_active === true &&
        targetFull?.approval_status === "approved";
      if (targetIsActiveAdmin) {
        return NextResponse.json(
          { error: "CANNOT_DELETE_LAST_ADMIN" },
          { status: 400 },
        );
      }
    }
  }

  // 4. 실제 hard delete (service_role 필요)
  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
