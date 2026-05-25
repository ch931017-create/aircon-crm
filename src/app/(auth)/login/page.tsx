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
    </main>
  );
}
