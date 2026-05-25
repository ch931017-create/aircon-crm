import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// =========================================================
// admin 전용 콜 다중 status 변경.
//
// 권한 정책:
//   - admin only. bulk 작업은 dispatcher 불허 (영향 범위 ↑).
//
// 허용 target status (의도된 제한):
//   - "new"       (대기)
//   - "assigned"  (진행/잡음)
//   - "cancelled" (취소)
//
// "completed" 일괄변경을 의도적으로 제외하는 이유:
//   - 단건 /api/calls/status 의 completed 처리는 다음 부수 효과 발생:
//       1) completed_at 자동 설정
//       2) admin/dispatcher 에게 push 발송 (notify_completion=true)
//       3) happy_call message_log 생성 (해피콜 SMS 트리거)
//       4) 후속 정산 흐름 (/api/calls/settlement 별도) 연계 가능
//   - bulk 로 N건을 완료시키면 push 폭주 + 해피콜 중복 발송 + 정산 누락 위험.
//   - 따라서 완료 처리는 항상 단건 흐름을 유지하고 bulk 에서는 차단.
//
// 처리 정책 (각 ID 별):
//   - deleted_at 있음 → skip (ALREADY_DELETED)
//   - 현재 status === "completed" → skip (COMPLETED_PROTECTED, un-complete 방지)
//   - 현재 status === target → skip (NO_CHANGE)
//   - 그 외 → status 만 update (다른 필드 미터치)
//     · completed_at: source 가 completed 가 아니므로 어차피 null. 손대지 않음.
//     · assigned_to:  hybrid 상태(status≠assigned 이지만 assigned_to 남음) 가능.
//                     이는 admin 의도로 보고 손대지 않음. release 가 필요하면
//                     기존 /api/calls/release API 사용.
//
// 최대 MAX_BULK 건 cap.
// =========================================================

const MAX_BULK = 50;
const ALLOWED_TARGETS = ["new", "assigned", "cancelled"] as const;
type AllowedTarget = (typeof ALLOWED_TARGETS)[number];

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
  const targetStatus = body?.status as string | undefined;

  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json({ error: "MISSING_CALL_IDS" }, { status: 400 });
  }
  if (rawIds.length > MAX_BULK) {
    return NextResponse.json(
      { error: "TOO_MANY", limit: MAX_BULK },
      { status: 400 },
    );
  }
  if (!targetStatus || !ALLOWED_TARGETS.includes(targetStatus as AllowedTarget)) {
    return NextResponse.json(
      { error: "INVALID_STATUS", allowed: ALLOWED_TARGETS },
      { status: 400 },
    );
  }
  const target = targetStatus as AllowedTarget;

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

  const successIds: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const failed: Array<{ id: string; reason: string }> = [];

  // 단건 N≤50 — 정합성/명확한 결과 보고 우선.
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
      skipped.push({ id, reason: "COMPLETED_PROTECTED" });
      continue;
    }
    if (call.status === target) {
      skipped.push({ id, reason: "NO_CHANGE" });
      continue;
    }

    const { error: updateError } = await supabase
      .from("calls")
      .update({ status: target })
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
