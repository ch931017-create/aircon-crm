-- =========================================================
-- 011_tax_invoice_status.sql
--   세금계산서 발행 상태 / 메모 / 첨부 URL
--   RLS는 기존 calls 정책 그대로 사용. 발행 처리는 admin 전용 API에서만.
-- =========================================================

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
