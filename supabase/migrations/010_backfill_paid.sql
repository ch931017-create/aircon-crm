-- =========================================================
-- 010_backfill_paid.sql
--   기존 완료된 콜은 기본적으로 입금완료(paid) 처리.
--   - status='completed' 또는 completed_at IS NOT NULL 인 콜
--   - payment_status='unpaid' 인 것만 갱신
--   - settlement_status='settled' 인 콜은 정산 정보 영향 없음
--     (paid_at만 보정해도 settled_at/settled_by는 그대로 유지)
-- =========================================================

UPDATE public.calls
   SET payment_status = 'paid',
       paid_at = COALESCE(paid_at, completed_at, now())
 WHERE payment_status = 'unpaid'
   AND (status = 'completed' OR completed_at IS NOT NULL);
