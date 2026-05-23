-- =========================================================
-- 001_init.sql : Enums + Tables + Triggers
-- =========================================================

-- Enums --------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin','dispatcher','technician');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.call_status as enum
    ('new','assigned','scheduled','visiting','completed','cancelled');
exception when duplicate_object then null; end $$;

-- profiles -----------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  phone       text,
  role        public.user_role not null default 'technician',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- calls --------------------------------------------------
create table if not exists public.calls (
  id                uuid primary key default gen_random_uuid(),
  customer_name     text not null,
  phone             text not null,
  address           text not null,
  district          text,
  symptom           text,
  preferred_time    timestamptz,
  memo              text,
  estimated_amount  integer,        -- 콜직원이 입력
  paid_amount       integer,        -- 기사가 입력
  status            public.call_status not null default 'new',
  assigned_to       uuid references public.profiles(id) on delete set null,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  assigned_at       timestamptz,
  completed_at      timestamptz
);

create index if not exists idx_calls_status      on public.calls(status);
create index if not exists idx_calls_assigned_to on public.calls(assigned_to);
create index if not exists idx_calls_created_at  on public.calls(created_at desc);

-- handle_new_user: auth.users 생성 시 profiles 자동 생성 ----
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Realtime 활성화 ----------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when duplicate_object then null; end $$;
