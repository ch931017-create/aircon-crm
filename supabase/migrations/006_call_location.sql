-- =========================================================
-- 006_call_location.sql : Add latitude and longitude for proximity filtering
-- =========================================================

do $$ begin
  alter table public.calls add column latitude double precision;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.calls add column longitude double precision;
exception when duplicate_column then null; end $$;

create index if not exists idx_calls_location on public.calls(latitude, longitude);
