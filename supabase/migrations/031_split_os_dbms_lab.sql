-- ============================================================
-- Migration 031: Split combined OS Lab / DBMS Lab into two subjects
-- ============================================================

-- Get the CSE branch id
DO $$
DECLARE
  v_cse_id uuid;
BEGIN
  SELECT id INTO v_cse_id FROM branches WHERE branch_code = 'CSE';

  -- Delete any combined/hybrid lab entries for CSE sem 5
  DELETE FROM public.subjects
  WHERE branch_id = v_cse_id
    AND semester = 5
    AND (subject_code LIKE '%501L%' OR subject_code LIKE '%502L%'
         OR subject_name LIKE '%OS Lab%' OR subject_name LIKE '%DBMS Lab%'
         OR subject_name LIKE '%Operating System Lab%'
         OR subject_name LIKE '%Database Management System Lab%');

  -- Insert two separate lab subjects
  INSERT INTO public.subjects (branch_id, semester, subject_name, subject_code, is_lab)
  VALUES
    (v_cse_id, 5, 'Operating System Lab',              'CS501L', true),
    (v_cse_id, 5, 'Database Management System Lab',    'CS502L', true)
  ON CONFLICT (branch_id, semester, subject_code) DO UPDATE
    SET subject_name = EXCLUDED.subject_name, is_lab = true;

  RAISE NOTICE 'Split OS Lab / DBMS Lab into two separate subjects';
END $$;

-- Verify
SELECT subject_code, subject_name, is_lab
FROM public.subjects s
JOIN public.branches b ON b.id = s.branch_id
WHERE b.branch_code = 'CSE' AND s.semester = 5
ORDER BY subject_code;
