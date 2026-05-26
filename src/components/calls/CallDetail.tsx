"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "./StatusBadge";
import { STATUS_LABEL } from "@/lib/call-meta";
import type { CallRow, PaymentMethod, ProfileRow } from "@/types/database";

const TECH_STATUS_FLOW: Record<CallRow["status"], CallRow["status"] | null> = {
  new: "assigned",
  assigned: null, // 완료는 정산 저장 시 처리
  on_the_way: null,
  working: null,
  scheduled: null,
  visiting: null,
  completed: null,
  cancelled: null,
};

const ALL_STATUS_OPTIONS: Array<CallRow["status"]> = [
  "new",
  "assigned",
  "completed",
  "cancelled",
];

interface CallDetailProps {
  call: CallRow;
  currentUserId: string;
  currentUserRole: ProfileRow["role"];
  technicians: Array<Pick<ProfileRow, "id" | "name">>;
  assigneeName?: string | null;
}

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "현금",
  transfer: "계좌이체",
  card: "카드결제 및 현금영수증",
  cash_receipt: "카드결제 및 현금영수증",
  tax_invoice: "세금계산서",
};

export function CallDetail({
  call,
  currentUserId,
  currentUserRole,
  technicians,
  assigneeName,
}: CallDetailProps) {
  const router = useRouter();
  const supabase = createClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    (call.payment_method as PaymentMethod) ?? "cash",
  );
  const [taxIncluded, setTaxIncluded] = useState(call.tax_included ?? false);

  const isAssignedTechnician = call.assigned_to === currentUserId;
  const isTechnician = currentUserRole === "technician";
  const canUpdateStatus = !isTechnician || isAssignedTechnician;
  const canClaim = isTechnician && call.status === "new" && !call.assigned_to;
  const canDelete =
    (currentUserRole === "admin" || currentUserRole === "dispatcher") &&
    call.status !== "completed";

  async function handleDelete() {
    const reason = window.prompt(
      `"${call.customer_name}" 콜을 삭제합니다.\n삭제 사유(선택, 비워도 됨):`,
      "",
    );
    if (reason === null) return;
    if (
      !window.confirm(
        "정말 휴지통으로 이동하시겠습니까? admin/dispatcher가 휴지통에서 복원 가능합니다.",
      )
    ) {
      return;
    }
    setDeleteLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/calls/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: call.id, reason: reason || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const code = data?.error ?? `HTTP ${res.status}`;
        const friendly =
          code === "COMPLETED_CALL_CANNOT_BE_DELETED"
            ? "완료된 콜은 삭제할 수 없습니다."
            : code === "ALREADY_DELETED"
              ? "이미 삭제된 콜입니다."
              : code === "FORBIDDEN"
                ? "삭제 권한이 없습니다."
                : code;
        throw new Error(friendly);
      }
      router.push("/calls");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeleteLoading(false);
    }
  }

  const nextStatus = TECH_STATUS_FLOW[call.status] ?? null;
  const statusOptions = useMemo(
    () => ALL_STATUS_OPTIONS.filter((status) => status !== call.status),
    [call.status],
  );

  async function handleClaim() {
    setErrorMessage(null);
    setClaimLoading(true);
    try {
      const response = await fetch("/api/calls/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: call.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessage(data.error ?? "콜 잡기에 실패했습니다.");
      } else {
        router.refresh();
      }
    } catch {
      setErrorMessage("콜 잡기에 실패했습니다.");
    } finally {
      setClaimLoading(false);
    }
  }

  async function handleStatusChange(status: string) {
    setErrorMessage(null);
    setStatusLoading(true);
    try {
      const response = await fetch("/api/calls/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: call.id, status }),
      });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessage(data.error ?? "상태 변경에 실패했습니다.");
      } else {
        router.refresh();
      }
    } catch {
      setErrorMessage("상태 변경에 실패했습니다.");
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleSettlementSubmit(event: FormEvent<HTMLFormElement>) {
    async function uploadPhotos(files: File[], type: "before" | "after") {
      if (files.length === 0) {
        return [];
      }

      const uploadedUrls: string[] = [];

      for (const file of Array.from(files)) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${call.id}/${type}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`;

        const { error } = await supabase.storage
          .from("call-photos")
          .upload(filePath, file);

        if (error) {
          // storage error.message 그대로 노출 → 진단 가능 (bucket 누락 / policy 거부 등).
          throw new Error(`사진 업로드 실패: ${error.message}`);
        }

        const { data } = supabase.storage
          .from("call-photos")
          .getPublicUrl(filePath);

        uploadedUrls.push(data.publicUrl);
      }

      return uploadedUrls;
    }

    event.preventDefault();
    setErrorMessage(null);
    setSettlementLoading(true);

    // 전체 흐름 outer try/catch/finally 로 wrap.
    //   기존 구조: try/catch 가 fetch 만 감싸서 uploadPhotos throw 시 finally 도달 X
    //              → "정산중..." 영구 stuck 버그.
    //   수정: setSettlementLoading(true) 이후 모든 async 작업을 동일 try 안에 포함.
    try {
      const formData = new FormData(event.currentTarget);
      const beforeFiles = formData
        .getAll("before_photos")
        .filter((file): file is File => file instanceof File && file.size > 0);

      const afterFiles = formData
        .getAll("after_photos")
        .filter((file): file is File => file instanceof File && file.size > 0);

      const beforePhotoUrls = await uploadPhotos(beforeFiles, "before");
      const afterPhotoUrls = await uploadPhotos(afterFiles, "after");

      const payload = {
        call_id: call.id,
        payment_method: formData.get("payment_method")?.toString(),
        paid_amount: Number(formData.get("paid_amount")),
        technician_amount: Number(formData.get("technician_amount") || 0),
        customer_amount: Number(formData.get("customer_amount") || 0),
        happy_call_checked: formData.get("happy_call_checked") === "on",
        happy_call_memo:
          formData.get("happy_call_memo")?.toString() ?? null,
        happy_call_checked_at:
          formData.get("happy_call_checked") === "on"
            ? new Date().toISOString()
            : null,
        tax_included: formData.get("tax_included") === "on",
        invoice_business_id:
          formData.get("invoice_business_id")?.toString() ?? null,
        invoice_business_name:
          formData.get("invoice_business_name")?.toString() ?? null,
        invoice_ceo_name:
          formData.get("invoice_ceo_name")?.toString() ?? null,
        invoice_email: formData.get("invoice_email")?.toString() ?? null,
        tax_invoice_file_url:
          formData.get("tax_invoice_file_url")?.toString() ?? null,
        settlement_note: formData.get("settlement_note")?.toString() ?? null,
        before_photo_urls: beforePhotoUrls,
        after_photo_urls: afterPhotoUrls,
        scheduled_date: formData.get("scheduled_date")?.toString() || null,
        reschedule_note: formData.get("reschedule_note")?.toString() || null,
        rescheduled: !!formData.get("scheduled_date"),
        rescheduled_at: formData.get("scheduled_date")
          ? new Date().toISOString()
          : null,
        happycall_customer_paid_amount:
          Number(formData.get("happycall_customer_paid_amount")) || null,
        happycall_amount_mismatch:
          Number(formData.get("happycall_customer_paid_amount")) > 0 &&
          Number(formData.get("happycall_customer_paid_amount")) !==
            call.paid_amount,
      };

      const response = await fetch("/api/calls/settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(data.error ?? "정산 저장에 실패했습니다.");
        return;
      }
      if (data.happy_call_url) {
        alert(`고객 확인 링크 생성 완료\n\n${data.happy_call_url}`);
      }
      router.refresh();
    } catch (err) {
      // uploadPhotos throw 든 fetch throw 든 모두 여기에서 처리.
      // error.message 그대로 노출 → 사용자가 "사진 업로드 실패: <원인>" 등 식별 가능.
      const msg =
        err instanceof Error ? err.message : "정산 저장 중 오류가 발생했습니다.";
      setErrorMessage(msg);
      console.warn("[settlement] submit failed:", err);
    } finally {
      // 어떤 경로(성공/실패/upload error)로든 loading 해제 보장 → 무한 "정산중.." 방지.
      setSettlementLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <button
  type="button"
  onClick={() => router.back()}
  className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
>
  ← 뒤로가기
</button>
            <h1 className="text-xl font-semibold">콜 상세</h1>
            <p className="text-sm text-slate-500">콜 상태와 정산 정보를 확인하고 업데이트하세요.</p>
          </div>
          <div className="space-x-2 text-right text-sm text-slate-500">
            <p>{STATUS_LABEL[call.status]}</p>
            <p className="text-slate-400">ID {call.id.slice(0, 8)}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm text-slate-500">고객명</p>
            <p className="text-base font-medium text-slate-900">{call.customer_name}</p>
          </div>
         <div className="space-y-2">
  <p className="text-sm text-slate-500">전화번호</p>

  <a
    href={`tel:${call.phone}`}
    className="flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-600"
  >
    📞 {call.phone}
  </a>
</div>
          <div className="space-y-2 sm:col-span-2">
  <p className="text-sm text-slate-500">주소</p>

  <div className="grid gap-2 sm:grid-cols-2">
    <a
      href={`https://map.naver.com/v5/search/${encodeURIComponent(call.address)}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-center rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600"
    >
      🗺 네이버지도
    </a>

    <a
      href={`https://map.kakao.com/?q=${encodeURIComponent(call.address)}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-center rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-yellow-300"
    >
      🚕 카카오맵
    </a>
  </div>

  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
    {call.address}
  </p>
</div>
          <div className="space-y-2">
            <p className="text-sm text-slate-500">지역구</p>
            <p className="text-base font-medium text-slate-900">{call.district ?? "미지정"}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-slate-500">희망 시간</p>
            <div className="space-y-3">
  <p className="text-base font-medium text-slate-900">
  {call.preferred_time
    ? new Date(call.preferred_time).toLocaleString("ko-KR", {
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "없음"}
</p>

  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <p className="mb-2 text-sm font-semibold text-amber-800">
      방문 날짜 변경
    </p>

    <input
      type="date"
      name="scheduled_date"
      defaultValue={(call.scheduled_date as string | null | undefined) ?? ""}
      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none"
    />

    <textarea
      name="reschedule_note"
      placeholder="날짜 변경 사유 입력"
      rows={2}
      className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none"
    />
  </div>
</div>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-slate-500">견적 금액</p>
            <p className="text-base font-medium text-slate-900">
              {call.estimated_amount != null ? `${call.estimated_amount.toLocaleString()}원` : "미정"}
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm text-slate-500">증상 / 메모</p>
            <p className="whitespace-pre-line rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              {call.symptom ?? call.memo ?? "없음"}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
  <div className="flex items-center justify-between gap-3">
    <div>
      <p className="text-sm text-slate-500">현재 진행 상태</p>

      <div className="mt-2 flex items-center gap-2">
        <StatusBadge status={call.status} />

        <span className="text-lg font-semibold text-slate-900">
          {STATUS_LABEL[call.status]}
        </span>
      </div>
    </div>

    {assigneeName ? (
      <div className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
        👨‍🔧 {assigneeName}
      </div>
    ) : (
      <div className="rounded-2xl bg-amber-100 px-4 py-2 text-sm font-medium text-amber-700">
        기사 미배정
      </div>
    )}
  </div>
</div>
      </div>

      {canClaim && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">콜 잡기</h2>
          <p className="mt-1 text-sm text-slate-500">본인에게 배정되지 않은 콜을 직접 잡을 수 있습니다.</p>
          <button
            type="button"
            onClick={handleClaim}
            disabled={claimLoading}
            className="mt-4 rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition disabled:opacity-60 hover:bg-brand-700"
          >
            {claimLoading ? "잡는 중..." : "이 콜 잡기"}
          </button>
          {errorMessage && (
            <p className="mt-3 text-sm text-rose-600">{errorMessage}</p>
          )}
        </div>
      )}

      {isTechnician && isAssignedTechnician ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">방문 완료 & 정산</h2>
              <p className="mt-1 text-sm text-slate-500">
                현장에서 결제 정보를 입력하면 콜이 완료 처리됩니다.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              현재: {STATUS_LABEL[call.status]}
            </span>
          </div>

          <form onSubmit={handleSettlementSubmit} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">결제방식</span>
                <select
                  name="payment_method"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="cash">현금</option>
                  <option value="transfer">계좌이체</option>
                  <option value="card">카드결제 및 현금영수증</option>
                  <option value="tax_invoice">세금계산서</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">결제 금액</span>
                <input
                  name="paid_amount"
                  type="number"
                  step="1000"
                  min="0"
                  defaultValue={call.paid_amount ?? undefined}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </label>
            </div>

           

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="tax_included"
                checked={taxIncluded}
                onChange={(event) => setTaxIncluded(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span className="text-sm text-slate-700">부가세 포함</span>
            </label>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
</div>

            {paymentMethod === "tax_invoice" && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="사업자등록번호" name="invoice_business_id" defaultValue={call.invoice_business_id ?? ""} />
                  <Field label="상호" name="invoice_business_name" defaultValue={call.invoice_business_name ?? ""} />
                  <Field label="대표자명" name="invoice_ceo_name" defaultValue={call.invoice_ceo_name ?? ""} />
                  <Field label="이메일" name="invoice_email" type="email" defaultValue={call.invoice_email ?? ""} />
                </div>
                <Field
                  label="사업자등록증 / 첨부파일 URL (선택)"
                  name="tax_invoice_file_url"
                  type="url"
                  defaultValue={
                    (call.tax_invoice_file_url as string | null | undefined) ?? ""
                  }
                />
              </div>
            )}
<div className="grid gap-3 sm:grid-cols-2">
  <label className="block">
    <span className="mb-1 block text-sm font-medium text-slate-700">
      수리 전 사진
    </span>
    <input
      name="before_photos"
      type="file"
      accept="image/*"
      multiple
      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
    />
    <p className="mt-1 text-xs text-slate-500">
      여러 장 선택 가능합니다.
    </p>
  </label>

  <label className="block">
    <span className="mb-1 block text-sm font-medium text-slate-700">
      수리 후 사진
    </span>
    <input
      name="after_photos"
      type="file"
      accept="image/*"
      multiple
      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
    />
    <p className="mt-1 text-xs text-slate-500">
      여러 장 선택 가능합니다.
    </p>
  </label>
</div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">정산 메모</span>
              <textarea
                name="settlement_note"
                defaultValue={call.settlement_note ?? ""}
                rows={3}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>

            {errorMessage && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
            )}

            <button
              type="submit"
              disabled={settlementLoading}
              className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition disabled:opacity-60 hover:bg-brand-700"
            >
              {settlementLoading ? "저장 중..." : call.status === "assigned" ? "완료 처리" : "정산 정보 저장"}
            </button>
          </form>
        </div>
      ) : canUpdateStatus ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">상태 변경</h2>
              <p className="mt-1 text-sm text-slate-500">
                {currentUserRole === "technician"
                  ? "본인에게 배정된 콜만 상태 변경할 수 있습니다."
                  : "전체 콜의 상태를 변경할 수 있습니다."}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              현재: {STATUS_LABEL[call.status]}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {currentUserRole === "technician" ? (
              nextStatus ? (
                <button
                  type="button"
                  onClick={() => handleStatusChange(nextStatus)}
                  disabled={statusLoading}
                  className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition disabled:opacity-60 hover:bg-brand-700"
                >
                  {statusLoading ? "변경 중..." : `다음 단계로: ${STATUS_LABEL[nextStatus]}`}
                </button>
              ) : (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  현재 상태에서는 추가 이동이 없습니다.
                </p>
              )
            ) : (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget as HTMLFormElement);
                  const status = formData.get("status")?.toString();
                  if (status) await handleStatusChange(status);
                }}
                className="space-y-3"
              >
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">새 상태</span>
                  <select
                    name="status"
                    defaultValue={call.status}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABEL[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={statusLoading}
                  className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition disabled:opacity-60 hover:bg-brand-700"
                >
                  {statusLoading ? "변경 중..." : "상태 변경"}
                </button>
              </form>
            )}
          </div>
          {errorMessage && (
            <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p>
          )}
        </div>
      ) : null}

{call.status === "completed" && (
  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-semibold">수리 사진</h2>

    <div className="mt-4 space-y-5">
      <PhotoSection
  title="수리 전 사진"
  urls={Array.isArray(call.before_photo_urls) ? call.before_photo_urls : []}
/>
<PhotoSection
  title="수리 후 사진"
  urls={Array.isArray(call.after_photo_urls) ? call.after_photo_urls : []}
/>
    </div>
  </div>
)}
      {call.status === "completed" && call.paid_amount != null && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">결제 정보</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DetailItem label="결제방식" value={call.payment_method ? PAYMENT_METHOD_LABEL[call.payment_method] : "-"} />
            <DetailItem label="결제금액" value={`${call.paid_amount.toLocaleString()}원`} />
            <DetailItem label="부가세" value={call.tax_included ? "포함" : "별도"} />
            <DetailItem label="정산 메모" value={call.settlement_note ?? "-"} />
            {call.payment_method === "tax_invoice" && (
              <>
                <DetailItem label="사업자등록번호" value={call.invoice_business_id ?? "-"} />
                <DetailItem label="상호" value={call.invoice_business_name ?? "-"} />
                <DetailItem label="대표자명" value={call.invoice_ceo_name ?? "-"} />
                <DetailItem label="이메일" value={call.invoice_email ?? "-"} />
              </>
            )}
            
      
          </div>
        </div>
      )}
      {call.status === "completed" && call.customer_confirmed_at && (
  <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          고객 확인 결과
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          고객이 문자 링크를 통해 직접 입력한 해피콜 결과입니다.
        </p>
      </div>

      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
        확인 완료
      </span>
    </div>

    {!isTechnician &&
      call.customer_amount != null &&
      call.paid_amount != null &&
      Number(call.customer_amount) !== Number(call.paid_amount) && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-extrabold text-rose-700">
            ⚠ 고객 확인 금액 불일치
          </p>
          <p className="mt-1 text-xs text-rose-600">
            기사 입력 금액과 고객이 직접 입력한 실제 결제금액이 다릅니다.
          </p>
        </div>
      )}

    <div className="grid gap-3 sm:grid-cols-2">
      {!isTechnician && (
        <>
          <DetailItem
            label="고객 입력 결제금액"
            value={
              call.customer_amount != null
                ? `${Number(call.customer_amount).toLocaleString()}원`
                : "-"
            }
          />

          <DetailItem
            label="기사 입력 결제금액"
            value={
              call.paid_amount != null
                ? `${Number(call.paid_amount).toLocaleString()}원`
                : "-"
            }
          />
        </>
      )}

      <DetailItem
        label="서비스 점수"
        value={
          call.customer_service_score != null
            ? `${call.customer_service_score}점`
            : "-"
        }
      />

      <DetailItem
        label="가스 충전 여부"
        value={call.customer_gas_charged ? "예" : "아니오"}
      />

      <DetailItem
        label="가스 설명 여부"
        value={
          call.customer_gas_charged
            ? call.customer_gas_explained
              ? "예"
              : "아니오"
            : "해당 없음"
        }
      />

      <DetailItem
        label="확인 시간"
        value={
          call.customer_confirmed_at
            ? new Date(call.customer_confirmed_at).toLocaleString("ko-KR")
            : "-"
        }
      />

      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 sm:col-span-2">
        <p className="text-xs text-slate-500">고객 메모</p>
        <p className="mt-1 whitespace-pre-line font-medium text-slate-900">
          {(call.customer_happycall_memo as string | null | undefined) || "-"}
        </p>
      </div>
    </div>
  </div>
)}

{canDelete && (
  <div className="rounded-3xl border border-rose-200 bg-rose-50/40 p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-rose-800">콜 삭제</h2>
        <p className="mt-1 text-sm text-rose-600">
          휴지통으로 이동됩니다. admin / dispatcher가 휴지통에서 복원할 수 있습니다.
        </p>
      </div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleteLoading}
        className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
      >
        {deleteLoading ? "삭제중..." : "🗑 콜 삭제"}
      </button>
    </div>
  </div>
)}
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}

function PhotoSection({ title, urls }: { title: string; urls: string[] }) {
  if (urls.length === 0) {
    return (
      <div>
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          등록된 사진이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {urls.map((url) => (
          <a key={url} href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt={title}
              className="aspect-square w-full rounded-3xl border border-slate-200 object-cover shadow-sm transition hover:scale-[1.02] hover:shadow-lg"
            />
          </a>
        ))}
      </div>
    </div>
  );
}