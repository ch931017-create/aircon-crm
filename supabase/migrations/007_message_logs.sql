-- =========================================================
-- 007_message_logs.sql : Message / Notification / Happy-call logs
-- =========================================================

DO $$ BEGIN
  CREATE TYPE public.message_type AS ENUM ('notification', 'happy_call');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.message_status AS ENUM ('pending', 'sent', 'answered', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.message_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  call_id uuid references public.calls(id) on delete set null,
  type public.message_type not null default 'notification',
  status public.message_status not null default 'pending',
  provider text,
  message_text text,
  payload jsonb,
  technician_id uuid references public.profiles(id) on delete set null,
  technician_name text,
  technician_phone text,
  customer_name text,
  customer_phone text,
  response jsonb,
  satisfaction text,
  note text
);

CREATE INDEX IF NOT EXISTS idx_message_logs_call_id ON public.message_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_status ON public.message_logs(status);
CREATE INDEX IF NOT EXISTS idx_message_logs_created_at ON public.message_logs(created_at desc);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_logs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
