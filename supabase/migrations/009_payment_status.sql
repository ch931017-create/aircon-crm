-- =========================================================
-- 009_payment_status.sql
--   1) payment_method enum 확장: invoice→tax_invoice rename,
--      transfer / cash_receipt 신규 추가
--   2) payment_status enum 추가 + calls.payment_status / paid_at
--   3) 기존 완료된 콜은 paid로 백필 (회귀 방지)
-- =========================================================

-- payment_method enum 확장 -----------------------------------------
DO $$ BEGIN
  ALTER TYPE public.payment_method RENAME VALUE 'invoice' TO 'tax_invoice';
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN invalid_parameter_value THEN NULL;
  WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'transfer';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'cash_receipt';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- payment_status enum -----------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- calls 컬럼 추가 ---------------------------------------------------
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status
    NOT NULL DEFAULT 'unpaid';

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_calls_payment_status
  ON public.calls(payment_status);

-- 기존 완료 콜 백필: 이미 완료 처리된 콜은 입금완료로 간주 ----------
UPDATE public.calls
   SET payment_status = 'paid',
       paid_at = COALESCE(paid_at, completed_at, now())
 WHERE status = 'completed'
   AND payment_status = 'unpaid';

-- RLS 변경 없음: 기존 calls_update_admin 정책으로 admin이 갱신 가능.
-- payment_status 변경은 admin 전용 API에서만 처리합니다.
