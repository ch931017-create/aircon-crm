-- =========================================================
-- 015_profile_location.sql : 기사 현재 위치 저장
-- =========================================================
-- 권한 정책: 운영 정책 + API 가드 방식
--   - 컬럼 추가 외 RLS / GRANT 변경 없음
--   - 클라이언트는 위치 컬럼을 절대 select 하지 않음 (코드 규약)
--   - 위치 조회는 server API에서만 (admin/dispatcher role 가드)
--   - 위치 update는 기사 본인만 (profiles_update_self RLS + 012 트리거 우회)
--     012의 guard_profile_self_update 트리거는 role/approval_status/
--     approved_at/approved_by/is_active 5개 컬럼만 보호.
--     current_lat/current_lng/location_updated_at은 보호 대상 아니므로
--     기사 본인이 자기 row update 가능.
-- =========================================================

BEGIN;

-- ---------------------------------------------------------
-- 컬럼 추가
-- ---------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_lat double precision;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_lng double precision;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

-- ---------------------------------------------------------
-- 인덱스 (lat·lng 둘 다 있는 정상 row만)
--   첫 버전(WHERE current_lat IS NOT NULL)이 이미 적용됐을 수도 있으므로
--   DROP → CREATE 패턴으로 멱등성 + 새 WHERE 조건 보장
-- ---------------------------------------------------------
DROP INDEX IF EXISTS public.idx_profiles_location;

CREATE INDEX IF NOT EXISTS idx_profiles_location
  ON public.profiles(current_lat, current_lng)
  WHERE current_lat IS NOT NULL
    AND current_lng IS NOT NULL;

COMMIT;

-- ---------------------------------------------------------
-- 사후 검증 SELECT (적용 후 결과 확인)
--   * cols_added : 3 이어야 함
--   * with_location : 0 (신규 시점에는 비어있음, 시간 지나면 늘어남)
-- ---------------------------------------------------------
SELECT
  count(*) FILTER (WHERE column_name IN ('current_lat', 'current_lng', 'location_updated_at')) AS cols_added,
  (SELECT count(*) FROM public.profiles WHERE current_lat IS NOT NULL) AS with_location
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles';
