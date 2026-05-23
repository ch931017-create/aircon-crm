import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CallCard } from "@/components/calls/CallCard";
import { formatKRW } from "@/lib/utils";
import type { CallRow, ProfileRow } from "@/types/database";

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export default async function AdminPage() {
  await requireRole("admin");

  const supabase = createClient();
  const [{ data: allCallsData }, { data: recentCallsData }, { data: profilesData }] =
    await Promise.all([
      supabase
        .from("calls")
        .select("status,created_at,estimated_amount,assigned_to,assigned_at,completed_at,paid_amount"),
      supabase
        .from("calls")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("profiles").select("id, name, role"),
    ]);

  const calls = (allCallsData ?? []) as Array<
    Pick<
      CallRow,
      | "status"
      | "created_at"
      | "estimated_amount"
      | "assigned_to"
      | "assigned_at"
      | "completed_at"
      | "paid_amount"
    >
  >;
  const recentCalls = (recentCallsData ?? []) as CallRow[];
  const profiles = (profilesData ?? []) as Array<Pick<ProfileRow, "id" | "name" | "role">>;

  const profileMap = new Map(
    profiles.map((profile) => [profile.id, { name: profile.name, role: profile.role }]),
  );

  const todayReceived = calls.filter((call) => isToday(call.created_at)).length;
  const newCount = calls.filter((call) => call.status === "new").length;
  const assignedCount = calls.filter((call) => call.status === "assigned").length;
  const completedCount = calls.filter((call) => call.status === "completed").length;
  const estimatedRevenue = calls.reduce((sum, call) => sum + (call.estimated_amount ?? 0), 0);

  const technicianProfiles = profiles.filter((profile) => profile.role === "technician");

  const technicianMetrics = technicianProfiles.map((technician) => {
    const assignedCalls = calls.filter((call) => call.assigned_to === technician.id);
    const completedCalls = assignedCalls.filter((call) => call.status === "completed");
    const cancelledCalls = assignedCalls.filter((call) => call.status === "cancelled");
    const responseTimes = assignedCalls
      .map((call) => {
        if (!call.assigned_at) return null;
        return (new Date(call.assigned_at).getTime() - new Date(call.created_at).getTime()) / 60000;
      })
      .filter((value): value is number => value !== null);

    const averageResponse = responseTimes.length
      ? `${Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)}분`
      : "-";
    const totalHandled = assignedCalls.length;
    const completedRate = totalHandled ? Math.round((completedCalls.length / totalHandled) * 100) : null;
    const cancelRate = totalHandled ? Math.round((cancelledCalls.length / totalHandled) * 100) : null;
    const revenue = completedCalls.reduce((sum, call) => sum + (call.paid_amount ?? 0), 0);

    return {
      name: technician.name,
      assignedCount: totalHandled,
      completedCount: completedCalls.length,
      completionRate: completedRate,
      cancelRate: cancelRate,
      averageResponse,
      revenue,
    };
  });

  const transferredCount = calls.filter(
  (call) => (call as Record<string, unknown>).rescheduled === true
).length;

const cancelledCount = calls.filter(
  (call) => call.status === "cancelled"
).length;

const cards = [
  { label: "오늘 접수 콜 수", value: todayReceived.toString() },
  { label: "취소된 콜 수", value: cancelledCount.toString() },
  { label: "다른 날짜 이관 수", value: transferredCount.toString() },
  { label: "완료 수", value: completedCount.toString() },
];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">관리자 대시보드</h1>
        <p className="mt-2 text-sm text-slate-500">
          오늘 접수 현황, 취소 콜, 날짜 변경 콜 현황을 확인하세요.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold">정산 관리</h2>
            <p className="text-sm text-slate-500">기사 정산 현황과 비율 설정을 확인하세요.</p>
          </div>
          <a
            href="/admin/settlement"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            이동
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold">메시지 / 해피콜</h2>
            <p className="text-sm text-slate-500">고객 알림 및 해피콜 로그를 확인하세요.</p>
          </div>
          <a
            href="/admin/logs"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            이동
          </a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">최근 콜</h2>
            <p className="text-sm text-slate-500">최근 등록된 콜 5건을 확인하세요.</p>
          </div>
          <p className="text-sm text-slate-500">총 {recentCalls.length}건</p>
        </div>

        {recentCalls.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            최근 콜이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {recentCalls.map((call) => (
              <CallCard
                key={call.id}
                call={call}
                assigneeName={
                  call.assigned_to ? profileMap.get(call.assigned_to)?.name ?? null : null
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">기사 성과 지표</h2>
            <p className="text-sm text-slate-500">기사별 완료율, 취소율, 응답속도, 매출을 확인하세요.</p>
          </div>
          <p className="text-sm text-slate-500">총 기사 수 {technicianProfiles.length}명</p>
        </div>

        {technicianMetrics.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            기술자 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="px-4 py-3">기사</th>
                  <th className="px-4 py-3">처리건수</th>
                  <th className="px-4 py-3">완료건수</th>
                  <th className="px-4 py-3">완료율</th>
                  <th className="px-4 py-3">취소율</th>
                  <th className="px-4 py-3">평균 응답</th>
                  <th className="px-4 py-3">매출</th>
                </tr>
              </thead>
              <tbody>
                {technicianMetrics.map((metric) => (
                  <tr key={metric.name} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{metric.name}</td>
                    <td className="px-4 py-3">{metric.assignedCount}</td>
                    <td className="px-4 py-3">{metric.completedCount}</td>
                    <td className="px-4 py-3">{metric.completionRate != null ? `${metric.completionRate}%` : "-"}</td>
                    <td className="px-4 py-3">{metric.cancelRate != null ? `${metric.cancelRate}%` : "-"}</td>
                    <td className="px-4 py-3">{metric.averageResponse}</td>
                    <td className="px-4 py-3">{formatKRW(metric.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
