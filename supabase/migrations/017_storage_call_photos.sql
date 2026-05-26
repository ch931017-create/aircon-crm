-- =========================================================
-- 017_storage_call_photos.sql : Storage call-photos bucket + RLS policies
-- =========================================================
-- 배경:
--   기사 정산 시 수리 전/후 사진을 Supabase Storage 'call-photos' bucket 에 업로드.
--   코드 (src/components/calls/CallDetail.tsx) 가 다음 흐름:
--     supabase.storage.from('call-photos').upload(filePath, file)
--     supabase.storage.from('call-photos').getPublicUrl(filePath)
--   bucket 자체는 Dashboard 에서 수동 생성됐을 가능성이 있으나, storage.objects
--   RLS policy 가 없으면 INSERT 거부:
--     "new row violates row-level security policy"
--
-- 이 마이그레이션이 처리:
--   1. bucket 생성 (idempotent) — public=true 강제 (getPublicUrl 동작에 필요).
--   2. storage.objects INSERT policy — authenticated 만 (익명 차단).
--   3. storage.objects SELECT policy — public 허용
--      (해피콜 페이지의 비로그인 고객도 사진 접근 + getPublicUrl URL 직접 GET).
--   4. UPDATE / DELETE policy 는 명시하지 않음 → RLS 기본 deny.
--      운영 정책상 사진 수정/삭제는 admin 별도 작업 (필요 시 후속 migration).
--
-- 권한 모델 (의도된 설계):
--   - 기사 / 콜직원 / 관리자 : authenticated → bucket 'call-photos' 에 업로드 가능
--   - 익명 사용자          : INSERT 차단, SELECT 만 허용 (해피콜 페이지용)
--   - 사진 수정/삭제      : 코드 경로 없음. RLS deny. 필요 시 별도 admin 작업.
--
-- 회귀 안전:
--   - 신규 bucket / policy 만 추가. 기존 다른 bucket / 정책 영향 X.
--   - DROP POLICY IF EXISTS → CREATE 멱등 패턴.
--   - bucket INSERT 도 ON CONFLICT 처리 (이미 있어도 안전).
--
-- 참고:
--   - public.call_photos 테이블 (004_features.sql) 은 현재 코드 미사용.
--     dead code 라 RLS 작업 불필요. 향후 사용 시 별도 migration.
-- =========================================================

BEGIN;

-- ---------------------------------------------------------
-- 1. bucket 생성 (idempotent + public 강제)
-- ---------------------------------------------------------
-- public=true 가 아니면 getPublicUrl 이 반환하는 URL 로 anon 접근 불가.
-- 이미 존재하는 bucket 이라도 public 속성을 정정.
INSERT INTO storage.buckets (id, name, public)
VALUES ('call-photos', 'call-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ---------------------------------------------------------
-- 2. INSERT policy — authenticated 사용자만 업로드
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "call_photos_insert_authenticated" ON storage.objects;
CREATE POLICY "call_photos_insert_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'call-photos');

-- ---------------------------------------------------------
-- 3. SELECT policy — public (비로그인 고객 + getPublicUrl)
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "call_photos_select_public" ON storage.objects;
CREATE POLICY "call_photos_select_public"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'call-photos');

COMMIT;

-- ---------------------------------------------------------
-- 사후 검증 (Dashboard SQL Editor 적용 직후 결과 확인)
-- ---------------------------------------------------------
-- ① bucket 확인 → 1행, public=true
SELECT id, name, public
FROM storage.buckets
WHERE id = 'call-photos';
-- 예상: ('call-photos', 'call-photos', true)

-- ② policy 확인 → 2행 (insert + select)
SELECT pol.polname, pol.polcmd
FROM pg_policy pol
JOIN pg_class c ON pol.polrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'storage'
  AND c.relname = 'objects'
  AND pol.polname LIKE 'call_photos_%'
ORDER BY pol.polname;
-- 예상:
--   call_photos_insert_authenticated | a   (INSERT)
--   call_photos_select_public        | r   (SELECT)
