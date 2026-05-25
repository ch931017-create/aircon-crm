# 출장시민기사

출장 에어컨 수리업체용 콜 관리 시스템. 일반 자동배차가 아닌 **수동 선점(claim) 모델**.

- 운영 도메인: https://출장시민기사.kr
- 내부 코드명: `aircon-crm` (package.json, service worker cache name 등 내부 식별자 유지)

## 셋업

```powershell
npm install
Copy-Item .env.local.example .env.local
# .env.local 파일에 Supabase 값 입력
npm run dev
```

http://localhost:3000 접속.

## 스택

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (Auth, Postgres, Realtime)

## 역할

- `admin` — 전체 권한, 사용자 관리, 강제 재배정
- `dispatcher` (콜직원) — 콜 등록, 견적금액 입력
- `technician` (기사) — 콜 선점, 방문, 결제금액 입력

## 콜 상태

`new` → `assigned` → `scheduled` → `visiting` → `completed`  (또는 `cancelled`)
