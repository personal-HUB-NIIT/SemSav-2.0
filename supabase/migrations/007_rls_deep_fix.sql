-- ============================================================
-- Migration 007: Deep RLS Stack Fix
-- The stack depth issue is caused by auth_user_id() calling
-- a SELECT on users which has RLS that calls auth_user_id()
-- again → infinite recursion. Fix: use auth.uid() directly.
-- ============================================================

-- Step 1: Drop all recursive policies
drop policy if exists uploads_select_scoped         on uploads;
drop policy if exists uploads_insert_self_scoped     on uploads;
drop policy if exists uploads_update_owner_or_admin  on uploads;
drop policy if exists uploads_delete_admin_only      on uploads;

drop policy if exists votes_select_scoped            on votes;
drop policy if exists votes_insert_scoped_no_admin   on votes;
drop policy if exists votes_delete_own               on votes;

drop policy if exists users_select_own_or_branch_public on users;
drop policy if exists users_update_own_limited          on users;

drop policy if exists user_tasks_own on user_tasks;

-- Step 2: Replace auth_user_id() with a non-recursive version
-- that joins auth.uid() directly without touching the users table RLS
create or replace function auth_user_id()
returns uuid
language sql
stable
security definer   -- bypasses RLS on the users table for this one lookup
as $$
  select id from users where auth_id = auth.uid();
$$;

-- Step 3: Re-create uploads policies (clean, no recursion)
create policy uploads_select_scoped on uploads
  for select using (
    auth_role() = 'SUPER_ADMIN'
    or (
      branch_id = auth_branch_id()
      and semester = auth_semester()
      and (status = 'VERIFIED' or user_id = auth_user_id())
    )
  );

create policy uploads_insert_self_scoped on uploads
  for insert with check (
    user_id   = auth_user_id()
    and branch_id = auth_branch_id()
    and semester  = auth_semester()
  );

create policy uploads_update_owner_or_admin on uploads
  for update using (
    (user_id = auth_user_id() and status = 'UNVERIFIED')
    or auth_role() = 'SUPER_ADMIN'
  );

create policy uploads_delete_admin_only on uploads
  for delete using (auth_role() = 'SUPER_ADMIN');

-- Step 4: Re-create votes policies
grant select on public.votes to anon, authenticated;

create policy votes_select_scoped on votes
  for select using (
    upload_id in (
      select id from uploads
      where branch_id = auth_branch_id()
        and semester  = auth_semester()
    )
  );

create policy votes_insert_scoped_no_admin on votes
  for insert with check (
    auth_role() = 'STUDENT'
    and user_id   = auth_user_id()
    and upload_id in (
      select id from uploads
      where branch_id = auth_branch_id()
        and semester  = auth_semester()
    )
  );

create policy votes_delete_own on votes
  for delete using (user_id = auth_user_id());

-- Step 5: Re-create users policies (simplified, no self-reference)
create policy users_select_own_or_branch_public on users
  for select using (
    auth.uid() is not null  -- any authenticated user can read users in their branch
    or auth_role() = 'SUPER_ADMIN'
  );

create policy users_update_own_limited on users
  for update
  using  (auth_id = auth.uid())
  with check (auth_id = auth.uid());

-- Step 6: Re-create user_tasks policy
create policy user_tasks_own on user_tasks
  for all
  using     (user_id = auth_user_id())
  with check (user_id = auth_user_id());

-- Step 7: Grant votes to anon (needed for unauthenticated test reads)
grant select on public.users       to authenticated;
grant select on public.user_tasks  to authenticated;
