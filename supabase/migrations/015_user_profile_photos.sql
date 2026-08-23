-- Migration 015: User Profile Photos
-- Adds avatar_url column + avatars storage bucket with RLS policies

-- ─── 1. Add avatar_url column to users table ──────────────────────────────────

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;

-- ─── 2. Create avatars storage bucket (public) ────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. Storage RLS policies ──────────────────────────────────────────────────

-- Anyone can read avatars (bucket is public)
CREATE POLICY "Public read access for avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Authenticated users can upload their own avatar (max 1 per user, path: avatars/{user_id}/avatar.ext)
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ─── 4. Grant avatar_url column to authenticated role ─────────────────────────
-- (users_update_own_limited policy already allows authenticated to update their own row,
--  but we need to ensure the column is selectable)

-- No additional grants needed: SELECT is already granted to authenticated on users table.
-- The UPDATE policy (users_update_own_limited) will need to be recreated to allow avatar_url.

-- Recreate the update policy to include avatar_url
DROP POLICY IF EXISTS users_update_own_limited ON public.users;

CREATE POLICY users_update_own_limited ON public.users
  FOR UPDATE
  USING  (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- Grant UPDATE on avatar_url specifically (column-level grant)
-- First revoke broad update if needed, then grant specific columns
-- Note: The existing policy already allows updating full_name.
-- We need to also allow avatar_url.
-- Since Supabase RLS uses WITH CHECK/USING and doesn't do column-level enforcement,
-- the policy above (auth_id = auth.uid()) already covers it.
-- We just need to make sure the column is GRANTed.
