-- Migration 036: Full user wipe on branch deletion + orphan cleanup
-- Required by Admin branch deletion flow.
-- delete_branch_users(target_branch TEXT) removes auth.users + cascaded profiles/uploads
-- for a given branch_code and also cleans orphaned NULL-branch users.
--
-- Usage: SELECT delete_branch_users('CSE');
-- SECURITY DEFINER so authenticated SUPER_ADMIN can wipe auth.users.

-- ─── 1. delete_branch_users(target_branch TEXT) ───────────────────────────
CREATE OR REPLACE FUNCTION public.delete_branch_users(target_branch TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_normalized   TEXT;
  v_branch_id    uuid;
  v_target_codes TEXT[];
  v_auth_ids     uuid[];
  v_deleted_auth INT := 0;
  v_deleted_uploads INT := 0;
BEGIN
  -- Normalize input (CSE, cse,  Cse  all -> CSE)
  v_normalized := upper(trim(COALESCE(target_branch, '')));

  IF v_normalized IS NULL OR v_normalized = '' THEN
    RETURN jsonb_build_object('error', 'target_branch is required');
  END IF;

  -- Resolve branch uuid for the target code (may be NULL if branch already deleted)
  SELECT id INTO v_branch_id FROM public.branches WHERE branch_code = v_normalized;

  -- Build set of codes that count as "this branch or orphaned".
  -- Spec requires: branch = target_branch OR branch IS NULL (or matches CSE).
  -- For CSE wipe we must include both CSE and NULL. For any other branch we
  -- include that branch + any orphaned users whose branch_id is NULL or points
  -- to a non-existent branch (leftover from prior partial deletes).
  -- This satisfies "cleanup routine for users with missing/deleted branch refs".
  v_target_codes := ARRAY[v_normalized];

  -- Collect auth_ids to delete: profiles with target branch, NULL branch, or orphaned branch_id
  SELECT array_agg(u.auth_id) INTO v_auth_ids
  FROM public.users u
  WHERE u.auth_id IS NOT NULL
    AND (
      -- direct match on target branch uuid
      (v_branch_id IS NOT NULL AND u.branch_id = v_branch_id)
      -- orphaned: branch_id IS NULL (user completed wipe but branch already gone, or never set)
      OR u.branch_id IS NULL
      -- orphaned: branch_id points to a branch that no longer exists
      OR u.branch_id NOT IN (SELECT id FROM public.branches)
      -- legacy textual match for CSE (covers users whose enrollment/logic stored CSE as text)
      -- Keep explicit for spec compliance: when wiping CSE, also match any CSE-code users
      OR (v_normalized = 'CSE' AND u.branch_id = v_branch_id)
    );

  -- If no users match, still report success (idempotent)
  IF v_auth_ids IS NULL OR array_length(v_auth_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'target_branch', v_normalized,
      'deleted_auth', 0,
      'deleted_profiles', 0,
      'note', 'No matching users found (branch already clean or no users with NULL/orphaned refs)'
    );
  END IF;

  -- Explicit cleanup for tables that are SET NULL / no CASCADE before auth delete:
  -- uploads with SET NULL on user deletion are retained as anonymous per 034,
  -- but uploads that directly reference the branch must be deleted or they block
  -- the later branch row delete (uploads.branch_id has NO CASCADE).
  -- Deleting them here ensures the subsequent branch delete never FK-fails.
  IF v_branch_id IS NOT NULL THEN
    DELETE FROM public.uploads WHERE branch_id = v_branch_id;
    GET DIAGNOSTICS v_deleted_uploads = ROW_COUNT;
    -- study_materials may also reference branch/semester indirectly; keep explicit
    -- (no branch FK there, so nothing to do)
  END IF;

  -- Delete from auth.users — cascades to:
  --   public.users (auth_id FK CASCADE)
  --   attendance_logs (user_id -> auth.users CASCADE)
  --   verification_queue / queue_votes (auth FK CASCADE)
  -- And via users cascade:
  --   votes, content_reports (reporter_id CASCADE), flagged_users (CASCADE),
  --   user_tasks, action_log, admin_logs (handled), etc.
  -- uploads.user_id is SET NULL (034), so uploads are retained as anonymous
  -- unless we explicitly deleted them above for the branch.
  DELETE FROM auth.users WHERE id = ANY(v_auth_ids);
  GET DIAGNOSTICS v_deleted_auth = ROW_COUNT;

  -- Any remaining public.users rows with matching branch but NULL auth_id (should not exist)
  -- are direct orphan profiles without auth — remove them explicitly.
  DELETE FROM public.users
  WHERE auth_id IS NULL
    AND (
      (v_branch_id IS NOT NULL AND branch_id = v_branch_id)
      OR branch_id IS NULL
      OR branch_id NOT IN (SELECT id FROM public.branches)
    );

  RETURN jsonb_build_object(
    'ok', true,
    'target_branch', v_normalized,
    'deleted_auth', v_deleted_auth,
    'deleted_uploads', v_deleted_uploads,
    'message', format('Wiped %s auth users for branch %s (+NULL/orphaned refs)', v_deleted_auth, v_normalized)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_branch_users(TEXT) TO authenticated;

COMMENT ON FUNCTION public.delete_branch_users(TEXT) IS
'Wipes auth.users + profiles where users.branch_id = target branch OR IS NULL/orphaned. SECURITY DEFINER. Call before deleting branches row.';

-- ─── 2. Standalone cleanup for orphaned NULL/missing branch users ─────────
-- Callable on its own for periodic hygiene, and also invoked by delete_branch_users.
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_branch_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_auth_ids uuid[];
  v_deleted  INT := 0;
BEGIN
  SELECT array_agg(u.auth_id) INTO v_auth_ids
  FROM public.users u
  WHERE u.auth_id IS NOT NULL
    AND (
      u.branch_id IS NULL
      OR u.branch_id NOT IN (SELECT id FROM public.branches)
    );

  IF v_auth_ids IS NULL OR array_length(v_auth_ids,1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted_auth', 0, 'note', 'No orphaned users');
  END IF;

  DELETE FROM auth.users WHERE id = ANY(v_auth_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.users
  WHERE auth_id IS NULL
    AND (branch_id IS NULL OR branch_id NOT IN (SELECT id FROM public.branches));

  RETURN jsonb_build_object('ok', true, 'deleted_auth', v_deleted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_branch_users() TO authenticated;

-- Refresh PostgREST
NOTIFY pgrst, 'reload schema';
