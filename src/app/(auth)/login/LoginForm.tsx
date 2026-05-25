"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signInAction, type SignInState } from "@/actions/auth";

const initial: SignInState = {};

export function LoginForm() {
  const [state, formAction] = useFormState(signInAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="이메일" name="email" type="email" autoComplete="username" />
      <Field
        label="비밀번호"
        name="password"
        type="password"
        autoComplete="current-password"
      />

      {state?.error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 ring-1 ring-rose-100">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        // 모바일 친화: py-3.5 로 터치 영역 확대. focus 시 emerald 톤으로 브랜드 통일.
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      // 큰 메인 CTA: py-4 + emerald + 강조 shadow. 현장 기사앱 느낌.
      className="w-full rounded-2xl bg-emerald-600 px-4 py-4 text-base font-semibold text-white shadow-md shadow-emerald-200 transition disabled:opacity-60 hover:bg-emerald-700 active:scale-[0.98]"
    >
      {pending ? "로그인 중..." : "로그인"}
    </button>
  );
}
