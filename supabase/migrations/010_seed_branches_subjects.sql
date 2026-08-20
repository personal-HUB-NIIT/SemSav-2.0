-- Migration 010: Seed Branches and Subjects for NITA
-- Add your college's branches and subject data here.

-- ============================================================
-- Branches
-- ============================================================
insert into branches (branch_code, branch_name, total_semesters, is_active)
values
  ('CSE',  'Computer Science & Engineering',        8, true),
  ('ECE',  'Electronics & Communication Engineering', 8, true),
  ('ME',   'Mechanical Engineering',                 8, true),
  ('CE',   'Civil Engineering',                      8, true),
  ('EE',   'Electrical Engineering',                 8, true),
  ('IT',   'Information Technology',                 8, true),
  ('CHE',  'Chemical Engineering',                   8, true),
  ('MCA',  'Master of Computer Applications',        4, true)
on conflict (branch_code) do nothing;

-- ============================================================
-- CSE Subjects
-- ============================================================
with cse as (select id from branches where branch_code = 'CSE')
insert into subjects (branch_id, semester, subject_name, subject_code, is_lab)
select cse.id, sem, subj_name, subj_code, is_lab_subj
from cse, (values
  -- Semester 1
  (1, 'Mathematics I',                   'MA101',  false),
  (1, 'Physics',                         'PH101',  false),
  (1, 'Basic Electrical Engineering',    'EE101',  false),
  (1, 'Engineering Graphics',            'CE101',  false),
  (1, 'Physics Lab',                     'PH191',  true),
  (1, 'Engineering Graphics Lab',        'CE191',  true),
  -- Semester 2
  (2, 'Mathematics II',                  'MA201',  false),
  (2, 'Chemistry',                       'CH201',  false),
  (2, 'Programming in C',                'CS201',  false),
  (2, 'Engineering Mechanics',           'ME201',  false),
  (2, 'Chemistry Lab',                   'CH291',  true),
  (2, 'C Programming Lab',               'CS291',  true),
  -- Semester 3
  (3, 'Data Structures',                 'CS301',  false),
  (3, 'Digital Electronics',             'CS302',  false),
  (3, 'Discrete Mathematics',            'MA301',  false),
  (3, 'Computer Organization',           'CS303',  false),
  (3, 'Object Oriented Programming',     'CS304',  false),
  (3, 'DS Lab',                          'CS391',  true),
  (3, 'OOP Lab',                         'CS392',  true),
  -- Semester 4
  (4, 'Algorithm Design & Analysis',     'CS401',  false),
  (4, 'Operating Systems',               'CS402',  false),
  (4, 'Database Management Systems',     'CS403',  false),
  (4, 'Computer Networks I',             'CS404',  false),
  (4, 'Mathematics III',                 'MA401',  false),
  (4, 'OS Lab',                          'CS491',  true),
  (4, 'DBMS Lab',                        'CS492',  true),
  -- Semester 5
  (5, 'Theory of Computation',           'CS501',  false),
  (5, 'Computer Networks II',            'CS502',  false),
  (5, 'Compiler Design',                 'CS503',  false),
  (5, 'Software Engineering',            'CS504',  false),
  (5, 'Elective I',                      'CS505',  false),
  (5, 'Networks Lab',                    'CS591',  true),
  -- Semester 6
  (6, 'Distributed Systems',             'CS601',  false),
  (6, 'Information Security',            'CS602',  false),
  (6, 'Machine Learning',                'CS603',  false),
  (6, 'Elective II',                     'CS604',  false),
  (6, 'ML Lab',                          'CS691',  true),
  -- Semester 7
  (7, 'Cloud Computing',                 'CS701',  false),
  (7, 'Elective III',                    'CS702',  false),
  (7, 'Elective IV',                     'CS703',  false),
  (7, 'Project I',                       'CS791',  false),
  -- Semester 8
  (8, 'Elective V',                      'CS801',  false),
  (8, 'Project II',                      'CS891',  false)
) as t(sem, subj_name, subj_code, is_lab_subj)
on conflict (branch_id, semester, subject_code) do nothing;

-- ============================================================
-- ECE Subjects (condensed, add more as needed)
-- ============================================================
with ece as (select id from branches where branch_code = 'ECE')
insert into subjects (branch_id, semester, subject_name, subject_code, is_lab)
select ece.id, sem, subj_name, subj_code, is_lab_subj
from ece, (values
  (1, 'Mathematics I',                   'MA101',  false),
  (1, 'Physics',                         'PH101',  false),
  (1, 'Basic Electrical Engineering',    'EE101',  false),
  (1, 'Engineering Graphics',            'CE101',  false),
  (2, 'Mathematics II',                  'MA201',  false),
  (2, 'Signals & Systems',               'EC201',  false),
  (2, 'Electronic Devices',              'EC202',  false),
  (3, 'Analog Electronics',              'EC301',  false),
  (3, 'Digital Electronics',             'EC302',  false),
  (3, 'Electromagnetic Theory',          'EC303',  false),
  (4, 'Communication Systems',           'EC401',  false),
  (4, 'Microprocessors',                 'EC402',  false),
  (4, 'Control Systems',                 'EC403',  false),
  (5, 'VLSI Design',                     'EC501',  false),
  (5, 'Digital Signal Processing',       'EC502',  false),
  (6, 'Wireless Communication',          'EC601',  false),
  (6, 'Embedded Systems',                'EC602',  false),
  (7, 'Elective I',                      'EC701',  false),
  (7, 'Project I',                       'EC791',  false),
  (8, 'Project II',                      'EC891',  false)
) as t(sem, subj_name, subj_code, is_lab_subj)
on conflict (branch_id, semester, subject_code) do nothing;
