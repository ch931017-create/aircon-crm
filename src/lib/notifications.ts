import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type Supa = SupabaseClient<Database>;

export async function insertMessageLog(supabase: Supa, payload: any) {
  return supabase.from("message_logs").insert(payload as any);
}

export function buildAssignmentMessage(call: { customer_name?: string; phone?: string }, tech: { name?: string; phone?: string }) {
  const message = `고객님, 담당 기사님이 배정되었습니다. 곧 연락드리겠습니다.`;
  return {
    message_text: message,
    customer_name: call.customer_name ?? null,
    customer_phone: call.phone ?? null,
    technician_name: tech.name ?? null,
    technician_phone: tech.phone ?? null,
  };
}

export function buildHappyCallMessage() {
  const message = `해피콜: 서비스 만족도 확인을 위해 연락드리겠습니다.`;
  return { message_text: message };
}
