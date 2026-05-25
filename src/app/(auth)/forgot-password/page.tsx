import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = { title: "비밀번호 재설정" };

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const callbackError = searchParams?.error === "callback_failed";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-brand-700">비밀번호 재설정</h1>
        <p className="mt-1 text-sm text-slate-500">
          가입한 이메일로 재설정 링크를 보내드립니다
        </p>
      </div>

      {callbackError ? (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          재설정 링크가 만료되었거나 유효하지 않습니다. 다시 요청해주세요.
        </p>
      ) : null}

      <ForgotPasswordForm />

      <p className="mt-4 text-center text-sm text-slate-500">
        <Link
          href="/login"
          className="font-medium text-brand-700 hover:underline"
        >
          로그인 화면으로 돌아가기
        </Link>
      </p>
    </main>
  );
}
