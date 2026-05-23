-- =========================================================
-- 003_rls.sql : Row Level Security 정책
-- =========================================================

alter table public.profiles enable row level security;
alter table public.calls    enable row level security;

-- =========================================================
-- profiles 정책
-- =========================================================
drop policy if exists "profiles_select_all"      on public.profiles;
drop policy if exists "profiles_update_self"     on public.profiles;
drop policy if exists "profiles_admin_all"       on public.profiles;

-- 인증된 사용자는 모든 profile 조회 가능 (기사 이름 표시용)
create policy "profiles_select_all"
  on public.profiles for select to authenticated
  using (true);

-- 본인 profile 수정 (단, role은 변경 불가 - 트리거나 컬럼별 가드는 생략, admin만 변경 가능하므로 admin policy에서 처리)
create policy "profiles_update_self"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- admin은 모든 profile 관리
create policy "profiles_admin_all"
  on public.profiles for all to authenticated
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- =========================================================
-- calls 정책
-- =========================================================
drop policy if exists "calls_select_all"             on public.calls;
drop policy if exists "calls_insert_dispatcher"      on public.calls;
drop policy if exists "calls_update_admin"           on public.calls;
drop policy if exists "calls_update_dispatcher_own"  on public.calls;
drop policy if exists "calls_update_tech_assigned"   on public.calls;
drop policy if exists "calls_delete_admin"           on public.calls;

-- SELECT: 인증된 모든 사용자 (전체 가시성 - 핵심 비즈니스 요구사항)
create policy "calls_select_all"
  on public.calls for select to authenticated
  using (true);

-- INSERT: dispatcher 또는 admin
create policy "calls_insert_dispatcher"
  on public.calls for insert to authenticated
  with check (
    public.get_my_role() in ('dispatcher', 'admin')
    and created_by = auth.uid()
  );

-- UPDATE: admin 전체
create policy "calls_update_admin"
  on public.calls for update to authenticated
  using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- UPDATE: dispatcher가 자기가 만든 콜
create policy "calls_update_dispatcher_own"
  on public.calls for update to authenticated
  using (public.get_my_role() = 'dispatcher' and created_by = auth.uid())
  with check (created_by = auth.uid());

-- UPDATE: technician이 자기가 선점한 콜
create policy "calls_update_tech_assigned"
  on public.calls for update to authenticated
  using (public.get_my_role() = 'technician' and assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

-- DELETE: admin만
create policy "calls_delete_admin"
  on public.calls for delete to authenticated
  using (public.get_my_role() = 'admin');
