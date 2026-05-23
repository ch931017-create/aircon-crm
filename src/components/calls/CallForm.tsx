"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createCallAction, type CreateCallState } from "@/actions/calls";

const initial: CreateCallState = {};

const DISTRICTS = [
  "강남구",
  "강동구",
  "강북구",
  "강서구",
  "관악구",
  "광진구",
  "구로구",
  "금천구",
  "노원구",
  "도봉구",
  "동대문구",
  "동작구",
  "마포구",
  "서대문구",
  "서초구",
  "성동구",
  "성북구",
  "송파구",
  "양천구",
  "영등포구",
  "용산구",
  "은평구",
  "종로구",
  "중구",
  "중랑구",
];

export function CallForm() {
  const [state, formAction] = useFormState(createCallAction, initial);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-3">
      <Field
        label="고객명"
        name="customer_name"
        required
        error={fe.customer_name}
      />
      <Field
        label="전화번호"
        name="phone"
        type="tel"
        placeholder="010-1234-5678"
        required
        error={fe.phone}
      />
      <Field label="주소" name="address" required error={fe.address} />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          지역구
        </span>
        <select
          name="district"
          defaultValue=""
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        >
          <option value="">선택</option>
          {DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      <Field label="증상" name="symptom" textarea rows={2} />

      <Field
        label="희망 시간"
        name="preferred_time"
        type="datetime-local"
      />

      <Field
        label="예상 금액 (원)"
        name="estimated_amount"
        type="number"
        inputMode="numeric"
        placeholder="80000"
      />

      <Field label="메모" name="memo" textarea rows={2} />

      {state.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  textarea?: boolean;
  rows?: number;
  error?: string;
  inputMode?: "text" | "numeric" | "tel" | "email";
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  textarea,
  rows,
  error,
  inputMode,
}: FieldProps) {
  const cls =
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {textarea ? (
        <textarea
          name={name}
          required={required}
          placeholder={placeholder}
          rows={rows ?? 2}
          className={cls}
        />
      ) : (
        <input
          name={name}
          type={type}
          inputMode={inputMode}
          required={required}
          placeholder={placeholder}
          className={cls}
        />
      )}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
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
      {pending ? "등록 중..." : "콜 등록"}
    </button>
  );
}
