-- FIX: Replace wrong CSE sem-5 timetable with correct data
-- Run this in Supabase SQL Editor

-- Step 1: Delete the wrong CME data that's sitting under CSE
DELETE FROM public.class_schedule
WHERE branch_id = (SELECT id FROM branches WHERE branch_code = 'CSE')
  AND semester = 5;

-- Step 2: Insert correct CSE sem-5 timetable
WITH cse AS (SELECT id FROM branches WHERE branch_code = 'CSE')
INSERT INTO public.class_schedule
  (branch_id, semester, day_of_week, start_time, end_time,
   subject_name, subject_code, teacher_name, room_number)
SELECT cse.id, 5, day, start::time, end::time, s_name, s_code, teacher, room
FROM cse, (VALUES
  -- Monday
  ('Monday',    '09:00', '09:55', 'Theory of Computation', 'CS501', 'Prof. A. Mehrotra', 'LHT-1'),
  ('Monday',    '10:00', '10:55', 'Computer Networks II',  'CS502', 'Dr. S. Kapoor',     'LHT-2'),
  ('Monday',    '11:15', '12:10', 'Compiler Design',       'CS503', 'Prof. R. Bajpai',   'LHT-3'),
  ('Monday',    '12:15', '13:10', 'Software Engineering',  'CS504', 'Dr. N. Srivastava', 'LHT-1'),
  ('Monday',    '14:00', '15:50', 'Networks Lab',          'CS591', 'Mr. A. Khan',       'NetLab-1'),
  -- Tuesday
  ('Tuesday',   '09:00', '09:55', 'Compiler Design',       'CS503', 'Prof. R. Bajpai',   'LHT-3'),
  ('Tuesday',   '10:00', '10:55', 'Computer Networks II',  'CS502', 'Dr. S. Kapoor',     'LHT-2'),
  ('Tuesday',   '11:15', '12:10', 'Elective I',            'CS505', 'Prof. B. Dash',     'LHT-2'),
  ('Tuesday',   '12:15', '13:10', 'Software Engineering',  'CS504', 'Dr. N. Srivastava', 'LHT-1'),
  -- Wednesday
  ('Wednesday', '09:00', '09:55', 'Software Engineering',  'CS504', 'Dr. N. Srivastava', 'LHT-1'),
  ('Wednesday', '10:00', '10:55', 'Elective I',            'CS505', 'Prof. B. Dash',     'LHT-2'),
  ('Wednesday', '11:15', '12:10', 'Theory of Computation', 'CS501', 'Prof. A. Mehrotra', 'LHT-1'),
  ('Wednesday', '12:15', '13:10', 'Computer Networks II',  'CS502', 'Dr. S. Kapoor',     'LHT-2'),
  ('Wednesday', '14:00', '15:50', 'Networks Lab',          'CS591', 'Mr. A. Khan',       'NetLab-1'),
  -- Thursday
  ('Thursday',  '09:00', '09:55', 'Elective I',            'CS505', 'Prof. B. Dash',     'LHT-2'),
  ('Thursday',  '10:00', '10:55', 'Compiler Design',       'CS503', 'Prof. R. Bajpai',   'LHT-3'),
  ('Thursday',  '11:15', '13:05', 'Networks Lab',          'CS591', 'Mr. A. Khan',       'NetLab-1'),
  ('Thursday',  '14:00', '14:55', 'TOC Tutorial',          'CS501', 'Prof. A. Mehrotra', 'LHT-1'),
  ('Thursday',  '15:00', '15:55', 'CN-II Tutorial',        'CS502', 'Dr. S. Kapoor',     'LHT-2'),
  -- Friday
  ('Friday',    '09:00', '09:55', 'Computer Networks II',  'CS502', 'Dr. S. Kapoor',     'LHT-2'),
  ('Friday',    '10:00', '10:55', 'Software Engineering',  'CS504', 'Dr. N. Srivastava', 'LHT-1'),
  ('Friday',    '11:15', '12:10', 'Compiler Design',       'CS503', 'Prof. R. Bajpai',   'LHT-3'),
  ('Friday',    '12:15', '13:10', 'Theory of Computation', 'CS501', 'Prof. A. Mehrotra', 'LHT-1')
) AS t(day, start, end, s_name, s_code, teacher, room);

-- Step 3: Verify — run this after to confirm
SELECT b.branch_code, cs.subject_code, cs.subject_name, cs.day_of_week, cs.start_time, cs.end_time
FROM public.class_schedule cs
JOIN public.branches b ON b.id = cs.branch_id
WHERE cs.semester = 5 AND b.branch_code = 'CSE'
ORDER BY CASE cs.day_of_week
  WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
  WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 END, cs.start_time;
