import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata = { title: "새 비밀번호 설정" };

// force-dynamic: session 검증 + cookie 의존이라 캐싱 불가
export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  // session 검증: 재설정 링크의 /auth/callback 이 exchangeCodeForSession 으로
  // recovery 세션을 cookie에 저장해둔 상태여야 함. 세션 없으면 다시 forgot으로.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=callback_failed");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-brand-700">새 비밀번호 설정</h1>
        <p className="mt-1 text-sm text-slate-500">
          새 비밀번호를 입력하고 저장하세요
        </p>
      </div>

      <UpdatePasswordForm />

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
