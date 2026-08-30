-- Migration 037: Orphan/NULL branch cleanup utility
-- Spec-required RPC: delete_orphan_and_null_branch_users()
-- Deletes auth.users where profile branch is NULL/empty/'CSE' (legacy) and
-- also covers current schema public.users with branch_id NULL/orphaned/CSE.

-- ─── Spec-exact function (legacy profiles) + adaptive handling for current schema ─
CREATE OR REPLACE FUNCTION delete_orphan_and_null_branch_users()
RETURNS VOID AS $$
BEGIN
  -- Legacy path: exact spec SQL — only runs if public.profiles exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles') THEN
    DELETE FROM auth.users
    WHERE id IN (
      SELECT id FROM public.profiles WHERE branch IS NULL OR branch = '' OR branch = 'CSE'
    );
  END IF;

  -- Current schema path: public.users with branch_id UUID FK
  -- Covers: branch_id IS NULL, branch_id orphaned (FK points to deleted branch),
  -- and explicit CSE branch (branch_code = 'CSE')
  DELETE FROM auth.users
  WHERE id IN (
    SELECT u.auth_id FROM public.users u
    WHERE u.auth_id IS NOT NULL
      AND (
        u.branch_id IS NULL
        OR u.branch_id NOT IN (SELECT id FROM public.branches)
        OR u.branch_id IN (SELECT id FROM public.branches WHERE branch_code = 'CSE')
      )
  );

  -- Fallback: any remaining public.users rows with orphan/NULL branch but auth_id NULL
  -- (should be rare; direct delete from public.users if no auth linkage)
  DELETE FROM public.users
  WHERE auth_id IS NULL
    AND (
      branch_id IS NULL
      OR branch_id NOT IN (SELECT id FROM public.branches)
      OR branch_id IN (SELECT id FROM public.branches WHERE branch_code = 'CSE')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure PostgREST can see it and authenticated admins can call it
REVOKE ALL ON FUNCTION delete_orphan_and_null_branch_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_orphan_and_null_branch_users() TO authenticated;
GRANT EXECUTE ON FUNCTION delete_orphan_and_null_branch_users() TO service_role;

COMMENT ON FUNCTION delete_orphan_and_null_branch_users() IS
'Admin cleanup: wipes auth.users + profiles where branch IS NULL/empty/CSE or branch_id orphaned. SECURITY DEFINER.';

NOTIFY pgrst, 'reload schema';
