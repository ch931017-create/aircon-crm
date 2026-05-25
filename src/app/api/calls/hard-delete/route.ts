import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// =========================================================
// admin 전용 콜 hard delete (복구 불가 영구삭제).
//
// 사용 위치:
//   - 휴지통(/calls/trash) 의 영구삭제 버튼 / 다중 선택 영구삭제.
//   - 활성 콜에서는 절대 호출 금지 (active calls 화면엔 영구삭제 UI 없음).
//
// 권한 정책 (의도된 설계):
//   - admin only. dispatcher 불허.
//   - DB RLS `calls_delete_admin` (003_rls.sql) 가 DELETE 자체를 admin만 허용.
//   - 즉 API/UI 가드 + DB RLS 의 3중 안전망.
//
// 처리 정책 (각 ID 별):
//   - 존재하지 않음 → failed NOT_FOUND
//   - deleted_at IS NULL (활성 콜) → skip ACTIVE_CALL
//     · 활성 콜이 hard delete 되는 것 절대 차단. 휴지통에 있는 콜만 영구삭제 허용.
//   - 그 외 → DELETE
//
// 최대 MAX_BULK 건 cap (실수/과부하 방지).
//
// FK 영향 (사전 확인, 정합성 보장):
//   - message_logs.call_id  : SET NULL (해피콜/SMS 로그 보존, call_id만 NULL)
//   - notifications.call_id : CASCADE (해당 콜 인앱 알림 자동 삭제)
//   - call_photos.call_id   : CASCADE (사진 메타데이터 자동 삭제)
//                             ⚠️ Supabase Storage 실제 파일은 자동 삭제 안 됨.
//                             운영 측 orphan 정리는 별도 작업 (필요 시 월 단위).
// =========================================================

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
  // 방어 코드: rawIds.length 체크와 별개로 dedupe/filter 후 실제 처리 대상으로도
  // 한 번 더 cap 검증. (현재 로직상 도달 불가하지만 추후 리팩토링 시 안전망)
  if (ids.length > MAX_BULK) {
    return NextResponse.json(
      { error: "TOO_MANY", limit: MAX_BULK },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const successIds: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const failed: Array<{ id: string; reason: string }> = [];

  // N+1 query — N≤50 이라 부하 미미. 정확한 결과 보고가 더 중요.
  // 각 ID 별 deleted_at 확인 후 DELETE → 활성 콜 보호.
  for (const id of ids) {
    const { data: call, error: fetchError } = await supabase
      .from("calls")
      .select("id, deleted_at")
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
    // 활성 콜 보호 — 운영상 가장 중요한 가드.
    // hard delete 는 휴지통(deleted_at IS NOT NULL) 콜만 대상.
    if (!call.deleted_at) {
      skipped.push({ id, reason: "ACTIVE_CALL" });
      continue;
    }

    const { error: deleteError } = await supabase
      .from("calls")
      .delete()
      .eq("id", id);

    if (deleteError) {
      failed.push({ id, reason: deleteError.message });
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
