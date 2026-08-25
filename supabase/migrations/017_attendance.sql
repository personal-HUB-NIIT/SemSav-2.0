-- ============================================================
-- Migration 017: Subject-Wise Manual Attendance Tracker
-- Project: Open-Verse (Semester Saviours)
-- ============================================================

-- ─── 1. Enum type ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'attendance_status') then
    create type public.attendance_status as enum ('present', 'absent', 'cancelled');
  end if;
end
$$;

-- ─── 2. Table ────────────────────────────────────────────────────────────────
-- user_id references auth.users id (same convention as verification_queue /
-- queue_votes). 'cancelled' rows are excluded from BOTH "classes attended"
-- AND "total classes held" so a mass bunk never penalises the student.
create table if not exists public.attendance_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  date       date not null,
  status     public.attendance_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One record per student per subject per day -> prevents duplicate presses.
  -- Re-tapping just upserts (changes) the same row.
  unique (user_id, subject_id, date)
);

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────
alter table public.attendance_logs enable row level security;

create policy "Users can view own attendance_logs"
on public.attendance_logs for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own attendance_logs"
on public.attendance_logs for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own attendance_logs"
on public.attendance_logs for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ─── 4. Indexes ──────────────────────────────────────────────────────────────
create index if not exists idx_attendance_user_date
  on public.attendance_logs (user_id, date desc);
create index if not exists idx_attendance_subject
  on public.attendance_logs (subject_id);

-- ─── 5. Grants (this project uses explicit grants — see migration 006) ──────
grant select, insert, update on public.attendance_logs to authenticated;

-- ─── 6. Aggregation RPC ──────────────────────────────────────────────────────
-- Efficient per-subject grouping on page load:
--   total_held = present + absent   (cancelled excluded entirely)
--   attended   = present
create or replace function public.get_attendance_summary(p_user_id uuid)
returns table (
  subject_id uuid,
  total_held bigint,
  attended   bigint,
  cancelled  bigint
)
language sql
stable
security invoker            -- caller's RLS still applies (own rows only)
set search_path = public
as $$
  select l.subject_id,
         count(*) filter (where l.status <> 'cancelled') as total_held,
         count(*) filter (where l.status = 'present')    as attended,
         count(*) filter (where l.status = 'cancelled')  as cancelled
  from public.attendance_logs l
  where l.user_id = p_user_id
  group by l.subject_id;
$$;

revoke all on function public.get_attendance_summary(uuid) from anon;
grant execute on function public.get_attendance_summary(uuid) to authenticated;
