"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CallRow, ProfileRow } from "@/types/database";
import { formatKRW } from "@/lib/utils";
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_LABEL,
  computeCallSettlement,
  formatMonthLabel,
  monthKey,
  summarizeSettlements,
  type CallSettlement,
} from "@/lib/settlement";

type Technician = Pick<
  ProfileRow,
  "id" | "name" | "role" | "cash_ratio" | "invoice_ratio" | "card_ratio"
>;

interface Props {
  calls: CallRow[];
  technicians: Technician[];
  invoiceProcessingFee: number;
}

const ALL_MONTHS = "all";

export function AdminSettlementsClient({
  calls,
  technicians,
  invoiceProcessingFee,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const call of calls) {
      const key = monthKey(call.completed_at);
      if (key) set.add(key);
    }
    return Array.from(set).sort().reverse();
  }, [calls]);

  const [selectedMonth, setSelectedMonth] = useState<string>(ALL_MONTHS);

  const techMap = useMemo(
    () => new Map(technicians.map((tech) => [tech.id, tech])),
    [technicians],
  );

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      if (selectedMonth === ALL_MONTHS) return true;
      return monthKey(call.completed_at) === selectedMonth;
    });
  }, [calls, selectedMonth]);

  const byTechnician = useMemo(() => {
    const buckets = new Map<
      string,
      Array<{ call: CallRow; settlement: CallSettlement | null }>
    >();
    for (const call of filteredCalls) {
      const techId = call.assigned_to;
      if (!techId) continue;
      const profile = techMap.get(techId) ?? null;
      const settlement = computeCallSettlement(
        call,
        profile,
        invoiceProcessingFee,
      );
      const list = buckets.get(techId) ?? [];
      list.push({ call, settlement });
      buckets.set(techId, list);
    }
    return buckets;
  }, [filteredCalls, techMap, invoiceProcessingFee]);

  const techSummaries = useMemo(() => {
    return technicians
      .map((tech) => {
        const rows = byTechnician.get(tech.id) ?? [];
        const totals = summarizeSettlements(rows);
        return { tech, rows, totals };
      })
      .sort((a, b) => b.totals.totalRevenue - a.totals.totalRevenue);
  }, [technicians, byTechnician]);

  const grandTotals = useMemo(() => {
    const all = techSummaries.flatMap((entry) => entry.rows);
    return summarizeSettlements(all);
  }, [techSummaries]);

  async function markCalls(callIds: string[], action: "settle" | "unsettle") {
    if (callIds.length === 0) return;
    setErrorMessage(null);
    const response = await fetch("/api/admin/settlements/mark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_ids: callIds, action }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setErrorMessage(data?.error ?? "정산 상태 변경에 실패했습니다.");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function markPayment(callIds: string[], action: "paid" | "unpaid") {
    if (callIds.length === 0) return;
    setErrorMessage(null);
    const response = await fetch("/api/admin/settlements/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_ids: callIds, action }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setErrorMessage(data?.error ?? "입금 상태 변경에 실패했습니다.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            월별 필터
          </span>
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:w-64"
          >
            <option value={ALL_MONTHS}>전체</option>
            {monthOptions.map((key) => (
              <option key={key} value={key}>
                {formatMonthLabel(key)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label="총 완료 매출"
          value={formatKRW(Math.round(grandTotals.totalRevenue))}
          description={`${grandTotals.completedCount}건`}
        />
        <SummaryCard
          label="입금 완료"
          value={formatKRW(Math.round(grandTotals.paidRevenue))}
          tone="success"
        />
        <SummaryCard
          label="미수 금액"
          value={formatKRW(Math.round(grandTotals.unpaidRevenue))}
          tone="warning"
        />
        <SummaryCard
          label="기사 정산 예정"
          value={formatKRW(Math.round(grandTotals.techPayoutExpected))}
        />
        <SummaryCard
          label="정산완료"
          value={formatKRW(Math.round(grandTotals.settledTechPayout))}
          tone="success"
        />
        <SummaryCard
          label="미정산"
          value={formatKRW(Math.round(grandTotals.pendingTechPayout))}
          tone="warning"
        />
      </div>

      {errorMessage ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm text-slate-700">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2">기사</th>
                <th className="px-3 py-2 text-right">완료 콜</th>
                <th className="px-3 py-2 text-right">총 매출</th>
                <th className="px-3 py-2 text-right">기사 정산 예정</th>
                <th className="px-3 py-2 text-right">회사 몫</th>
                <th className="px-3 py-2 text-right">미수</th>
                <th className="px-3 py-2 text-right">미정산</th>
                <th className="px-3 py-2 text-right">정산완료</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {techSummaries.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-10 text-center text-sm text-slate-500"
                  >
                    표시할 정산 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                techSummaries.map(({ tech, rows, totals }) => {
                  const open = expanded === tech.id;
                  // 정산완료 가능 콜: 입금완료 + 미정산
                  const settleableIds = rows
                    .filter(
                      ({ call, settlement }) =>
                        settlement &&
                        call.payment_status === "paid" &&
                        call.settlement_status === "pending",
                    )
                    .map(({ call }) => call.id);
                  return (
                    <Group key={tech.id}>
                      <tr className="border-b border-slate-100">
                        <td className="px-3 py-3 font-medium text-slate-900">
                          {tech.name}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {totals.completedCount}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatKRW(Math.round(totals.totalRevenue))}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-emerald-700">
                          {formatKRW(Math.round(totals.techPayoutExpected))}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatKRW(Math.round(totals.companyShare))}
                        </td>
                        <td className="px-3 py-3 text-right text-amber-700">
                          {formatKRW(Math.round(totals.unpaidRevenue))}
                        </td>
                        <td className="px-3 py-3 text-right text-amber-700">
                          {formatKRW(Math.round(totals.pendingTechPayout))}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-500">
                          {formatKRW(Math.round(totals.settledTechPayout))}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded(open ? null : tech.id)
                              }
                              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              {open ? "접기" : "상세"}
                            </button>
                            <button
                              type="button"
                              disabled={pending || settleableIds.length === 0}
                              onClick={() =>
                                markCalls(settleableIds, "settle")
                              }
                              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition disabled:opacity-50 hover:bg-brand-700"
                              title="입금완료 + 미정산인 콜만 처리됩니다"
                            >
                              일괄 정산완료 ({settleableIds.length})
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td
                            colSpan={9}
                            className="border-b border-slate-100 bg-slate-50 px-3 py-4"
                          >
                            <CallDetailTable
                              rows={rows}
                              disabled={pending}
                              onToggleSettlement={(callId, settled) =>
                                markCalls(
                                  [callId],
                                  settled ? "unsettle" : "settle",
                                )
                              }
                              onTogglePayment={(callId, paid) =>
                                markPayment(
                                  [callId],
                                  paid ? "unpaid" : "paid",
                                )
                              }
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Group>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function CallDetailTable({
  rows,
  disabled,
  onToggleSettlement,
  onTogglePayment,
}: {
  rows: Array<{ call: CallRow; settlement: CallSettlement | null }>;
  disabled: boolean;
  onToggleSettlement: (callId: string, settled: boolean) => void;
  onTogglePayment: (callId: string, paid: boolean) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">콜이 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1000px] w-full text-xs text-slate-700">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="px-2 py-2">완료일</th>
            <th className="px-2 py-2">고객</th>
            <th className="px-2 py-2">지역</th>
            <th className="px-2 py-2">결제방식</th>
            <th className="px-2 py-2 text-right">총액</th>
            <th className="px-2 py-2 text-right">공급가액</th>
            <th className="px-2 py-2 text-right">비율</th>
            <th className="px-2 py-2 text-right">기사 정산</th>
            <th className="px-2 py-2 text-right">회사 몫</th>
            <th className="px-2 py-2">입금</th>
            <th className="px-2 py-2">정산</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ call, settlement }) => {
            const isPaid = call.payment_status === "paid";
            const isSettled = call.settlement_status === "settled";
            const canSettle = isPaid && !!settlement;
            return (
              <tr key={call.id} className="border-t border-slate-200">
                <td className="px-2 py-2">
                  {call.completed_at
                    ? new Date(call.completed_at).toLocaleDateString("ko-KR")
                    : "-"}
                </td>
                <td className="px-2 py-2">{call.customer_name}</td>
                <td className="px-2 py-2">{call.district ?? "-"}</td>
                <td className="px-2 py-2">
                  {call.payment_method
                    ? PAYMENT_METHOD_LABEL[call.payment_method]
                    : "-"}
                </td>
                <td className="px-2 py-2 text-right">
                  {formatKRW(settlement?.totalAmount ?? null)}
                </td>
                <td className="px-2 py-2 text-right">
                  {settlement && settlement.vat > 0
                    ? formatKRW(settlement.supplyAmount)
                    : "-"}
                </td>
                <td className="px-2 py-2 text-right">
                  {settlement ? `${settlement.ratio.toFixed(1)}%` : "-"}
                </td>
                <td className="px-2 py-2 text-right font-semibold text-emerald-700">
                  {settlement
                    ? formatKRW(Math.round(settlement.finalTechPayout))
                    : "-"}
                </td>
                <td className="px-2 py-2 text-right">
                  {settlement
                    ? formatKRW(Math.round(settlement.companyShare))
                    : "-"}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onTogglePayment(call.id, isPaid)}
                    className={
                      isPaid
                        ? "rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                        : "rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                    }
                    title={
                      isPaid
                        ? "클릭 시 미수로 되돌립니다"
                        : "클릭 시 입금완료로 처리합니다"
                    }
                  >
                    {PAYMENT_STATUS_LABEL[call.payment_status]}
                  </button>
                </td>
                <td className="px-2 py-2">
                  <span
                    className={
                      isSettled
                        ? "rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
                        : "rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                    }
                  >
                    {SETTLEMENT_STATUS_LABEL[call.settlement_status]}
                  </span>
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    disabled={
                      disabled || (!isSettled && !canSettle) || !settlement
                    }
                    onClick={() => onToggleSettlement(call.id, isSettled)}
                    className={
                      isSettled
                        ? "rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        : "rounded-lg bg-brand-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    }
                    title={
                      !isSettled && !canSettle
                        ? "미수건은 정산완료 처리할 수 없습니다"
                        : ""
                    }
                  >
                    {isSettled ? "정산취소" : "정산완료"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: string;
  description?: string;
  tone?: "warning" | "success";
}) {
  const ring =
    tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50"
        : "border-slate-200 bg-white";
  return (
    <div className={`rounded-3xl border p-4 shadow-sm ${ring}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {description ? (
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}
