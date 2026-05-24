"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createCallSchema } from "@/lib/schemas";
import { geocodeAddress } from "@/lib/geocoding";
import { sendPushToProfile } from "@/lib/web-push";

export interface CreateCallState {
  error?: string;
  fieldErrors?: Record<string, string>;
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
    return { error: "입력값을 확인하세요", fieldErrors };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const input = parsed.data;

  // 주소 → 좌표 (실패해도 콜 등록은 진행). geocodeAddress는 throw하지 않음.
  let latitude: number | null = null;
  let longitude: number | null = null;
  const geo = await geocodeAddress(input.address);
  if (geo) {
    latitude = geo.lat;
    longitude = geo.lng;
  }

  const { error } = await supabase.from("calls").insert({
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
    latitude,
    longitude,
  });

  if (error) {
    return { error: `등록 실패: ${error.message}` };
  }

  revalidatePath("/calls");
  redirect("/calls");
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
