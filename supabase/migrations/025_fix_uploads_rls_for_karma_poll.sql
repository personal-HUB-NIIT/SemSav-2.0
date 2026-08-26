-- Migration 025: Fix uploads RLS — students see all branch+semester uploads
-- Problem: uploads_select_scoped only allowed VERIFIED + own uploads
-- This blocked KarmaPoll from showing other students' UNVERIFIED uploads

-- Drop the old restrictive policy
DROP POLICY IF EXISTS uploads_select_scoped ON public.uploads;

-- New policy: students see ALL uploads in their branch+semester
-- (VERIFIED, UNVERIFIED, even PURGED — frontend filters as needed)
CREATE POLICY uploads_select_scoped ON public.uploads
  FOR SELECT USING (
    auth_role() = 'SUPER_ADMIN'
    OR (
      branch_id = auth_branch_id()
      AND semester = auth_semester()
    )
  );
