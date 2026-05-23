import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { signOutAction } from "@/actions/auth";

export const dynamic = "force-dynamic";

export default async function PendingApprovalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // 이미 승인된 사용자는 홈으로 (이 페이지에 머무를 이유 없음)
  if (user.profile.role === "admin" || user.profile.approval_status === "approved") {
    redirect("/");
  }

  const isRejected = user.profile.approval_status === "rejected";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {isRejected ? (
          <>
            <h1 className="text-xl font-bold text-rose-700">가입 거절됨</h1>
            <p className="mt-3 text-sm text-slate-600">
              관리자가 가입 요청을 거절했습니다.
              <br />
              문의가 필요하면 운영팀에 연락해 주세요.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-slate-900">승인 대기 중</h1>
            <p className="mt-3 text-sm text-slate-600">
              관리자 승인 후 앱을 사용할 수 있습니다.
              <br />
              승인이 완료되면 다시 로그인해 주세요.
            </p>
          </>
        )}

        <dl className="mt-6 space-y-1 text-left text-xs text-slate-500">
          <div className="flex justify-between gap-3">
            <dt>이름</dt>
            <dd className="text-slate-700">{user.profile.name || "-"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>이메일</dt>
            <dd className="text-slate-700">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>역할</dt>
            <dd className="text-slate-700">{user.profile.role}</dd>
          </div>
        </dl>
      </div>

      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-900"
        >
          로그아웃
        </button>
      </form>
    </main>
  );
}
