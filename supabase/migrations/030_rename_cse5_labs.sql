-- ============================================================
-- Migration 030: Rename CSE 5th sem labs to full descriptive names
-- OS Lab → Operating System Lab (CS501L)
-- DBMS Lab → Database Management System Lab (CS502L)
-- ============================================================

UPDATE public.subjects
SET subject_name = 'Operating System Lab'
WHERE subject_code = 'CS501L'
  AND branch_id = (SELECT id FROM branches WHERE branch_code = 'CSE')
  AND semester = 5;

UPDATE public.subjects
SET subject_name = 'Database Management System Lab'
WHERE subject_code = 'CS502L'
  AND branch_id = (SELECT id FROM branches WHERE branch_code = 'CSE')
  AND semester = 5;

-- Also update timetable subject_name references
UPDATE public.class_schedule
SET subject_name = 'Operating System Lab (Group 1)'
WHERE subject_code = 'CS501L'
  AND branch_id = (SELECT id FROM branches WHERE branch_code = 'CSE')
  AND semester = 5
  AND day_of_week = 'Monday';

UPDATE public.class_schedule
SET subject_name = 'Operating System Lab (Group 2)'
WHERE subject_code = 'CS501L'
  AND branch_id = (SELECT id FROM branches WHERE branch_code = 'CSE')
  AND semester = 5
  AND day_of_week = 'Thursday';

UPDATE public.class_schedule
SET subject_name = 'Database Management System Lab (Group 2)'
WHERE subject_code = 'CS502L'
  AND branch_id = (SELECT id FROM branches WHERE branch_code = 'CSE')
  AND semester = 5
  AND day_of_week = 'Monday';

UPDATE public.class_schedule
SET subject_name = 'Database Management System Lab (Group 1)'
WHERE subject_code = 'CS502L'
  AND branch_id = (SELECT id FROM branches WHERE branch_code = 'CSE')
  AND semester = 5
  AND day_of_week = 'Thursday';

-- Verify
SELECT subject_code, subject_name, is_lab
FROM public.subjects s
JOIN public.branches b ON b.id = s.branch_id
WHERE b.branch_code = 'CSE' AND s.semester = 5
ORDER BY subject_code;
