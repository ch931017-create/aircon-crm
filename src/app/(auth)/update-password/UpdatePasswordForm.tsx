"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  updatePasswordAction,
  type UpdatePasswordState,
} from "@/actions/auth";

const initial: UpdatePasswordState = {};

export function UpdatePasswordForm() {
  const [state, formAction] = useFormState(updatePasswordAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <Field
        label="새 비밀번호 (8자 이상)"
        name="password"
        autoComplete="new-password"
      />
      <Field
        label="새 비밀번호 확인"
        name="confirm"
        autoComplete="new-password"
      />

      {state?.error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
  autoComplete,
}: {
  label: string;
  name: string;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <input
        name={name}
        type="password"
        autoComplete={autoComplete}
        minLength={8}
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
      {pending ? "변경 중..." : "비밀번호 변경"}
    </button>
  );
}
