"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ApprovalStatus, ProfileRow, UserRole } from "@/types/database";

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

export function UsersClient({ initialProfiles }: { initialProfiles: ProfileLite[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createRole, setCreateRole] = useState<UserRole>("dispatcher");

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
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {p.name || "(이름없음)"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{p.phone ?? "-"}</td>
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
                    {p.approval_status === "pending" ? (
                      <div className="flex justify-end gap-1.5">
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
                      </div>
                    ) : p.approval_status === "rejected" ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleApprove(p.id, true)}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        재승인
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
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
