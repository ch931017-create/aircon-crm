import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "로그인 — 에어컨 콜풀 CRM" };

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { reset?: string };
}) {
  const resetSuccess = searchParams?.reset === "ok";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-brand-700">에어컨 콜풀 CRM</h1>
        <p className="mt-1 text-sm text-slate-500">계정으로 로그인하세요</p>
      </div>

      {resetSuccess ? (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.
        </p>
      ) : null}

      <LoginForm />

      <div className="mt-3 flex items-center justify-between text-sm">
        <Link
          href="/forgot-password"
          className="text-slate-500 hover:text-brand-700 hover:underline"
        >
          비밀번호를 잊으셨나요?
        </Link>
      </div>

      <p className="mt-4 text-center text-sm text-slate-500">
        기사이신가요?{" "}
        <Link
          href="/signup"
          className="font-medium text-brand-700 hover:underline"
        >
          회원가입
        </Link>
      </p>
    </main>
  );
}
