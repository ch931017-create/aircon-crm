import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { BRAND_NAME } from "@/lib/brand";

// title 만 짧게 지정 → layout.tsx 의 template 가 "로그인 | 출장시민기사" 으로 자동 조합.
export const metadata = { title: "로그인" };

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { reset?: string };
}) {
  const resetSuccess = searchParams?.reset === "ok";

  return (
    // 전체 배경: 연한 emerald → white → slate gradient. 현장 업무앱 느낌, 과도한 glassmorphism 회피.
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50">
      <div className="safe-top safe-bottom mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
        {/* Hero — 로고 박스 + 브랜드명 + 슬로건.
            로고는 /public/icon-192x192.png 재사용. 디자인 OG 이미지가 추후 추가되면
            /logo/login-hero.png 같은 별도 파일로 교체 가능. next/image priority 로 빠른 LCP. */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-[28px] bg-white shadow-md shadow-emerald-100 ring-1 ring-emerald-100">
            <Image
              src="/icon-192x192.png"
              alt="출장시민기사"
              width={80}
              height={80}
              priority
              className="rounded-2xl"
            />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-emerald-700">
            {BRAND_NAME}
          </h1>
          {/* 2단 슬로건:
                ① 강조 라인 (운영 메시지)
                ② 보조 라인 (플랫폼 설명) */}
          <p className="mt-2 text-sm font-semibold text-emerald-800">
            소방관은 불을 끄고, 의사는 수술을 하고, 우리는 에어컨을 고치지만 셋이 공통점이 있다.&apos;그것은 사람을 살리는 직업이라는 것&apos;
          </p>
          <p className="mt-1 text-xs font-medium text-emerald-700/70">
            현장 중심 에어컨 기사운영 플랫폼
          </p>
        </div>

        {/* 비밀번호 재설정 직후 안내 (existing 기능 유지) */}
        {resetSuccess ? (
          <p className="mb-4 rounded-2xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100">
            비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.
          </p>
        ) : null}

        {/* 카드 — 폼 + 비밀번호 링크 (LoginForm 내부 로직/server action 미변경) */}
        <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-md shadow-emerald-100/40">
          <LoginForm />

          {/* 비밀번호 링크 — 단일 (/forgot-password). 우측 정렬 emerald 톤. */}
          <div className="mt-5 flex items-center justify-end text-sm">
            <Link
              href="/forgot-password"
              className="font-semibold text-emerald-700 transition hover:text-emerald-800 hover:underline"
            >
              비밀번호찾기 / 재설정
            </Link>
          </div>
        </div>

        {/* 회원가입 (기능 유지) */}
        <p className="mt-6 text-center text-sm text-slate-500">
          기사이신가요?{" "}
          <Link
            href="/signup"
            className="font-semibold text-emerald-700 transition hover:underline"
          >
            회원가입
          </Link>
        </p>
      </div>
    </main>
  );
}
