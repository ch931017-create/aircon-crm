import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LogsPage({ searchParams }: { searchParams?: Record<string, string> }) {
  await requireRole("admin");

  const supabase = createClient();

  // 간단한 필터 지원: type, status, technician, q (고객명/전화)
  const typeFilter = searchParams?.type ?? null;
  const statusFilter = searchParams?.status ?? null;
  const techFilter = searchParams?.technician ?? null;
  const q = searchParams?.q ?? null;

  const specialTypeFilters = [
  "happy_call_unanswered",
  "happy_call_answered",
  "amount_match",
  "amount_mismatch",
];

const isSpecialTypeFilter = specialTypeFilters.includes(typeFilter ?? "");

let logs: any[] | null = null;

if (isSpecialTypeFilter) {
  let callsQuery = supabase
    .from("calls")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200) as any;

  if (techFilter) callsQuery = callsQuery.eq("assigned_to", techFilter);

  if (q) {
    callsQuery = callsQuery.or(`customer_name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  if (typeFilter === "happy_call_unanswered") {
    callsQuery = callsQuery
      .eq("status", "completed")
      .or("happy_call_checked.is.null,happy_call_checked.eq.false");
  }

  if (typeFilter === "happy_call_answered") {
    callsQuery = callsQuery
      .eq("status", "completed")
      .eq("happy_call_checked", true);
  }

  if (typeFilter === "amount_match") {
    callsQuery = callsQuery
      .not("customer_amount", "is", null)
      .not("paid_amount", "is", null);
  }

  if (typeFilter === "amount_mismatch") {
    callsQuery = callsQuery
      .not("customer_amount", "is", null)
      .not("paid_amount", "is", null);
  }

  const { data: calls } = await callsQuery;

  const technicianIds = [
  ...new Set(
    (calls ?? [])
      .map((call: any) => call.assigned_to)
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
  ),
] as string[];

let technicianNameMap = new Map<string, string>();

if (technicianIds.length > 0) {
  const { data: technicians } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", technicianIds);

  technicianNameMap = new Map(
    (technicians ?? []).map((tech: any) => [tech.id, tech.name])
  );
}
  logs = (calls ?? [])
    .filter((call: any) => {
      if (typeFilter === "amount_match") {
        return Number(call.customer_amount) === Number(call.paid_amount);
      }

      if (typeFilter === "amount_mismatch") {
        return Number(call.customer_amount) !== Number(call.paid_amount);
      }

      return true;
    })
    .map((call: any) => ({
      id: call.id,
      call_id: call.id,
      created_at: call.customer_confirmed_at ?? call.updated_at ?? call.created_at,
      type: typeFilter,
      status: call.happy_call_checked ? "answered" : call.status,
      technician_name: technicianNameMap.get(call.assigned_to) ?? null,
      technician_id: call.assigned_to,
      customer_name: call.customer_name,
      customer_phone: call.phone,
      message_text:
        typeFilter === "amount_mismatch"
          ? `금액 불일치: 고객 ${Number(call.customer_amount).toLocaleString()}원 / 기사 ${Number(call.paid_amount).toLocaleString()}원`
          : typeFilter === "amount_match"
            ? `금액 일치: ${Number(call.customer_amount).toLocaleString()}원`
            : call.customer_note ?? call.memo ?? "-",
    }));
} else {
  let query = supabase
    .from("message_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200) as any;

  if (typeFilter) query = query.eq("type", typeFilter);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (techFilter) query = query.eq("technician_id", techFilter);
  if (q) query = query.ilike("customer_name", `%${q}%`).or(`customer_phone.ilike.%${q}%`);

  const { data } = await query;
  logs = data;
}

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">메시지 / 해피콜 로그</h1>
        <p className="mt-2 text-sm text-slate-500">발송 예정 로그와 해피콜 상태를 확인합니다.</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <form method="get" className="grid gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="text-sm text-slate-500">유형</span>
            <select name="type" defaultValue={typeFilter ?? ""} className="mt-1 w-full rounded-lg border px-2 py-1">
  <option value="">전체</option>
  <option value="notification">알림</option>
  <option value="happy_call">해피콜 전체</option>
  <option value="happy_call_unanswered">해피콜 미완료</option>
  <option value="happy_call_answered">해피콜 완료</option>
  <option value="amount_match">금액 일치</option>
  <option value="amount_mismatch">금액 불일치</option>
</select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-500">상태</span>
            <select name="status" defaultValue={statusFilter ?? ""} className="mt-1 w-full rounded-lg border px-2 py-1">
              <option value="">전체</option>
              <option value="pending">pending</option>
              <option value="sent">sent</option>
              <option value="answered">answered</option>
              <option value="failed">failed</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-500">기사 ID</span>
            <input name="technician" defaultValue={techFilter ?? ""} className="mt-1 w-full rounded-lg border px-2 py-1" />
          </label>
          <label className="block">
            <span className="text-sm text-slate-500">고객명/전화</span>
            <input name="q" defaultValue={q ?? ""} className="mt-1 w-full rounded-lg border px-2 py-1" />
          </label>
          <div className="sm:col-span-4">
            <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">필터 적용</button>
          </div>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-slate-700">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3">시간</th>
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">기사</th>
                <th className="px-4 py-3 min-w-[120px]">고객</th>
                <th className="px-4 py-3 min-w-[220px]">메시지</th>
                <th className="px-4 py-3">동작</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((log: any) => (
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
  {log.type === "amount_mismatch"
    ? "금액 불일치"
    : log.type === "amount_match"
      ? "금액 일치"
      : log.type === "happy_call_answered"
        ? "해피콜 완료"
        : log.type === "happy_call_unanswered"
          ? "해피콜 미완료"
          : log.type}
</td>
<td className="px-4 py-3">
  {log.status === "answered"
    ? "확인 완료"
    : log.status === "completed"
      ? "완료"
      : log.status}
</td>
<td className="px-4 py-3">{log.technician_name ?? "-"}</td>
<td className="px-4 py-3 min-w-[120px]">{log.customer_name ?? log.customer_phone ?? "-"}</td>
<td className="px-4 py-3 min-w-[220px] whitespace-pre-line">{log.message_text ?? "-"}</td>
<td className="px-4 py-3">
  {log.call_id ? (
    <Link
      href={`/calls/${log.call_id}`}
      className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
    >
      상세
    </Link>
  ) : (
    "-"
  )}
</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
