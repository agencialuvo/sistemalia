-- ============================================================
-- 038_tenant_logos_storage.sql
--
-- Creates the `tenant-logos` Storage bucket for Historia 2 (Paso 3:
-- Logotipo / Foto de Perfil). Public bucket (logo is stamped on
-- clinical documents, WhatsApp templates, etc. — needs a plain URL,
-- not a signed one), account-scoped writes.
--
-- File path convention (mirrors chat-media / flow-media from 020/023):
--   tenant-logos/account-{account_id}/logo-<timestamp>.<ext>
-- The policies rely on the first path segment being
-- `account-{account_id}` for an account the caller belongs to.
--
-- Idempotent — safe to re-run.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-logos',
  'tenant-logos',
  TRUE,
  2097152, -- 2 MB per spec
  ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Tenant logos are publicly readable" ON storage.objects;
CREATE POLICY "Tenant logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-logos');

DROP POLICY IF EXISTS "Members can upload tenant logo" ON storage.objects;
CREATE POLICY "Members can upload tenant logo"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'tenant-logos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can update tenant logo" ON storage.objects;
CREATE POLICY "Members can update tenant logo"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'tenant-logos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can delete tenant logo" ON storage.objects;
CREATE POLICY "Members can delete tenant logo"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'tenant-logos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );
