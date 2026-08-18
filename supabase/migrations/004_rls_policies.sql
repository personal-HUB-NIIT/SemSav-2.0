-- ============================================================
-- Migration 004: Row Level Security (RLS) Policies
-- Project: Open-Verse (Semester Saviours)
-- ============================================================

-- ─────────────────────────────────────────
-- 2.5.1  Helper functions (read JWT claims)
-- ─────────────────────────────────────────

-- Reads the student's role from the JWT app_metadata
create or replace function auth_role()
returns user_role
language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role')::user_role,
    'STUDENT'
  );
$$;

-- Reads the student's branch_id from the JWT
create or replace function auth_branch_id()
returns uuid
language sql stable as $$
  select (auth.jwt() -> 'app_metadata' ->> 'branch_id')::uuid;
$$;

-- Reads the student's semester from the JWT
create or replace function auth_semester()
returns smallint
language sql stable as $$
  select (auth.jwt() -> 'app_metadata' ->> 'semester')::smallint;
$$;

-- Translates Supabase auth.uid() → public.users.id
create or replace function auth_user_id()
returns uuid
language sql stable as $$
  select id from users where auth_id = auth.uid();
$$;

-- ─────────────────────────────────────────
-- 2.5.2  uploads RLS policies
-- ─────────────────────────────────────────
alter table uploads enable row level security;

-- Students see VERIFIED uploads in their branch+semester,
-- plus their own UNVERIFIED uploads (so they can track pending items)
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

-- Students can only insert into their own branch/semester, attributed to themselves
create policy uploads_insert_self_scoped on uploads
  for insert
  with check (
    user_id   = auth_user_id()
    and branch_id = auth_branch_id()
    and semester  = auth_semester()
  );

-- Only the uploader (before verification) or an admin may update metadata
create policy uploads_update_owner_or_admin on uploads
  for update
  using (
    (user_id = auth_user_id() and status = 'UNVERIFIED')
    or auth_role() = 'SUPER_ADMIN'
  );

-- Only admin can hard-delete an upload (emergency purge)
create policy uploads_delete_admin_only on uploads
  for delete
  using (auth_role() = 'SUPER_ADMIN');

-- ─────────────────────────────────────────
-- 2.5.3  votes RLS policies
-- ─────────────────────────────────────────
alter table votes enable row level security;

create policy votes_select_scoped on votes
  for select
  using (
    upload_id in (
      select id from uploads
      where branch_id = auth_branch_id()
        and semester  = auth_semester()
    )
  );

-- Scoped voting: must be a STUDENT (admins explicitly excluded),
-- voting on their own branch+semester content only
create policy votes_insert_scoped_no_admin on votes
  for insert
  with check (
    auth_role() = 'STUDENT'
    and user_id   = auth_user_id()
    and upload_id in (
      select id from uploads
      where branch_id = auth_branch_id()
        and semester  = auth_semester()
    )
  );

-- Students can retract their own vote
create policy votes_delete_own on votes
  for delete
  using (user_id = auth_user_id());

-- ─────────────────────────────────────────
-- 2.5.4  users RLS policies
-- ─────────────────────────────────────────
alter table users enable row level security;

create policy users_select_own_or_branch_public on users
  for select
  using (
    id = auth_user_id()
    or auth_role() = 'SUPER_ADMIN'
    or branch_id = auth_branch_id() -- needed for leaderboard / contributor names
  );

create policy users_update_own_limited on users
  for update
  using  (id = auth_user_id())
  with check (id = auth_user_id());

-- Revoke write access to sensitive columns from the authenticated role entirely.
-- Only security definer triggers/functions can change these — never a direct client UPDATE.
revoke update (karma_points, role, is_banned, is_verified) on users from authenticated;
grant  update (full_name) on users to authenticated;

-- ─────────────────────────────────────────
-- 2.5.5  subjects / branches RLS policies
-- ─────────────────────────────────────────
alter table branches enable row level security;
alter table subjects  enable row level security;

-- Anyone can read branches (needed to populate signup dropdowns)
create policy branches_select_all on branches
  for select using (true);

-- Only admin can mutate branches
create policy branches_write_admin_only on branches
  for all
  using     (auth_role() = 'SUPER_ADMIN')
  with check (auth_role() = 'SUPER_ADMIN');

-- Anyone can read subjects (needed for upload forms)
create policy subjects_select_all on subjects
  for select using (true);

-- Only admin can mutate subjects
create policy subjects_write_admin_only on subjects
  for all
  using     (auth_role() = 'SUPER_ADMIN')
  with check (auth_role() = 'SUPER_ADMIN');

-- ─────────────────────────────────────────
-- 2.5.6  admin_logs RLS policies
-- ─────────────────────────────────────────
alter table admin_logs enable row level security;

create policy admin_logs_admin_only on admin_logs
  for all
  using     (auth_role() = 'SUPER_ADMIN')
  with check (auth_role() = 'SUPER_ADMIN');

-- ─────────────────────────────────────────
-- RLS for security-sensitive tables
-- ─────────────────────────────────────────
alter table admin_credentials enable row level security;
create policy admin_credentials_self_only on admin_credentials
  for select
  using (user_id = auth_user_id() and auth_role() = 'SUPER_ADMIN');

alter table security_events enable row level security;
create policy security_events_admin_only on security_events
  for all
  using     (auth_role() = 'SUPER_ADMIN')
  with check (auth_role() = 'SUPER_ADMIN');

alter table otp_verifications enable row level security;
-- OTPs are only accessible via Edge Functions using service_role key
-- No direct client access permitted
create policy otp_no_direct_access on otp_verifications
  for all using (false);

alter table action_log enable row level security;
create policy action_log_admin_only on action_log
  for select using (auth_role() = 'SUPER_ADMIN');

alter table ai_usage_log enable row level security;
create policy ai_usage_log_admin_only on ai_usage_log
  for select using (auth_role() = 'SUPER_ADMIN');

alter table user_tasks enable row level security;
create policy user_tasks_own on user_tasks
  for all
  using     (user_id = auth_user_id())
  with check (user_id = auth_user_id());

alter table allowed_domains enable row level security;
create policy allowed_domains_select_all   on allowed_domains for select using (true);
create policy allowed_domains_admin_write  on allowed_domains
  for all
  using     (auth_role() = 'SUPER_ADMIN')
  with check (auth_role() = 'SUPER_ADMIN');
