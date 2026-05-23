-- =========================================================
-- 012_approval_status.sql : 기사 회원가입 승인제
-- =========================================================
-- 신규 가입자는 approval_status='pending' 상태로 시작하여
-- 관리자 승인을 받아야 앱 기능 사용 가능.
-- 기존 사용자는 자동으로 'approved'로 백필되어 영향 없음.

-- ---------------------------------------------------------
-- 1. enum
-- ---------------------------------------------------------
do $$ begin
  create type public.approval_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------
-- 2. profiles 컬럼 추가
-- ---------------------------------------------------------
alter table public.profiles
  add column if not exists approval_status public.approval_status not null default 'pending',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------
-- 3. 기존 사용자 백필 (관리자 잠김 방지 - 매우 중요)
--    - admin / dispatcher: 무조건 approved
--    - active technician: approved (기존 운영 상태 유지)
-- ---------------------------------------------------------
update public.profiles
   set approval_status = 'approved',
       approved_at = coalesce(approved_at, created_at)
 where role in ('admin', 'dispatcher')
   and approval_status <> 'approved';

update public.profiles
   set approval_status = 'approved',
       approved_at = coalesce(approved_at, created_at)
 where role = 'technician'
   and is_active = true
   and approval_status = 'pending';

-- ---------------------------------------------------------
-- 4. 인덱스: 승인 대기 목록 빠르게 조회
-- ---------------------------------------------------------
create index if not exists idx_profiles_approval_pending
  on public.profiles(approval_status)
  where approval_status = 'pending';

-- ---------------------------------------------------------
-- 5. 자기 권한 임의 상승 차단 트리거
--    본인 update 시 role / approval_status / is_active /
--    approved_at / approved_by 컬럼은 admin 외에는 변경 불가.
--    (profiles_update_self RLS가 전체 컬럼 update를 허용하므로
--     이 트리거가 컬럼 단위 가드 역할)
-- ---------------------------------------------------------
create or replace function public.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role public.user_role;
begin
  -- 트리거 호출자가 본인 row를 수정 중이고, admin이 아닐 때만 가드
  select role into v_caller_role from public.profiles where id = auth.uid();

  if auth.uid() = old.id and v_caller_role is distinct from 'admin' then
    new.role             := old.role;
    new.approval_status  := old.approval_status;
    new.approved_at      := old.approved_at;
    new.approved_by      := old.approved_by;
    new.is_active        := old.is_active;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_self_update on public.profiles;
create trigger profiles_guard_self_update
  before update on public.profiles
  for each row execute function public.guard_profile_self_update();

-- ---------------------------------------------------------
-- 6. 사후 검증 (Dashboard에서 수동 실행하여 확인 권장)
-- ---------------------------------------------------------
-- select
--   count(*) filter (where approval_status = 'approved') as approved,
--   count(*) filter (where approval_status = 'pending')  as pending,
--   count(*) filter (where role = 'admin' and approval_status <> 'approved') as admin_not_approved
-- from public.profiles;
-- ↑ admin_not_approved 는 반드시 0
