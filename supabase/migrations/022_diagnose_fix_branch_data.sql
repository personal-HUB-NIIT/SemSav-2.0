-- ============================================================
-- Migration 022: Diagnose & fix branch data leakage
-- CSE users seeing CME timetable because branch_id is wrong
-- or class_schedule data is orphaned.
-- ============================================================

-- ─── 1. DIAGNOSTIC: Show current state ──────────────────────────────────────
-- Run these SELECTs first in Supabase SQL Editor to see the problem:

-- A) What branch does each user point to?
SELECT u.id, u.auth_id, u.full_name, u.enrollment_id, u.semester,
       b.branch_code, b.branch_name
FROM public.users u
LEFT JOIN public.branches b ON b.id = u.branch_id
WHERE u.role = 'STUDENT';

-- B) What class_schedule data exists per branch?
SELECT b.branch_code, cs.semester, count(*) as slot_count,
       min(cs.subject_code) as first_code, max(cs.subject_code) as last_code
FROM public.class_schedule cs
JOIN public.branches b ON b.id = cs.branch_id
GROUP BY b.branch_code, cs.semester
ORDER BY b.branch_code, cs.semester;

-- C) What subjects exist per branch for sem 5?
SELECT b.branch_code, s.semester, s.subject_code, s.subject_name
FROM public.subjects s
JOIN public.branches b ON b.id = s.branch_id
WHERE s.semester = 5
ORDER BY b.branch_code, s.subject_code;

-- ─── 2. FIX: Ensure CSE sem-5 class_schedule exists ───────────────────────
-- If CSE schedule is missing, re-seed it:
DO $$
DECLARE
  cse_id uuid;
  schedule_count int;
BEGIN
  SELECT id INTO cse_id FROM public.branches WHERE branch_code = 'CSE';

  IF cse_id IS NULL THEN
    RAISE NOTICE 'CSE branch not found — run migration 010 first';
    RETURN;
  END IF;

  SELECT count(*) INTO schedule_count
  FROM public.class_schedule
  WHERE branch_id = cse_id AND semester = 5;

  IF schedule_count = 0 THEN
    RAISE NOTICE 'No CSE sem-5 schedule found — re-seeding from migration 013 data';

    INSERT INTO public.class_schedule
      (branch_id, semester, day_of_week, start_time, end_time,
       subject_name, subject_code, teacher_name, room_number)
    SELECT cse_id, 5, day, start::time, end::time, s_name, s_code, teacher, room
    FROM (VALUES
      ('Monday',    '09:00', '09:55', 'Theory of Computation', 'CS501', 'Prof. A. Mehrotra', 'LHT-1'),
      ('Monday',    '10:00', '10:55', 'Computer Networks II',  'CS502', 'Dr. S. Kapoor',     'LHT-2'),
      ('Monday',    '11:15', '12:10', 'Compiler Design',       'CS503', 'Prof. R. Bajpai',   'LHT-3'),
      ('Monday',    '12:15', '13:10', 'Software Engineering',  'CS504', 'Dr. N. Srivastava', 'LHT-1'),
      ('Monday',    '14:00', '15:50', 'Networks Lab',          'CS591', 'Mr. A. Khan',       'NetLab-1'),
      ('Tuesday',   '09:00', '09:55', 'Compiler Design',       'CS503', 'Prof. R. Bajpai',   'LHT-3'),
      ('Tuesday',   '10:00', '10:55', 'Computer Networks II',  'CS502', 'Dr. S. Kapoor',     'LHT-2'),
      ('Tuesday',   '11:15', '12:10', 'Elective I',            'CS505', 'Prof. B. Dash',     'LHT-2'),
      ('Tuesday',   '12:15', '13:10', 'Software Engineering',  'CS504', 'Dr. N. Srivastava', 'LHT-1'),
      ('Wednesday', '09:00', '09:55', 'Software Engineering',  'CS504', 'Dr. N. Srivastava', 'LHT-1'),
      ('Wednesday', '10:00', '10:55', 'Elective I',            'CS505', 'Prof. B. Dash',     'LHT-2'),
      ('Wednesday', '11:15', '12:10', 'Theory of Computation', 'CS501', 'Prof. A. Mehrotra', 'LHT-1'),
      ('Wednesday', '12:15', '13:10', 'Computer Networks II',  'CS502', 'Dr. S. Kapoor',     'LHT-2'),
      ('Wednesday', '14:00', '15:50', 'Networks Lab',          'CS591', 'Mr. A. Khan',       'NetLab-1'),
      ('Thursday',  '09:00', '09:55', 'Elective I',            'CS505', 'Prof. B. Dash',     'LHT-2'),
      ('Thursday',  '10:00', '10:55', 'Compiler Design',       'CS503', 'Prof. R. Bajpai',   'LHT-3'),
      ('Thursday',  '11:15', '13:05', 'Networks Lab',          'CS591', 'Mr. A. Khan',       'NetLab-1'),
      ('Thursday',  '14:00', '14:55', 'TOC Tutorial',          'CS501', 'Prof. A. Mehrotra', 'LHT-1'),
      ('Thursday',  '15:00', '15:55', 'CN-II Tutorial',        'CS502', 'Dr. S. Kapoor',     'LHT-2'),
      ('Friday',    '09:00', '09:55', 'Computer Networks II',  'CS502', 'Dr. S. Kapoor',     'LHT-2'),
      ('Friday',    '10:00', '10:55', 'Software Engineering',  'CS504', 'Dr. N. Srivastava', 'LHT-1'),
      ('Friday',    '11:15', '12:10', 'Compiler Design',       'CS503', 'Prof. R. Bajpai',   'LHT-3'),
      ('Friday',    '12:15', '13:10', 'Theory of Computation', 'CS501', 'Prof. A. Mehrotra', 'LHT-1')
    ) AS t(day, start, end, s_name, s_code, teacher, room);
  ELSE
    RAISE NOTICE 'CSE sem-5 schedule already has % slots — skipping re-seed', schedule_count;
  END IF;
END $$;

-- ─── 3. FIX: Ensure CME sem-5 class_schedule exists ───────────────────────
DO $$
DECLARE
  cme_id uuid;
  schedule_count int;
BEGIN
  SELECT id INTO cme_id FROM public.branches WHERE branch_code = 'CME';

  IF cme_id IS NULL THEN
    RAISE NOTICE 'CME branch not found — run migration 010 first';
    RETURN;
  END IF;

  SELECT count(*) INTO schedule_count
  FROM public.class_schedule
  WHERE branch_id = cme_id AND semester = 5;

  IF schedule_count = 0 THEN
    RAISE NOTICE 'No CME sem-5 schedule found — re-seeding';

    INSERT INTO public.class_schedule
      (branch_id, semester, day_of_week, start_time, end_time,
       subject_name, subject_code, teacher_name, room_number)
    SELECT cme_id, 5, day, start::time, end::time, s_name, s_code, teacher, room
    FROM (VALUES
      ('Monday',    '09:00', '10:00', 'Scientific Computation Lab', 'CME501', 'Dr. Susmita Roy & Mrs. Sarbani Das', 'MA301'),
      ('Monday',    '10:00', '11:00', 'Scientific Computation Lab', 'CME501', 'Dr. Susmita Roy & Mrs. Sarbani Das', 'MA301'),
      ('Tuesday',   '09:00', '10:00', 'Integral Transforms',        'CME502', 'Dr. Pinki Majumder',                  'MA302'),
      ('Tuesday',   '10:00', '11:00', 'Integral Transforms',        'CME502', 'Dr. Pinki Majumder',                  'MA302'),
      ('Tuesday',   '11:00', '12:00', 'Soft Computing',             'CME503', 'Dr. Susmita Roy',                     'MA303'),
      ('Tuesday',   '12:00', '13:00', 'Soft Computing',             'CME503', 'Dr. Susmita Roy',                     'MA303'),
      ('Tuesday',   '14:00', '15:00', 'Statistical Inference',      'CME504', 'Prof. Apu Kumar Saha',                'MA303'),
      ('Tuesday',   '15:00', '16:00', 'Statistical Inference',      'CME504', 'Prof. Apu Kumar Saha',                'MA303'),
      ('Wednesday', '09:00', '10:00', 'Financial Mathematics',      'CME505', 'Dr. Birojit Das',                     'MA302'),
      ('Wednesday', '10:00', '11:00', 'Financial Mathematics',      'CME505', 'Dr. Birojit Das',                     'MA302'),
      ('Thursday',  '09:00', '10:00', 'Integral Transforms',        'CME502', 'Dr. Abhijit Baidya',                  'MA305'),
      ('Thursday',  '10:00', '11:00', 'Integral Transforms',        'CME502', 'Dr. Abhijit Baidya',                  'MA305'),
      ('Thursday',  '11:00', '12:00', 'Soft Computing',             'CME503', 'Dr. Pinki Majumder',                  'MA304'),
      ('Thursday',  '12:00', '13:00', 'Soft Computing',             'CME503', 'Dr. Pinki Majumder',                  'MA304'),
      ('Thursday',  '14:00', '15:00', 'Statistical Inference',      'CME504', 'Dr. Jayanta Debnath',                 'MA311'),
      ('Thursday',  '15:00', '16:00', 'Statistical Inference',      'CME504', 'Dr. Jayanta Debnath',                 'MA311'),
      ('Friday',    '09:00', '10:00', 'Financial Mathematics',      'CME505', 'Dr. Birojit Das',                     'MA311'),
      ('Friday',    '10:00', '11:00', 'Financial Mathematics',      'CME505', 'Dr. Birojit Das',                     'MA311')
    ) AS t(day, start, end, s_name, s_code, teacher, room);
  ELSE
    RAISE NOTICE 'CME sem-5 schedule already has % slots — skipping re-seed', schedule_count;
  END IF;
END $$;

-- ─── 4. FIX: Ensure CSE sem-5 subjects exist ──────────────────────────────
DO $$
DECLARE
  cse_id uuid;
  subject_count int;
BEGIN
  SELECT id INTO cse_id FROM public.branches WHERE branch_code = 'CSE';

  SELECT count(*) INTO subject_count
  FROM public.subjects
  WHERE branch_id = cse_id AND semester = 5;

  IF subject_count = 0 THEN
    RAISE NOTICE 'No CSE sem-5 subjects found — re-seeding';

    INSERT INTO public.subjects (branch_id, semester, subject_name, subject_code, is_lab)
    SELECT cse_id, 5, v.name, v.code, v.is_lab
    FROM (VALUES
      ('Theory of Computation', 'CS501', false),
      ('Computer Networks II',  'CS502', false),
      ('Compiler Design',       'CS503', false),
      ('Software Engineering',  'CS504', false),
      ('Elective I',            'CS505', false),
      ('Networks Lab',          'CS591', true)
    ) AS v(name, code, is_lab);
  ELSE
    RAISE NOTICE 'CSE sem-5 already has % subjects — skipping', subject_count;
  END IF;
END $$;

-- ─── 5. FIX: Ensure CME sem-5 subjects exist ──────────────────────────────
DO $$
DECLARE
  cme_id uuid;
  subject_count int;
BEGIN
  SELECT id INTO cme_id FROM public.branches WHERE branch_code = 'CME';

  SELECT count(*) INTO subject_count
  FROM public.subjects
  WHERE branch_id = cme_id AND semester = 5;

  IF subject_count = 0 THEN
    RAISE NOTICE 'No CME sem-5 subjects found — re-seeding';

    INSERT INTO public.subjects (branch_id, semester, subject_name, subject_code, is_lab)
    SELECT cme_id, 5, v.name, v.code, v.is_lab
    FROM (VALUES
      ('Scientific Computation Lab', 'CME501', true),
      ('Integral Transforms',        'CME502', false),
      ('Soft Computing',             'CME503', false),
      ('Statistical Inference',      'CME504', false),
      ('Financial Mathematics',      'CME505', false)
    ) AS v(name, code, is_lab);
  ELSE
    RAISE NOTICE 'CME sem-5 already has % subjects — skipping', subject_count;
  END IF;
END $$;

-- ─── 6. CRITICAL FIX: Correct any user whose branch_id points to wrong branch
-- If a user enrolled as CSE somehow has CME's branch_id, fix it.
-- Uncomment and set the enrollment_id below, then run:
--
-- UPDATE public.users
-- SET branch_id = (SELECT id FROM public.branches WHERE branch_code = 'CSE')
-- WHERE enrollment_id = 'YOUR_ENROLLMENT_ID';
