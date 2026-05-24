"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createCallAction, type CreateCallState } from "@/actions/calls";
import { REGION_GROUPS } from "@/lib/regions";

const initial: CreateCallState = {};

export function CallForm() {
  const [state, formAction] = useFormState(createCallAction, initial);
  const fe = state.fieldErrors ?? {};

  const [selectedSido, setSelectedSido] = useState<string>("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");

  const availableDistricts = useMemo(() => {
    const group = REGION_GROUPS.find((g) => g.sido === selectedSido);
    return group?.districts ?? [];
  }, [selectedSido]);

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

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            시/도
          </span>
          <select
            value={selectedSido}
            onChange={(e) => {
              setSelectedSido(e.target.value);
              setSelectedDistrict("");
            }}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">선택</option>
            {REGION_GROUPS.map((group) => (
              <option key={group.sido} value={group.sido}>
                {group.sido}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            시/군/구
          </span>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            disabled={!selectedSido}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">
              {selectedSido ? "선택" : "시/도를 먼저 선택"}
            </option>
            {availableDistricts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        {/* DB에는 시/군/구 단일 값만 저장 (기존 호환). action에서 district 필드로 받음 */}
        <input type="hidden" name="district" value={selectedDistrict} />
      </div>

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
