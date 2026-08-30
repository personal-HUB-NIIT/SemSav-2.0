-- Migration 035: Robust branch deletion RPC
-- Deletes a branch and ALL associated data in the correct order.
-- SECURITY DEFINER so it can clean up auth.users for orphaned accounts.

CREATE OR REPLACE FUNCTION public.delete_branch_cascade(p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_branch_code text;
  v_uploads int := 0;
  v_users  int := 0;
  v_subjects int := 0;
  v_auth_deleted int := 0;
BEGIN
  SELECT branch_code INTO v_branch_code FROM branches WHERE id = p_branch_id;
  IF v_branch_code IS NULL THEN
    RETURN jsonb_build_object('error', 'Branch not found');
  END IF;

  -- 1. Delete uploads for this branch
  DELETE FROM uploads WHERE branch_id = p_branch_id;
  GET DIAGNOSTICS v_uploads = ROW_COUNT;

  -- 2. Delete user profiles for this branch
  --    (auth.users has ON DELETE CASCADE from users.auth_id, so this also
  --     cleans up auth accounts automatically)
  DELETE FROM users WHERE branch_id = p_branch_id;
  GET DIAGNOSTICS v_users = ROW_COUNT;

  -- 3. Delete any orphaned auth.users that reference deleted profiles
  --    (safety net in case of FK timing issues)
  DELETE FROM auth.users
  WHERE id NOT IN (SELECT auth_id FROM users WHERE auth_id IS NOT NULL)
    AND id IN (
      SELECT au.id FROM auth.users au
      WHERE au.raw_user_meta_data->>'branch_code' = v_branch_code
         OR au.email LIKE '%' || lower(v_branch_code) || '%'
    );
  GET DIAGNOSTICS v_auth_deleted = ROW_COUNT;

  -- 4. Delete the branch itself (cascades subjects, class_schedule via FK)
  DELETE FROM branches WHERE id = p_branch_id;
  GET DIAGNOSTICS v_subjects = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'branch_code', v_branch_code,
    'uploads_deleted', v_uploads,
    'users_deleted', v_users,
    'auth_deleted', v_auth_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_branch_cascade(uuid) TO authenticated;
