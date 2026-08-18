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
