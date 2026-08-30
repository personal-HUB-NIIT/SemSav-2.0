-- ============================================================
-- Migration 038: ICS 5th Semester Setup (Branch + Subjects + Timetable)
-- Source: Official ICS Sem 5 Routine 2026-2027 (provided schedule)
-- Legend: OS=Operating System DBMS=Database Management System DIP=Digital Image Processing
--         COA=Computer Architecture and Organization EEC=Engineering Economics & Costing
-- Faculty: PD=Dr. Prarthana Dutta SS=Dr. Sushmita Sharma MKDB=Prof. Mrinal Kanti Deb Barma
--          KN=Kaju Nath NbD=Nabendu Debnath SZM=Dr. Syeda Zeenat Marshoodulla
-- Parallel groups: Mon 09-12 OS Lab G1 / DBMS Lab G2, Thu 10-13 DBMS Lab G1 / OS Lab G2
-- ============================================================

-- ─── 1. Ensure ICS branch exists ─────────────────────────────────────────
INSERT INTO public.branches (branch_code, branch_name, total_semesters, is_active)
VALUES ('ICS', 'Computer Science (IIITA)', 8, true)
ON CONFLICT (branch_code) DO NOTHING;

-- ─── 2. Reset ICS Sem-5 subjects (idempotent) ────────────────────────────
DELETE FROM public.subjects
WHERE branch_id = (SELECT id FROM public.branches WHERE branch_code = 'ICS')
  AND semester = 5;

-- ─── 3. Insert correct ICS Sem-5 subjects ────────────────────────────────
WITH ics AS (SELECT id FROM public.branches WHERE branch_code = 'ICS')
INSERT INTO public.subjects (branch_id, semester, subject_name, subject_code, is_lab)
SELECT ics.id, 5, v.name, v.code, v.is_lab
FROM ics, (VALUES
  ('Operating System',                            'ICS501',  false),
  ('Database Management System',                  'ICS502',  false),
  ('Computer Architecture & Organization',        'ICS503',  false),
  ('Digital Image Processing',                    'ICS504',  false),
  ('Engineering Economics & Costing',             'ICS505',  false),
  ('Elective-I: Foundation of Cryptography',      'ICS506',  false),
  ('OS Lab',                                      'ICS501L', true),
  ('DBMS Lab',                                    'ICS502L', true),
  ('COA Lab',                                     'ICS503L', true),
  ('Seminar',                                     'ICS507',  false)
) AS v(name, code, is_lab);

-- ─── 4. Reset ICS Sem-5 timetable ────────────────────────────────────────
DELETE FROM public.class_schedule
WHERE branch_id = (SELECT id FROM public.branches WHERE branch_code = 'ICS')
  AND semester = 5;

-- ─── 5. Insert ICS Sem-5 weekly timetable (rooms & faculty per provided schedule) ─
WITH ics AS (SELECT id FROM public.branches WHERE branch_code = 'ICS')
INSERT INTO public.class_schedule
  (branch_id, semester, day_of_week, start_time, end_time,
   subject_name, subject_code, teacher_name, room_number)
SELECT ics.id, 5, day, start_time::time, end_time::time, s_name, s_code, teacher, room
FROM ics, (VALUES
  -- ═══════════════════ MONDAY ═══════════════════
  ('Monday',    '09:00', '12:00', 'OS Lab (Group 1)',                         'ICS501L', 'Dr. Prarthana Dutta',              'Rm 117'),
  ('Monday',    '09:00', '12:00', 'DBMS Lab (Group 2)',                       'ICS502L', 'Dr. Sushmita Sharma',              'Rm PMD-107'),
  ('Monday',    '12:00', '13:00', 'Elective-I: Foundation of Cryptography',   'ICS506',  'Prof. Mrinal Kanti Deb Barma',     'Rm L203'),
  ('Monday',    '14:00', '15:00', 'Engineering Economics & Costing',          'ICS505',  'Nabendu Debnath',                  'Rm L201'),
  ('Monday',    '15:00', '17:00', 'Operating System',                         'ICS501',  'Dr. Prarthana Dutta',              'Rm L202'),

  -- ═══════════════════ TUESDAY ═══════════════════
  ('Tuesday',   '09:00', '12:00', 'COA Lab (Group 1)',                        'ICS503L', 'Dr. Prarthana Dutta',              'Rm PMD-222'),
  ('Tuesday',   '12:00', '13:00', 'Engineering Economics & Costing',          'ICS505',  'Kaju Nath',                        'Rm G07'),
  ('Tuesday',   '14:00', '15:00', 'Database Management System',               'ICS502',  'Dr. Sushmita Sharma',              'Rm L103'),
  ('Tuesday',   '15:00', '17:00', 'Computer Architecture & Organization',     'ICS503',  'Dr. Syeda Zeenat Marshoodulla',    'Rm L103'),

  -- ═══════════════════ WEDNESDAY ═══════════════════
  ('Wednesday', '09:00', '10:00', 'Operating System',                         'ICS501',  'Dr. Prarthana Dutta',              'Rm G07'),
  ('Wednesday', '10:00', '11:00', 'Digital Image Processing',                 'ICS504',  'Dr. Prarthana Dutta',              'Rm G07'),
  ('Wednesday', '11:00', '13:00', 'Elective-I: Foundation of Cryptography',   'ICS506',  'Prof. Mrinal Kanti Deb Barma',     'Rm L204'),
  ('Wednesday', '14:00', '15:00', 'Engineering Economics & Costing',          'ICS505',  'Nabendu Debnath',                  'Rm L101'),
  ('Wednesday', '15:00', '16:00', 'Database Management System',               'ICS502',  'Dr. Sushmita Sharma',              'Rm L101'),

  -- ═══════════════════ THURSDAY ═══════════════════
  ('Thursday',  '10:00', '13:00', 'DBMS Lab (Group 1)',                       'ICS502L', 'Dr. Sushmita Sharma',              'Rm PMD-107'),
  ('Thursday',  '10:00', '13:00', 'OS Lab (Group 2)',                         'ICS501L', 'Dr. Prarthana Dutta',              'Rm 117'),
  ('Thursday',  '14:00', '15:00', 'Operating System',                         'ICS501',  'Dr. Prarthana Dutta',              'Rm L103'),
  ('Thursday',  '15:00', '16:00', 'Database Management System',               'ICS502',  'Dr. Sushmita Sharma',              'Rm L103'),

  -- ═══════════════════ FRIDAY ═══════════════════
  ('Friday',    '09:00', '10:00', 'Computer Architecture & Organization',     'ICS503',  'Dr. Syeda Zeenat Marshoodulla',    'Rm L101'),
  ('Friday',    '10:00', '13:00', 'COA Lab (Group 2)',                        'ICS503L', 'Dr. Prarthana Dutta',              'Rm PMD-107'),
  ('Friday',    '14:00', '15:00', 'Digital Image Processing',                 'ICS504',  'Dr. Prarthana Dutta',              'Rm L102'),
  ('Friday',    '15:00', '17:00', 'Seminar',                                  'ICS507',  '-',                                'Rm L102')
) AS t(day, start_time, end_time, s_name, s_code, teacher, room);

-- Step 6: Verify
-- SELECT s.subject_code, s.subject_name FROM public.subjects s JOIN public.branches b ON b.id=s.branch_id WHERE b.branch_code='ICS' AND s.semester=5 ORDER BY s.subject_code;
-- SELECT cs.day_of_week, cs.start_time, cs.end_time, cs.subject_code, cs.subject_name, cs.teacher_name, cs.room_number FROM public.class_schedule cs JOIN public.branches b ON b.id=cs.branch_id WHERE b.branch_code='ICS' AND cs.semester=5 ORDER BY CASE cs.day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 END, cs.start_time;
