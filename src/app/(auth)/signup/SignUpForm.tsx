"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signUpAction, type SignUpState } from "@/actions/auth";

const initial: SignUpState = {};

export function SignUpForm() {
  const [state, formAction] = useFormState(signUpAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <Field label="이름" name="name" type="text" autoComplete="name" />
      <Field
        label="휴대폰 번호"
        name="phone"
        type="tel"
        autoComplete="tel"
        placeholder="010-1234-5678"
      />
      <Field label="이메일" name="email" type="email" autoComplete="username" />
      <Field
        label="비밀번호 (8자 이상)"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
      />

      {state?.error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      {state?.notice ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.notice}
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
  placeholder,
  minLength,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
  placeholder?: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        required
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
      className="w-full rounded-xl bg-brand-600 px-4 py-3 text-base font-medium text-white shadow-sm transition disabled:opacity-60 hover:bg-brand-700"
    >
      {pending ? "가입 중..." : "회원가입"}
    </button>
  );
}
