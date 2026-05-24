"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";
import { createCallAction, type CreateCallState } from "@/actions/calls";
import { REGION_GROUPS } from "@/lib/regions";

const initial: CreateCallState = {};

// 콜 등록 시 선택 가능한 정시 시간대 (운영 시간 09:00 ~ 21:00)
const HOUR_OPTIONS: string[] = Array.from({ length: 13 }, (_, i) => {
  const hour = 9 + i;
  return `${String(hour).padStart(2, "0")}:00`;
});

interface CallFormProps {
  // 명시되면 등록 성공 후 해당 경로로 이동.
  // 미지정이면 같은 페이지에 머무르면서 form reset + 콜 리스트 refresh.
  redirectAfterSuccess?: string;
}

export function CallForm({ redirectAfterSuccess }: CallFormProps = {}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState(createCallAction, initial);
  // state가 undefined가 되는 엣지 케이스(action 비정상 종료 등) 방어
  const fe = state?.fieldErrors ?? {};

  const [selectedSido, setSelectedSido] = useState<string>("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");

  const [preferredDate, setPreferredDate] = useState<string>("");
  const [preferredHour, setPreferredHour] = useState<string>("");

  // 마지막 success 처리 ts (중복 처리 방지)
  const handledTsRef = useRef<number | undefined>(undefined);

  // 등록 성공 시: form reset + local state reset + router.refresh (또는 redirect)
  useEffect(() => {
    if (!state?.success || !state.ts) return;
    if (handledTsRef.current === state.ts) return;
    handledTsRef.current = state.ts;

    formRef.current?.reset();
    setSelectedSido("");
    setSelectedDistrict("");
    setPreferredDate("");
    setPreferredHour("");

    toast.success("콜이 등록되었습니다");

    if (redirectAfterSuccess) {
      router.push(redirectAfterSuccess);
    } else {
      // 같은 페이지에 머무름 — server component(CallsPage) 재실행 → CallList props 갱신
      router.refresh();
    }
  }, [state, redirectAfterSuccess, router]);

  // 시/군/구 목록을 가나다순으로 정렬 (한글 localeCompare).
  // REGION_GROUPS 원본은 그대로 두고 표시 시점에만 정렬 — 데이터 구조 유지.
  // sort된 옵션이면 native select의 type-to-select가 자연스럽게 동작.
  const availableDistricts = useMemo(() => {
    const group = REGION_GROUPS.find((g) => g.sido === selectedSido);
    return [...(group?.districts ?? [])].sort((a, b) =>
      a.localeCompare(b, "ko-KR"),
    );
  }, [selectedSido]);

  // 날짜 + 시간 합쳐서 datetime-local 형식 ("YYYY-MM-DDTHH:00") 생성.
  // 둘 중 하나라도 비어있으면 빈 문자열 → server action에서 null 처리됨.
  // server action(actions/calls.ts)에서 이 문자열을 new Date()로 파싱하여
  // 로컬(KST) timezone으로 해석 후 ISO로 저장. 기존 호환 100%.
  const combinedPreferredTime = useMemo(() => {
    if (!preferredDate || !preferredHour) return "";
    return `${preferredDate}T${preferredHour}`;
  }, [preferredDate, preferredHour]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 lg:space-y-2"
    >
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

      <div className="grid gap-3 sm:grid-cols-2 lg:gap-2">
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
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 lg:py-2 lg:text-sm"
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
            // 가나다순 정렬되어 있어 native select의 type-to-select 가능:
            //   focus 후 "구" → 구로 시작하는 첫 항목으로 이동, Enter로 확정
            //   "구리" 연속 입력 (브라우저 type-buffer ~1s) → 구리시로 이동
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100 disabled:text-slate-400 lg:py-2 lg:text-sm"
          >
            <option value="">
              {selectedSido ? "선택 (타이핑으로 검색)" : "시/도를 먼저 선택"}
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

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">
          고객 희망 일시
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 lg:py-2 lg:text-sm"
          />
          <select
            value={preferredHour}
            onChange={(e) => setPreferredHour(e.target.value)}
            disabled={!preferredDate}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100 disabled:text-slate-400 lg:py-2 lg:text-sm"
          >
            <option value="">
              {preferredDate ? "시간 선택" : "날짜를 먼저 선택"}
            </option>
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
        {/* 서버 호환: 기존 preferred_time 필드명에 datetime-local 형식으로 합쳐 전송 */}
        <input
          type="hidden"
          name="preferred_time"
          value={combinedPreferredTime}
        />
        <p className="mt-1 text-xs text-slate-500">
          운영 시간 09:00 ~ 21:00 중 선택. 비워두면 미정으로 저장됩니다.
        </p>
      </div>

      <Field
        label="예상 금액 (원)"
        name="estimated_amount"
        type="number"
        inputMode="numeric"
        placeholder="80000"
      />

      <Field label="메모" name="memo" textarea rows={2} />

      {state?.error && (
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
  step?: number | string;
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
  step,
}: FieldProps) {
  // 모바일은 기존 padding/font 그대로, lg(데스크탑)에서만 컴팩트
  const cls =
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 lg:py-2 lg:text-sm";
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
          // 모바일 rows, PC는 한 줄 더 짧게
          rows={rows ?? 2}
          className={`${cls} lg:min-h-0`}
        />
      ) : (
        <input
          name={name}
          type={type}
          inputMode={inputMode}
          required={required}
          placeholder={placeholder}
          step={step}
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
      className="w-full rounded-xl bg-brand-600 px-4 py-3 text-base font-medium text-white shadow-sm transition disabled:opacity-60 hover:bg-brand-700 lg:py-2.5 lg:text-sm"
    >
      {pending ? "등록 중..." : "콜 등록"}
    </button>
  );
}
