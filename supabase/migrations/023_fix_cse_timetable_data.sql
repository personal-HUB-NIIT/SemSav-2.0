-- ============================================================
-- FIX: CSE 5th Sem — real IIITA timetable with rooms & teachers
-- Source: Official CSE Dept Routine (IIITA) Odd Sem 2026-2027
-- ============================================================

-- Faculty reference:
-- PD  = Dr. Prarthana Dutta          SS  = Dr. Sushmita Sharma
-- SZM = Dr. Syeda Zeenat Marshoodulla  KN  = Kaju Nath
-- NbD = Nabendu Debnath               MKDB = Prof. Mrinal Kanti Deb Barma

-- Step 1: Delete wrong CSE sem-5 subjects
DELETE FROM public.subjects
WHERE branch_id = (SELECT id FROM branches WHERE branch_code = 'CSE')
  AND semester = 5;

-- Step 2: Insert correct CSE sem-5 subjects
WITH cse AS (SELECT id FROM branches WHERE branch_code = 'CSE')
INSERT INTO public.subjects (branch_id, semester, subject_name, subject_code, is_lab)
SELECT cse.id, 5, v.name, v.code, v.is_lab
FROM cse, (VALUES
  ('Operating System',                          'CS501', false),
  ('Database Management System',                'CS502', false),
  ('Computer Architecture & Organization',      'CS503', false),
  ('Digital Image Processing',                  'CS504', false),
  ('Engineering Economics & Costing',           'CS505', false),
  ('Elective I: Foundation of Cryptography',    'CS506', false),
  ('OS Lab',                                    'CS501L', true),
  ('DBMS Lab',                                  'CS502L', true),
  ('COA Lab',                                   'CS503L', true)
) AS v(name, code, is_lab);

-- Step 3: Delete wrong CSE sem-5 timetable
DELETE FROM public.class_schedule
WHERE branch_id = (SELECT id FROM branches WHERE branch_code = 'CSE')
  AND semester = 5;

-- Step 4: Insert correct timetable with rooms & teachers
WITH cse AS (SELECT id FROM branches WHERE branch_code = 'CSE')
INSERT INTO public.class_schedule
  (branch_id, semester, day_of_week, start_time, end_time,
   subject_name, subject_code, teacher_name, room_number)
SELECT cse.id, 5, day, start_time::time, end_time::time, s_name, s_code, teacher, room
FROM cse, (VALUES
  -- ═══════════════════ MONDAY ═══════════════════
  ('Monday',    '09:00', '12:00', 'OS Lab (Group 1)',               'CS501L', 'Dr. Prarthana Dutta',              'ABS 117'),
  ('Monday',    '09:00', '12:00', 'DBMS Lab (Group 2)',             'CS502L', 'Dr. Sushmita Sharma',              'PMD 107'),
  ('Monday',    '12:00', '13:00', 'Elective I: Foundation of Cryptography', 'CS506', 'Prof. Mrinal Kanti Deb Barma', 'L203'),
  ('Monday',    '14:00', '15:00', 'Engineering Economics & Costing', 'CS505', 'Nabendu Debnath',                 'L101'),
  ('Monday',    '15:00', '17:00', 'Operating System',               'CS501',  'Dr. Prarthana Dutta',              'L202'),

  -- ═══════════════════ TUESDAY ═══════════════════
  ('Tuesday',   '09:00', '12:00', 'COA Lab (Group 1)',              'CS503L', 'Dr. Prarthana Dutta',              'PMD 222'),
  ('Tuesday',   '12:00', '13:00', 'Engineering Economics & Costing', 'CS505', 'Kaju Nath',                       'G07'),
  ('Tuesday',   '14:00', '15:00', 'Database Management System',     'CS502',  'Dr. Sushmita Sharma',              'L103'),
  ('Tuesday',   '15:00', '17:00', 'Computer Architecture & Organization', 'CS503', 'Dr. Syeda Zeenat Marshoodulla', 'L103'),

  -- ═══════════════════ WEDNESDAY ═══════════════════
  ('Wednesday', '09:00', '10:00', 'Operating System',               'CS501',  'Dr. Prarthana Dutta',              'G07'),
  ('Wednesday', '10:00', '11:00', 'Digital Image Processing',       'CS504',  'Dr. Prarthana Dutta',              'G07'),
  ('Wednesday', '11:00', '13:00', 'Elective I: Foundation of Cryptography', 'CS506', 'Prof. Mrinal Kanti Deb Barma', 'L204'),
  ('Wednesday', '14:00', '15:00', 'Engineering Economics & Costing', 'CS505', 'Nabendu Debnath',                 'L101'),
  ('Wednesday', '15:00', '17:00', 'Database Management System',     'CS502',  'Dr. Sushmita Sharma',              'L101'),

  -- ═══════════════════ THURSDAY ═══════════════════
  ('Thursday',  '10:00', '13:00', 'DBMS Lab (Group 1)',             'CS502L', 'Dr. Sushmita Sharma',              'PMD 107'),
  ('Thursday',  '10:00', '13:00', 'OS Lab (Group 2)',               'CS501L', 'Dr. Prarthana Dutta',              'ABS 117'),
  ('Thursday',  '14:00', '15:00', 'Operating System',               'CS501',  'Dr. Prarthana Dutta',              'L103'),
  ('Thursday',  '15:00', '16:00', 'Database Management System',     'CS502',  'Dr. Sushmita Sharma',              'L103'),

  -- ═══════════════════ FRIDAY ═══════════════════
  ('Friday',    '09:00', '10:00', 'Computer Architecture & Organization', 'CS503', 'Dr. Syeda Zeenat Marshoodulla', 'L101'),
  ('Friday',    '10:00', '13:00', 'COA Lab (Group 2)',              'CS503L', 'Dr. Prarthana Dutta',              'PMD 107'),
  ('Friday',    '14:00', '15:00', 'Digital Image Processing',       'CS504',  'Dr. Prarthana Dutta',              'L102'),
  ('Friday',    '15:00', '16:00', 'Seminar',                        '-',       '-',                                'L102')
) AS t(day, start_time, end_time, s_name, s_code, teacher, room);

-- Step 5: Verify subjects
SELECT s.subject_code, s.subject_name, s.is_lab
FROM public.subjects s
JOIN public.branches b ON b.id = s.branch_id
WHERE b.branch_code = 'CSE' AND s.semester = 5
ORDER BY s.subject_code;

-- Step 6: Verify timetable
SELECT cs.day_of_week, cs.start_time, cs.end_time,
       cs.subject_code, cs.subject_name, cs.teacher_name, cs.room_number
FROM public.class_schedule cs
JOIN public.branches b ON b.id = cs.branch_id
WHERE cs.semester = 5 AND b.branch_code = 'CSE'
ORDER BY CASE cs.day_of_week
  WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
  WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 END, cs.start_time;
