-- ============================================================
-- Migration 021: Fix multi-tenant data leakage in attendance
-- Ensures all attendance queries are scoped to branch + semester
-- ============================================================

-- 1. Update get_attendance_summary to accept branch_id & semester
--    so it only aggregates subjects belonging to the user's branch/semester.
create or replace function public.get_attendance_summary(
  p_user_id   uuid,
  p_branch_id uuid,
  p_semester  int
)
returns table (
  subject_id uuid,
  total_held bigint,
  attended   bigint,
  cancelled  bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select l.subject_id,
         count(*) filter (where l.status <> 'cancelled') as total_held,
         count(*) filter (where l.status = 'present')    as attended,
         count(*) filter (where l.status = 'cancelled')  as cancelled
  from public.attendance_logs l
  join public.subjects s on s.id = l.subject_id
  where l.user_id = p_user_id
    and s.branch_id = p_branch_id
    and s.semester  = p_semester
  group by l.subject_id;
$$;

-- 2. Revoke anon access (already done in 017 but safety)
revoke all on function public.get_attendance_summary(uuid, uuid, int) from anon;
grant execute on function public.get_attendance_summary(uuid, uuid, int) to authenticated;

-- 3. Add composite index for fast subject lookups during attendance join
create index if not exists idx_subjects_branch_semester
  on public.subjects (branch_id, semester);
