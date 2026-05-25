import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// admin 전용 콜 다중 soft delete.
//
// =========================================================
// 삭제 권한 정책 (Phase 1+2 시점, 의도된 설계):
//   - admin       : 단건 삭제 가능 + bulk 삭제 가능 (이 API)
//   - dispatcher  : 단건 삭제만 가능 (/api/calls/delete). bulk 불가.
//   - technician  : 삭제 자체 불가 (UI/API/DB 트리거 3중 차단).
//
// dispatcher가 bulk 불가인 이유:
//   - 단건 삭제는 실수의 영향 범위가 작아 dispatcher에도 허용 유지.
//   - bulk는 한 번에 다수 콜에 영향 → admin only 로 엄격 제한.
//   - 만약 향후 dispatcher에도 bulk를 열어주려면 다음을 동시에 변경:
//       1) 이 API의 role 체크에 "dispatcher" 추가
//       2) CallList의 액션바/체크박스 가드(isAdmin)에 dispatcher 포함
//       3) 변경 사유와 함께 운영팀 합의 기록
// =========================================================
//
// 단건 /api/calls/delete 의 처리 정책은 그대로 따름:
//   - 완료콜(status='completed') 거부 (정산 보호)
//   - 이미 삭제된 콜 skip
//   - 그 외 soft delete (deleted_at, deleted_by, delete_reason 채움)
//
// bulk 고유 처리:
//   - 최대 MAX_BULK 건 cap (실수/과부하 방지)
//   - 각 ID 결과를 details로 반환 → UI에서 정확한 안내 가능
//
// hard delete 아님. 삭제된 콜은 휴지통(/calls/trash)에서 복원 가능.

const MAX_BULK = 50;

export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (me.profile.role !== "admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const rawIds: unknown = body?.call_ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json({ error: "MISSING_CALL_IDS" }, { status: 400 });
  }
  if (rawIds.length > MAX_BULK) {
    return NextResponse.json(
      { error: "TOO_MANY", limit: MAX_BULK },
      { status: 400 },
    );
  }
  // 문자열만 + 중복 제거
  const ids = Array.from(
    new Set(
      rawIds.filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      ),
    ),
  );
  if (ids.length === 0) {
    return NextResponse.json({ error: "MISSING_CALL_IDS" }, { status: 400 });
  }

  const supabase = createClient();
  const now = new Date().toISOString();
  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 200)
      : "admin bulk delete";

  const successIds: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const failed: Array<{ id: string; reason: string }> = [];

  // N+1 query — N≤50 이라 운영 부하 미미. 정합성/명확한 결과 보고 우선.
  // batch update로 묶으면 트리거가 일부 row만 거부할 때 결과 보고가 불명확.
  for (const id of ids) {
    const { data: call, error: fetchError } = await supabase
      .from("calls")
      .select("id, status, deleted_at")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      failed.push({ id, reason: fetchError.message });
      continue;
    }
    if (!call) {
      failed.push({ id, reason: "NOT_FOUND" });
      continue;
    }
    if (call.deleted_at) {
      skipped.push({ id, reason: "ALREADY_DELETED" });
      continue;
    }
    if (call.status === "completed") {
      skipped.push({ id, reason: "COMPLETED" });
      continue;
    }

    const { error: updateError } = await supabase
      .from("calls")
      .update({
        deleted_at: now,
        deleted_by: me.id,
        delete_reason: reason,
      })
      .eq("id", id);

    if (updateError) {
      failed.push({ id, reason: updateError.message });
    } else {
      successIds.push(id);
    }
  }

  return NextResponse.json({
    success: successIds.length,
    skipped: skipped.length,
    failed: failed.length,
    details: {
      success: successIds,
      skipped,
      failed,
    },
  });
}
