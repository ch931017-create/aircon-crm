"use client";

import { useMemo, useState } from "react";
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

export function MySettlementsClient({
  calls,
  profile,
  invoiceProcessingFee,
}: Props) {
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

  const rows = useMemo(() => {
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

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              월별 필터
            </span>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
            <span className="mb-1 block text-sm font-medium text-slate-700">
              입금 상태
            </span>
            <select
              value={paymentFilter}
              onChange={(event) =>
                setPaymentFilter(event.target.value as PaymentFilter)
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="all">전체</option>
              <option value="paid">입금완료</option>
              <option value="unpaid">미수</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          label="총 완료 매출"
          value={formatKRW(Math.round(totals.totalRevenue))}
          description={`${totals.completedCount}건`}
        />
        <SummaryCard
          label="입금 완료 금액"
          value={formatKRW(Math.round(totals.paidRevenue))}
          tone="success"
        />
        <SummaryCard
          label="미수 금액"
          value={formatKRW(Math.round(totals.unpaidRevenue))}
          tone="warning"
        />
        <SummaryCard
          label="기사 정산 예정금액"
          value={formatKRW(Math.round(totals.techPayoutExpected))}
          description="미수건 포함 예상 금액"
        />
        <SummaryCard
          label="정산완료 금액"
          value={formatKRW(Math.round(totals.settledTechPayout))}
          tone="success"
        />
        <SummaryCard
          label="미정산 금액"
          value={formatKRW(Math.round(totals.pendingTechPayout))}
          description="입금완료 + 미정산"
          tone="warning"
        />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            정산 내역이 없습니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map(({ call, settlement }) => (
              <li
                key={call.id}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-500">
                    {call.completed_at
                      ? new Date(call.completed_at).toLocaleDateString("ko-KR")
                      : "-"}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Pill
                      tone={call.payment_status === "paid" ? "success" : "warning"}
                    >
                      {PAYMENT_STATUS_LABEL[call.payment_status]}
                    </Pill>
                    <Pill
                      tone={
                        call.settlement_status === "settled"
                          ? "success"
                          : "neutral"
                      }
                    >
                      {SETTLEMENT_STATUS_LABEL[call.settlement_status]}
                    </Pill>
                  </div>
                </div>

                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <p className="text-base font-semibold text-slate-900">
                    {call.customer_name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {call.district ?? "-"}
                  </p>
                </div>

                <p className="mt-1 text-xs text-slate-500">{call.address}</p>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <Row
                    label="결제방식"
                    value={
                      call.payment_method
                        ? PAYMENT_METHOD_LABEL[call.payment_method]
                        : "-"
                    }
                  />
                  <Row
                    label="총 결제금액"
                    value={formatKRW(settlement?.totalAmount ?? null)}
                  />
                  {settlement && settlement.vat > 0 ? (
                    <>
                      <Row
                        label="공급가액"
                        value={formatKRW(settlement.supplyAmount)}
                      />
                      <Row label="부가세" value={formatKRW(settlement.vat)} />
                    </>
                  ) : null}
                  <Row
                    label="적용 비율"
                    value={
                      settlement ? `${settlement.ratio.toFixed(1)}%` : "-"
                    }
                  />
                  <Row
                    label="회사 몫"
                    value={
                      settlement
                        ? formatKRW(Math.round(settlement.companyShare))
                        : "-"
                    }
                  />
                  {settlement && settlement.processingFee > 0 ? (
                    <Row
                      label="세금계산서 처리비"
                      value={`-${formatKRW(settlement.processingFee)}`}
                    />
                  ) : null}
                  <Row
                    label="기사 정산금"
                    value={
                      settlement
                        ? formatKRW(Math.round(settlement.finalTechPayout))
                        : "-"
                    }
                    emphasize
                  />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({
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
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd
        className={
          emphasize
            ? "text-right text-sm font-semibold text-emerald-700"
            : "text-right text-sm text-slate-900"
        }
      >
        {value}
      </dd>
    </>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "neutral";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "warning"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
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
