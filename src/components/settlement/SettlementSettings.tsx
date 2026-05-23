"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { ProfileRow } from "@/types/database";
import { DEFAULT_RATIOS } from "@/lib/settlement";

interface Props {
  profiles: ProfileRow[];
  invoiceProcessingFee: number;
}

export function SettlementSettings({ profiles, invoiceProcessingFee }: Props) {
  const router = useRouter();
  const [profileId, setProfileId] = useState<string>(profiles[0]?.id ?? "");
  const [cashRatio, setCashRatio] = useState<string>(
    profiles[0]?.cash_ratio?.toString() ?? String(DEFAULT_RATIOS.base),
  );
  const [invoiceFee, setInvoiceFee] = useState<string>(
    invoiceProcessingFee.toString(),
  );
  const [loading, setLoading] = useState(false);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === profileId) ?? null,
    [profiles, profileId],
  );

  // 선택된 기사에 맞게 폼 값을 동기화 (기사 변경 시 / 서버 데이터 갱신 시)
  useEffect(() => {
    if (!selectedProfile) return;
    setCashRatio(
      selectedProfile.cash_ratio?.toString() ?? String(DEFAULT_RATIOS.base),
    );
  }, [selectedProfile]);

  useEffect(() => {
    setInvoiceFee(invoiceProcessingFee.toString());
  }, [invoiceProcessingFee]);

  const baseRatioNum = Number(cashRatio);
  const cardRatioPreview = Number.isFinite(baseRatioNum)
    ? Math.max(0, baseRatioNum - DEFAULT_RATIOS.cardDeduction)
    : 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileId) {
      toast.error("기사를 선택하세요.");
      return;
    }
    if (!Number.isFinite(baseRatioNum) || baseRatioNum < 0 || baseRatioNum > 100) {
      toast.error("기본 비율은 0~100 사이의 숫자여야 합니다.");
      return;
    }
    const feeNum = Number(invoiceFee);
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      toast.error("세금계산서 처리비는 0 이상의 숫자여야 합니다.");
      return;
    }

    setLoading(true);
    try {
      // 기존 호환을 위해 cash_ratio/invoice_ratio/card_ratio 모두 동기화 저장.
      // - cash_ratio: 기본 비율 (UI 입력값)
      // - invoice_ratio: 세금계산서도 기본비율 사용
      // - card_ratio: 자동 -5%p 차감
      const res = await fetch("/api/admin/profile-ratios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: profileId,
          cash_ratio: baseRatioNum,
          invoice_ratio: baseRatioNum,
          card_ratio: Math.max(0, baseRatioNum - DEFAULT_RATIOS.cardDeduction),
          invoice_processing_fee: feeNum,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "저장에 실패했습니다.");
        return;
      }
      toast.success("저장되었습니다.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">정산 비율 설정</h2>
      <p className="mt-1 text-sm text-slate-500">
        기사별 기본 비율과 세금계산서 처리비를 관리합니다. 카드결제 및
        현금영수증은 기본 비율에서 자동으로 5%p 차감됩니다.
      </p>

      {profiles.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          등록된 기사가 없습니다.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              기사 선택
            </span>
            <select
              value={profileId}
              onChange={(event) => setProfileId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} (현재 {Number(profile.cash_ratio ?? 0).toFixed(1)}%)
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="기본 비율 (현금/계좌/세금계산서)"
              value={cashRatio}
              onChange={setCashRatio}
              suffix="%"
              type="number"
            />
            <ReadOnlyField
              label="카드결제 및 현금영수증 (자동 -5%p)"
              value={`${cardRatioPreview.toFixed(1)}%`}
            />
          </div>

          <Field
            label="세금계산서 처리비 (건당 차감)"
            value={invoiceFee}
            onChange={setInvoiceFee}
            suffix="원"
            type="number"
          />

          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <p>적용 예시 (총 결제 110,000원, 부가세 포함):</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>
                현금/계좌이체 → 110,000 × {baseRatioNum.toFixed(1)}% ={" "}
                {Math.round(110000 * (baseRatioNum / 100)).toLocaleString("ko-KR")}원
              </li>
              <li>
                카드결제 및 현금영수증 → 100,000 × {cardRatioPreview.toFixed(1)}% ={" "}
                {Math.round(100000 * (cardRatioPreview / 100)).toLocaleString(
                  "ko-KR",
                )}
                원
              </li>
              <li>
                세금계산서 → 100,000 × {baseRatioNum.toFixed(1)}% -{" "}
                {Number(invoiceFee || 0).toLocaleString("ko-KR")}원 ={" "}
                {Math.round(
                  100000 * (baseRatioNum / 100) - Number(invoiceFee || 0),
                ).toLocaleString("ko-KR")}
                원
              </li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading || !profileId}
            className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition disabled:opacity-60 hover:bg-brand-700 sm:w-auto"
          >
            {loading ? "저장 중..." : "저장"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={value}
          step={type === "number" ? "0.1" : undefined}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        {suffix && <span className="text-sm text-slate-500">{suffix}</span>}
      </div>
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-700">
        {value}
      </div>
    </div>
  );
}
