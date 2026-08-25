-- ============================================================
-- Migration 019: Fix delete_user_account (real account deletion)
-- ============================================================
-- The previous version (016) only cleaned some public tables and left
-- the auth.users row alive, so the account was never really deleted
-- (and 016 was never applied anyway -> PGRST202 "function not found").
--
-- This version:
--   1. cleans tables that reference public.users WITHOUT on-delete cascade
--   2. best-effort removes the user's storage objects
--   3. deletes the auth.users row itself — everything else
--      (public.users, uploads, votes, user_tasks, attendance_logs,
--       queue_votes, verification_queue, sessions, identities ...)
--      disappears via ON DELETE CASCADE foreign keys.
-- ============================================================

create or replace function public.delete_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_public_id uuid;
begin
  -- Only the owner can delete the account (null-safe: anon gets rejected)
  if p_user_id is null or auth.uid() is null or p_user_id != auth.uid() then
    raise exception 'You can only delete your own account';
  end if;

  select id into v_public_id from public.users where auth_id = p_user_id;

  -- Tables referencing public.users(id) WITHOUT on-delete cascade
  delete from public.admin_logs   where admin_id  = v_public_id;
  delete from public.ai_usage_log where user_id   = v_public_id;

  -- Best-effort cleanup of storage objects (column names differ across
  -- storage schema versions, so each attempt is wrapped and ignored on error)
  begin
    delete from storage.objects where owner = p_user_id;
  exception when others then null;
  end;
  begin
    delete from storage.objects where owner_id = p_user_id::text;
  exception when others then null;
  end;

  -- The real deletion. Cascades wipe:
  --   auth.identities, auth.sessions, auth.refresh_tokens
  --   public.users (auth_id references auth.users on delete cascade)
  --     -> uploads, votes, user_tasks, admin_credentials, action_log ...
  --   attendance_logs, queue_votes, verification_queue (reference auth.users)
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.delete_user_account(uuid) from anon;
grant execute on function public.delete_user_account(uuid) to authenticated;
