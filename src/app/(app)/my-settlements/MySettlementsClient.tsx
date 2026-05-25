"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
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

interface Props {
  calls: CallRow[];
  profile: Pick<
    ProfileRow,
    "id" | "name" | "cash_ratio" | "invoice_ratio" | "card_ratio"
  > | null;
  invoiceProcessingFee: number;
}

const ALL_MONTHS = "all";
type PaymentFilter = "all" | "paid" | "unpaid";

interface Row {
  call: CallRow;
  settlement: CallSettlement | null;
}

// completed_at (ISO UTC) → 한국 로컬 YYYY-MM-DD
function localDateKey(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateLabel(key: string): string {
  if (key === "unknown") return "날짜 미정";
  const [y, m, d] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return `${Number(y)}년 ${Number(m)}월 ${Number(d)}일 (${WEEKDAY[date.getDay()]})`;
}

export function MySettlementsClient({
  calls,
  profile,
  invoiceProcessingFee,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyCallId, setBusyCallId] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const call of calls) {
      const key = monthKey(call.completed_at);
      if (key) set.add(key);
    }
    return Array.from(set).sort().reverse();
  }, [calls]);

  const [selectedMonth, setSelectedMonth] = useState<string>(
    monthOptions[0] ?? ALL_MONTHS,
  );
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");

  const rows = useMemo<Row[]>(() => {
    return calls
      .filter((call) => {
        if (selectedMonth !== ALL_MONTHS) {
          if (monthKey(call.completed_at) !== selectedMonth) return false;
        }
        if (paymentFilter === "paid" && call.payment_status !== "paid")
          return false;
        if (paymentFilter === "unpaid" && call.payment_status !== "unpaid")
          return false;
        return true;
      })
      .map((call) => ({
        call,
        settlement: computeCallSettlement(call, profile, invoiceProcessingFee),
      }));
  }, [calls, selectedMonth, paymentFilter, profile, invoiceProcessingFee]);

  const totals = useMemo(() => summarizeSettlements(rows), [rows]);

  // 날짜별 그룹 (최신 날짜 우선)
  const dateGroups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const key = localDateKey(row.call.completed_at);
      const arr = map.get(key) ?? [];
      arr.push(row);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        items,
        summary: summarizeSettlements(items),
      }));
  }, [rows]);

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  async function togglePayment(call: CallRow) {
    const isPaid = call.payment_status === "paid";
    const isSettled = call.settlement_status === "settled";
    if (isSettled && isPaid) {
      toast.error(
        "정산완료된 콜은 미수로 변경할 수 없습니다. 관리자에게 정산취소를 요청하세요.",
      );
      return;
    }
    const action = isPaid ? "unpaid" : "paid";
    setBusyCallId(call.id);
    try {
      const res = await fetch("/api/calls/payment-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: call.id, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const code = data?.error ?? `HTTP ${res.status}`;
        const friendly =
          code === "ALREADY_SETTLED_CANNOT_UNPAID"
            ? "정산완료된 콜은 미수로 변경할 수 없습니다."
            : code === "ONLY_COMPLETED_CALL_ALLOWED"
              ? "완료된 콜만 변경 가능합니다."
              : code === "FORBIDDEN"
                ? "본인 콜만 변경 가능합니다."
                : code;
        throw new Error(friendly);
      }
      toast.success(action === "paid" ? "입금완료로 변경" : "미수로 변경");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setBusyCallId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              월별 필터
            </span>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value={ALL_MONTHS}>전체</option>
              {monthOptions.map((key) => (
                <option key={key} value={key}>
                  {formatMonthLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              입금 상태
            </span>
            <select
              value={paymentFilter}
              onChange={(event) =>
                setPaymentFilter(event.target.value as PaymentFilter)
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="all">전체</option>
              <option value="paid">입금완료</option>
              <option value="unpaid">미수</option>
            </select>
          </label>
        </div>
      </div>

      {/* 전체 요약 */}
      <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        <SummaryCard
          label="총 완료 매출"
          value={formatKRW(Math.round(totals.totalRevenue))}
          description={`${totals.completedCount}건`}
        />
        <SummaryCard
          label="입금 완료"
          value={formatKRW(Math.round(totals.paidRevenue))}
          tone="success"
        />
        <SummaryCard
          label="미수"
          value={formatKRW(Math.round(totals.unpaidRevenue))}
          tone="warning"
        />
        <SummaryCard
          label="기사 정산 예정"
          value={formatKRW(Math.round(totals.techPayoutExpected))}
          description="미수건 포함"
        />
        <SummaryCard
          label="정산완료"
          value={formatKRW(Math.round(totals.settledTechPayout))}
          tone="success"
        />
        <SummaryCard
          label="미정산"
          value={formatKRW(Math.round(totals.pendingTechPayout))}
          tone="warning"
        />
      </div>

      {/* 날짜별 그룹 리스트 */}
      <div className="space-y-2">
        {dateGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            정산 내역이 없습니다.
          </div>
        ) : (
          dateGroups.map(({ date, items, summary }) => {
            const open = expandedDates.has(date);
            return (
              <div
                key={date}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm sm:rounded-3xl"
              >
                {/* 날짜 row 헤더 (요약 + chevron) */}
                <button
                  type="button"
                  onClick={() => toggleDate(date)}
                  aria-expanded={open}
                  className="w-full px-3 py-3 text-left transition hover:bg-slate-50 sm:px-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 sm:text-base">
                        {formatDateLabel(date)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        완료 {summary.completedCount}건 · 매출{" "}
                        {formatKRW(Math.round(summary.totalRevenue))}
                      </p>
                    </div>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-slate-400 transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-4 sm:text-xs">
                    <DateMeta
                      label="기사 정산 예정"
                      value={formatKRW(Math.round(summary.techPayoutExpected))}
                      tone="brand"
                    />
                    <DateMeta
                      label="회사 몫"
                      value={formatKRW(Math.round(summary.companyShare))}
                    />
                    <DateMeta
                      label="미수"
                      value={formatKRW(Math.round(summary.unpaidRevenue))}
                      tone={summary.unpaidRevenue > 0 ? "warning" : undefined}
                    />
                    <DateMeta
                      label="입금완료"
                      value={formatKRW(Math.round(summary.paidRevenue))}
                      tone={summary.paidRevenue > 0 ? "success" : undefined}
                    />
                    <DateMeta
                      label="정산완료"
                      value={formatKRW(Math.round(summary.settledTechPayout))}
                      tone={
                        summary.settledTechPayout > 0 ? "success" : undefined
                      }
                    />
                    <DateMeta
                      label="미정산"
                      value={formatKRW(Math.round(summary.pendingTechPayout))}
                      tone={
                        summary.pendingTechPayout > 0 ? "warning" : undefined
                      }
                    />
                  </div>
                </button>

                {/* 펼침 영역: 콜 상세 리스트 */}
                {open && (
                  <div className="border-t border-slate-100 px-3 py-3 sm:px-4">
                    <ul className="space-y-2">
                      {items.map(({ call, settlement }) => {
                        const isPaid = call.payment_status === "paid";
                        const isSettled =
                          call.settlement_status === "settled";
                        const busy = busyCallId === call.id || pending;
                        return (
                          <li
                            key={call.id}
                            className="rounded-xl border border-slate-100 bg-slate-50/50 p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {call.customer_name}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {call.district ?? "-"} ·{" "}
                                  {call.completed_at
                                    ? new Date(
                                        call.completed_at,
                                      ).toLocaleTimeString("ko-KR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                    : "-"}
                                </p>
                              </div>
                              <Link
                                href={`/calls/${call.id}`}
                                className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                              >
                                상세
                              </Link>
                            </div>

                            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                              <DetailRow
                                label="결제방식"
                                value={
                                  call.payment_method
                                    ? PAYMENT_METHOD_LABEL[
                                        call.payment_method
                                      ]
                                    : "-"
                                }
                              />
                              <DetailRow
                                label="총액"
                                value={formatKRW(
                                  settlement?.totalAmount ?? null,
                                )}
                              />
                              <DetailRow
                                label="기사 정산금"
                                value={
                                  settlement
                                    ? formatKRW(
                                        Math.round(settlement.finalTechPayout),
                                      )
                                    : "-"
                                }
                                emphasize
                              />
                              <DetailRow
                                label="회사 몫"
                                value={
                                  settlement
                                    ? formatKRW(
                                        Math.round(settlement.companyShare),
                                      )
                                    : "-"
                                }
                              />
                            </dl>

                            <div className="mt-2 flex items-center justify-between gap-2">
                              {/* 입금 상태 — 기사 본인이 토글 가능 (정산완료는 disabled) */}
                              <button
                                type="button"
                                onClick={() => togglePayment(call)}
                                disabled={busy || (isPaid && isSettled)}
                                title={
                                  isPaid && isSettled
                                    ? "정산완료된 콜은 변경 불가 (관리자에게 정산취소 요청)"
                                    : isPaid
                                      ? "클릭하여 미수로 변경"
                                      : "클릭하여 입금완료로 변경"
                                }
                                className={
                                  isPaid
                                    ? "rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-200 disabled:opacity-60"
                                    : "rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-200 disabled:opacity-60"
                                }
                              >
                                {PAYMENT_STATUS_LABEL[call.payment_status]}
                              </button>

                              {/* 정산 상태 — 표시만 (기사는 변경 불가) */}
                              <span
                                className={
                                  isSettled
                                    ? "rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-700"
                                    : "rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600"
                                }
                                title={
                                  isSettled
                                    ? "정산완료됨"
                                    : "정산은 관리자가 처리합니다"
                                }
                              >
                                {SETTLEMENT_STATUS_LABEL[call.settlement_status]}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DateMeta({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "brand";
}) {
  const cls =
    tone === "success"
      ? "text-emerald-700 font-semibold"
      : tone === "warning"
        ? "text-amber-700 font-semibold"
        : tone === "brand"
          ? "text-brand-700 font-semibold"
          : "text-slate-700";
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-slate-500">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
}

function DetailRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={
          emphasize
            ? "text-right font-semibold text-emerald-700"
            : "text-right text-slate-900"
        }
      >
        {value}
      </dd>
    </>
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
    <div className={`rounded-2xl border p-3 shadow-sm sm:p-4 ${ring}`}>
      <p className="text-[11px] text-slate-500 sm:text-xs">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900 sm:text-2xl">
        {value}
      </p>
      {description ? (
        <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">
          {description}
        </p>
      ) : null}
    </div>
  );
}
