"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { StatusBadge } from "@/components/calls/StatusBadge";
import type { CallRow, ProfileRow } from "@/types/database";

interface Props {
  calls: CallRow[];
  profiles: Array<Pick<ProfileRow, "id" | "name" | "role">>;
  // admin 만 영구삭제 UI 노출. dispatcher 는 복원만 가능 (기존 정책 유지).
  isAdmin: boolean;
}

// hard delete 안전 가드:
//   - admin only (UI/API/RLS 3중)
//   - active call (deleted_at IS NULL) 은 API 에서 skip
//   - 최대 50건
//   - 2단계 confirm: window.confirm → window.prompt("영구삭제" 입력 요구)
const HARD_DELETE_MAX = 50;
const TYPE_TO_CONFIRM = "영구삭제";

export function TrashClient({ calls, profiles, isAdmin }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // SSR prop(`calls`) 을 local state 로 받아 optimistic remove 가능하게.
  // 다른 admin/dispatcher 가 restore/hard-delete 한 경우 router.refresh() 후
  // prop 이 다시 동기화 되도록 useEffect 로 sync.
  const [localCalls, setLocalCalls] = useState<CallRow[]>(calls);
  useEffect(() => {
    setLocalCalls(calls);
  }, [calls]);

  const [search, setSearch] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [hardDeletingId, setHardDeletingId] = useState<string | null>(null);

  // bulk selection (admin only).
  // immutable 규칙: 모든 갱신은 new Set(prev) 또는 new Set([...]) 기반.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return localCalls;
    return localCalls.filter((call) =>
      [call.customer_name, call.phone, call.address, call.district ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [localCalls, search]);

  // visible 변동 시 selectedIds 자동 prune.
  // 검색 변경, restore/hard-delete 후 사라진 콜 → 선택 자동 해제.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visibleIds = new Set(visible.map((c) => c.id));
    const next = new Set<string>();
    let changed = false;
    selectedIds.forEach((id) => {
      if (visibleIds.has(id)) next.add(id);
      else changed = true;
    });
    if (changed) setSelectedIds(next);
  }, [visible, selectedIds]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      // immutable: new Set(prev) 후 add/delete
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function selectAllVisible() {
    setSelectedIds(new Set(visible.map((c) => c.id)));
  }

  async function handleRestore(callId: string, customerName: string) {
    if (restoringId || bulkDeleting || hardDeletingId) return;
    if (!window.confirm(`"${customerName}" 콜을 복원하시겠습니까?`)) {
      return;
    }
    setRestoringId(callId);
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
      // optimistic remove (복원되면 휴지통에서 사라짐). router.refresh()로 보강 동기화.
      setLocalCalls((prev) => prev.filter((c) => c.id !== callId));
      toast.success("콜이 복원되었습니다");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "복원 실패");
    } finally {
      setRestoringId(null);
    }
  }

  // 단건 영구삭제 — 2단계 confirm.
  async function handleHardDelete(call: CallRow) {
    if (hardDeletingId || bulkDeleting || restoringId) return;

    // Step 1: 일반 confirm + 사이드 이펙트 명시
    const ok1 = window.confirm(
      `정말 다음 콜을 영구 삭제하시겠습니까?\n\n` +
        `· 고객: ${call.customer_name}\n` +
        `· 주소: ${call.address}\n\n` +
        `[복구 불가] 휴지통에서도 완전히 제거됩니다.\n\n` +
        `· 해피콜/SMS 로그는 보존됩니다 (콜 연결만 끊김).\n` +
        `· 인앱 알림과 사진 메타데이터는 함께 삭제됩니다.`,
    );
    if (!ok1) return;

    // Step 2: 정확 텍스트 입력 요구.
    // trim 으로 앞뒤 공백 허용 (실수로 공백 친 케이스 구제).
    // Cancel 시 prompt 가 null 반환 → optional chaining 으로 자연 비교.
    const typed = window.prompt(
      `진짜 영구 삭제하려면 아래에 "${TYPE_TO_CONFIRM}" 라고 입력하세요.`,
      "",
    );
    if (typed?.trim() !== TYPE_TO_CONFIRM) {
      toast.message("취소되었습니다 (정확한 문구가 필요합니다)");
      return;
    }

    setHardDeletingId(call.id);
    try {
      const res = await fetch("/api/calls/hard-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_ids: [call.id] }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: number;
        skipped?: number;
        failed?: number;
        details?: { success?: string[]; skipped?: Array<{ reason: string }>; failed?: Array<{ reason: string }> };
        error?: string;
      };
      if (!res.ok) {
        const code = data.error ?? `HTTP ${res.status}`;
        const friendly =
          code === "FORBIDDEN" ? "권한이 없습니다." : code;
        throw new Error(friendly);
      }

      if ((data.success ?? 0) === 1) {
        setLocalCalls((prev) => prev.filter((c) => c.id !== call.id));
        toast.success("콜을 영구 삭제했습니다");
      } else if ((data.skipped ?? 0) > 0) {
        const reason = data.details?.skipped?.[0]?.reason;
        if (reason === "ACTIVE_CALL") {
          toast.message("이미 복원된 콜입니다. 휴지통에서 사라집니다.");
          setLocalCalls((prev) => prev.filter((c) => c.id !== call.id));
        } else {
          toast.message("처리할 수 없는 콜입니다");
        }
      } else {
        toast.error("영구 삭제 실패");
      }
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "영구 삭제 실패");
    } finally {
      setHardDeletingId(null);
    }
  }

  // 다중 영구삭제 — 2단계 confirm.
  async function handleBulkHardDelete() {
    if (bulkDeleting || hardDeletingId || restoringId) return;
    if (selectedIds.size === 0) return;
    if (selectedIds.size > HARD_DELETE_MAX) {
      toast.error(`한 번에 최대 ${HARD_DELETE_MAX}건까지 영구삭제 가능합니다.`);
      return;
    }
    const count = selectedIds.size;

    const ok1 = window.confirm(
      `정말 선택한 ${count}건 콜을 영구 삭제하시겠습니까?\n\n` +
        `[복구 불가] 휴지통에서도 완전히 제거됩니다.\n\n` +
        `· 해피콜/SMS 로그는 보존됩니다 (콜 연결만 끊김).\n` +
        `· 인앱 알림과 사진 메타데이터는 함께 삭제됩니다.\n` +
        `· 이미 복원된 콜은 자동 제외됩니다.`,
    );
    if (!ok1) return;

    // trim 으로 앞뒤 공백 허용 (실수로 공백 친 케이스 구제).
    const typed = window.prompt(
      `진짜 ${count}건 영구 삭제하려면 아래에 "${TYPE_TO_CONFIRM}" 라고 입력하세요.`,
      "",
    );
    if (typed?.trim() !== TYPE_TO_CONFIRM) {
      toast.message("취소되었습니다 (정확한 문구가 필요합니다)");
      return;
    }

    const ids = Array.from(selectedIds);
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/calls/hard-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_ids: ids }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: number;
        skipped?: number;
        failed?: number;
        details?: { success?: string[] };
        error?: string;
        limit?: number;
      };
      if (!res.ok) {
        const code = data.error ?? `HTTP ${res.status}`;
        const friendly =
          code === "FORBIDDEN"
            ? "권한이 없습니다."
            : code === "TOO_MANY"
              ? `한 번에 최대 ${data.limit ?? HARD_DELETE_MAX}건까지 영구삭제 가능합니다.`
              : code === "MISSING_CALL_IDS"
                ? "선택된 콜이 없습니다."
                : code;
        throw new Error(friendly);
      }

      // 성공 ID만 local state 제거. skipped/failed 는 router.refresh() 로 보강.
      const successIds = new Set(data.details?.success ?? []);
      if (successIds.size > 0) {
        setLocalCalls((prev) => prev.filter((c) => !successIds.has(c.id)));
      }
      setSelectedIds(new Set());

      const s = data.success ?? 0;
      const k = data.skipped ?? 0;
      const f = data.failed ?? 0;
      let msg = `${s}건 영구삭제`;
      if (k > 0) msg += ` · ${k}건 스킵`;
      if (f > 0) msg += ` · ${f}건 실패`;
      if (f > 0) toast.error(msg);
      else if (k > 0) toast.message(msg);
      else toast.success(msg);

      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "일괄 영구삭제 실패");
    } finally {
      setBulkDeleting(false);
    }
  }

  const anyBusy =
    isPending ||
    restoringId !== null ||
    hardDeletingId !== null ||
    bulkDeleting;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">휴지통</h1>
          <p className="mt-1 text-sm text-slate-500">
            삭제된 콜 {localCalls.length}건 · admin / dispatcher 만 조회/복원 가능
            {isAdmin ? ", admin 만 영구삭제" : ""}
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

      {/* 영구삭제 권한 정책 (의도된 설계, future maintainer 주의):
            admin      : 단건 + 다중 영구삭제 가능
            dispatcher : 복원만 가능 (영구삭제 UI 안 보임)
            technician : trash page 접근 자체 차단 (page.tsx requireRole 가드)
          영구삭제는 복구 불가. 2단계 confirm (window.confirm + prompt "영구삭제" 입력) 필수. */}
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm">
          <span className="font-semibold text-rose-900">
            선택 {selectedIds.size}건
            {selectedIds.size >= HARD_DELETE_MAX ? (
              <span className="ml-1 text-rose-600">(최대)</span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={selectAllVisible}
            disabled={anyBusy || visible.length === 0}
            className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            title="현재 보이는 콜 전체 선택"
          >
            전체 선택
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={anyBusy || selectedIds.size === 0}
            className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            선택 해제
          </button>
          <button
            type="button"
            onClick={handleBulkHardDelete}
            disabled={anyBusy || selectedIds.size === 0}
            className="ml-auto rounded-lg bg-rose-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkDeleting
              ? "영구삭제 중..."
              : `선택 영구삭제 (${selectedIds.size})`}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
          {localCalls.length === 0
            ? "휴지통이 비어있습니다."
            : "검색 결과가 없습니다."}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((call) => {
            const deletedBy = call.deleted_by
              ? profileMap.get(call.deleted_by as string)
              : null;
            const isThisHardDeleting = hardDeletingId === call.id;
            const isThisRestoring = restoringId === call.id;
            return (
              <div
                key={call.id}
                className="flex items-start gap-2"
              >
                {isAdmin && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(call.id)}
                    onChange={() => toggleSelected(call.id)}
                    disabled={anyBusy}
                    aria-label="콜 선택"
                    title="선택 (다중 영구삭제용)"
                    className="mt-4 h-5 w-5 flex-none cursor-pointer accent-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                  />
                )}
                <article className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
                    <div className="flex flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleRestore(call.id, call.customer_name)
                        }
                        disabled={anyBusy}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isThisRestoring ? "복원중..." : "복원"}
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleHardDelete(call)}
                          disabled={anyBusy}
                          title="영구삭제 (복구 불가)"
                          className="rounded-xl bg-rose-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isThisHardDeleting ? "삭제중..." : "영구삭제"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
