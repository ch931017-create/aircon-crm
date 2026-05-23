-- =========================================================
-- 008_settlement_status.sql : Per-call settlement status
-- =========================================================
-- 정산 상태 ENUM: 정산 미완료 / 정산 완료
DO $$ BEGIN
  CREATE TYPE public.settlement_status AS ENUM ('pending', 'settled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- calls 테이블에 정산 상태 컬럼 추가
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS settlement_status public.settlement_status
    NOT NULL DEFAULT 'pending';

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS settled_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calls_settlement_status
  ON public.calls(settlement_status);

CREATE INDEX IF NOT EXISTS idx_calls_settled_at
  ON public.calls(settled_at);

-- RLS는 기존 calls 정책으로 충분:
--  * calls_select_all : 인증된 사용자 전체 조회 가능 (페이지 단에서 본인 콜만 필터)
--  * calls_update_admin : admin은 settlement_status / settled_at / settled_by 갱신 가능
--  * calls_update_tech_assigned : 기사는 본인 콜 update 가능하지만,
--    settlement 처리 API는 admin 전용 핸들러로만 노출함
