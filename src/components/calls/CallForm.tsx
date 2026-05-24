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
  const availableDistricts = useMemo(() => {
    const group = REGION_GROUPS.find((g) => g.sido === selectedSido);
    return [...(group?.districts ?? [])].sort((a, b) =>
      a.localeCompare(b, "ko-KR"),
    );
  }, [selectedSido]);

  // ─────────────────────────────────────────────────────────
  // 시/군/구 검색 combobox 상태
  //   - native select의 한글 type-to-select가 IME 조합에서 불안정해서
  //     input + dropdown 패턴으로 교체. "구리" 타이핑 → 구리시 필터링.
  //   - form submit은 기존 hidden input name="district" 그대로 사용.
  // ─────────────────────────────────────────────────────────
  const [districtQuery, setDistrictQuery] = useState<string>("");
  const [districtListOpen, setDistrictListOpen] = useState<boolean>(false);
  const [districtHighlight, setDistrictHighlight] = useState<number>(0);
  const districtListRef = useRef<HTMLUListElement>(null);

  // 사용자 입력 query로 필터링 (부분 일치)
  const filteredDistricts = useMemo(() => {
    const q = districtQuery.trim();
    if (!q) return availableDistricts;
    return availableDistricts.filter((d) => d.includes(q));
  }, [availableDistricts, districtQuery]);

  // 시/도 변경 시 시/군/구 관련 상태 reset
  useEffect(() => {
    setSelectedDistrict("");
    setDistrictQuery("");
    setDistrictListOpen(false);
    setDistrictHighlight(0);
  }, [selectedSido]);

  // 필터 변경 시 highlight 0으로 복귀
  useEffect(() => {
    setDistrictHighlight(0);
  }, [districtQuery]);

  // highlight 변경 시 list 안에서 보이도록 scroll
  useEffect(() => {
    if (!districtListOpen) return;
    const el = districtListRef.current?.children[districtHighlight] as
      | HTMLElement
      | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [districtHighlight, districtListOpen]);

  function selectDistrict(value: string) {
    setSelectedDistrict(value);
    setDistrictQuery(value);
    setDistrictListOpen(false);
  }

  function handleDistrictKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
  ): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDistrictListOpen(true);
      setDistrictHighlight((i) =>
        Math.min(i + 1, Math.max(0, filteredDistricts.length - 1)),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDistrictListOpen(true);
      setDistrictHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (districtListOpen && filteredDistricts[districtHighlight]) {
        e.preventDefault();
        selectDistrict(filteredDistricts[districtHighlight]);
      }
    } else if (e.key === "Escape") {
      setDistrictListOpen(false);
    }
  }

  function handleDistrictBlur(): void {
    // dropdown 항목 mousedown으로 선택 처리한 직후 blur가 와도 안전하게 닫음.
    // 입력 후 항목 선택 안 했으면 마지막 selectedDistrict로 input 복원.
    window.setTimeout(() => {
      setDistrictListOpen(false);
      setDistrictQuery(selectedDistrict);
    }, 150);
  }

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
        <label className="relative block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            시/군/구
          </span>
          <input
            type="text"
            value={districtQuery}
            onChange={(e) => {
              setDistrictQuery(e.target.value);
              setSelectedDistrict(""); // typing 시 임시 무효화 — 항목 선택해야 확정
              setDistrictListOpen(true);
            }}
            onFocus={() => setDistrictListOpen(true)}
            onClick={() => setDistrictListOpen(true)}
            onBlur={handleDistrictBlur}
            onKeyDown={handleDistrictKeyDown}
            disabled={!selectedSido}
            placeholder={
              selectedSido ? "시/군/구 검색 (예: 구리)" : "시/도를 먼저 선택"
            }
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={districtListOpen}
            aria-controls="district-listbox"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100 disabled:text-slate-400 lg:py-2 lg:text-sm"
          />
          {districtListOpen && selectedSido && filteredDistricts.length > 0 && (
            <ul
              ref={districtListRef}
              id="district-listbox"
              role="listbox"
              className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
            >
              {filteredDistricts.map((d, i) => (
                <li
                  key={d}
                  role="option"
                  aria-selected={i === districtHighlight}
                  // mousedown으로 처리 → input의 blur 발생 전 선택 완료
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectDistrict(d);
                  }}
                  onMouseEnter={() => setDistrictHighlight(i)}
                  className={
                    i === districtHighlight
                      ? "cursor-pointer px-3 py-2 text-sm bg-brand-100 text-brand-700"
                      : "cursor-pointer px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  }
                >
                  {d}
                </li>
              ))}
            </ul>
          )}
          {districtListOpen &&
            selectedSido &&
            filteredDistricts.length === 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg">
                일치하는 시/군/구가 없습니다
              </div>
            )}
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
