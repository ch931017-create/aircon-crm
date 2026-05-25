// 운영 브랜드 메타데이터. 외부 노출(메타/manifest/OG)과 화면 라벨의 단일 소스.
// 변경 시 반드시 점검:
//   - app/layout.tsx (metadata + appleWebApp)
//   - public/manifest.json (name/short_name/description)
//   - public/offline.html (브랜드 라벨)
//   - 각 page metadata title (template 적용 → 짧은 title만 둘 것)

export const BRAND_NAME = "출장시민기사";
export const BRAND_SHORT = "출장시민";

// 대표 색상(16진수) — manifest theme_color / background_color 와 동기화 필요.
export const BRAND_COLOR = "#2563eb";

// 로고 옆 보조 문자 (앱 내 시각 라벨용).
export const BRAND_LOGO_TEXT = "에어컨";

// 운영 도메인 (한글). new URL() 사용 시 자동 punycode 변환.
// 환경별 도메인 차이는 NEXT_PUBLIC_APP_URL 별도 사용 (메일 callback 등).
// 메타데이터 baseUrl 은 운영 도메인 고정.
export const BRAND_DOMAIN = "https://출장시민기사.kr";

// og:description / meta description / manifest description 공통 문구.
// 운영 친화적 + 검색 친화적. 50~80자 권장 범위.
export const BRAND_DESCRIPTION =
  "에어컨 출장수리 기사/콜직원 업무 관리 — 콜 배정, 일정, 정산 통합";
