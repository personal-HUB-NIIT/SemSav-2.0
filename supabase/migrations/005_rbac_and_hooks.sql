-- ============================================================
-- Migration 005: RBAC, Auth Hook & Admin Wrapper
-- Project: Open-Verse (Semester Saviours)
-- ============================================================

-- ─────────────────────────────────────────
-- 2.6.1  Custom JWT claim injection hook
--         (registered in Supabase Dashboard:
--          Auth → Hooks → custom_access_token_hook)
-- ─────────────────────────────────────────
create or replace function custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims    jsonb;
  v_role    user_role;
  v_branch  uuid;
  v_semester smallint;
begin
  select role, branch_id, semester
    into v_role, v_branch, v_semester
    from users
    where auth_id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{app_metadata,role}',     to_jsonb(v_role));
  claims := jsonb_set(claims, '{app_metadata,branch_id}', to_jsonb(v_branch));
  claims := jsonb_set(claims, '{app_metadata,semester}',  to_jsonb(v_semester));
  event  := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- Grant required permission for Supabase to invoke this hook
grant usage on schema public to supabase_auth_admin;
grant execute on function custom_access_token_hook to supabase_auth_admin;
revoke execute on function custom_access_token_hook from authenticated, anon;

-- ─────────────────────────────────────────
-- 2.6.3  Admin action wrapper
--         Every admin mutation MUST call this
--         in the same transaction to guarantee
--         an audit log entry is always written.
-- ─────────────────────────────────────────
create or replace function admin_perform_action(
  p_action       admin_action,
  p_target_id    uuid,
  p_target_table text,
  p_reason       text,
  p_metadata     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_admin_id uuid := auth_user_id();
  v_log_id   uuid;
begin
  if auth_role() <> 'SUPER_ADMIN' then
    raise exception 'FORBIDDEN: admin_perform_action requires SUPER_ADMIN role';
  end if;

  insert into admin_logs (
    admin_id, action_taken, target_id, target_table, reason, metadata
  ) values (
    v_admin_id, p_action, p_target_id, p_target_table, p_reason, p_metadata
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- ─────────────────────────────────────────
-- Seed: Insert NIIT (Neotia Institute of
--       Technology Management & Science)
--       as the first allowed_domain so the
--       app can accept real .edu.in emails.
--       Change/add your actual college domain here.
-- ─────────────────────────────────────────
-- NOTE: Uncomment and edit before running in production.
-- insert into allowed_domains (domain, is_active)
-- values ('nita.ac.in', true);
