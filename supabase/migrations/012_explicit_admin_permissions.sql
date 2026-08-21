-- Migration 012: Explicit Admin vs Student Permissions
-- This migration does NOT change the existing policy logic (already correct),
-- but makes the rules explicit and documents them clearly.
-- Run in Supabase SQL Editor AFTER migration 004.

-- ============================================================
-- PERMISSION SUMMARY (enforced by RLS, NOT just the UI):
--
--   TABLE        | STUDENT              | SUPER_ADMIN
--   -------------|----------------------|-------------------------------------
--   branches     | SELECT only          | SELECT + INSERT + UPDATE + DELETE
--   subjects     | SELECT only          | SELECT + INSERT + UPDATE + DELETE
--   uploads      | SELECT + INSERT own  | SELECT + INSERT + UPDATE + DELETE
--   votes        | SELECT + INSERT own  | SELECT only (cannot vote)
--   users        | SELECT + UPDATE own  | SELECT all
-- ============================================================

-- Drop and recreate uploads delete policy to make it crystal clear:
-- Users CANNOT delete their own uploads. Only SUPER_ADMIN can.
drop policy if exists uploads_delete_admin_only on uploads;

create policy uploads_delete_admin_only on uploads
  for delete
  using (auth_role() = 'SUPER_ADMIN');

-- Confirm branches: no student can write
drop policy if exists branches_write_admin_only on branches;

create policy branches_insert_admin_only on branches
  for insert
  with check (auth_role() = 'SUPER_ADMIN');

create policy branches_update_admin_only on branches
  for update
  using     (auth_role() = 'SUPER_ADMIN')
  with check (auth_role() = 'SUPER_ADMIN');

create policy branches_delete_admin_only on branches
  for delete
  using (auth_role() = 'SUPER_ADMIN');

-- Confirm subjects: no student can write
drop policy if exists subjects_write_admin_only on subjects;

create policy subjects_insert_admin_only on subjects
  for insert
  with check (auth_role() = 'SUPER_ADMIN');

create policy subjects_update_admin_only on subjects
  for update
  using     (auth_role() = 'SUPER_ADMIN')
  with check (auth_role() = 'SUPER_ADMIN');

create policy subjects_delete_admin_only on subjects
  for delete
  using (auth_role() = 'SUPER_ADMIN');
