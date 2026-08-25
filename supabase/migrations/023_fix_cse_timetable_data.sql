-- ============================================================
-- FIX: Replace wrong CSE sem-5 data with real IIITA timetable
-- Source: User-provided CSE 5th Sem exact routine
-- ============================================================

-- Step 1: Delete wrong CSE sem-5 subjects (cascades to attendance_logs)
DELETE FROM public.subjects
WHERE branch_id = (SELECT id FROM branches WHERE branch_code = 'CSE')
  AND semester = 5;

-- Step 2: Insert correct CSE sem-5 subjects (IIITA curriculum)
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

-- Step 4: Insert correct CSE sem-5 timetable
WITH cse AS (SELECT id FROM branches WHERE branch_code = 'CSE')
INSERT INTO public.class_schedule
  (branch_id, semester, day_of_week, start_time, end_time,
   subject_name, subject_code, teacher_name, room_number)
SELECT cse.id, 5, day, start_time::time, end_time::time, s_name, s_code, teacher, room
FROM cse, (VALUES
  -- MONDAY
  ('Monday',    '09:00', '12:00', 'OS Lab',              'CS501L', 'Group 1',  'Lab Room'),
  ('Monday',    '09:00', '12:00', 'DBMS Lab',            'CS502L', 'Group 2',  'Lab Room'),
  ('Monday',    '12:00', '13:00', 'Elective I: Foundation of Cryptography', 'CS506', '-', '-'),
  ('Monday',    '14:00', '15:00', 'Engineering Economics & Costing', 'CS505', '-', '-'),
  ('Monday',    '15:00', '17:00', 'Operating System',    'CS501',  '-', '-'),

  -- TUESDAY
  ('Tuesday',   '12:00', '13:00', 'Engineering Economics & Costing', 'CS505', '-', '-'),
  ('Tuesday',   '14:00', '15:00', 'Database Management System', 'CS502', '-', '-'),
  ('Tuesday',   '15:00', '17:00', 'Computer Architecture & Organization', 'CS503', '-', '-'),

  -- WEDNESDAY
  ('Wednesday', '10:00', '11:00', 'Operating System',    'CS501',  '-', '-'),
  ('Wednesday', '11:00', '13:00', 'Elective I: Foundation of Cryptography', 'CS506', '-', '-'),
  ('Wednesday', '11:00', '13:00', 'Digital Image Processing', 'CS504', '-', '-'),
  ('Wednesday', '14:00', '15:00', 'Engineering Economics & Costing', 'CS505', '-', '-'),
  ('Wednesday', '15:00', '17:00', 'Database Management System', 'CS502', '-', '-'),

  -- THURSDAY
  ('Thursday',  '10:00', '13:00', 'DBMS Lab',            'CS502L', 'Group 1',  'Lab Room'),
  ('Thursday',  '10:00', '13:00', 'OS Lab',              'CS501L', 'Group 2',  'Lab Room'),
  ('Thursday',  '14:00', '15:00', 'Operating System',    'CS501',  '-', '-'),
  ('Thursday',  '15:00', '16:00', 'Database Management System', 'CS502', '-', '-'),

  -- FRIDAY
  ('Friday',    '09:00', '10:00', 'Computer Architecture & Organization', 'CS503', '-', '-'),
  ('Friday',    '10:00', '13:00', 'COA Lab',             'CS503L', 'Group 2',  'Lab Room'),
  ('Friday',    '14:00', '15:00', 'Digital Image Processing', 'CS504', '-', '-'),
  ('Friday',    '15:00', '16:00', 'Seminar',             '-',      '-', '-')
) AS t(day, start_time, end_time, s_name, s_code, teacher, room);

-- Step 5: Verify
SELECT b.branch_code, s.subject_code, s.subject_name, s.is_lab
FROM public.subjects s
JOIN public.branches b ON b.id = s.branch_id
WHERE b.branch_code = 'CSE' AND s.semester = 5
ORDER BY s.subject_code;

SELECT b.branch_code, cs.subject_code, cs.subject_name, cs.day_of_week,
       cs.start_time, cs.end_time
FROM public.class_schedule cs
JOIN public.branches b ON b.id = cs.branch_id
WHERE cs.semester = 5 AND b.branch_code = 'CSE'
ORDER BY CASE cs.day_of_week
  WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
  WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 END, cs.start_time;
