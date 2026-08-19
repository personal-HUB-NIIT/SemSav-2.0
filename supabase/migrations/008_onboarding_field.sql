-- ============================================================
-- Migration 008: Add onboarding_completed to users
-- ============================================================
alter table users
  add column if not exists onboarding_completed boolean not null default false;

-- Grant to authenticated role
grant update (onboarding_completed, full_name, branch_id, semester) on users to authenticated;
