import Link from "next/link";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "기사 회원가입" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-brand-700">기사 회원가입</h1>
        <p className="mt-1 text-sm text-slate-500">
          현장 출동 기사용 계정을 생성합니다
        </p>
      </div>

      <SignUpForm />

      <p className="mt-6 text-center text-sm text-slate-500">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          로그인
        </Link>
      </p>
    </main>
  );
}
