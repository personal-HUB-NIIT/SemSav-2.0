-- ============================================================
-- Migration 006: Grants & RLS Stack Depth Fix
-- Project: Open-Verse (Semester Saviours)
-- ============================================================

-- ─────────────────────────────────────────
-- Fix 1: Grant table access to anon + authenticated roles
-- Supabase PostgREST requires explicit GRANT to expose tables
-- via the REST API, even when RLS is enabled.
-- ─────────────────────────────────────────
grant usage on schema public to anon, authenticated;

-- Tables that anonymous (unauthenticated) users need to read
-- (signup form dropdowns for branch/subject selection)
grant select on public.branches        to anon, authenticated;
grant select on public.subjects        to anon, authenticated;
grant select on public.allowed_domains to anon, authenticated;

-- Tables that authenticated students interact with
grant select, insert        on public.uploads         to authenticated;
grant update                on public.uploads         to authenticated;
grant select, insert, delete on public.votes          to authenticated;
grant select, insert, update on public.user_tasks     to authenticated;
grant select                on public.users           to authenticated;
grant update (full_name)    on public.users           to authenticated;
grant select                on public.ai_usage_log    to authenticated;
grant select, insert        on public.action_log      to authenticated;

-- ─────────────────────────────────────────
-- Fix 2: Stack depth limit on uploads & votes
-- Caused by RLS policy on votes doing a subquery on uploads
-- which itself has an RLS policy — circular reference.
-- Solution: use SECURITY DEFINER view to break the cycle.
-- ─────────────────────────────────────────

-- Drop the problematic recursive subquery policies
drop policy if exists votes_select_scoped       on votes;
drop policy if exists votes_insert_scoped_no_admin on votes;

-- Create a SECURITY DEFINER function to safely fetch
-- upload IDs for the current user's branch+semester
-- without triggering the uploads RLS recursion
create or replace function get_branch_sem_upload_ids()
returns setof uuid
language sql
stable
security definer
as $$
  select id from uploads
  where branch_id = auth_branch_id()
    and semester  = auth_semester();
$$;

-- Re-create votes policies using the function (no subquery on uploads)
create policy votes_select_scoped on votes
  for select
  using (
    upload_id in (select get_branch_sem_upload_ids())
  );

create policy votes_insert_scoped_no_admin on votes
  for insert
  with check (
    auth_role() = 'STUDENT'
    and user_id   = auth_user_id()
    and upload_id in (select get_branch_sem_upload_ids())
  );

-- Also fix the uploads_select policy for same reason
drop policy if exists uploads_select_scoped on uploads;
create policy uploads_select_scoped on uploads
  for select
  using (
    auth_role() = 'SUPER_ADMIN'
    or (
      branch_id = auth_branch_id()
      and semester = auth_semester()
      and (status = 'VERIFIED' or user_id = auth_user_id())
    )
  );
