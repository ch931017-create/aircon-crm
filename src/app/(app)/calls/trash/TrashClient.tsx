"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { StatusBadge } from "@/components/calls/StatusBadge";
import type { CallRow, ProfileRow } from "@/types/database";

interface Props {
  calls: CallRow[];
  profiles: Array<Pick<ProfileRow, "id" | "name" | "role">>;
}

export function TrashClient({ calls, profiles }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return calls;
    return calls.filter((call) =>
      [call.customer_name, call.phone, call.address, call.district ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [calls, search]);

  async function handleRestore(callId: string, customerName: string) {
    if (
      !window.confirm(`"${customerName}" 콜을 복원하시겠습니까?`)
    ) {
      return;
    }
    setBusyId(callId);
    try {
      const res = await fetch("/api/calls/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: callId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast.success("콜이 복원되었습니다");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "복원 실패");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">휴지통</h1>
          <p className="mt-1 text-sm text-slate-500">
            삭제된 콜 {calls.length}건 · admin / dispatcher만 조회·복원 가능
          </p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="고객명/전화/주소 검색"
          className="w-56 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
          {calls.length === 0
            ? "휴지통이 비어있습니다."
            : "검색 결과가 없습니다."}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((call) => {
            const deletedBy = call.deleted_by
              ? profileMap.get(call.deleted_by as string)
              : null;
            return (
              <article
                key={call.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-slate-900">
                        {call.customer_name}
                      </h3>
                      <StatusBadge status={call.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {call.district ?? "지역 미정"} · {call.address}
                    </p>
                    {call.symptom && (
                      <p className="mt-1 text-xs text-slate-500">
                        {call.symptom}
                      </p>
                    )}
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600 sm:grid-cols-3">
                      <div>
                        <dt className="font-semibold text-slate-700">
                          삭제일
                        </dt>
                        <dd>
                          {call.deleted_at
                            ? format(
                                new Date(call.deleted_at as string),
                                "yyyy.M.d HH:mm",
                                { locale: ko },
                              )
                            : "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-700">
                          삭제자
                        </dt>
                        <dd>{deletedBy?.name ?? "-"}</dd>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <dt className="font-semibold text-slate-700">사유</dt>
                        <dd className="truncate">
                          {(call.delete_reason as string | null) ?? "(없음)"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleRestore(call.id, call.customer_name)
                    }
                    disabled={busyId === call.id || isPending}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {busyId === call.id ? "복원중..." : "복원"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
