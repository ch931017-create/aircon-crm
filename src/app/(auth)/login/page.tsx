import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "로그인 — 에어컨 콜풀 CRM" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-brand-700">에어컨 콜풀 CRM</h1>
        <p className="mt-1 text-sm text-slate-500">계정으로 로그인하세요</p>
      </div>
      <LoginForm />

      <p className="mt-4 text-center text-sm text-slate-500">
        기사이신가요?{" "}
        <Link
          href="/signup"
          className="font-medium text-brand-700 hover:underline"
        >
          회원가입
        </Link>
      </p>

      <details className="mt-6 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium">테스트 계정</summary>
        <ul className="mt-2 space-y-1">
          <li>admin@test.com / test1234 (관리자)</li>
          <li>dispatcher@test.com / test1234 (콜직원)</li>
          <li>tech1@test.com / test1234 (기사)</li>
        </ul>
      </details>
    </main>
  );
}
