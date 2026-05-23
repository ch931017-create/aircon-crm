"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CallRow, ProfileRow } from "@/types/database";

interface Props {
  calls: CallRow[];
  profiles: ProfileRow[];
  invoiceProcessingFee: number;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "현금",
  transfer: "계좌이체",
  card: "카드결제 및 현금영수증",
  cash_receipt: "카드결제 및 현금영수증",
  tax_invoice: "세금계산서",
};

function formatKRW(amount: number) {
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

export function SettlementDashboard({ calls, profiles, invoiceProcessingFee }: Props) {
  const [selectedTech, setSelectedTech] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const techMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );

  const filterResult = useMemo(() => {
    const from = startDate ? new Date(startDate) : null;
    const to = endDate ? new Date(endDate) : null;
    return calls.filter((call) => {
      if (selectedTech && call.assigned_to !== selectedTech) return false;
      if (from && (!call.completed_at || new Date(call.completed_at) < from)) return false;
      if (to && (!call.completed_at || new Date(call.completed_at) > to)) return false;
      return true;
    });
  }, [calls, selectedTech, startDate, endDate]);

  const totals = useMemo(() => {
    const summary = {
      cashCount: 0,
      cashRevenue: 0,
      invoiceCount: 0,
      invoiceRevenue: 0,
      cardCount: 0,
      cardRevenue: 0,
      totalRevenue: 0,
      companyFee: 0,
      techPayout: 0,
      processingFee: 0,
      finalPayout: 0,
    };

    for (const call of filterResult) {
      if (!call.paid_amount || !call.payment_method) continue;
      const profile = techMap.get(call.assigned_to ?? "") ?? {
        cash_ratio: 70,
        invoice_ratio: 70,
        card_ratio: 65,
      };
      const amount = call.paid_amount;
      let techShare = 0;
      let companyShare = 0;
      let processFee = 0;

      if (call.payment_method === "cash" || call.payment_method === "transfer") {
        techShare = (amount * profile.cash_ratio) / 100;
        companyShare = amount - techShare;
        summary.cashCount += 1;
        summary.cashRevenue += amount;
      } else if (call.payment_method === "tax_invoice") {
        techShare = (amount * profile.invoice_ratio) / 100;
        processFee = invoiceProcessingFee;
        companyShare = amount - techShare;
        summary.invoiceCount += 1;
        summary.invoiceRevenue += amount;
      } else if (
        call.payment_method === "card" ||
        call.payment_method === "cash_receipt"
      ) {
        techShare = (amount * profile.card_ratio) / 100;
        companyShare = amount - techShare;
        summary.cardCount += 1;
        summary.cardRevenue += amount;
      }

      summary.totalRevenue += amount;
      summary.companyFee += companyShare;
      summary.processingFee += processFee;
      summary.techPayout += techShare;
      summary.finalPayout += techShare - processFee;
    }

    return summary;
  }, [filterResult, techMap, invoiceProcessingFee]);

  const handleRefresh = async () => {
    setMessage(null);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">정산 대시보드</h1>
            <p className="text-sm text-slate-500">기사별, 날짜별 정산 현황과 회사 수수료를 확인하세요.</p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            새로고침
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">기사 필터</span>
            <select
              value={selectedTech}
              onChange={(event) => setSelectedTech(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">전체 기사</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">시작일</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">종료일</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="현금 건수" value={totals.cashCount} description={formatKRW(totals.cashRevenue)} />
        <Card label="세금계산서 건수" value={totals.invoiceCount} description={formatKRW(totals.invoiceRevenue)} />
        <Card label="카드 건수" value={totals.cardCount} description={formatKRW(totals.cardRevenue)} />
        <Card label="총 매출" value={formatKRW(totals.totalRevenue)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card label="회사 수수료" value={formatKRW(totals.companyFee)} />
        <Card label="기사 정산금" value={formatKRW(totals.techPayout)} />
        <Card label="세금계산서 처리비" value={formatKRW(totals.processingFee)} />
        <Card label="최종 기사 지급액" value={formatKRW(totals.finalPayout)} />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">세금계산서 발행 대상</h2>
        <p className="mt-1 text-sm text-slate-500">
          결제방식이 세금계산서인 완료 콜만 표시됩니다.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[1000px] w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-3 pr-4">완료일</th>
                <th className="py-3 pr-4">기사</th>
                <th className="py-3 pr-4">고객명</th>
                <th className="py-3 pr-4">금액</th>
                <th className="py-3 pr-4">사업자번호</th>
                <th className="py-3 pr-4">상호</th>
                <th className="py-3 pr-4">대표자</th>
                <th className="py-3 pr-4">이메일</th>
                <th className="py-3 pr-4">메모</th>
              </tr>
            </thead>
            <tbody>
              {filterResult
                .filter((call) => call.payment_method === "tax_invoice")
                .map((call) => {
                  const tech = techMap.get(call.assigned_to ?? "");
                  return (
                    <tr key={call.id} className="border-b border-slate-100">
                      <td className="py-3 pr-4">
                        {call.completed_at
                          ? new Date(call.completed_at).toLocaleDateString("ko-KR")
                          : "-"}
                      </td>
                      <td className="py-3 pr-4">{tech?.name ?? "-"}</td>
                      <td className="py-3 pr-4">{call.customer_name}</td>
                      <td className="py-3 pr-4 font-semibold">
                        {call.paid_amount != null ? formatKRW(call.paid_amount) : "-"}
                      </td>
                      <td className="py-3 pr-4">{call.invoice_business_id ?? "-"}</td>
                      <td className="py-3 pr-4">{call.invoice_business_name ?? "-"}</td>
                      <td className="py-3 pr-4">{call.invoice_ceo_name ?? "-"}</td>
                      <td className="py-3 pr-4">{call.invoice_email ?? "-"}</td>
                      <td className="py-3 pr-4">{call.settlement_note ?? "-"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
      
      {message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}
    </div>
  );
}

function Card({ label, value, description }: { label: string; value: string | number; description?: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
      {description ? <p className="mt-2 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}
