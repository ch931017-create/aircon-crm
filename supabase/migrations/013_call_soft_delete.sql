-- =========================================================
-- 013_call_soft_delete.sql : 콜 soft delete + 휴지통
-- =========================================================
-- 권한 정책 (앱 + DB 이중 가드):
--   - admin   : 모든 콜 soft delete / 휴지통 조회 / 복원 가능
--   - dispatcher : 동일
--   - technician : 삭제·복원·휴지통 조회 모두 불가 (DB 트리거 차단)
--   - 완료콜(status='completed')은 누구든 soft delete/restore 불가
--     (DB 트리거에서 RAISE EXCEPTION으로 명시적 거부)
--   - hard delete는 admin이 직접 SQL 사용 시에만 (기존 calls_delete_admin 유지)
--
-- 회귀 안전:
--   - SELECT 정책 분리로 기존 모든 SELECT 코드가 자동으로
--     deleted_at IS NULL 필터링됨 → 기존 동작 100% 유지
--   - status 컬럼 무변경 (soft delete는 deleted_at만 채움)
--   - 정책 교체는 zero-downtime 순서 (신규 생성 → 마지막 기존 DROP)
-- =========================================================

BEGIN;

-- ---------------------------------------------------------
-- 1. 컬럼 추가
-- ---------------------------------------------------------
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS deleted_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS delete_reason text;

-- ---------------------------------------------------------
-- 2. 인덱스 (활성/휴지통 둘 다 빠른 조회)
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_calls_not_deleted
  ON public.calls(created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_calls_deleted
  ON public.calls(deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------
-- 3. SELECT 정책 — zero-downtime 교체
--    a. 새 정책 먼저 생성 (기존 calls_select_all과 OR 결합되어 효력 없음)
--    b. 마지막에 calls_select_all DROP → 그 순간부터 새 정책만 효력
--    ROLLBACK되어도 calls_select_all 살아있어 운영 영향 0
-- ---------------------------------------------------------

-- 3a. 새 정책 먼저 생성 (멱등을 위해 DROP IF EXISTS → CREATE)
DROP POLICY IF EXISTS "calls_select_not_deleted" ON public.calls;
CREATE POLICY "calls_select_not_deleted"
  ON public.calls FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "calls_select_deleted_admin_dispatcher" ON public.calls;
CREATE POLICY "calls_select_deleted_admin_dispatcher"
  ON public.calls FOR SELECT TO authenticated
  USING (
    deleted_at IS NOT NULL
    AND public.get_my_role() IN ('admin', 'dispatcher')
  );

-- 3b. 기존 calls_select_all 마지막에 제거 (이 시점부터 새 정책만 효력)
DROP POLICY IF EXISTS "calls_select_all" ON public.calls;

-- ---------------------------------------------------------
-- 4. 통합 가드 트리거
--    (a) technician : deleted_* 컬럼 변경 silent 차단 (OLD 값으로 복원)
--    (b) 완료콜(OLD.status='completed') : deleted_* 변경 시 RAISE EXCEPTION
--        - 정산 등 다른 컬럼 update는 NEW.deleted_*=OLD.deleted_* → 통과
--    (c) service_role(auth.uid IS NULL) : 우회 (운영 admin SQL 통과)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_calls_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  -- (c) service_role 우회
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := public.get_my_role();

  -- (a) technician 차단: deleted_* 변경 시도 silent 복원
  IF v_role = 'technician' THEN
    NEW.deleted_at    := OLD.deleted_at;
    NEW.deleted_by    := OLD.deleted_by;
    NEW.delete_reason := OLD.delete_reason;
  END IF;

  -- (b) 완료콜 보호: deleted_* 변경 시도면 명시적 거부
  IF OLD.status = 'completed'
     AND (
       NEW.deleted_at    IS DISTINCT FROM OLD.deleted_at
       OR NEW.deleted_by    IS DISTINCT FROM OLD.deleted_by
       OR NEW.delete_reason IS DISTINCT FROM OLD.delete_reason
     ) THEN
    RAISE EXCEPTION 'COMPLETED_CALL_CANNOT_BE_SOFT_DELETED'
      USING errcode = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calls_guard_soft_delete_trg ON public.calls;
CREATE TRIGGER calls_guard_soft_delete_trg
  BEFORE UPDATE ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_calls_soft_delete();

COMMIT;

-- ---------------------------------------------------------
-- 사후 검증 (Dashboard에서 적용 직후 결과 확인)
-- ---------------------------------------------------------
-- ① 컬럼 3개 생성 확인 → 3
SELECT count(*) AS cols_added
FROM information_schema.columns
WHERE table_schema='public' AND table_name='calls'
  AND column_name IN ('deleted_at','deleted_by','delete_reason');

-- ② 콜 분포 → active = 전체 기존 콜 수, trashed = 0
SELECT
  (SELECT count(*) FROM public.calls WHERE deleted_at IS NULL) AS active,
  (SELECT count(*) FROM public.calls WHERE deleted_at IS NOT NULL) AS trashed;

-- ③ SELECT 정책 확인
--    - calls_select_all 은 없어야 함
--    - calls_select_not_deleted, calls_select_deleted_admin_dispatcher 둘 다 있어야 함
SELECT polname FROM pg_policy
WHERE polrelid = 'public.calls'::regclass
  AND polname LIKE 'calls_select_%'
ORDER BY polname;

-- ④ 트리거 확인 → 1행
SELECT tgname FROM pg_trigger WHERE tgname='calls_guard_soft_delete_trg';
