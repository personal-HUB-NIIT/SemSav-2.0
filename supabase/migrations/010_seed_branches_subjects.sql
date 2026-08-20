-- Migration 010: Seed Branches and Subjects
-- Only two branches: CME and CSE
-- Run in Supabase SQL Editor.

-- ============================================================
-- Step 1: Remove all old branches (cascade will clean subjects)
-- ============================================================
delete from subjects;
delete from branches;

-- ============================================================
-- Step 2: Insert the two official branches
-- ============================================================
insert into branches (branch_code, branch_name, total_semesters, is_active)
values
  ('CME', 'Computational Mathematics & Engineering', 8, true),
  ('CSE', 'Computer Science & Engineering',          8, true);

-- ============================================================
-- Step 3: CME Subjects (all 8 semesters)
-- ============================================================
with cme as (select id from branches where branch_code = 'CME')
insert into subjects (branch_id, semester, subject_name, subject_code, is_lab)
select cme.id, sem, subj_name, subj_code, is_lab_subj
from cme, (values
  -- Semester 1
  (1, 'Calculus & Real Analysis',           'CM101', false),
  (1, 'Linear Algebra',                     'CM102', false),
  (1, 'Introduction to Programming (C)',    'CM103', false),
  (1, 'Engineering Physics',                'PH101', false),
  (1, 'Programming Lab',                    'CM191', true),
  -- Semester 2
  (2, 'Differential Equations',             'CM201', false),
  (2, 'Discrete Mathematics',               'CM202', false),
  (2, 'Data Structures',                    'CM203', false),
  (2, 'Statistics & Probability',           'CM204', false),
  (2, 'DS Lab',                             'CM291', true),
  -- Semester 3
  (3, 'Numerical Analysis',                 'CM301', false),
  (3, 'Algorithm Design & Analysis',        'CM302', false),
  (3, 'Object Oriented Programming',        'CM303', false),
  (3, 'Graph Theory',                       'CM304', false),
  (3, 'OOP Lab',                            'CM391', true),
  -- Semester 4
  (4, 'Optimization Methods',               'CM401', false),
  (4, 'Database Management Systems',        'CM402', false),
  (4, 'Operating Systems',                  'CM403', false),
  (4, 'Complex Analysis',                   'CM404', false),
  (4, 'DBMS Lab',                           'CM491', true),
  -- Semester 5
  (5, 'Machine Learning Fundamentals',      'CM501', false),
  (5, 'Mathematical Modelling',             'CM502', false),
  (5, 'Computer Networks',                  'CM503', false),
  (5, 'Functional Programming',             'CM504', false),
  (5, 'ML Lab',                             'CM591', true),
  -- Semester 6
  (6, 'Deep Learning & Neural Networks',    'CM601', false),
  (6, 'Cryptography & Security',            'CM602', false),
  (6, 'Computational Geometry',             'CM603', false),
  (6, 'Elective I',                         'CM604', false),
  (6, 'DL Lab',                             'CM691', true),
  -- Semester 7
  (7, 'High Performance Computing',         'CM701', false),
  (7, 'Research Methodology',               'CM702', false),
  (7, 'Elective II',                        'CM703', false),
  (7, 'Project I',                          'CM791', false),
  -- Semester 8
  (8, 'Elective III',                       'CM801', false),
  (8, 'Project II / Thesis',                'CM891', false)
) as t(sem, subj_name, subj_code, is_lab_subj);

-- ============================================================
-- Step 4: CSE Subjects (all 8 semesters)
-- ============================================================
with cse as (select id from branches where branch_code = 'CSE')
insert into subjects (branch_id, semester, subject_name, subject_code, is_lab)
select cse.id, sem, subj_name, subj_code, is_lab_subj
from cse, (values
  -- Semester 1
  (1, 'Mathematics I',                      'MA101', false),
  (1, 'Physics',                            'PH101', false),
  (1, 'Basic Electrical Engineering',       'EE101', false),
  (1, 'Engineering Graphics',               'CE101', false),
  (1, 'Physics Lab',                        'PH191', true),
  (1, 'Engineering Graphics Lab',           'CE191', true),
  -- Semester 2
  (2, 'Mathematics II',                     'MA201', false),
  (2, 'Chemistry',                          'CH201', false),
  (2, 'Programming in C',                   'CS201', false),
  (2, 'Engineering Mechanics',              'ME201', false),
  (2, 'Chemistry Lab',                      'CH291', true),
  (2, 'C Programming Lab',                  'CS291', true),
  -- Semester 3
  (3, 'Data Structures',                    'CS301', false),
  (3, 'Digital Electronics',                'CS302', false),
  (3, 'Discrete Mathematics',               'MA301', false),
  (3, 'Computer Organization',              'CS303', false),
  (3, 'Object Oriented Programming',        'CS304', false),
  (3, 'DS Lab',                             'CS391', true),
  (3, 'OOP Lab',                            'CS392', true),
  -- Semester 4
  (4, 'Algorithm Design & Analysis',        'CS401', false),
  (4, 'Operating Systems',                  'CS402', false),
  (4, 'Database Management Systems',        'CS403', false),
  (4, 'Computer Networks I',                'CS404', false),
  (4, 'Mathematics III',                    'MA401', false),
  (4, 'OS Lab',                             'CS491', true),
  (4, 'DBMS Lab',                           'CS492', true),
  -- Semester 5
  (5, 'Theory of Computation',              'CS501', false),
  (5, 'Computer Networks II',               'CS502', false),
  (5, 'Compiler Design',                    'CS503', false),
  (5, 'Software Engineering',               'CS504', false),
  (5, 'Elective I',                         'CS505', false),
  (5, 'Networks Lab',                       'CS591', true),
  -- Semester 6
  (6, 'Distributed Systems',               'CS601', false),
  (6, 'Information Security',              'CS602', false),
  (6, 'Machine Learning',                  'CS603', false),
  (6, 'Elective II',                        'CS604', false),
  (6, 'ML Lab',                             'CS691', true),
  -- Semester 7
  (7, 'Cloud Computing',                   'CS701', false),
  (7, 'Elective III',                       'CS702', false),
  (7, 'Elective IV',                        'CS703', false),
  (7, 'Project I',                          'CS791', false),
  -- Semester 8
  (8, 'Elective V',                         'CS801', false),
  (8, 'Project II',                         'CS891', false)
) as t(sem, subj_name, subj_code, is_lab_subj);
