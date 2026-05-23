-- =========================================================
-- 002_functions.sql : RPC + 컬럼 권한 트리거
-- =========================================================

-- get_my_role: RLS 정책 안에서 재귀 없이 role 조회 -----------
create or replace function public.get_my_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- claim_call: 콜 선점 (원자적) ----------------------------
create or replace function public.claim_call(p_call_id uuid)
returns public.calls
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.calls;
  v_role public.user_role;
begin
  v_role := public.get_my_role();
  if v_role <> 'technician' then
    raise exception 'ONLY_TECHNICIAN_CAN_CLAIM' using errcode = '42501';
  end if;

  update public.calls
     set assigned_to = auth.uid(),
         assigned_at = now(),
         status      = 'assigned'
   where id = p_call_id
     and status = 'new'
     and assigned_to is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'ALREADY_CLAIMED' using errcode = 'P0001';
  end if;
  return v_row;
end;
$$;

-- release_call: 기사 본인이 선점을 해제 (status=assigned일 때만) -
create or replace function public.release_call(p_call_id uuid)
returns public.calls
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.calls;
begin
  update public.calls
     set assigned_to = null,
         assigned_at = null,
         status      = 'new'
   where id = p_call_id
     and assigned_to = auth.uid()
     and status = 'assigned'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'CANNOT_RELEASE' using errcode = '42501';
  end if;
  return v_row;
end;
$$;

-- 컬럼별 권한 트리거 ---------------------------------------
-- technician → estimated_amount 수정 금지
-- dispatcher → paid_amount 수정 금지
create or replace function public.calls_column_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_role public.user_role;
begin
  v_role := public.get_my_role();

  if tg_op = 'UPDATE' then
    if v_role = 'technician'
       and coalesce(new.estimated_amount, -1) is distinct from coalesce(old.estimated_amount, -1) then
      raise exception 'TECHNICIAN_CANNOT_EDIT_ESTIMATED' using errcode = '42501';
    end if;
    if v_role = 'dispatcher'
       and coalesce(new.paid_amount, -1) is distinct from coalesce(old.paid_amount, -1) then
      raise exception 'DISPATCHER_CANNOT_EDIT_PAID' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists calls_column_guard_trg on public.calls;
create trigger calls_column_guard_trg
  before update on public.calls
  for each row execute function public.calls_column_guard();
