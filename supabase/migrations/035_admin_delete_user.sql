-- ============================================================
-- Migration 035: Admin delete user (retain uploads)
-- ============================================================
-- Creates admin_delete_user() RPC for Admin Dashboard student detail view.
-- Deletes the target auth.users row; uploads are retained via SET NULL (034).
-- ============================================================

create or replace function public.admin_delete_user(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_auth_id uuid;
  v_target_role user_role;
  v_admin_public_id uuid;
begin
  -- Only SUPER_ADMIN can call this
  if auth_role() <> 'SUPER_ADMIN' then
    return jsonb_build_object('error', 'FORBIDDEN: requires SUPER_ADMIN');
  end if;

  if p_target_user_id is null then
    return jsonb_build_object('error', 'Missing target user id');
  end if;

  select auth_id, role into v_target_auth_id, v_target_role
  from public.users where id = p_target_user_id;

  if v_target_auth_id is null then
    return jsonb_build_object('error', 'User not found');
  end if;

  -- Prevent deleting another SUPER_ADMIN (or self if desired)
  if v_target_role = 'SUPER_ADMIN' then
    return jsonb_build_object('error', 'Cannot delete another admin');
  end if;

  select id into v_admin_public_id from public.users where auth_id = auth.uid();

  -- Clean admin_logs / ai_usage_log for target (no cascade)
  delete from public.admin_logs   where admin_id  = p_target_user_id;
  delete from public.ai_usage_log where user_id   = p_target_user_id;

  -- Best-effort: remove avatar
  begin
    delete from storage.objects
    where bucket_id = 'avatars'
      and (storage.foldername(name))[1] = v_target_auth_id::text;
  exception when others then null;
  end;

  -- Do NOT delete semsav-files storage objects — uploads are retained as anonymous

  -- Audit log
  begin
    insert into public.admin_logs (admin_id, action_taken, target_id, target_table, reason)
    values (v_admin_public_id, 'ACCOUNT_BAN', p_target_user_id, 'users', 'Admin deleted user account');
  exception when others then null;
  end;

  -- Delete auth user -> cascades to public.users and SET NULL on uploads
  delete from auth.users where id = v_target_auth_id;

  return jsonb_build_object('ok', true, 'message', 'User deleted; uploads retained as anonymous');
end;
$$;

revoke all on function public.admin_delete_user(uuid) from anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

comment on function public.admin_delete_user(uuid) is 'Admin deletes a student account; uploads retained via ON DELETE SET NULL';

-- Force PostgREST to reload schema cache (fixes "Could not find function in schema cache")
notify pgrst, 'reload schema';
