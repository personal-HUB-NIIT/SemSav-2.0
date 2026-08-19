-- ============================================================
-- Migration 001: Extensions & Enum Types
-- Project: Open-Verse (Semester Saviours)
-- ============================================================

-- Required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Enum Types
create type user_role as enum ('STUDENT', 'SUPER_ADMIN');
create type upload_category as enum ('NOTES', 'ASSIGNMENT', 'TEST');
create type upload_status as enum ('UNVERIFIED', 'VERIFIED', 'PURGED');
create type vote_type as enum ('UP', 'DOWN');
create type test_type as enum ('MID_SEM', 'QUIZ', 'LAB_TEST', 'VIVA', 'RESCHEDULED');
create type admin_action as enum (
  'BRANCH_CREATE', 'BRANCH_UPDATE', 'SUBJECT_SEED',
  'CONTENT_PURGE', 'ACCOUNT_BAN', 'ACCOUNT_UNBAN',
  'CREDENTIAL_RESET', 'DOMAIN_WHITELIST_UPDATE'
);
-- ============================================================
-- Migration 002: Core Tables
-- Project: Open-Verse (Semester Saviours)
-- ============================================================

-- ─────────────────────────────────────────
-- 2.3.1 branches
-- ─────────────────────────────────────────
create table branches (
  id             uuid primary key default uuid_generate_v4(),
  branch_code    text not null unique,          -- e.g. 'CSE', 'ECE'
  branch_name    text not null,                 -- e.g. 'Computer Science & Engineering'
  total_semesters smallint not null default 8,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_branches_active on branches (is_active) where is_active = true;

-- ─────────────────────────────────────────
-- 2.3.2 subjects
-- ─────────────────────────────────────────
create table subjects (
  id             uuid primary key default uuid_generate_v4(),
  branch_id      uuid not null references branches(id) on delete cascade,
  semester       smallint not null check (semester between 1 and 12),
  subject_name   text not null,
  subject_code   text not null,
  is_lab         boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (branch_id, semester, subject_code)
);
create index idx_subjects_branch_sem on subjects (branch_id, semester);

-- ─────────────────────────────────────────
-- 2.3.3 users
-- ─────────────────────────────────────────
create table users (
  id             uuid primary key default uuid_generate_v4(),
  auth_id        uuid unique references auth.users(id) on delete cascade, -- Supabase Auth linkage
  enrollment_id  text not null unique,          -- e.g. '24CSE001'
  full_name      text not null,
  email          text not null unique,
  password_hash  text,                          -- see Spec Section 6.4
  branch_id      uuid not null references branches(id),
  semester       smallint not null check (semester between 1 and 12),
  karma_points   integer not null default 0,
  role           user_role not null default 'STUDENT',
  is_verified    boolean not null default false, -- OTP email verification gate
  is_banned      boolean not null default false,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_email_domain check (
    email ~* '@[A-Za-z0-9.-]+\.(ac\.in|edu\.in)$'
  )
);
create index idx_users_branch_sem  on users (branch_id, semester);
create index idx_users_role        on users (role);
create unique index idx_users_enrollment on users (lower(enrollment_id));

-- ─────────────────────────────────────────
-- 2.3.4 otp_verifications
-- ─────────────────────────────────────────
create table otp_verifications (
  id          uuid primary key default uuid_generate_v4(),
  email       text not null,
  otp_code    char(6) not null,
  purpose     text not null default 'SIGNUP',   -- SIGNUP | PASSWORD_RESET
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index idx_otp_email_purpose on otp_verifications (email, purpose, consumed_at);

-- ─────────────────────────────────────────
-- 2.3.5 uploads
-- ─────────────────────────────────────────
create table uploads (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references users(id) on delete cascade,
  branch_id        uuid not null references branches(id),
  semester         smallint not null,
  subject_id       uuid not null references subjects(id),
  category         upload_category not null,
  title_syllabus   text not null,
  test_type        test_type,                   -- only when category = 'TEST'
  due_date_time    timestamptz,                 -- deadline (ASSIGNMENT) or exam time (TEST)
  room_no          text,                        -- only for TEST
  file_url         text,                        -- Supabase Storage path
  linked_notes_id  uuid references uploads(id), -- TEST -> linked NOTES for syllabus
  status           upload_status not null default 'UNVERIFIED',
  net_score        integer not null default 0,
  ai_confidence    numeric(3,2),               -- Gemini extraction confidence, 0.00-1.00
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chk_test_fields check (
    category <> 'TEST' or (test_type is not null and due_date_time is not null)
  )
);
create index idx_uploads_branch_sem_status on uploads (branch_id, semester, status);
create index idx_uploads_category_due      on uploads (category, due_date_time);
create index idx_uploads_subject           on uploads (subject_id);
create index idx_uploads_user              on uploads (user_id);

-- ─────────────────────────────────────────
-- 2.3.6 votes
-- ─────────────────────────────────────────
create table votes (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references users(id) on delete cascade,
  upload_id   uuid not null references uploads(id) on delete cascade,
  vote_type   vote_type not null,
  created_at  timestamptz not null default now(),
  unique (user_id, upload_id)
);
create index idx_votes_upload on votes (upload_id);

-- ─────────────────────────────────────────
-- 2.3.7 user_tasks
-- ─────────────────────────────────────────
create table user_tasks (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  upload_id    uuid not null references uploads(id) on delete cascade,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, upload_id)
);
create index idx_user_tasks_user on user_tasks (user_id, is_completed);

-- ─────────────────────────────────────────
-- 2.3.8 admin_logs
-- ─────────────────────────────────────────
create table admin_logs (
  id           uuid primary key default uuid_generate_v4(),
  admin_id     uuid not null references users(id),
  action_taken admin_action not null,
  target_id    uuid,                           -- upload_id, user_id, or branch_id
  target_table text,                           -- for readability in audit trail
  reason       text,
  metadata     jsonb,
  ip_address   inet,
  created_at   timestamptz not null default now()
);
create index idx_admin_logs_admin  on admin_logs (admin_id, created_at desc);
create index idx_admin_logs_action on admin_logs (action_taken);

-- ─────────────────────────────────────────
-- 4.5 ai_usage_log  (Gemini monitoring)
-- ─────────────────────────────────────────
create table ai_usage_log (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references users(id),
  endpoint    text not null,                   -- 'extract' | 'summarize' | 'moderate'
  tokens_used integer,
  latency_ms  integer,
  success     boolean not null,
  created_at  timestamptz not null default now()
);
create index idx_ai_usage_created on ai_usage_log (created_at desc);

-- ─────────────────────────────────────────
-- 6.2.1 admin_credentials  (isolated TOTP)
-- ─────────────────────────────────────────
create table admin_credentials (
  user_id      uuid primary key references users(id) on delete cascade,
  totp_secret  text not null,                  -- encrypted via pgsodium / app-layer envelope
  totp_enabled boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- 6.2.2 security_events
-- ─────────────────────────────────────────
create table security_events (
  id           uuid primary key default uuid_generate_v4(),
  event_type   text not null,                  -- 'ADMIN_LOGIN_FAIL' | 'MFA_FAIL' | 'ADMIN_LOGIN_SUCCESS'
  actor_email  text,
  ip_address   inet,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- 6.5 allowed_domains  (per-college whitelist)
-- ─────────────────────────────────────────
create table allowed_domains (
  id         uuid primary key default uuid_generate_v4(),
  domain     text not null unique,             -- e.g. 'nita.ac.in'
  branch_id  uuid references branches(id),    -- null = campus-wide
  is_active  boolean not null default true
);

-- ─────────────────────────────────────────
-- action_log  (for rolling-window rate limits)
-- ─────────────────────────────────────────
create table action_log (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references users(id) on delete cascade,
  action     text not null,                    -- 'UPLOAD' | 'VOTE' | 'OTP_RESEND' | 'GEMINI_EXTRACT' | 'GEMINI_SUMMARIZE'
  created_at timestamptz not null default now()
);
create index idx_action_log_user_action on action_log (user_id, action, created_at desc);
-- ============================================================
-- Migration 003: Triggers & State Machine
-- Project: Open-Verse (Semester Saviours)
-- ============================================================

-- ─────────────────────────────────────────
-- 2.4.1  Generic updated_at maintenance
-- ─────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

create trigger trg_uploads_updated_at
  before update on uploads
  for each row execute function set_updated_at();

create trigger trg_branches_updated_at
  before update on branches
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────
-- 2.4.2  Net-score recomputation + state
--         transition + karma reward
--         (The core Trust Protocol trigger)
-- ─────────────────────────────────────────
create or replace function recompute_upload_score()
returns trigger
language plpgsql
security definer
as $$
declare
  v_upload_id uuid;
  v_delta     integer;
  v_status    upload_status;
  v_new_score integer;
  v_uploader  uuid;
begin
  -- Determine which row (insert or delete) and the score delta it represents
  if (tg_op = 'INSERT') then
    v_upload_id := new.upload_id;
    v_delta     := case when new.vote_type = 'UP' then 1 else -1 end;
  elsif (tg_op = 'DELETE') then
    v_upload_id := old.upload_id;
    v_delta     := case when old.vote_type = 'UP' then -1 else 1 end;
  end if;

  -- Lock the target upload row to serialize concurrent voters
  select status, net_score, user_id
    into v_status, v_new_score, v_uploader
    from uploads
    where id = v_upload_id
    for update;

  v_new_score := v_new_score + v_delta;
  update uploads set net_score = v_new_score where id = v_upload_id;

  -- Only transition state once, guarded by current status, to avoid re-firing rewards
  if v_status = 'UNVERIFIED' and v_new_score >= 5 then
    update uploads set status = 'VERIFIED' where id = v_upload_id;

    -- +10 karma to uploader
    update users
      set karma_points = karma_points + 10
      where id = v_uploader;

    -- +2 karma to every upvoter who voted correctly
    -- (voted UP on an item that became VERIFIED)
    update users
      set karma_points = karma_points + 2
      where id in (
        select user_id from votes
        where upload_id = v_upload_id and vote_type = 'UP'
      );

  elsif v_status = 'UNVERIFIED' and v_new_score <= -5 then
    update uploads set status = 'PURGED' where id = v_upload_id;

    -- -15 karma penalty to uploader (clamped at 0 — no negative karma)
    update users
      set karma_points = greatest(0, karma_points - 15)
      where id = v_uploader;
  end if;

  return null;
end;
$$;

create trigger trg_votes_recompute_score
  after insert or delete on votes
  for each row execute function recompute_upload_score();

-- ─────────────────────────────────────────
-- 2.4.3  Fair-Access Karma Gate
--         (AI feature unlock at >= 15 karma)
-- ─────────────────────────────────────────
create or replace function has_ai_access(
  p_user_id  uuid,
  p_threshold integer default 15
)
returns boolean
language sql
stable
as $$
  select karma_points >= p_threshold
    from users
    where id = p_user_id;
$$;

-- ─────────────────────────────────────────
-- 2.4.4  Self-vote lock
--         (defense-in-depth beyond RLS)
-- ─────────────────────────────────────────
create or replace function prevent_self_vote()
returns trigger language plpgsql as $$
begin
  if (select user_id from uploads where id = new.upload_id) = new.user_id then
    raise exception 'SELF_VOTE_FORBIDDEN: uploaders cannot vote on their own content';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_vote
  before insert on votes
  for each row execute function prevent_self_vote();

-- ─────────────────────────────────────────
-- 6.1.1  Admin headcount cap (max 3 admins)
-- ─────────────────────────────────────────
create or replace function enforce_admin_headcount()
returns trigger language plpgsql as $$
begin
  if new.role = 'SUPER_ADMIN' and
     (select count(*) from users where role = 'SUPER_ADMIN') >= 3 then
    raise exception 'ADMIN_HEADCOUNT_EXCEEDED: max 3 SUPER_ADMIN accounts permitted';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_admin_headcount
  before insert or update of role on users
  for each row when (new.role = 'SUPER_ADMIN')
  execute function enforce_admin_headcount();

-- ─────────────────────────────────────────
-- 6.6  Reusable rolling-window rate limiter
-- ─────────────────────────────────────────
create or replace function check_rate_limit(
  p_user_id   uuid,
  p_action    text,
  p_max_count integer,
  p_window    interval
)
returns boolean
language sql
stable
as $$
  select count(*) < p_max_count
    from action_log
    where user_id  = p_user_id
      and action   = p_action
      and created_at >= now() - p_window;
$$;
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


-- insert into allowed_domains (domain, is_active)
-- values ('nita.ac.in', true);
