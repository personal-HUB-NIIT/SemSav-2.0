-- Migration 015: User Profile Photos
-- Run this ENTIRE script in Supabase SQL Editor → New Query → Run

-- ─── 1. Add avatar_url column to users table ──────────────────────────────────

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;

-- ─── 2. Create avatars storage bucket ─────────────────────────────────────────
-- Use DO block so it doesn't fail if bucket already exists

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'avatars',
    'avatars',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  );
EXCEPTION WHEN unique_violation THEN
  -- Bucket already exists, do nothing
  NULL;
END $$;

-- ─── 3. Drop existing policies on storage.objects for avatars (idempotent) ────

DROP POLICY IF EXISTS "Public read access for avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

-- ─── 4. Create storage RLS policies ──────────────────────────────────────────

CREATE POLICY "Public read access for avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ─── 5. Ensure users update policy covers avatar_url ─────────────────────────

DROP POLICY IF EXISTS users_update_own_limited ON public.users;

CREATE POLICY users_update_own_limited ON public.users
  FOR UPDATE
  USING  (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- ─── 6. Verify ───────────────────────────────────────────────────────────────
-- Run this to confirm:
-- SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='avatar_url';
-- SELECT id, name, public FROM storage.buckets WHERE id='avatars';
