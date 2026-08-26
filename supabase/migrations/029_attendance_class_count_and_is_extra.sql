-- ============================================================
-- Migration 029: Add class_count + is_extra to attendance_logs
-- Supports multiple extra classes per subject per day
-- ============================================================

-- 1. Add new columns
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS class_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_extra    boolean NOT NULL DEFAULT false;

-- 2. Drop the unique constraint (extra classes need multiple rows per day)
ALTER TABLE public.attendance_logs
  DROP CONSTRAINT IF EXISTS attendance_logs_user_id_subject_id_date_key;

-- 3. Add a new unique constraint that includes is_extra
--    (allows one regular + multiple extra entries per subject per day)
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_logs_regular
  ON public.attendance_logs (user_id, subject_id, date)
  WHERE is_extra = false;

-- 4. Re-create get_attendance_summary to use class_count
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
         SUM(l.class_count) FILTER (WHERE l.status IN ('present', 'absent')) AS total_held,
         SUM(l.class_count) FILTER (WHERE l.status = 'present')             AS attended
  FROM public.attendance_logs l
  JOIN public.subjects s ON s.id = l.subject_id
  WHERE l.user_id = p_user_id
    AND s.branch_id = p_branch_id
    AND s.semester  = p_semester
  GROUP BY l.subject_id;
$$;

REVOKE ALL ON FUNCTION public.get_attendance_summary(uuid, uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_summary(uuid, uuid, int) TO authenticated;

-- 5. Backfill existing rows
UPDATE public.attendance_logs SET class_count = 1, is_extra = false WHERE class_count IS NULL;
