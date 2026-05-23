-- =========================================================
-- 005_settlement.sql : Payment and settlement schema
-- =========================================================

-- payment_method enum
DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash', 'invoice', 'card');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- calls 테이블에 결제/정산 관련 컬럼 추가
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS tax_included boolean DEFAULT true NOT NULL;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS invoice_business_id text;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS invoice_business_name text;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS invoice_ceo_name text;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS invoice_email text;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS settlement_note text;

CREATE INDEX IF NOT EXISTS idx_calls_payment_method
  ON public.calls(payment_method);

-- profiles 테이블에 기사별 정산 비율 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cash_ratio numeric(5,2) NOT NULL DEFAULT 70.0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invoice_ratio numeric(5,2) NOT NULL DEFAULT 70.0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS card_ratio numeric(5,2) NOT NULL DEFAULT 65.0;

-- 정산 설정 테이블
CREATE TABLE IF NOT EXISTS public.settlement_settings (
  id text PRIMARY KEY,
  invoice_processing_fee integer NOT NULL DEFAULT 5000,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.settlement_settings (id, invoice_processing_fee)
VALUES ('default', 5000)
ON CONFLICT (id) DO NOTHING;

-- Realtime & 기존 함수 유지
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
