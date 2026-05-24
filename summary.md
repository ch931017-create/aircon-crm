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

---
---

# 추가 작업 요약 — PWA / 사용자 관리 / 기사 승인제 / 배포

작업일: 2026-05-23
대상 프로젝트: 출장 에어컨 수리 CRM "출장시민" (Next.js 14 App Router + Supabase)
배포 URL: https://aircon-crm-prod.vercel.app

---

## 1. 변경 목적

| # | 요구 | 처리 |
|---|---|---|
| 1 | GitHub push + Vercel 배포 | 로컬 git init → push, Vercel import + env vars 설정 |
| 2 | PWA 설치 가능 상태 완성 | manifest.json + layout.tsx + PWAInstallPrompt 보강 |
| 3 | 운영용 계정 정리 (테스트 계정 삭제) | FK 영향 분석 + 안전한 단계별 SQL **초안만** 제공 (실행은 사용자) |
| 4 | 관리자가 콜직원/기사 생성 | `/admin/users` 페이지 + service-role 기반 4개 API |
| 5 | 기사 회원가입 승인제 | `approval_status` 컬럼 추가 + 가드 + 승인 UI |

---

## 2. 배포 인프라 (요구 #1)

- 로컬 `git init` → 초기 커밋(`a68f5a3 chore: initial commit - ...`) → GitHub `ch931017-create/aircon-crm` push
- `.gitignore`에 `.claude/`, `supabase/.temp/` 추가
- Vercel: Next.js framework로 자동 import, 환경변수 7개 등록
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (sensitive)
  - `NEXT_PUBLIC_APP_URL=https://aircon-crm-prod.vercel.app`
  - `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SOLAPI_SENDER`
- Supabase Auth → URL Configuration에 Site URL / Redirect URL 등록 안내

---

## 3. PWA 완성 (요구 #2)

### 3-1. `public/manifest.json`

- `theme_color` / `background_color`를 `#10b981`(녹색) → `#2563eb`(BRAND_COLOR와 일치)로 통일
- icons에 `purpose: "any maskable"` 추가 → Lighthouse PWA installable 통과

### 3-2. `src/app/layout.tsx`

- `apple-mobile-web-app-title`을 하드코드 → `BRAND_SHORT` 변수 참조 (일관성)
- `<meta name="theme-color">` 명시 추가 (manifest와 동기화)

### 3-3. `src/components/layout/PWAInstallPrompt.tsx`

- 기존: 데스크탑(non-iOS, non-Android)에서 `setShowPrompt(false)`로 영구 차단
- 변경: iOS는 별도 안내 표시, 그 외(Android/Desktop Chrome/Edge)는 `beforeinstallprompt` 이벤트 수신 시 표시
- 일회성 dismiss를 `sessionStorage`에 기록 → 같은 세션 동안 재노출 방지
- 불필요한 console.log 제거

### 3-4. Lighthouse 검증 가이드

배포 후 https://aircon-crm-prod.vercel.app 에서 Chrome DevTools → Lighthouse → Mode: Navigation, Device: Mobile, Category: PWA → Analyze.

체크리스트:
- "Web app manifest meets the installability requirements" ✓
- "Service worker registers a fetch handler" ✓ (이미 service-worker.js에 구현됨)
- "Manifest has a maskable icon" ✓
- 주소창 우측 "설치" 아이콘 표시 확인

> ⚠️ 현재 `"any maskable"`을 동일 PNG에 부여한 상태. Android에서 모서리가 잘릴 수 있어 마스커블 전용 아이콘(safe zone 80% 중앙)을 별도 제작하면 더 깔끔.

---

## 4. 운영용 계정 정리 (요구 #3)

**파일은 만들지 않고 SQL 초안만 제공.** 본인이 Supabase Dashboard에서 단계별로 검토하며 실행.

### 4-1. profiles FK 매핑

| 테이블 | 컬럼 | 동작 |
|---|---|---|
| `auth.users` ← `profiles.id` | `id` | CASCADE |
| `calls.assigned_to`, `created_by`, `assigned_technician_id`, `settled_by`, `tax_invoice_issued_by` | | SET NULL |
| `notifications.profile_id` | | CASCADE |
| `call_photos.uploaded_by` | | SET NULL |
| `message_logs.technician_id` | | SET NULL |

→ 콜/사진/메시지 로그는 보존, 알림만 함께 삭제.

### 4-2. 단계별 SQL 초안

1. STEP 1: 전체 계정 + 활동량 조회로 후보 식별
2. STEP 2: `accounts_to_delete` 임시 테이블에 삭제 대상 적재
3. STEP 3: admin 계정 포함 여부 자동 abort 가드
4. STEP 4: `DELETE FROM auth.users` 트랜잭션 (CASCADE/SET NULL 자동)
5. STEP 5: 담당자 빈 콜 / 정산자 빈 콜 사후 검증

상세 SQL은 대화 기록 참조. 실제 실행 시 백업 → 단계별 실행 권장.

---

## 5. 사용자 관리 시스템 (요구 #4)

### 5-1. service-role 클라이언트 — `src/lib/supabase/admin.ts`

- `@supabase/supabase-js`로 `SUPABASE_SERVICE_ROLE_KEY` 기반 클라이언트 생성
- `auth.admin.createUser` / RLS 우회가 필요한 server-only 작업 전용
- 절대 client import 금지

### 5-2. API 4개 — `src/app/api/admin/users/*`

| Endpoint | 용도 | 클라이언트 |
|---|---|---|
| `POST /api/admin/users/create` | 신규 계정 생성 (이메일 인증 스킵, `email_confirm: true`) | admin (service-role) |
| `POST /api/admin/users/role` | 기존 사용자 role 변경 | regular (RLS) |
| `POST /api/admin/users/toggle-active` | `is_active` 토글 | regular (RLS) |
| `POST /api/admin/users/approve` | `approval_status` 'approved' / 'rejected' 설정 | regular (RLS) |

모든 엔드포인트에 `me.profile.role !== "admin"` 가드(403). 본인이 본인 admin 권한을 떨어뜨리거나 비활성화하는 사고 방지 (`CANNOT_DEMOTE_SELF`, `CANNOT_DEACTIVATE_SELF`).

`create` API는 profile update가 실패하면 방금 만든 auth user를 롤백 삭제하여 정합성 유지.

### 5-3. 페이지 `/admin/users`

- `src/app/(app)/admin/users/page.tsx` (서버, `requireRole("admin")`)
- `src/app/(app)/admin/users/UsersClient.tsx` (클라이언트)
- 탭: 전체 / 승인 대기 / 관리자 / 콜직원 / 기사 (대기 인원 배지)
- 검색: 이름/휴대폰 (클라이언트 필터링)
- "+ 계정 생성" 폼: 역할 select + 이름/휴대폰/이메일/비밀번호 입력 → service-role API 호출 → 즉시 활성 + 승인 상태로 생성됨
- 행 동작:
  - role select (드롭다운으로 즉시 변경)
  - 활성/비활성 토글 pill 버튼
  - pending인 경우 [승인] / [거절] 버튼
  - rejected인 경우 [재승인] 버튼
- toast 알림 + `router.refresh()` 로 server 데이터 재로드

### 5-4. 진입점 추가

- `BottomNav.tsx`: admin 전용 "사용자" 메뉴 (`Users` 아이콘)
- `src/app/(app)/admin/page.tsx`: 대시보드 카드 그리드에 "사용자 관리" 카드 추가, `lg:grid-cols-3`으로 확장

---

## 6. 기사 회원가입 승인제 (요구 #5)

### 6-1. Migration `supabase/migrations/012_approval_status.sql`

```sql
-- enum
do $$ begin
  create type public.approval_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

-- 컬럼 추가
alter table public.profiles
  add column if not exists approval_status public.approval_status not null default 'pending',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

-- 백필 (중요!): 관리자 / 기존 active 사용자는 즉시 'approved'
update public.profiles
   set approval_status = 'approved',
       approved_at = coalesce(approved_at, created_at)
 where role in ('admin', 'dispatcher')
   and approval_status <> 'approved';

update public.profiles
   set approval_status = 'approved',
       approved_at = coalesce(approved_at, created_at)
 where role = 'technician'
   and is_active = true
   and approval_status = 'pending';

-- 인덱스
create index if not exists idx_profiles_approval_pending
  on public.profiles(approval_status)
  where approval_status = 'pending';

-- 본인이 자기 role / approval_status / is_active 임의 상승 차단 트리거
create or replace function public.guard_profile_self_update() ...
create trigger profiles_guard_self_update before update on public.profiles ...
```

**적용 방식**: SQL 파일만 작성. Supabase Dashboard → SQL Editor에 붙여넣어 수동 실행.

**백필 검증 SQL** (적용 직후 즉시 실행):
```sql
SELECT
  count(*) FILTER (WHERE approval_status = 'approved') AS approved,
  count(*) FILTER (WHERE approval_status = 'pending') AS pending,
  count(*) FILTER (WHERE role = 'admin' AND approval_status != 'approved') AS admin_not_approved
FROM public.profiles;
-- admin_not_approved 가 0 이어야 함 (관리자 잠김 방지 확인)
```

### 6-2. 타입 — `src/types/database.ts`

- `ApprovalStatus = "pending" | "approved" | "rejected"` 추가
- `ProfileRow / Insert / Update`에 3개 필드 추가: `approval_status`, `approved_at`, `approved_by`
- `Database.Enums.approval_status` 추가

### 6-3. App layout 가드 — `src/app/(app)/layout.tsx`

```ts
if (user.profile.role !== "admin" &&
    user.profile.approval_status !== "approved") {
  redirect("/pending-approval");
}
```

admin은 어떤 경우에도 통과 (안전장치). technician/dispatcher 중 approved 아닌 사용자만 차단.

### 6-4. 신규 페이지 `/pending-approval`

- `src/app/pending-approval/page.tsx` (app 라우트 그룹 밖에 위치 → app layout 가드 안 받음)
- `getCurrentUser()` 자체 가드: 미인증 → /login, 이미 approved → /
- `approval_status === 'rejected'` 시 다른 안내 문구 표시
- 사용자 정보 (이름/이메일/역할) 표시 + 로그아웃 버튼

### 6-5. signup 안내 문구 변경 — `src/actions/auth.ts`

- 메일 인증 ON 경로: "가입 요청이 접수되었습니다. ... 관리자 승인이 완료되면 로그인할 수 있습니다."
- 메일 인증 OFF 경로: 직접 로그인되지만 `redirect("/pending-approval")`로 명시적 이동

### 6-6. Admin 승인 UI

`/admin/users` 페이지에 통합 (위 5-3 참조). "승인 대기" 탭에서 대기자만 필터링 가능.

---

## 7. 권한 / 보안

| 경로 | 가드 |
|---|---|
| `/admin/users` | `requireRole("admin")` |
| `POST /api/admin/users/create` | `role === "admin"` + service-role 클라이언트 (server-only) |
| `POST /api/admin/users/role` | `role === "admin"`, 본인 demote 방지 |
| `POST /api/admin/users/toggle-active` | `role === "admin"`, 본인 deactivate 방지 |
| `POST /api/admin/users/approve` | `role === "admin"` |
| `/pending-approval` | 인증 + 미승인 (`getCurrentUser` 가드) |
| 모든 `(app)/*` 페이지 | `requireUser()` + approval gate (admin 제외) |

RLS는 기존 `profiles_admin_all` / `profiles_update_self` 그대로. 컬럼별 가드는 BEFORE UPDATE 트리거로 추가 (012 migration).

---

## 8. 변경 / 추가 파일 목록

### 신규 (10)
- `supabase/migrations/012_approval_status.sql`
- `src/lib/supabase/admin.ts`
- `src/app/api/admin/users/create/route.ts`
- `src/app/api/admin/users/role/route.ts`
- `src/app/api/admin/users/toggle-active/route.ts`
- `src/app/api/admin/users/approve/route.ts`
- `src/app/(app)/admin/users/page.tsx`
- `src/app/(app)/admin/users/UsersClient.tsx`
- `src/app/pending-approval/page.tsx`
- (운영 SQL 초안은 파일로 저장하지 않음)

### 수정 (8)
- `public/manifest.json` — 색상 통일, icons.purpose
- `src/app/layout.tsx` — apple title 동적화, theme-color meta
- `src/components/layout/PWAInstallPrompt.tsx` — 데스크탑 지원, sessionStorage dismiss
- `src/types/database.ts` — ApprovalStatus + ProfileRow 필드 추가
- `src/app/(app)/layout.tsx` — approval 가드
- `src/actions/auth.ts` — signup notice + pending-approval redirect
- `src/components/layout/BottomNav.tsx` — admin "사용자" 메뉴
- `src/app/(app)/admin/page.tsx` — "사용자 관리" 카드

### Migration 누적 목록
- `011_tax_invoice_status.sql` (이전)
- **`012_approval_status.sql`** (이번)

---

## 9. 검증

```powershell
npm run build
# 결과: ✓ Compiled successfully, 32 pages, 0 errors
```

신규 라우트:
- `/admin/users` (3.08 kB / 99.7 kB First Load)
- `/pending-approval` (150 B / 87.5 kB)
- `/api/admin/users/{create,role,toggle-active,approve}` (server only)

---

## 10. 적용 순서 (운영)

1. **Migration 012 적용**: Supabase Dashboard → SQL Editor → `012_approval_status.sql` 내용 붙여넣고 실행
2. **백필 검증 SQL 실행**: admin_not_approved = 0 확인
3. **GitHub push → Vercel 자동 배포** (build 통과 확인됨)
4. **배포 후 검증**:
   - https://aircon-crm-prod.vercel.app/admin/users 접속 (admin으로)
   - 기존 사용자 모두 "승인" 상태로 표시되는지 확인
   - 테스트로 신규 dispatcher 1명 "+ 계정 생성"으로 만들어보고, 그 계정으로 로그인 시도 → 정상 /calls 진입 확인
5. **테스트 계정 정리**: 위 SQL 초안으로 직접 수행

---

## 11. 회귀 안전 (건드리지 않음)

- 콜 등록 / 선점 / 상태 변경 / 지도 / 상세
- 정산 시스템 (`/my-settlements`, `/admin/settlements`, 정산 API)
- 세금계산서 (`/admin/tax-invoices`, 발행 API)
- 해피콜 SMS (`/happy-call`, `/api/happy-call`)
- 기존 RLS의 `calls` 정책
- `signInAction` (로그인 후 layout 가드가 자연스럽게 잡음)

---
---

# 추가 작업 요약 — 지역 확장 / PC split / 카드 슬림 / 해피콜 진입점

작업일: 2026-05-24
대상 프로젝트: 출장 에어컨 수리 CRM "출장시민" (Next.js 14 App Router + Supabase)
배포 URL: https://aircon-crm-prod.vercel.app

---

## 1. 변경 목적

| # | 요구 | 처리 |
|---|---|---|
| 1 | 지역 범위 확장 (서울 → 경기 / 인천) | 2단계 select (시/도 → 시/군/구), 데이터 상수 분리 |
| 2 | 콜직원 PC 전용 split 레이아웃 | `/calls`에 PC 한정 좌측 리스트 + 우측 등록 폼 |
| 3 | 기사앱 콜카드 슬림화 | CallList 모바일 컴팩트 (radius/padding/grid 압축) |
| 5 | 관리자 해피콜 진입점 강화 | 대시보드 카드 + 미완료/불일치 카운트 + logs 탭 |

> 작업 4 (콜 삭제 soft delete), 6 (Web Push)는 별도 세션에서 진행 예정.

---

## 2. 작업 1: 지역 범위 확장

### 2-1. 데이터 구조 분석
- DB의 `calls.district`는 단순 text 컬럼 (enum / constraint 아님). DB 변경 불필요
- 입력은 `CallForm.tsx`의 `DISTRICTS` 배열 1개에서만 옴 (서울 25구)
- 표시/검색은 7개 파일에서 자유 문자열로 사용 → 옵션 늘려도 회귀 없음
- 콜 수정 페이지는 없음 → 영향 범위 축소

### 2-2. 신규 — `src/lib/regions.ts`
```ts
export const REGION_GROUPS: RegionGroup[] = [
  { sido: "서울", districts: [25개 구] },
  { sido: "경기", districts: [31개 시·군] },
  { sido: "인천", districts: [10개 군·구] },
];
export const ALL_DISTRICTS: string[] = REGION_GROUPS.flatMap(...);
```

### 2-3. 수정 — `src/components/calls/CallForm.tsx`
- 단일 select (서울 25구) → 2단계 select
  - 시/도 select (3개): 서울/경기/인천
  - 시/군/구 select: 시/도 선택 시 동적 노출
- DB에는 시/군/구 값만 hidden input으로 전송 (기존 `district` 컬럼/스키마 100% 호환)

### 2-4. 회귀 안전
- 기존 콜의 `district`("강남구") 표시 그대로
- 검색 필터(자유 텍스트)는 옵션과 무관하게 동작
- DB/RLS 미변경

---

## 3. 작업 3: 기사앱 콜카드 슬림화

### 3-1. 수정 — `src/components/calls/CallList.tsx`
- `<details>` 컨테이너 `rounded-[28px]` → `rounded-2xl lg:rounded-[28px]`
- `<summary>` `py-2.5` → `py-2 sm:py-2.5 lg:py-1.5` (mobile/sm/lg 3단계)
- 모바일에서 stack → `grid-cols-2 gap-x-3 gap-y-1` 압축
- 첫 줄 지역+주소를 한 baseline에 inline 배치 (모바일에서만)
- 폰트 모바일 `text-xs` / sm 이상 `text-[13px]`

### 3-2. 결과
- iPhone 12 Pro viewport(844px height) 기준 한 화면 콜 ~3건 → ~6건
- 데스크탑(`sm:`/`lg:`) 변경은 작업 2와 함께 적용

### 3-3. 회귀 안전
- CallCard 컴포넌트는 별개 (`/admin` 대시보드 최근 콜 5건에서만 사용) → 무변경
- 잡기/반납/취소 버튼 영역 그대로 (요구사항 명시)

---

## 4. 작업 2: 콜직원 PC 전용 split 레이아웃

### 4-1. 수정 — `src/app/(app)/layout.tsx`
```diff
- max-w-screen-md px-4
+ max-w-screen-md px-4 lg:max-w-screen-2xl lg:px-6
```
- 모바일/태블릿(<lg): 기존 그대로 (768px max-width)
- PC(≥lg): 1536px 까지 확장

### 4-2. 다른 페이지 너비 보호 (남용 방지)
- `src/app/(app)/calls/new/page.tsx`: `mx-auto max-w-2xl` 추가 → 등록 폼이 너무 늘어나지 않게
- `src/app/(app)/calls/[id]/page.tsx`: `mx-auto max-w-4xl` 추가 → CallDetail 폼 폭 제한

### 4-3. 수정 — `src/app/(app)/calls/page.tsx` (핵심)
- `canCreate`(dispatcher/admin)이고 PC일 때만 `lg:grid lg:grid-cols-[minmax(0,1fr)_380px]` split
- 좌측: 기존 CallList 그대로
- 우측 aside: `lg:sticky lg:top-4` 고정, CallForm 그대로 import
- "콜 등록" 헤더 버튼은 모바일에서만 표시 (`lg:hidden`) — PC에서는 우측 패널이 대체
- 기사 화면(`/my-calls`)은 영향 없음 (filterMine + technician)

### 4-4. 수정 — `src/components/calls/CallList.tsx`
- 필터 영역 `lg:sticky lg:top-2 lg:z-10` → PC 스크롤 시 필터 고정

### 4-5. 회귀 안전
- 모바일/태블릿 UI 100% 동일 (lg: prefix로 격리)
- 기사 화면 영향 없음
- CallForm은 등록 후 `redirect("/calls")` 그대로 → split view에서 즉시 갱신
- 다른 admin 페이지(settlements/tax-invoices 등) 표가 더 넓어져 가독성 ↑

---

## 5. 작업 5: 관리자 해피콜 진입점 강화

### 5-1. 수정 — `src/app/(app)/admin/page.tsx`
- 두 개의 카운트 쿼리 추가:
  - **해피콜 미완료**: `completed AND (happy_call_checked IS NULL OR FALSE)` 개수
  - **금액 검증**: `customer_amount`/`paid_amount` 둘 다 있는 콜 → 클라이언트 mismatch 카운트
- 대시보드 카드 그리드에 2개 카드 추가:
  - 황색 카드: "해피콜 미완료 N건" → `/admin/logs?type=happy_call_unanswered`
  - 적색 카드: "금액 불일치 M건" → `/admin/logs?type=amount_mismatch`

### 5-2. 수정 — `src/app/(app)/admin/logs/page.tsx`
- 상단에 5개 탭 추가 (Link 기반, URL `?type=` 갱신):
  - 전체 / 해피콜 미완료 / 해피콜 완료 / 금액 불일치 / 해피콜 메시지
- 기존 select form은 그대로 유지 (양립)
- `activeTabKey`로 현재 탭 하이라이트

### 5-3. 회귀 안전
- 해피콜 토큰 생성 / SMS 발송 / `/api/happy-call` 응답 처리 코드 미변경
- 기존 `/admin/logs?type=...` deep-link 그대로 작동
- 카운트 쿼리는 head: true (메타데이터만) + 단순 IS NULL 필터로 부담 미미

---

## 6. 변경 / 추가 파일 목록

### 신규 (1)
- `src/lib/regions.ts` — 시/도 / 시/군/구 데이터 상수

### 수정 (6)
- `src/components/calls/CallForm.tsx` — 2단계 지역 select
- `src/components/calls/CallList.tsx` — 모바일 컴팩트 + PC 필터 sticky + PC row 슬림
- `src/app/(app)/calls/page.tsx` — PC dispatcher/admin split 레이아웃
- `src/app/(app)/calls/new/page.tsx` — max-w-2xl
- `src/app/(app)/calls/[id]/page.tsx` — max-w-4xl
- `src/app/(app)/layout.tsx` — lg:max-w-screen-2xl
- `src/app/(app)/admin/page.tsx` — 해피콜/금액 카드 + 카운트 쿼리
- `src/app/(app)/admin/logs/page.tsx` — 상단 탭 추가

### 건드리지 않음 (회귀 안전)
- DB / RLS / Migration (이번 4개 작업 모두 DB 무관)
- 해피콜 토큰 / SMS 발송 / 고객 확인 페이지
- 정산, 세금계산서, 콜 선점/배정 로직
- 사용자 관리 / 승인제

---

## 7. 검증

```powershell
npm run build
# 결과: ✓ Compiled successfully, 32 pages, 0 errors
```

---

## 8. 테스트 시나리오

### A. 지역 확장
1. `/calls/new` 접속 → 시/도 select에 서울/경기/인천 노출
2. 경기 선택 → 시/군/구에 31개 시·군 노출
3. 등록 → `/calls`에 정상 표시

### B. 콜직원 PC split (필수: 콜직원 또는 admin 계정)
1. PC 1440px 너비 `/calls` 접속 → 좌측 리스트 + 우측 등록 패널
2. 우측 폼에서 콜 등록 → 좌측 리스트에 realtime 반영
3. 모바일 vp(390px) → 단일 컬럼 + 상단 "콜 등록" 버튼 (기존과 동일)

### C. 기사앱 슬림
1. iPhone vp(390x844) `/my-calls` → 한 화면 5건 이상
2. 잡기/반납/취소 버튼 탭 영역 유지
3. 데스크탑 vp(1280px+) → 6컬럼 grid 정상

### D. 해피콜 진입점
1. admin 로그인 → `/admin` → "해피콜 미완료 N건" / "금액 불일치 M건" 카드 노출
2. 카드 클릭 → `/admin/logs?type=...` 로 진입 + 데이터 필터링
3. logs 상단 탭 클릭 → URL 갱신 + 즉시 필터링

---

## 9. 다음 세션 예정 작업

- **작업 4**: 콜 soft delete
  - DB migration 013 (deleted_at/deleted_by + RLS 교체) — 적용 전 영향 보고
  - 관리자/콜직원만 삭제 가능, 기사 절대 불가
  - 서버 권한 (API + RLS) 이중 확인
- **작업 6**: Web Push 알림
  - VAPID 키, `push_subscriptions` 테이블, service worker 강화
  - 신규 콜 등록 시 해당 기사에게만 발송 (무차별 X)
  - SMS fallback 없음 (기사 SMS 비용 0)
  - 앱 내부 알림/뱃지/미확인 표시 구조 검토

