-- ============================================================
-- Migration 020: Replace BTMT with real CME Sem-5 setup
-- ============================================================
-- Correction: the shared routine ("BTMT 5th Sem" label) is actually the
-- CME — Computational Mathematics & Engineering — routine. This migration:
--   1. moves any users off BTMT onto CME
--   2. deletes the wrongly-created BTMT branch (cascades its subjects,
--      timetable and any attendance marks against them)
--   3. wipes CME sem-5 placeholder subjects and reseeds with the real
--      routine subjects (codes CME501–CME505)
--   4. seeds the full CME sem-5 weekly timetable (rooms = MA3xx)
--
-- NOTE: step 3 will fail with a foreign-key error if any uploads already
-- reference the old CME-5 placeholder subjects — check before re-running.
-- ============================================================

-- ─── 1. Move users off BTMT (users.branch_id has no ON DELETE CASCADE) ──────
update public.users
set branch_id = (select id from public.branches where branch_code = 'CME')
where branch_id = (select id from public.branches where branch_code = 'BTMT');

-- ─── 2. Delete the wrong BTMT branch ────────────────────────────────────────
delete from public.branches where branch_code = 'BTMT';

-- ─── 3. Real CME Sem-5 subjects ─────────────────────────────────────────────
with cme as (
  select id from public.branches where branch_code = 'CME'
)
delete from public.subjects
where semester = 5
  and branch_id in (select id from cme);

with cme as (
  select id from public.branches where branch_code = 'CME'
)
insert into public.subjects (branch_id, semester, subject_name, subject_code, is_lab)
select cme.id, 5, v.subject_name, v.subject_code, v.is_lab
from cme, (values
  ('Scientific Computation Lab', 'CME501', true),
  ('Integral Transforms',        'CME502', false),
  ('Soft Computing',             'CME503', false),
  ('Statistical Inference',      'CME504', false),
  ('Financial Mathematics',      'CME505', false)
) as v(subject_name, subject_code, is_lab);

-- ─── 4. CME Sem-5 weekly timetable (routine w.e.f. 27/07/2026) ──────────────
with cme as (
  select id from public.branches where branch_code = 'CME'
)
delete from public.class_schedule
where semester = 5
  and branch_id in (select id from cme);

insert into public.class_schedule
  (branch_id, semester, day_of_week, start_time, end_time,
   subject_name, subject_code, teacher_name, room_number)
select b.id, 5, v.day, v.start::time, v.end_t::time, v.s_name, v.s_code, v.teacher, v.room
from public.branches b, (values
  -- Monday — Scientific Computation Lab, Room MA301 (double period)
  ('Monday',    '09:00', '10:00', 'Scientific Computation Lab', 'CME501', 'Dr. Susmita Roy & Mrs. Sarbani Das', 'MA301'),
  ('Monday',    '10:00', '11:00', 'Scientific Computation Lab', 'CME501', 'Dr. Susmita Roy & Mrs. Sarbani Das', 'MA301'),
  -- Tuesday
  ('Tuesday',   '09:00', '10:00', 'Integral Transforms',   'CME502', 'Dr. Pinki Majumder',   'MA302'),
  ('Tuesday',   '10:00', '11:00', 'Integral Transforms',   'CME502', 'Dr. Pinki Majumder',   'MA302'),
  ('Tuesday',   '11:00', '12:00', 'Soft Computing',        'CME503', 'Dr. Susmita Roy',      'MA303'),
  ('Tuesday',   '12:00', '13:00', 'Soft Computing',        'CME503', 'Dr. Susmita Roy',      'MA303'),
  ('Tuesday',   '14:00', '15:00', 'Statistical Inference', 'CME504', 'Prof. Apu Kumar Saha', 'MA303'),
  ('Tuesday',   '15:00', '16:00', 'Statistical Inference', 'CME504', 'Prof. Apu Kumar Saha', 'MA303'),
  -- Wednesday — Financial Mathematics, Room MA302 (double period)
  ('Wednesday', '09:00', '10:00', 'Financial Mathematics', 'CME505', 'Dr. Birojit Das', 'MA302'),
  ('Wednesday', '10:00', '11:00', 'Financial Mathematics', 'CME505', 'Dr. Birojit Das', 'MA302'),
  -- Thursday
  ('Thursday',  '09:00', '10:00', 'Integral Transforms',   'CME502', 'Dr. Abhijit Baidya',   'MA305'),
  ('Thursday',  '10:00', '11:00', 'Integral Transforms',   'CME502', 'Dr. Abhijit Baidya',   'MA305'),
  ('Thursday',  '11:00', '12:00', 'Soft Computing',        'CME503', 'Dr. Pinki Majumder',   'MA304'),
  ('Thursday',  '12:00', '13:00', 'Soft Computing',        'CME503', 'Dr. Pinki Majumder',   'MA304'),
  ('Thursday',  '14:00', '15:00', 'Statistical Inference', 'CME504', 'Dr. Jayanta Debnath',  'MA311'),
  ('Thursday',  '15:00', '16:00', 'Statistical Inference', 'CME504', 'Dr. Jayanta Debnath',  'MA311'),
  -- Friday — Financial Mathematics, Room MA311 (double period)
  ('Friday',    '09:00', '10:00', 'Financial Mathematics', 'CME505', 'Dr. Birojit Das', 'MA311'),
  ('Friday',    '10:00', '11:00', 'Financial Mathematics', 'CME505', 'Dr. Birojit Das', 'MA311')
) as v(day, start, end_t, s_name, s_code, teacher, room)
where b.branch_code = 'CME';
