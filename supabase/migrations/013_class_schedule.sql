-- Migration 013: Class Schedule
-- 1. Create table
CREATE TABLE IF NOT EXISTS public.class_schedule (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  semester     int  NOT NULL,
  day_of_week  text NOT NULL CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  subject_name text NOT NULL,
  subject_code text NOT NULL,
  teacher_name text,
  room_number  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 2. RLS & Policy
ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read class_schedule"
ON public.class_schedule FOR SELECT
TO authenticated
USING (true);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_class_schedule_lookup ON public.class_schedule (branch_id, semester, day_of_week);

-- 4. Placeholder Seed Data
-- INSTRUCTION: Run this in Supabase SQL Editor. 
-- Replace the placeholder teacher/room details with your actual PDF routine.
-- To reset, run: DELETE FROM public.class_schedule WHERE branch_id = (SELECT id FROM branches WHERE branch_code = 'CSE') AND semester = 5;

WITH cse AS (SELECT id FROM branches WHERE branch_code = 'CSE')
INSERT INTO public.class_schedule (branch_id, semester, day_of_week, start_time, end_time, subject_name, subject_code, teacher_name, room_number)
SELECT cse.id, 5, day, start::time, end::time, s_name, s_code, teacher, room
FROM cse, (VALUES
  -- Monday
  ('Monday', '09:00', '09:55', 'Theory of Computation', 'CS501', 'Prof. A. Mehrotra', 'LHT-1'),
  ('Monday', '10:00', '10:55', 'Computer Networks II', 'CS502', 'Dr. S. Kapoor', 'LHT-2'),
  ('Monday', '11:15', '12:10', 'Compiler Design', 'CS503', 'Prof. R. Bajpai', 'LHT-3'),
  ('Monday', '12:15', '13:10', 'Software Engineering', 'CS504', 'Dr. N. Srivastava', 'LHT-1'),
  ('Monday', '14:00', '15:50', 'Networks Lab', 'CS591', 'Mr. A. Khan', 'NetLab-1'),
  -- Tuesday
  ('Tuesday', '09:00', '09:55', 'Compiler Design', 'CS503', 'Prof. R. Bajpai', 'LHT-3'),
  ('Tuesday', '10:00', '10:55', 'Computer Networks II', 'CS502', 'Dr. S. Kapoor', 'LHT-2'),
  ('Tuesday', '11:15', '12:10', 'Elective I', 'CS505', 'Prof. B. Dash', 'LHT-2'),
  ('Tuesday', '12:15', '13:10', 'Software Engineering', 'CS504', 'Dr. N. Srivastava', 'LHT-1'),
  -- Wednesday
  ('Wednesday', '09:00', '09:55', 'Software Engineering', 'CS504', 'Dr. N. Srivastava', 'LHT-1'),
  ('Wednesday', '10:00', '10:55', 'Elective I', 'CS505', 'Prof. B. Dash', 'LHT-2'),
  ('Wednesday', '11:15', '12:10', 'Theory of Computation', 'CS501', 'Prof. A. Mehrotra', 'LHT-1'),
  ('Wednesday', '12:15', '13:10', 'Computer Networks II', 'CS502', 'Dr. S. Kapoor', 'LHT-2'),
  ('Wednesday', '14:00', '15:50', 'Networks Lab', 'CS591', 'Mr. A. Khan', 'NetLab-1'),
  -- Thursday
  ('Thursday', '09:00', '09:55', 'Elective I', 'CS505', 'Prof. B. Dash', 'LHT-2'),
  ('Thursday', '10:00', '10:55', 'Compiler Design', 'CS503', 'Prof. R. Bajpai', 'LHT-3'),
  ('Thursday', '11:15', '13:05', 'Networks Lab', 'CS591', 'Mr. A. Khan', 'NetLab-1'),
  ('Thursday', '14:00', '14:55', 'TOC Tutorial', 'CS501', 'Prof. A. Mehrotra', 'LHT-1'),
  ('Thursday', '15:00', '15:55', 'CN-II Tutorial', 'CS502', 'Dr. S. Kapoor', 'LHT-2'),
  -- Friday
  ('Friday', '09:00', '09:55', 'Computer Networks II', 'CS502', 'Dr. S. Kapoor', 'LHT-2'),
  ('Friday', '10:00', '10:55', 'Software Engineering', 'CS504', 'Dr. N. Srivastava', 'LHT-1'),
  ('Friday', '11:15', '12:10', 'Compiler Design', 'CS503', 'Prof. R. Bajpai', 'LHT-3'),
  ('Friday', '12:15', '13:10', 'Theory of Computation', 'CS501', 'Prof. A. Mehrotra', 'LHT-1')
) AS t(day, start, end, s_name, s_code, teacher, room);
