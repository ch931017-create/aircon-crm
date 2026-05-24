-- =========================================================
-- 014_push_subscriptions.sql : Web Push 구독 + 알림 설정
-- =========================================================
-- 추가 항목:
--   1) profiles.notify_completion : admin/dispatcher의 완료 알림 opt-out
--      기본 true. technician은 사용 안 함 (UI에서도 admin/dispatcher만 토글 노출)
--   2) push_subscriptions 테이블 : 브라우저별 push 구독 정보 저장
--      한 사용자가 여러 디바이스 → 여러 row. endpoint UNIQUE로 중복 방지
--
-- 권한 정책:
--   - 본인 구독만 select / insert / delete
--   - admin은 모든 구독 관리 (디버깅/운영용)
--   - service_role(server push 발송)은 RLS 자동 우회
--
-- 회귀 안전:
--   - 신규 컬럼/테이블만 추가, 기존 RLS / 트리거 / 정책 미변경
--   - 기존 notifications 테이블(004)과는 별개 (인앱 알림 vs 푸시 구독)
-- =========================================================

BEGIN;

-- ---------------------------------------------------------
-- 1. profiles 알림 설정 컬럼 (admin/dispatcher 한정 사용)
-- ---------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_completion boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------
-- 2. push_subscriptions 테이블
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile
  ON public.push_subscriptions(profile_id);

-- ---------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 본인 구독 SELECT
DROP POLICY IF EXISTS push_subscriptions_select_self ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_self
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- 본인 구독 INSERT
DROP POLICY IF EXISTS push_subscriptions_insert_self ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_self
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- 본인 구독 DELETE (수동 구독 해제용)
DROP POLICY IF EXISTS push_subscriptions_delete_self ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_self
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (profile_id = auth.uid());

-- admin은 모든 구독 관리 (운영 디버깅용)
DROP POLICY IF EXISTS push_subscriptions_admin_all ON public.push_subscriptions;
CREATE POLICY push_subscriptions_admin_all
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- service_role(server push 발송)은 RLS 자동 우회. UPDATE는 last_used_at 갱신 용도.

COMMIT;

-- ---------------------------------------------------------
-- 사후 검증 (Dashboard에서 적용 직후 결과 확인)
-- ---------------------------------------------------------
-- ① profiles.notify_completion 컬럼 추가 확인 → 1
SELECT count(*) AS notify_completion_added
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
  AND column_name='notify_completion';

-- ② push_subscriptions 테이블 + 인덱스 생성 확인
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_name='push_subscriptions') AS table_created,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname='public' AND indexname='idx_push_subscriptions_profile') AS index_created;
-- 결과: table_created = 1, index_created = 1

-- ③ RLS 정책 4개 확인
SELECT polname FROM pg_policy
WHERE polrelid='public.push_subscriptions'::regclass
ORDER BY polname;
-- 결과: 4행
--   push_subscriptions_admin_all
--   push_subscriptions_delete_self
--   push_subscriptions_insert_self
--   push_subscriptions_select_self

-- ④ 기존 사용자의 notify_completion 기본값 확인 (모두 true)
SELECT
  count(*) FILTER (WHERE notify_completion = true) AS opted_in,
  count(*) FILTER (WHERE notify_completion = false) AS opted_out
FROM public.profiles;
-- 결과: opted_in = 전체 사용자 수, opted_out = 0
