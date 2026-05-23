# 추가 기능 작업 요약 — 기사 필터 / 기사 배지 / 세금계산서 관리

작업일: 2026-05-23
대상 프로젝트: 출장 에어컨 수리 CRM "출장시민" (Next.js 14 App Router + Supabase)

---

## 1. 변경 목적

| # | 요구 | 처리 |
|---|---|---|
| 1 | 전체콜 화면에 기사 검색 필터 | `CallList`에 dispatcher/admin 전용 기사 select 추가 |
| 2 | 콜 행 상태 배지 옆에 기사 이름 배지 | `CallList` 행 + `CallCard` 헤더에 brand pill 추가 |
| 3 | 세금계산서 관리 페이지 신규 | `/admin/tax-invoices` + 발행 토글/메모 API + 첨부 URL |
| 4 | 권한 격리 / 타입 안전 유지 | admin-only API 가드, `npx tsc --noEmit` 0 errors |

---

## 2. 기사 검색 필터 (요구 #1)

**`src/components/calls/CallList.tsx`**

- 새 state: `technicianFilter` (`"all"` / `"unassigned"` / 기사 ID)
- `showTechnicianFilter = !filterMine && (currentUserRole === "dispatcher" || "admin")` — `/my-calls`나 기사 화면에서는 숨김
- 필터 그리드를 `sm:grid-cols-4` → `sm:grid-cols-5`로 확장 (조건부)
- select 옵션:
  - "전체 기사"
  - "미배정" (`assigned_to === null`)
  - profiles 중 `role === "technician"` 인 모든 기사
- `visible` 계산에 기사 필터 적용. 기존 상태/검색/날짜/지역/반경/정렬과 동시 동작
- `useEffect(setPage(1))` 의존성에 `technicianFilter` 추가 — 변경 시 페이지 초기화

기존 클라이언트 컴포넌트의 상태 패턴을 그대로 따랐고, URL query parameter 동기화는 미적용 (요구사항에서 "유지하면 좋음" 정도로 표시되어 있어 보수적으로 진행).

---

## 3. 행 상태 배지 옆 기사 이름 배지 (요구 #2)

### `src/components/calls/CallList.tsx`

`<details>` 행의 상태 셀:
```tsx
<div className="flex flex-wrap items-center gap-1">
  <StatusBadge status={call.status} />
  {assignee && (
    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
      {assignee.name}
    </span>
  )}
</div>
```

`assignee`는 기존 `profileMap.get(call.assigned_to)` 결과 재사용. 미배정은 표시 안 함. 모바일에서 wrap 되도록 `flex-wrap`.

### `src/components/calls/CallCard.tsx` (관리자 대시보드 "최근 콜 5건")

- 상단 제목 라인의 `<StatusBadge>` 뒤에 `assigneeName` pill 추가
- 기존 하단 `<Row Icon={User}>`로 중복 표시되던 부분 제거
- `User` 아이콘 import 정리

---

## 4. 세금계산서 관리 시스템 (요구 #3)

### 4-1. Migration — `supabase/migrations/011_tax_invoice_status.sql`

```sql
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS tax_invoice_issued boolean NOT NULL DEFAULT false;
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS tax_invoice_issued_at timestamptz;
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS tax_invoice_issued_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS tax_invoice_memo text;
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS tax_invoice_file_url text;

CREATE INDEX IF NOT EXISTS idx_calls_tax_invoice_issued
  ON public.calls(tax_invoice_issued)
  WHERE tax_invoice_issued = false;
```

RLS 정책은 기존 calls 정책을 재사용 (admin은 모든 update 가능, technician은 본인 콜 update). 발행 처리는 admin 전용 API에서만 수행하므로 추가 정책 불필요.

### 4-2. 타입 — `src/types/database.ts`

`CallRow / CallInsert / CallUpdate` 모두에 5개 필드 추가:

- `tax_invoice_issued: boolean`
- `tax_invoice_issued_at: string | null`
- `tax_invoice_issued_by: string | null`
- `tax_invoice_memo: string | null`
- `tax_invoice_file_url: string | null`

### 4-3. 페이지 — `/admin/tax-invoices`

**`src/app/(app)/admin/tax-invoices/page.tsx`** (서버 컴포넌트)

- `requireRole("admin", "dispatcher")` — admin과 dispatcher 모두 조회 가능
- 서버 쿼리: `payment_method='tax_invoice' AND status='completed'` (최신순 최대 1000건)
- profiles 매핑으로 기사명 동봉

**`src/app/(app)/admin/tax-invoices/TaxInvoicesClient.tsx`** (클라이언트)

- 검색: 고객명/사업자번호/상호/대표자/이메일
- 발행상태 필터: 전체 / 미발행 / 발행완료
- 합계 카드 3개: 총 건수 / 미발행 / 발행완료
- **데스크탑 (`lg:` 이상)**: 12컬럼 표 (완료일·고객·기사·금액·사업자번호·상호·대표자·이메일·주소·첨부·상태·동작)
- **모바일 (`lg:` 미만)**: 카드 리스트로 자동 전환 (좌우 스크롤 없이 가독성 확보)
- **admin만**:
  - "발행완료 / 발행취소" 토글 버튼 → 클릭 시 toast
  - 메모 input → "저장" 버튼 → 변경 사항 있을 때만 활성
- **dispatcher**:
  - 토글/메모 입력 비활성, 조회만 가능
- 첨부 URL이 있으면 새 탭으로 여는 "파일" 링크 표시

### 4-4. API — `src/app/api/admin/tax-invoices/issue/route.ts`

- POST `{ call_id, issued?, memo? }`
- **admin only** (`role !== "admin"`이면 403)
- `issued` boolean → `tax_invoice_issued / tax_invoice_issued_at / tax_invoice_issued_by` 자동 갱신 (true면 현재시각·user.id, false면 null)
- `memo` 문자열 → `tax_invoice_memo` 저장 (빈 문자열은 null)
- WHERE에 `.eq("payment_method", "tax_invoice")` 가드 — 다른 결제방식 콜을 실수로 갱신하는 것 차단

### 4-5. CallDetail 첨부 URL 입력

**`src/components/calls/CallDetail.tsx`**: 결제방식이 `tax_invoice`일 때만 다음 필드 추가
- "사업자등록증 / 첨부파일 URL (선택)" — type="url"

**`src/components/calls/CallDetail.tsx`** (handleSettlementSubmit): payload에 `tax_invoice_file_url` 포함

**`src/app/api/calls/settlement/route.ts`**: `body.tax_invoice_file_url`을 받아 tax_invoice 결제방식일 때만 update에 반영. 빈 문자열은 null로 정규화.

> Supabase Storage 업로드 UI는 별도 인프라 작업(bucket 생성, RLS 정책)이 필요해 현 단계에서는 URL 입력으로 단순화. 추후 Storage 업로드 컴포넌트로 자연스럽게 확장 가능.

### 4-6. BottomNav

**`src/components/layout/BottomNav.tsx`**
- `FileText` 아이콘 import 추가
- dispatcher와 admin에게 `/admin/tax-invoices` "세금계산서" 메뉴 노출
- technician에게는 메뉴 미노출 (서버 페이지가 admin/dispatcher만 허용)

---

## 5. 권한 / 보안

| 경로 | 가드 |
|---|---|
| `/admin/tax-invoices` | `requireRole("admin", "dispatcher")` |
| `POST /api/admin/tax-invoices/issue` | `role === "admin"` (403 차단) |
| `/calls` 기사 필터 | dispatcher/admin에게만 select 노출 |
| 기존 `/my-settlements`, `/admin/settlements` 등 | 이전 작업의 권한 가드 그대로 유지 |

`calls_select_all` RLS는 그대로 유지 (콜 목록 전체 가시성). 발행 처리/메모 저장은 서버 API의 admin 가드로 차단.

---

## 6. 변경 / 추가 파일 목록

### 신규 (4)
- `supabase/migrations/011_tax_invoice_status.sql`
- `src/app/(app)/admin/tax-invoices/page.tsx`
- `src/app/(app)/admin/tax-invoices/TaxInvoicesClient.tsx`
- `src/app/api/admin/tax-invoices/issue/route.ts`

### 수정 (6)
- `src/types/database.ts` — tax_invoice_* 5개 필드 추가
- `src/components/calls/CallList.tsx` — 기사 필터 select + 행 상태셀에 기사 배지
- `src/components/calls/CallCard.tsx` — 헤더 배지 라인에 기사 배지, `User` 아이콘 import/사용처 정리
- `src/components/calls/CallDetail.tsx` — tax_invoice 선택 시 첨부 URL 입력, payload에 포함
- `src/app/api/calls/settlement/route.ts` — `tax_invoice_file_url` 저장 처리
- `src/components/layout/BottomNav.tsx` — dispatcher/admin에 세금계산서 메뉴

### Migration 누적 목록 (참고)
- `010_backfill_paid.sql` (이전 작업)
- **`011_tax_invoice_status.sql`** (이번 작업)

### 건드리지 않음 (회귀 안전)
- 해피콜 SMS (`src/lib/sms.ts`, `src/app/happy-call/*`, `src/app/api/happy-call/*`)
- 정산 시스템 (`/my-settlements`, `/admin/settlements`, `/api/admin/settlements/*`)
- 콜 목록 실시간 / 지도 / 콜 상세 라우팅
- `/admin/logs`, `/admin/settlement`(단수) 대시보드
- RLS 정책

---

## 7. 검증

```powershell
npx tsc --noEmit
# 결과: 0 errors
```

---

## 8. 새 URL 경로 / API

- 페이지: `/admin/tax-invoices` (admin, dispatcher)
- API: `POST /api/admin/tax-invoices/issue` (admin only)

---

## 9. 테스트 방법

### 9-1. 마이그레이션 적용

```powershell
# Supabase CLI
supabase db push

# 또는 Dashboard SQL Editor에서 011_tax_invoice_status.sql 실행
```

적용 후 확인:

```sql
\d public.calls
-- tax_invoice_issued, tax_invoice_issued_at, tax_invoice_issued_by,
-- tax_invoice_memo, tax_invoice_file_url 5개 컬럼 확인
```

### 9-2. 개발 서버

```powershell
npm run dev
```

### 9-3. 시나리오

#### A. 기사 필터 (`/calls`)
1. `dispatcher@test.com / test1234` 또는 admin으로 로그인 → `/calls`
2. 필터 영역에 "기사" select 노출 확인 ("전체 기사 / 미배정 / 김기사 …")
3. 특정 기사 선택 → 해당 기사 배정 콜만 표시
4. "미배정" 선택 → `assigned_to=null` 콜만 표시
5. technician으로 로그인 → `/my-calls`로 redirect되거나 `/calls`에 기사 select 미표시 확인

#### B. 행 기사 배지
1. `/calls`에서 배정된 콜 → 상태 배지 옆에 brand-100 색 기사 이름 pill 노출
2. 미배정 콜은 상태 배지만 단독 표시
3. `/admin` 대시보드의 최근 콜 카드 상단에도 기사 배지 노출

#### C. 세금계산서 등록 (technician 흐름)
1. technician으로 콜 잡고 완료 처리 시 결제방식 = **세금계산서** 선택
2. 사업자등록번호/상호/대표자/이메일 + "사업자등록증 / 첨부파일 URL (선택)" 노출
3. URL 입력 후 저장 → DB에 `tax_invoice_file_url` 저장 확인

#### D. 세금계산서 관리 (`/admin/tax-invoices`)
1. dispatcher 또는 admin으로 로그인 → 하단 메뉴 "세금계산서" 클릭
2. tax_invoice 결제방식 콜만 최신순 표시
3. 검색에 사업자번호 일부 입력 → 즉시 필터링
4. 발행상태 필터 셀렉트: 전체 / 미발행 / 발행완료
5. **admin만**: "발행완료" 버튼 클릭 → 토스트 + 상태 변경 + 시각 자동 기록
6. **admin만**: 메모 입력 후 "저장" 클릭 → 토스트 + 메모 저장
7. dispatcher 로그인: 토글/메모 비활성, 조회만 가능 확인
8. 모바일 뷰포트에서 카드 형태로 표시되는지 확인
9. dispatcher가 직접 `POST /api/admin/tax-invoices/issue` 호출 시 403 응답 확인

#### E. 회귀 체크
- `/calls`, `/calls/map`, `/calls/[id]` 정상
- 기존 결제방식 (현금/계좌이체/카드결제 및 현금영수증) 흐름 정상
- 정산 페이지(`/my-settlements`, `/admin/settlements`) 정상
- 해피콜 SMS / 콜 상태 변경 / 관리자 로그 정상

---

## 10. 알아두면 좋은 점

- 기사 검색 필터는 클라이언트 state(`technicianFilter`)로 관리. URL 동기화가 필요하면 `useSearchParams` + `router.replace`로 확장 가능
- 기사 배지는 `profileMap.get(assigned_to)` 결과를 재사용하므로 추가 쿼리/네트워크 비용 없음
- 첨부 URL은 단순 텍스트 URL 입력. Storage 업로드로 확장하려면:
  1. Supabase Dashboard → Storage → 버킷 생성 (예: `tax-invoices`)
  2. RLS 정책으로 technician만 본인 콜에 업로드 허용
  3. `CallDetail`의 input을 file로 교체 후 `supabase.storage.from('tax-invoices').upload(...)` → 반환 URL을 `tax_invoice_file_url`에 저장
- `tax_invoice_issued`에 부분 인덱스(`WHERE tax_invoice_issued = false`)를 사용해 "미발행 콜 조회"가 빠르게 동작
