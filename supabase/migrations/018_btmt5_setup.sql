-- ============================================================
-- Migration 018: BTMT 5th Semester Setup (Branch + Subjects + Timetable)
-- Source: NIT Agartala, Dept. of Mathematics
-- BTMT 5th Sem Class Routine (Session 2026-27, w.e.f. 27/07/2026)
--
-- NOTE: The (MA3xx) values in the routine are ROOM NUMBERS of the
-- Mathematics department, NOT subject codes. They are stored in
-- class_schedule.room_number below. The routine lists no official
-- subject codes, so app-side canonical codes (BTMT5xx) are assigned;
-- edit them here if official codes become available.
--
-- IDEMPOTENT: safe to re-run. Wipes & reseeds BTMT sem-5 subjects and
-- timetable each time (deleting subjects cascades to any attendance
-- marks logged against them).
-- ============================================================

-- ─── 1. Branch ───────────────────────────────────────────────────────────────
insert into public.branches (branch_code, branch_name, total_semesters)
values ('BTMT', 'Mathematics', 10)
on conflict (branch_code) do nothing;

-- ─── 2. Subjects (BTMT · Semester 5) ────────────────────────────────────────
with btmt as (
  select id from public.branches where branch_code = 'BTMT'
)
delete from public.subjects
where semester = 5
  and branch_id in (select id from btmt);

with btmt as (
  select id from public.branches where branch_code = 'BTMT'
)
insert into public.subjects (branch_id, semester, subject_name, subject_code, is_lab)
select btmt.id, 5, v.subject_name, v.subject_code, v.is_lab
from btmt, (values
  ('Scientific Computation Lab', 'BTMT501', true),
  ('Integral Transforms',        'BTMT502', false),
  ('Soft Computing',             'BTMT503', false),
  ('Statistical Inference',      'BTMT504', false),
  ('Financial Mathematics',      'BTMT505', false)
) as v(subject_name, subject_code, is_lab);

-- ─── 3. Weekly Timetable (class_schedule) ───────────────────────────────────
with btmt as (
  select id from public.branches where branch_code = 'BTMT'
)
delete from public.class_schedule
where semester = 5
  and branch_id in (select id from btmt);

insert into public.class_schedule
  (branch_id, semester, day_of_week, start_time, end_time,
   subject_name, subject_code, teacher_name, room_number)
select b.id, 5, v.day, v.start::time, v.end_t::time, v.s_name, v.s_code, v.teacher, v.room
from public.branches b, (values
  -- Monday — Scientific Computation Lab, Room MA301 (double period)
  ('Monday',    '09:00', '10:00', 'Scientific Computation Lab', 'BTMT501', 'Dr. Susmita Roy & Mrs. Sarbani Das', 'MA301'),
  ('Monday',    '10:00', '11:00', 'Scientific Computation Lab', 'BTMT501', 'Dr. Susmita Roy & Mrs. Sarbani Das', 'MA301'),
  -- Tuesday
  ('Tuesday',   '09:00', '10:00', 'Integral Transforms',   'BTMT502', 'Dr. Pinki Majumder',   'MA302'),
  ('Tuesday',   '10:00', '11:00', 'Integral Transforms',   'BTMT502', 'Dr. Pinki Majumder',   'MA302'),
  ('Tuesday',   '11:00', '12:00', 'Soft Computing',        'BTMT503', 'Dr. Susmita Roy',      'MA303'),
  ('Tuesday',   '12:00', '13:00', 'Soft Computing',        'BTMT503', 'Dr. Susmita Roy',      'MA303'),
  ('Tuesday',   '14:00', '15:00', 'Statistical Inference', 'BTMT504', 'Prof. Apu Kumar Saha', 'MA303'),
  ('Tuesday',   '15:00', '16:00', 'Statistical Inference', 'BTMT504', 'Prof. Apu Kumar Saha', 'MA303'),
  -- Wednesday — Financial Mathematics, Room MA302 (double period)
  ('Wednesday', '09:00', '10:00', 'Financial Mathematics', 'BTMT505', 'Dr. Birojit Das', 'MA302'),
  ('Wednesday', '10:00', '11:00', 'Financial Mathematics', 'BTMT505', 'Dr. Birojit Das', 'MA302'),
  -- Thursday
  ('Thursday',  '09:00', '10:00', 'Integral Transforms',   'BTMT502', 'Dr. Abhijit Baidya',   'MA305'),
  ('Thursday',  '10:00', '11:00', 'Integral Transforms',   'BTMT502', 'Dr. Abhijit Baidya',   'MA305'),
  ('Thursday',  '11:00', '12:00', 'Soft Computing',        'BTMT503', 'Dr. Pinki Majumder',   'MA304'),
  ('Thursday',  '12:00', '13:00', 'Soft Computing',        'BTMT503', 'Dr. Pinki Majumder',   'MA304'),
  ('Thursday',  '14:00', '15:00', 'Statistical Inference', 'BTMT504', 'Dr. Jayanta Debnath',  'MA311'),
  ('Thursday',  '15:00', '16:00', 'Statistical Inference', 'BTMT504', 'Dr. Jayanta Debnath',  'MA311'),
  -- Friday — Financial Mathematics, Room MA311 (double period)
  ('Friday',    '09:00', '10:00', 'Financial Mathematics', 'BTMT505', 'Dr. Birojit Das', 'MA311'),
  ('Friday',    '10:00', '11:00', 'Financial Mathematics', 'BTMT505', 'Dr. Birojit Das', 'MA311')
) as v(day, start, end_t, s_name, s_code, teacher, room)
where b.branch_code = 'BTMT';

-- ─── 4. OPTIONAL: move an existing student onto BTMT · Sem 5 ────────────────
-- Accounts created before the BTMT branch existed point at some other
-- branch, so dashboard timetable + attendance would show nothing.
-- Uncomment and set your enrollment id, then run:
--
-- update public.users u
-- set branch_id = (select id from public.branches where branch_code = 'BTMT'),
--     semester  = 5
-- where u.enrollment_id = '24BTMT001';   -- <-- replace with YOUR enrollment id
