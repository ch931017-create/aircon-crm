"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  requestPasswordResetAction,
  type RequestPasswordResetState,
} from "@/actions/auth";

const initial: RequestPasswordResetState = {};

export function ForgotPasswordForm() {
  const [state, formAction] = useFormState(
    requestPasswordResetAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          이메일
        </span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </label>

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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand-600 px-4 py-3 text-base font-medium text-white shadow-sm transition disabled:opacity-60 hover:bg-brand-700"
    >
      {pending ? "전송 중..." : "재설정 메일 보내기"}
    </button>
  );
}
