-- Fix the Auth Hook permissions and edge cases
-- By making it security definer, it can access the users table even though
-- supabase_auth_admin does not have explicit SELECT permissions on it.
-- We also handle cases where the user does not exist yet.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  claims    jsonb;
  v_role    user_role;
  v_branch  uuid;
  v_semester smallint;
begin
  -- Safely attempt to fetch user info if they exist
  begin
    select role, branch_id, semester
      into v_role, v_branch, v_semester
      from public.users
      where auth_id = (event ->> 'user_id')::uuid;
  exception
    when others then
      -- If any error occurs (e.g. table not found or user not ready), just continue
      null;
  end;

  -- Ensure claims object exists
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  
  -- Ensure app_metadata exists inside claims before setting keys
  if claims -> 'app_metadata' is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;

  -- Set claims safely
  if v_role is not null then
    claims := jsonb_set(claims, '{app_metadata,role}', to_jsonb(v_role));
  end if;
  
  if v_branch is not null then
    claims := jsonb_set(claims, '{app_metadata,branch_id}', to_jsonb(v_branch));
  end if;
  
  if v_semester is not null then
    claims := jsonb_set(claims, '{app_metadata,semester}', to_jsonb(v_semester));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- Grant required permissions
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon;
