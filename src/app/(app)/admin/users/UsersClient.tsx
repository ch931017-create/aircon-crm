"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ApprovalStatus, ProfileRow, UserRole } from "@/types/database";

// 인라인 편집 대상 셀. 같은 row에서 name → phone 으로 순차 편집은 허용 안 함
// (별도 클릭 필요) → 실수 저장 방지.
type EditTarget = { id: string; field: "name" | "phone" } | null;

type ProfileLite = Pick<
  ProfileRow,
  | "id"
  | "name"
  | "phone"
  | "role"
  | "is_active"
  | "created_at"
  | "approval_status"
  | "approved_at"
  | "approved_by"
>;

type Tab = "all" | "pending" | "admin" | "dispatcher" | "technician";

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "관리자",
  dispatcher: "콜직원",
  technician: "기사",
};

const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: "대기",
  approved: "승인",
  rejected: "거절",
};

export function UsersClient({
  initialProfiles,
  currentUserId,
}: {
  initialProfiles: ProfileLite[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createRole, setCreateRole] = useState<UserRole>("dispatcher");

  // inline 편집 상태. editTarget이 set되면 해당 cell이 input 모드.
  // editValue는 input의 current 값 (controlled). editSaving은 저장 중 중복 방지.
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [editValue, setEditValue] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  // 삭제 진행 중인 user_id. 중복 클릭/요청 차단 + 해당 row 버튼 "삭제중..." 표시.
  // 한 번에 한 row만 삭제 진행 (간단한 UX, race 회피).
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // 편집 모드 진입 시 input에 포커스 + 전체 선택 (빠른 덮어쓰기)
  useEffect(() => {
    if (editTarget && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editTarget]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialProfiles.filter((p) => {
      if (tab === "pending" && p.approval_status !== "pending") return false;
      if (tab === "admin" && p.role !== "admin") return false;
      if (tab === "dispatcher" && p.role !== "dispatcher") return false;
      if (tab === "technician" && p.role !== "technician") return false;
      if (q) {
        const hay = `${p.name} ${p.phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [initialProfiles, tab, search]);

  const pendingCount = initialProfiles.filter(
    (p) => p.approval_status === "pending",
  ).length;

  // 마지막 admin 가드용 카운트.
  // "활성 admin" = role=admin AND is_active AND approval_status=approved.
  // 이 카운트가 1이고 삭제 대상이 그 활성 admin이면 UI에서도 disable.
  // 서버 측에도 동일 검증 있음 (방어 X 2).
  const activeAdminCount = useMemo(
    () =>
      initialProfiles.filter(
        (p) =>
          p.role === "admin" &&
          p.is_active === true &&
          p.approval_status === "approved",
      ).length,
    [initialProfiles],
  );

  async function callApi(url: string, body: object) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function handleApprove(userId: string, approve: boolean) {
    try {
      await callApi("/api/admin/users/approve", {
        user_id: userId,
        action: approve ? "approve" : "reject",
      });
      toast.success(approve ? "승인되었습니다" : "거절되었습니다");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리 실패");
    }
  }

  async function handleRoleChange(userId: string, role: UserRole) {
    try {
      await callApi("/api/admin/users/role", { user_id: userId, role });
      toast.success(`역할이 ${ROLE_LABEL[role]}로 변경되었습니다`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "변경 실패");
    }
  }

  async function handleToggleActive(userId: string, isActive: boolean) {
    try {
      await callApi("/api/admin/users/toggle-active", {
        user_id: userId,
        is_active: isActive,
      });
      toast.success(isActive ? "활성화되었습니다" : "비활성화되었습니다");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리 실패");
    }
  }

  function startEdit(id: string, field: "name" | "phone", current: string | null) {
    if (editSaving) return;
    setEditTarget({ id, field });
    setEditValue(current ?? "");
  }

  function cancelEdit() {
    setEditTarget(null);
    setEditValue("");
  }

  async function saveEdit() {
    if (!editTarget) return;
    if (editSaving) return;

    const field = editTarget.field;
    const original =
      initialProfiles.find((p) => p.id === editTarget.id)?.[field] ?? "";
    const next = editValue.trim();

    // 변경 없으면 그대로 닫기 (불필요한 API 호출 방지)
    if (next === (original ?? "")) {
      cancelEdit();
      return;
    }

    // name은 비울 수 없음 (서버에서도 검증되지만 UX 빠르게)
    if (field === "name" && !next) {
      toast.error("이름은 비울 수 없습니다");
      return;
    }

    setEditSaving(true);
    try {
      await callApi("/api/admin/users/update", {
        user_id: editTarget.id,
        [field]: next,
      });
      toast.success(field === "name" ? "이름이 수정되었습니다" : "전화번호가 수정되었습니다");
      cancelEdit();
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "수정 실패";
      if (msg.includes("NAME_EMPTY")) toast.error("이름은 비울 수 없습니다");
      else if (msg.includes("NAME_TOO_LONG")) toast.error("이름이 너무 깁니다 (최대 100자)");
      else if (msg.includes("PHONE_TOO_LONG")) toast.error("전화번호가 너무 깁니다");
      else toast.error(msg);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(p: ProfileLite) {
    // 진행 중인 삭제가 있으면 중복 차단 (다른 row 클릭도 막음 — 단순한 UX).
    if (deletingUserId) return;

    // 클라이언트 가드 (서버에도 동일 검증):
    //   1) 본인 ID 차단
    //   2) 마지막 활성 admin 차단
    if (p.id === currentUserId) {
      toast.error("본인 계정은 삭제할 수 없습니다");
      return;
    }
    const isLastActiveAdmin =
      p.role === "admin" &&
      p.is_active === true &&
      p.approval_status === "approved" &&
      activeAdminCount <= 1;
    if (isLastActiveAdmin) {
      toast.error("마지막 활성 관리자는 삭제할 수 없습니다");
      return;
    }

    // 강한 confirm. 사용자 이름/역할 + 복구 불가 + 사이드 이펙트 4가지 명시.
    const roleLabel = ROLE_LABEL[p.role];
    const ok = window.confirm(
      `정말 다음 계정을 영구 삭제하시겠습니까?\n\n` +
        `· 이름: ${p.name || "(이름없음)"}\n` +
        `· 역할: ${roleLabel}\n\n` +
        `[복구 불가] 이 작업은 되돌릴 수 없습니다.\n\n` +
        `· 이 계정으로 더 이상 로그인할 수 없습니다.\n` +
        `· 푸시 알림 구독은 함께 삭제됩니다.\n` +
        `· 이 사용자가 배정/생성/삭제한 콜과 해피콜 로그는 보존됩니다\n` +
        `  (담당자 필드는 빈 값으로 변경됨).`,
    );
    if (!ok) return;

    setDeletingUserId(p.id);
    try {
      await callApi("/api/admin/users/delete", { user_id: p.id });
      toast.success(`${p.name || "계정"}을 삭제했습니다`);
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "삭제 실패";
      if (msg.includes("CANNOT_DELETE_SELF"))
        toast.error("본인 계정은 삭제할 수 없습니다");
      else if (msg.includes("CANNOT_DELETE_LAST_ADMIN"))
        toast.error("마지막 활성 관리자는 삭제할 수 없습니다");
      else if (msg.includes("NOT_FOUND"))
        toast.error("이미 삭제된 계정입니다");
      else toast.error(msg);
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleCreate(formData: FormData) {
    const payload = {
      name: String(formData.get("name") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      role: createRole,
    };
    if (!payload.name || !payload.phone || !payload.email || !payload.password) {
      toast.error("모든 항목을 입력하세요");
      return;
    }
    if (payload.password.length < 8) {
      toast.error("비밀번호는 8자 이상이어야 합니다");
      return;
    }
    try {
      await callApi("/api/admin/users/create", payload);
      toast.success(`${ROLE_LABEL[createRole]} 계정이 생성되었습니다`);
      setShowCreate(false);
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "생성 실패";
      if (msg.includes("ALREADY_REGISTERED")) toast.error("이미 등록된 이메일입니다");
      else if (msg.includes("PASSWORD_TOO_SHORT")) toast.error("비밀번호가 너무 짧습니다");
      else toast.error(msg);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">사용자 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            관리자/콜직원/기사 계정 생성, 역할 변경, 승인 처리.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showCreate ? "닫기" : "+ 계정 생성"}
        </button>
      </div>

      {showCreate ? (
        <form
          action={handleCreate}
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
        >
          <h2 className="text-base font-semibold">새 계정 생성</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                역할
              </span>
              <select
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as UserRole)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="dispatcher">콜직원</option>
                <option value="technician">기사</option>
                <option value="admin">관리자</option>
              </select>
            </label>
            <Field label="이름" name="name" type="text" />
            <Field label="휴대폰" name="phone" type="tel" placeholder="010-1234-5678" />
            <Field label="이메일" name="email" type="email" />
            <Field label="비밀번호 (8자 이상)" name="password" type="password" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              생성
            </button>
          </div>
          <p className="text-xs text-slate-500">
            생성된 계정은 이메일 인증 없이 즉시 로그인 가능하며, 승인 상태도 자동으로 &apos;승인&apos;
            처리됩니다.
          </p>
        </form>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", `전체 (${initialProfiles.length})`],
            ["pending", `승인 대기 (${pendingCount})`],
            ["admin", "관리자"],
            ["dispatcher", "콜직원"],
            ["technician", "기사"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            {label}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름/휴대폰 검색"
          className="ml-auto w-44 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          해당 조건의 사용자가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">휴대폰</th>
                <th className="px-4 py-3">역할</th>
                <th className="px-4 py-3">승인</th>
                <th className="px-4 py-3">활성</th>
                <th className="px-4 py-3">가입일</th>
                <th className="px-4 py-3 text-right">동작</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isEditingName =
                  editTarget?.id === p.id && editTarget.field === "name";
                const isEditingPhone =
                  editTarget?.id === p.id && editTarget.field === "phone";
                return (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {isEditingName ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        // blur 자동저장 제거 (실수 방지): 다른 곳 클릭 시 변경 폐기 후 편집 종료.
                        // 명시적 저장은 Enter 만 인정. Esc / blur 는 모두 취소.
                        onBlur={() => {
                          if (editSaving) return;
                          cancelEdit();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveEdit();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelEdit();
                          }
                        }}
                        disabled={editSaving}
                        maxLength={100}
                        className="w-full rounded-lg border border-brand-500 bg-white px-2 py-1 text-sm outline-none ring-2 ring-brand-100 disabled:opacity-60"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(p.id, "name", p.name)}
                        title="클릭하여 수정 (Enter 저장, Esc 취소)"
                        className="w-full rounded px-1 py-0.5 text-left hover:bg-slate-100"
                      >
                        {p.name || "(이름없음)"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {isEditingPhone ? (
                      <input
                        ref={editInputRef}
                        type="tel"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        // blur 자동저장 제거 (실수 방지): 명시적 저장은 Enter 만 인정.
                        onBlur={() => {
                          if (editSaving) return;
                          cancelEdit();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveEdit();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelEdit();
                          }
                        }}
                        disabled={editSaving}
                        maxLength={30}
                        placeholder="010-1234-5678"
                        className="w-full rounded-lg border border-brand-500 bg-white px-2 py-1 text-sm outline-none ring-2 ring-brand-100 disabled:opacity-60"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(p.id, "phone", p.phone ?? "")}
                        title="클릭하여 수정 (Enter 저장, Esc 취소)"
                        className="w-full rounded px-1 py-0.5 text-left text-slate-700 hover:bg-slate-100"
                      >
                        {p.phone ?? "-"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={p.role}
                      disabled={isPending}
                      onChange={(e) =>
                        handleRoleChange(p.id, e.target.value as UserRole)
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      <option value="admin">관리자</option>
                      <option value="dispatcher">콜직원</option>
                      <option value="technician">기사</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        p.approval_status === "approved"
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                          : p.approval_status === "pending"
                            ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700"
                            : "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700"
                      }
                    >
                      {APPROVAL_LABEL[p.approval_status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleToggleActive(p.id, !p.is_active)}
                      className={
                        p.is_active
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200"
                          : "rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
                      }
                    >
                      {p.is_active ? "활성" : "비활성"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(p.created_at).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(() => {
                      // 삭제 가드 (UI 측):
                      //   - 본인 계정 → disable
                      //   - 마지막 활성 admin → disable (해당 admin 자신만)
                      // 둘 다 서버에서 동일 검증. 여기는 UX 명시.
                      const isSelf = p.id === currentUserId;
                      const isLastActiveAdmin =
                        p.role === "admin" &&
                        p.is_active === true &&
                        p.approval_status === "approved" &&
                        activeAdminCount <= 1;
                      const isThisDeleting = deletingUserId === p.id;
                      const someoneDeleting = deletingUserId !== null;
                      // 본인/last-admin 가드 + 자신/타 row 삭제 진행 중 모두 disable.
                      const deleteDisabled =
                        isPending ||
                        isSelf ||
                        isLastActiveAdmin ||
                        someoneDeleting;
                      const deleteTitle = isSelf
                        ? "본인 계정은 삭제할 수 없습니다"
                        : isLastActiveAdmin
                          ? "마지막 활성 관리자는 삭제할 수 없습니다"
                          : someoneDeleting && !isThisDeleting
                            ? "다른 사용자 삭제 진행 중"
                            : "사용자 영구 삭제 (복구 불가)";
                      return (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {p.approval_status === "pending" && (
                            <>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleApprove(p.id, true)}
                                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                              >
                                승인
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleApprove(p.id, false)}
                                className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700"
                              >
                                거절
                              </button>
                            </>
                          )}
                          {p.approval_status === "rejected" && (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleApprove(p.id, true)}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              재승인
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={deleteDisabled}
                            onClick={() => handleDelete(p)}
                            title={deleteTitle}
                            className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isThisDeleting ? "삭제중..." : "삭제"}
                          </button>
                        </div>
                      );
                    })()}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  name,
  type,
  placeholder,
}: {
  label: string;
  name: string;
  type: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}
