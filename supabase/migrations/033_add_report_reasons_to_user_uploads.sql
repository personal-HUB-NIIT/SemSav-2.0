-- Migration 033: Add report reasons to get_user_uploads RPC
-- So admins can see WHY content was flagged when reviewing a flagged user

CREATE OR REPLACE FUNCTION public.get_user_uploads(p_user_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', u.id,
    'title_syllabus', u.title_syllabus,
    'category', u.category,
    'test_type', u.test_type,
    'due_date_time', u.due_date_time,
    'file_url', u.file_url,
    'status', u.status,
    'net_score', u.net_score,
    'created_at', u.created_at,
    'subject_name', s.subject_name,
    'subject_code', s.subject_code,
    'report_count', (
      SELECT COUNT(*) FROM public.content_reports cr
      WHERE cr.upload_id = u.id
    ),
    'report_reasons', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'reason', cr.reason,
          'reporter_name', (
            SELECT u2.full_name FROM public.users u2
            WHERE u2.id = cr.reporter_id
          ),
          'created_at', cr.created_at
        )
      ), '[]'::jsonb)
      FROM public.content_reports cr
      WHERE cr.upload_id = u.id
    )
  )
  FROM public.uploads u
  LEFT JOIN public.subjects s ON s.id = u.subject_id
  WHERE u.user_id = p_user_id
  ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_uploads(uuid) TO authenticated;
