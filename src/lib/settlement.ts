import type {
  CallRow,
  PaymentMethod,
  PaymentStatus,
  ProfileRow,
  SettlementStatus,
} from "@/types/database";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "현금",
  transfer: "계좌이체",
  card: "카드결제 및 현금영수증",
  cash_receipt: "카드결제 및 현금영수증",
  tax_invoice: "세금계산서",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "미수",
  paid: "입금완료",
};

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  pending: "미정산",
  settled: "정산완료",
};

export const DEFAULT_RATIOS = {
  base: 70, // 기본 (현금/계좌이체/세금계산서) 비율
  cardDeduction: 5, // 카드/현금영수증 차감 %p
};

export const TAX_INVOICE_PROCESSING_FEE_DEFAULT = 5000;
export const VAT_RATE = 0.1;

export interface CallSettlement {
  paymentMethod: PaymentMethod;
  totalAmount: number; // 고객 결제 총액 (paid_amount)
  supplyAmount: number; // 부가세 제외 공급가액
  vat: number; // 부가세
  ratio: number; // 적용된 기사 비율 (%)
  techShare: number; // 공급가액 기준 기사 몫(처리비 차감 전)
  processingFee: number; // 세금계산서 처리비
  finalTechPayout: number; // 실 기사 정산금액 (처리비 차감 후)
  companyShare: number; // 회사 몫 (totalAmount - finalTechPayout)
}

type SettlementProfile = Pick<
  ProfileRow,
  "cash_ratio" | "invoice_ratio" | "card_ratio"
>;

type SettlementCall = Pick<
  CallRow,
  "paid_amount" | "payment_method" | "tax_included"
>;

/**
 * 결제 유형별 정산 금액 계산.
 *
 * - cash / transfer : 부가세 차감 없음, profile.cash_ratio 그대로
 * - card / cash_receipt : 부가세 별도, 공급가액 기준, 기본비율 - 5%
 * - tax_invoice : 부가세 별도, 공급가액 기준, 기본비율 그대로, 5,000원 차감
 *
 * 기본비율(baseRatio)은 profile.cash_ratio를 사용합니다.
 * profile.invoice_ratio / card_ratio 컬럼은 호환성을 위해 남겨두지만,
 * 새 규칙에서는 baseRatio 한 가지만 사용합니다.
 */
export function computeCallSettlement(
  call: SettlementCall,
  profile: SettlementProfile | null | undefined,
  invoiceProcessingFee = TAX_INVOICE_PROCESSING_FEE_DEFAULT,
): CallSettlement | null {
  if (call.paid_amount == null || !call.payment_method) return null;
  const totalAmount = Number(call.paid_amount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return null;

  const baseRatio = Number(profile?.cash_ratio ?? DEFAULT_RATIOS.base);
  const taxIncluded = call.tax_included !== false; // 기본 true

  const supplyOnlyAmount = taxIncluded
    ? Math.round(totalAmount / (1 + VAT_RATE))
    : totalAmount;
  const vatOnly = totalAmount - supplyOnlyAmount;

  let supplyAmount = totalAmount;
  let vat = 0;
  let ratio = baseRatio;
  let processingFee = 0;

  switch (call.payment_method) {
    case "cash":
    case "transfer":
      // 부가세 차감 없음, 기본비율
      supplyAmount = totalAmount;
      vat = 0;
      ratio = baseRatio;
      break;
    case "card":
    case "cash_receipt":
      // 부가세 별도, 공급가액 기준, 기본비율 - 5%p
      supplyAmount = supplyOnlyAmount;
      vat = vatOnly;
      ratio = Math.max(0, baseRatio - DEFAULT_RATIOS.cardDeduction);
      break;
    case "tax_invoice":
      // 부가세 별도, 공급가액 기준, 기본비율, 5,000원 차감
      supplyAmount = supplyOnlyAmount;
      vat = vatOnly;
      ratio = baseRatio;
      processingFee = invoiceProcessingFee;
      break;
  }

  const techShare = (supplyAmount * ratio) / 100;
  const finalTechPayout = techShare - processingFee;
  const companyShare = totalAmount - finalTechPayout;

  return {
    paymentMethod: call.payment_method,
    totalAmount,
    supplyAmount,
    vat,
    ratio,
    techShare,
    processingFee,
    finalTechPayout,
    companyShare,
  };
}

export interface SettlementTotals {
  completedCount: number;
  totalRevenue: number; // 총 완료 매출 (모든 완료 콜 금액)
  paidRevenue: number; // 입금 완료 매출 (paid만)
  unpaidRevenue: number; // 미수 매출 (unpaid만)
  techPayoutExpected: number; // 기사 정산 예정 (paid만, 미수 제외)
  unpaidTechPayout: number; // 미수 콜이 만약 입금되면 받을 금액 (참고용)
  pendingTechPayout: number; // paid + pending (정산완료 가능 금액)
  settledTechPayout: number; // paid + settled
  companyShare: number; // 회사 몫 (모든 완료 콜 기준)
  processingFee: number;
}

export function summarizeSettlements(
  rows: Array<{
    call: Pick<
      CallRow,
      "paid_amount" | "payment_method" | "settlement_status" | "payment_status"
    >;
    settlement: CallSettlement | null;
  }>,
): SettlementTotals {
  const totals: SettlementTotals = {
    completedCount: 0,
    totalRevenue: 0,
    paidRevenue: 0,
    unpaidRevenue: 0,
    techPayoutExpected: 0,
    unpaidTechPayout: 0,
    pendingTechPayout: 0,
    settledTechPayout: 0,
    companyShare: 0,
    processingFee: 0,
  };
  for (const { call, settlement } of rows) {
    if (!settlement) continue;
    totals.completedCount += 1;
    totals.totalRevenue += settlement.totalAmount;
    totals.companyShare += settlement.companyShare;
    totals.processingFee += settlement.processingFee;

    const isPaid = call.payment_status === "paid";
    if (isPaid) {
      totals.paidRevenue += settlement.totalAmount;
      // 정산 예정 / 미정산 / 정산완료는 모두 paid 콜만 집계
      totals.techPayoutExpected += settlement.finalTechPayout;
      if (call.settlement_status === "settled") {
        totals.settledTechPayout += settlement.finalTechPayout;
      } else {
        totals.pendingTechPayout += settlement.finalTechPayout;
      }
    } else {
      // 미수는 매출에만 잡히고 정산 합계에서는 제외 (참고용 값만 유지)
      totals.unpaidRevenue += settlement.totalAmount;
      totals.unpaidTechPayout += settlement.finalTechPayout;
    }
  }
  return totals;
}

export function monthKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${year}년 ${Number(month)}월`;
}
