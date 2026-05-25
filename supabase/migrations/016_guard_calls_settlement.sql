-- =========================================================
-- 016_guard_calls_settlement.sql
--   technician 의 calls.settlement_status / settled_at / settled_by
--   직접 변경을 DB 트리거에서 차단.
--
-- 배경:
--   - RLS calls_update_tech_assigned (004) 는 기사가 본인 콜 update 허용.
--   - settlement_status 변경 권한은 운영 정책상 admin 전용.
--   - API(/api/admin/settlements/mark) 는 admin only로 이미 막혀있지만
--     기사가 supabase JS로 직접 update 시도하면 DB까지 통과 가능.
--   - 본 트리거로 DB 레벨 이중 가드.
--
-- 패턴: 012 guard_profile_self_update / 013 guard_calls_soft_delete 와 동일.
-- service_role(auth.uid IS NULL)은 우회 (server-side admin SQL 통과).
-- admin/dispatcher는 영향 없음 (기존 API 그대로 동작).
--
-- 회귀 안전:
--   - 신규 트리거 추가. 기존 트리거(calls_guard_soft_delete_trg,
--     calls_column_guard_trg) 모두 그대로 유지.
--   - settlement_status 외 컬럼은 본 트리거에서 처리 안 함.
-- =========================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_calls_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  -- service_role / 운영 SQL 우회
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := public.get_my_role();

  -- technician 은 settlement 관련 컬럼 변경 금지 (silent restore)
  IF v_role = 'technician' THEN
    NEW.settlement_status := OLD.settlement_status;
    NEW.settled_at        := OLD.settled_at;
    NEW.settled_by        := OLD.settled_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calls_guard_settlement_trg ON public.calls;
CREATE TRIGGER calls_guard_settlement_trg
  BEFORE UPDATE ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_calls_settlement();

COMMIT;

-- ---------------------------------------------------------
-- 사후 검증
-- ---------------------------------------------------------
-- ① 트리거 생성 확인 → 1행
SELECT tgname FROM pg_trigger WHERE tgname = 'calls_guard_settlement_trg';

-- ② 기존 트리거도 함께 살아있는지 확인 → 3행
SELECT tgname FROM pg_trigger
WHERE tgname IN (
  'calls_guard_settlement_trg',
  'calls_guard_soft_delete_trg',
  'calls_column_guard_trg'
)
ORDER BY tgname;
