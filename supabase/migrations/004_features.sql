-- =========================================================
-- 004_features.sql : Assignment, status workflow, notification, and media schema
-- =========================================================

-- call_status 새 상태 추가
DO $$ BEGIN
  ALTER TYPE public.call_status ADD VALUE IF NOT EXISTS 'on_the_way' AFTER 'assigned';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.call_status ADD VALUE IF NOT EXISTS 'working' AFTER 'on_the_way';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- calls 테이블에 assigned_technician_id 추가
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS assigned_technician_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calls_assigned_technician_id
  ON public.calls(assigned_technician_id);

UPDATE public.calls
SET assigned_technician_id = assigned_to
WHERE assigned_technician_id IS NULL
  AND assigned_to IS NOT NULL;

-- 관리자/콜직원 전용 배정 RPC
CREATE OR REPLACE FUNCTION public.assign_call_to_technician(
  p_call_id uuid,
  p_technician_id uuid
)
RETURNS public.calls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.calls;
  v_role public.user_role;
BEGIN
  v_role := public.get_my_role();
  IF v_role NOT IN ('admin', 'dispatcher') THEN
    RAISE EXCEPTION 'ONLY_DISPATCHER_OR_ADMIN_CAN_ASSIGN' USING errcode = '42501';
  END IF;

  UPDATE public.calls
     SET assigned_to = p_technician_id,
         assigned_technician_id = p_technician_id,
         assigned_at = now(),
         status = 'assigned'
   WHERE id = p_call_id
     AND status = 'new'
     AND assigned_to IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'ALREADY_ASSIGNED' USING errcode = 'P0001';
  END IF;

  RETURN v_row;
END;
$$;

-- notification 테이블 기본 구조
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_profile_id_is_read
  ON public.notifications(profile_id, is_read);

-- photo 테이블 기본 구조
CREATE TABLE IF NOT EXISTS public.call_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_photos_call_id
  ON public.call_photos(call_id);

-- RLS / 정책 업데이트
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_owner ON public.notifications;
CREATE POLICY notifications_select_owner
  ON public.notifications FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS notifications_insert_owner ON public.notifications;
CREATE POLICY notifications_insert_owner
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_admin ON public.notifications;
CREATE POLICY notifications_update_admin
  ON public.notifications FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS notifications_delete_admin ON public.notifications;
CREATE POLICY notifications_delete_admin
  ON public.notifications FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

-- calls 테이블 RLS 업데이트: dispatcher는 전체 콜 상태 변경 가능, technician은 할당된 콜만 수정 가능
DROP POLICY IF EXISTS calls_update_dispatcher_own ON public.calls;
DROP POLICY IF EXISTS calls_update_tech_assigned ON public.calls;

DROP POLICY IF EXISTS calls_update_dispatcher_all ON public.calls;
CREATE POLICY calls_update_dispatcher_all
  ON public.calls FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'dispatcher')
  WITH CHECK (public.get_my_role() = 'dispatcher');

DROP POLICY IF EXISTS calls_update_tech_assigned ON public.calls;
CREATE POLICY calls_update_tech_assigned
  ON public.calls FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'technician' AND (assigned_to = auth.uid() OR assigned_technician_id = auth.uid()))
  WITH CHECK (assigned_to = auth.uid() OR assigned_technician_id = auth.uid());
