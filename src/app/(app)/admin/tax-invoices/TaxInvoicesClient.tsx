"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type { CallRow, ProfileRow, UserRole } from "@/types/database";
import { formatKRW } from "@/lib/utils";

interface Props {
  calls: CallRow[];
  profiles: Array<Pick<ProfileRow, "id" | "name" | "role">>;
  currentUserRole: UserRole;
}

type IssueFilter = "all" | "issued" | "unissued";

export function TaxInvoicesClient({
  calls,
  profiles,
  currentUserRole,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
  const [memoDraft, setMemoDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const canManage =
    currentUserRole === "admin" || currentUserRole === "dispatcher";
  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return calls.filter((call) => {
      if (issueFilter === "issued" && !call.tax_invoice_issued) return false;
      if (issueFilter === "unissued" && call.tax_invoice_issued) return false;
      if (!term) return true;
      return [
        call.customer_name,
        call.phone,
        call.address,
        call.invoice_business_id ?? "",
        call.invoice_business_name ?? "",
        call.invoice_ceo_name ?? "",
        call.invoice_email ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [calls, search, issueFilter]);

  const totals = useMemo(() => {
    let issuedCount = 0;
    let unissuedCount = 0;
    let totalAmount = 0;
    for (const call of filtered) {
      totalAmount += Number(call.paid_amount ?? 0);
      if (call.tax_invoice_issued) issuedCount += 1;
      else unissuedCount += 1;
    }
    return { issuedCount, unissuedCount, totalAmount };
  }, [filtered]);

  async function persist(
    callId: string,
    body: { issued?: boolean; memo?: string },
  ) {
    if (!canManage) {
      toast.error("권한이 없습니다.");
      return;
    }
    setSavingId(callId);
    try {
      const res = await fetch("/api/admin/tax-invoices/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: callId, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "저장에 실패했습니다.");
        return;
      }
      toast.success(
        body.issued === true
          ? "발행완료 처리되었습니다."
          : body.issued === false
            ? "미발행으로 되돌렸습니다."
            : "메모가 저장되었습니다.",
      );
      startTransition(() => router.refresh());
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              검색
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="고객명, 사업자번호, 상호, 이메일"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              발행 상태
            </span>
            <select
              value={issueFilter}
              onChange={(event) =>
                setIssueFilter(event.target.value as IssueFilter)
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="all">전체</option>
              <option value="unissued">미발행</option>
              <option value="issued">발행완료</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="총 건수" value={`${filtered.length}건`} />
        <SummaryCard
          label="미발행"
          value={`${totals.unissuedCount}건`}
          tone="warning"
        />
        <SummaryCard
          label="발행완료"
          value={`${totals.issuedCount}건`}
          tone="success"
        />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            세금계산서 대상 콜이 없습니다.
          </div>
        ) : (
          <>
            {/* 데스크탑: 표 형태 */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[1100px] w-full text-xs text-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-2 py-2">완료일</th>
                    <th className="px-2 py-2">고객</th>
                    <th className="px-2 py-2">기사</th>
                    <th className="px-2 py-2 text-right">금액</th>
                    <th className="px-2 py-2">사업자번호</th>
                    <th className="px-2 py-2">상호</th>
                    <th className="px-2 py-2">대표자</th>
                    <th className="px-2 py-2">이메일</th>
                    <th className="px-2 py-2">주소</th>
                    <th className="px-2 py-2">첨부</th>
                    <th className="px-2 py-2">상태</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((call) => {
                    const techName = call.assigned_to
                      ? profileMap.get(call.assigned_to)?.name ?? "-"
                      : "-";
                    return (
                      <tr
                        key={call.id}
                        className="border-t border-slate-100 align-top"
                      >
                        <td className="px-2 py-2">
                          {call.completed_at
                            ? new Date(call.completed_at).toLocaleDateString(
                                "ko-KR",
                              )
                            : "-"}
                        </td>
                        <td className="px-2 py-2">
                          <Link
                            href={`/calls/${call.id}`}
                            className="text-brand-700 hover:underline"
                          >
                            {call.customer_name}
                          </Link>
                          <div className="text-[11px] text-slate-500">
                            {call.phone}
                          </div>
                        </td>
                        <td className="px-2 py-2">{techName}</td>
                        <td className="px-2 py-2 text-right font-semibold">
                          {formatKRW(call.paid_amount)}
                        </td>
                        <td className="px-2 py-2">
                          {call.invoice_business_id ?? "-"}
                        </td>
                        <td className="px-2 py-2">
                          {call.invoice_business_name ?? "-"}
                        </td>
                        <td className="px-2 py-2">
                          {call.invoice_ceo_name ?? "-"}
                        </td>
                        <td className="px-2 py-2">
                          {call.invoice_email ?? "-"}
                        </td>
                        <td className="px-2 py-2">{call.address}</td>
                        <td className="px-2 py-2">
                          {call.tax_invoice_file_url ? (
                            <a
                              href={call.tax_invoice_file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-700 hover:underline"
                            >
                              파일
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <StatusPill issued={call.tax_invoice_issued} />
                          {call.tax_invoice_issued_at ? (
                            <div className="mt-1 text-[10px] text-slate-500">
                              {new Date(
                                call.tax_invoice_issued_at,
                              ).toLocaleString("ko-KR")}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          {canManage ? (
                            <div className="flex flex-col gap-1.5">
                              <button
                                type="button"
                                disabled={pending || savingId === call.id}
                                onClick={() =>
                                  persist(call.id, {
                                    issued: !call.tax_invoice_issued,
                                  })
                                }
                                className={
                                  call.tax_invoice_issued
                                    ? "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                    : "rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                                }
                              >
                                {call.tax_invoice_issued
                                  ? "발행취소"
                                  : "발행완료"}
                              </button>
                              <MemoEditor
                                callId={call.id}
                                initial={call.tax_invoice_memo ?? ""}
                                draft={memoDraft[call.id]}
                                onDraft={(v) =>
                                  setMemoDraft((prev) => ({
                                    ...prev,
                                    [call.id]: v,
                                  }))
                                }
                                disabled={pending || savingId === call.id}
                                onSave={(memo) =>
                                  persist(call.id, { memo })
                                }
                              />
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500">
                              {call.tax_invoice_memo ?? "-"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일: 카드 리스트 */}
            <ul className="space-y-2 lg:hidden">
              {filtered.map((call) => {
                const techName = call.assigned_to
                  ? profileMap.get(call.assigned_to)?.name ?? "-"
                  : "-";
                return (
                  <li
                    key={call.id}
                    className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">
                        {call.completed_at
                          ? new Date(call.completed_at).toLocaleDateString(
                              "ko-KR",
                            )
                          : "-"}
                      </div>
                      <StatusPill issued={call.tax_invoice_issued} />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-2">
                      <Link
                        href={`/calls/${call.id}`}
                        className="text-base font-semibold text-brand-700 hover:underline"
                      >
                        {call.customer_name}
                      </Link>
                      <p className="text-sm font-semibold">
                        {formatKRW(call.paid_amount)}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500">{call.address}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <Cell label="기사" value={techName} />
                      <Cell label="사업자번호" value={call.invoice_business_id ?? "-"} />
                      <Cell label="상호" value={call.invoice_business_name ?? "-"} />
                      <Cell label="대표자" value={call.invoice_ceo_name ?? "-"} />
                      <Cell label="이메일" value={call.invoice_email ?? "-"} />
                      <Cell
                        label="첨부"
                        value={
                          call.tax_invoice_file_url ? (
                            <a
                              href={call.tax_invoice_file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-700 hover:underline"
                            >
                              파일
                            </a>
                          ) : (
                            "-"
                          )
                        }
                      />
                    </dl>
                    {canManage ? (
                      <div className="mt-3 flex flex-col gap-2">
                        <button
                          type="button"
                          disabled={pending || savingId === call.id}
                          onClick={() =>
                            persist(call.id, {
                              issued: !call.tax_invoice_issued,
                            })
                          }
                          className={
                            call.tax_invoice_issued
                              ? "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                              : "w-full rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                          }
                        >
                          {call.tax_invoice_issued ? "발행취소" : "발행완료"}
                        </button>
                        <MemoEditor
                          callId={call.id}
                          initial={call.tax_invoice_memo ?? ""}
                          draft={memoDraft[call.id]}
                          onDraft={(v) =>
                            setMemoDraft((prev) => ({
                              ...prev,
                              [call.id]: v,
                            }))
                          }
                          disabled={pending || savingId === call.id}
                          onSave={(memo) => persist(call.id, { memo })}
                        />
                      </div>
                    ) : call.tax_invoice_memo ? (
                      <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        메모: {call.tax_invoice_memo}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function MemoEditor({
  callId,
  initial,
  draft,
  onDraft,
  disabled,
  onSave,
}: {
  callId: string;
  initial: string;
  draft: string | undefined;
  onDraft: (value: string) => void;
  disabled: boolean;
  onSave: (memo: string) => void;
}) {
  const value = draft ?? initial;
  const isDirty = value !== initial;
  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(event) => onDraft(event.target.value)}
        placeholder="메모"
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-brand-500"
      />
      <button
        type="button"
        disabled={disabled || !isDirty}
        onClick={() => onSave(value)}
        className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
      >
        저장
      </button>
      {/* keep callId reference for key stability checks */}
      <span className="hidden" data-call-id={callId} />
    </div>
  );
}

function StatusPill({ issued }: { issued: boolean }) {
  return issued ? (
    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
      발행완료
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
      미발행
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
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
    </div>
  );
}

function Cell({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-900">{value}</dd>
    </>
  );
}
