"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCallSchema } from "@/lib/schemas";
import { geocodeAddress } from "@/lib/geocoding";
import { sendPushToProfile, sendPushToProfiles } from "@/lib/web-push";

export interface CreateCallState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  // 매 응답마다 새 reference 보장 → CallForm의 useEffect dep 정확 트리거
  ts?: number;
}

export async function createCallAction(
  _prev: CreateCallState,
  formData: FormData,
): Promise<CreateCallState> {
  const raw = {
    customer_name: formData.get("customer_name"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    district: formData.get("district"),
    symptom: formData.get("symptom"),
    preferred_time: formData.get("preferred_time"),
    memo: formData.get("memo"),
    estimated_amount: formData.get("estimated_amount"),
  };

  const parsed = createCallSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { error: "입력값을 확인하세요", fieldErrors, ts: Date.now() };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다.", ts: Date.now() };

  const input = parsed.data;

  // (1) insert 먼저 — latitude/longitude는 null로 두고 즉시 응답.
  //     체감 속도 개선: geocoding await 제거 (1~2초 단축)
  const { data: inserted, error } = await supabase
    .from("calls")
    .insert({
      customer_name: input.customer_name,
      phone: input.phone,
      address: input.address,
      district: input.district ?? null,
      symptom: input.symptom ?? null,
      // 정시 단위로 정규화 (브라우저 step="3600" 우회 시도 대비)
      preferred_time: input.preferred_time
        ? (() => {
            const d = new Date(input.preferred_time);
            d.setMinutes(0, 0, 0);
            return d.toISOString();
          })()
        : null,
      memo: input.memo ?? null,
      estimated_amount: input.estimated_amount ?? null,
      paid_amount: null,
      status: "new",
      assigned_to: null,
      created_by: user.id,
      latitude: null,
      longitude: null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return {
      error: `등록 실패: ${error?.message ?? "unknown"}`,
      ts: Date.now(),
    };
  }

  // (2) 백그라운드 geocoding — fire-and-forget.
  //     실패해도 콜 등록은 이미 성공. lat/lng는 1~2초 후 채워짐.
  //     service_role(createAdminClient)로 update — RLS / cookie 만료 영향 0.
  //     Vercel serverless 환경에서 response 후 instance가 즉시 frozen될 수 있어
  //     drop될 가능성 ~5%. 미수신 시 lat/lng가 NULL로 유지 (지도/거리에만 영향).
  //     운영상 1~2초 늦게 채워지는 것 허용.
  const callId = inserted.id as string;
  const addressForGeocode = input.address;
  void (async () => {
    try {
      const geo = await geocodeAddress(addressForGeocode);
      if (!geo) return;
      const admin = createAdminClient();
      const { error: updateError } = await admin
        .from("calls")
        .update({ latitude: geo.lat, longitude: geo.lng })
        .eq("id", callId);
      if (updateError) {
        console.warn(
          "[geocode-backfill] update failed:",
          callId,
          updateError.message,
        );
      }
    } catch (err) {
      console.warn("[geocode-backfill] exception:", callId, err);
    }
  })();

  // (3) 신규 콜 푸시 — 활성 승인 technician 전체에게 발송.
  //     운영 정책:
  //       - 콜은 자동배차가 아닌 수동 선점(claim) 모델 → 등록 즉시 기사들이 알아야 잡음.
  //       - admin/dispatcher 는 발송 대상 아님 (등록한 본인이 dispatcher 인 경우 다수).
  //       - technician 은 push opt-out 컬럼 없음 (운영 정책: 무조건 수신).
  //     민감정보 보호:
  //       - title 에 지역구(district) 만 노출, 그 외 정보 노출 X.
  //       - body 는 일반 안내문 (고객명/전화/주소/증상 미포함).
  //     성능:
  //       - service_role admin client 로 RLS 우회하여 technician id 조회.
  //       - sendPushToProfiles 가 Promise.allSettled 로 N 동시 발송 (~1s 이내).
  //       - 410/404 endpoint 자동 cleanup 포함.
  //     실패 처리:
  //       - try/catch 로 흡수. push 실패가 콜 등록 응답에 영향 0.
  try {
    const adminForPush = createAdminClient();
    const { data: techs } = await adminForPush
      .from("profiles")
      .select("id")
      .eq("role", "technician")
      .eq("is_active", true)
      .eq("approval_status", "approved");

    const techIds = (techs ?? []).map((t) => t.id as string);
    if (techIds.length > 0) {
      const district = input.district?.trim();
      // 🚨 prefix — 잠금화면 / Android notification tray 시인성 강화 목적.
      // 신규 콜은 기사가 빠르게 인지해야 하는 가장 중요한 푸시이므로 의도된 강조.
      const title = district ? `🚨 ${district} 콜++` : "🚨 신규 콜++";
      await sendPushToProfiles(techIds, {
        title,
        // 민감정보 미포함. 상세는 앱에서 확인.
        body: "새로운 콜이 등록됐습니다. 앱에서 확인하세요.",
        url: `/calls/${callId}`,
        // callId 기반 tag — 다른 콜 알림에 덮이지 않음.
        tag: `new-call-${callId}`,
        // 중요 알림: 사용자가 닫을 때까지 유지 + 진동.
        // 브라우저/OS 정책상 강제 소리 재생은 불가 (시스템 사운드/햅틱 설정 의존).
        requireInteraction: true,
        renotify: true,
        vibrate: [200, 100, 200, 100, 200],
        actions: [
          { action: "open", title: "콜 보기" },
          { action: "dismiss", title: "닫기" },
        ],
      });
    }
  } catch (err) {
    console.warn("[create-call] new-call push failed:", callId, err);
  }

  // redirect 제거 — client(CallForm)가 success 감지 후 form reset + router.refresh
  revalidatePath("/calls");
  return { success: true, ts: Date.now() };
}

export interface CallActionState {
  error?: string;
}

export async function assignCallAction(
  _prev: CallActionState,
  formData: FormData,
): Promise<CallActionState> {
  const callId = formData.get("call_id")?.toString();
  const technicianId = formData.get("technician_id")?.toString();

  if (!callId || !technicianId) {
    return { error: "기사 선택 후 다시 시도해주세요." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("assign_call_to_technician", {
    p_call_id: callId,
    p_technician_id: technicianId,
  } as any);

  if (error) {
    const message =
      error.code === "P0001"
        ? "이미 다른 기사에게 배정되었습니다."
        : `배정 실패: ${error.message}`;
    return { error: message };
  }

  // 배정된 기사에게 push (technician은 알림 OFF 불가 — 운영 정책)
  // sendPushToProfile은 throw하지 않으므로 redirect 흐름에 영향 없음
  try {
    const { data: call } = await supabase
      .from("calls")
      .select("customer_name, address, district")
      .eq("id", callId)
      .maybeSingle();
    const body = call
      ? `${call.district ?? "지역미정"} · ${call.customer_name} (${call.address})`
      : "새 콜이 배정되었습니다";
    await sendPushToProfile(technicianId, {
      title: "새 콜 배정",
      body,
      url: `/calls/${callId}`,
      tag: `call-${callId}-assigned`,
    });
  } catch {
    // push 실패는 무시 — 배정 자체는 성공
  }

  revalidatePath(`/calls/${callId}`);
  revalidatePath("/calls");
  revalidatePath("/my-calls");
  redirect(`/calls/${callId}`);
}

export async function changeCallStatusAction(
  _prev: CallActionState,
  formData: FormData,
): Promise<CallActionState> {
  const callId = formData.get("call_id")?.toString();
  const status = formData.get("status")?.toString();

  if (!callId || !status) {
    return { error: "상태를 선택한 후 다시 시도해주세요." };
  }

  const supabase = createClient();
  const updateData: Record<string, unknown> = { status };
  if (status === "completed") {
    updateData.completed_at = new Date().toISOString();
  } else if (status !== "assigned") {
    updateData.completed_at = null;
  }

  const { error } = await supabase
    .from("calls")
    .update(updateData)
    .eq("id", callId);

  if (error) {
    return { error: `상태 변경 실패: ${error.message}` };
  }

  revalidatePath(`/calls/${callId}`);
  revalidatePath("/calls");
  revalidatePath("/my-calls");
  redirect(`/calls/${callId}`);
}
