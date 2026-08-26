-- ============================================================
-- Migration 028: Fix attendance — add DELETE policy + re-create summary RPC
-- ============================================================

-- 1. Add DELETE policy for attendance_logs (was missing from 017)
DROP POLICY IF EXISTS "Users can delete own attendance_logs" ON public.attendance_logs;
CREATE POLICY "Users can delete own attendance_logs"
ON public.attendance_logs FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 2. Add DELETE grant (was missing from 017)
GRANT DELETE ON public.attendance_logs TO authenticated;

-- 3. Re-create get_attendance_summary with 3 params (ensures it exists)
CREATE OR REPLACE FUNCTION public.get_attendance_summary(
  p_user_id   uuid,
  p_branch_id uuid,
  p_semester  int
)
RETURNS TABLE (
  subject_id uuid,
  total_held bigint,
  attended   bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT l.subject_id,
         COUNT(*) FILTER (WHERE l.status = 'present' OR l.status = 'absent') AS total_held,
         COUNT(*) FILTER (WHERE l.status = 'present')                        AS attended
  FROM public.attendance_logs l
  JOIN public.subjects s ON s.id = l.subject_id
  WHERE l.user_id = p_user_id
    AND s.branch_id = p_branch_id
    AND s.semester  = p_semester
  GROUP BY l.subject_id;
$$;

REVOKE ALL ON FUNCTION public.get_attendance_summary(uuid, uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_summary(uuid, uuid, int) TO authenticated;
