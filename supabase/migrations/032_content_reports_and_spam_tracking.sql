-- Migration 032: Content Reports & Spam Tracking
-- Adds report button alongside upvote/downvote
-- If 5% of class reports content → purged + uploader flagged to admin
-- Admin can view flagged users, their uploads, and ban/delete them

-- ─── 1. content_reports table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id   uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (upload_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_cr_upload ON public.content_reports (upload_id);
CREATE INDEX IF NOT EXISTS idx_cr_reporter ON public.content_reports (reporter_id);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can read reports (for counts)
CREATE POLICY content_reports_select ON public.content_reports
  FOR SELECT USING (true);

-- Authenticated users can insert reports (RPC will handle validation)
CREATE POLICY content_reports_insert ON public.content_reports
  FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_id FROM public.users WHERE id = reporter_id));

-- ─── 2. flagged_users table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.flagged_users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  report_count      integer NOT NULL DEFAULT 1,
  flagged_upload_ids uuid[] NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'banned')),
  reviewed_by       uuid REFERENCES public.users(id),
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_fu_status ON public.flagged_users (status);

ALTER TABLE public.flagged_users ENABLE ROW LEVEL SECURITY;

-- Only admins can see flagged users
CREATE POLICY flagged_users_admin_only ON public.flagged_users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE auth_id = auth.uid() AND role = 'SUPER_ADMIN'
    )
  );

-- ─── 3. submit_report RPC ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_report(
  p_upload_id   uuid,
  p_reporter_id uuid,
  p_reason      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upload       record;
  v_report_count integer;
  v_total        integer;
  v_required     integer;
BEGIN
  -- Lock the upload row
  SELECT id, user_id, branch_id, semester, status
  INTO v_upload
  FROM public.uploads
  WHERE id = p_upload_id
  FOR UPDATE;

  IF v_upload IS NULL THEN
    RETURN jsonb_build_object('error', 'Upload not found');
  END IF;

  IF v_upload.status != 'UNVERIFIED' THEN
    RETURN jsonb_build_object('error', 'This item is no longer pending verification');
  END IF;

  -- Self-report prevention
  IF v_upload.user_id = p_reporter_id THEN
    RETURN jsonb_build_object('error', 'You cannot report your own content');
  END IF;

  -- Check for existing report
  IF EXISTS (
    SELECT 1 FROM public.content_reports
    WHERE upload_id = p_upload_id AND reporter_id = p_reporter_id
  ) THEN
    RETURN jsonb_build_object('error', 'You have already reported this content');
  END IF;

  -- Insert the report
  INSERT INTO public.content_reports (upload_id, reporter_id, reason)
  VALUES (p_upload_id, p_reporter_id, p_reason);

  -- Count reports for this upload
  SELECT COUNT(*) INTO v_report_count
  FROM public.content_reports
  WHERE upload_id = p_upload_id;

  -- Calculate 5% threshold
  SELECT COUNT(*) INTO v_total
  FROM public.users
  WHERE branch_id = v_upload.branch_id
    AND semester = v_upload.semester
    AND is_banned = false;

  v_required := GREATEST(1, CEIL(v_total * 0.05));

  -- Check if threshold met
  IF v_report_count >= v_required THEN
    -- PURGE the content
    UPDATE public.uploads SET status = 'PURGED' WHERE id = p_upload_id;

    -- -15 karma to uploader (min 0)
    UPDATE public.users
    SET karma_points = GREATEST(0, karma_points - 15)
    WHERE id = v_upload.user_id;

    -- Add/update flagged_users record
    INSERT INTO public.flagged_users (user_id, report_count, flagged_upload_ids)
    VALUES (v_upload.user_id, 1, ARRAY[p_upload_id])
    ON CONFLICT (user_id)
    DO UPDATE SET
      report_count = flagged_users.report_count + 1,
      flagged_upload_ids = array_append(
        CASE WHEN p_upload_id = ANY(flagged_users.flagged_upload_ids)
          THEN flagged_users.flagged_upload_ids
          ELSE flagged_users.flagged_upload_ids
        END,
        CASE WHEN p_upload_id = ANY(flagged_users.flagged_upload_ids)
          THEN NULL
          ELSE p_upload_id
        END
      ),
      updated_at = now();

    -- Clean up NULL entries from array append
    UPDATE public.flagged_users
    SET flagged_upload_ids = array_remove(flagged_upload_ids, NULL)
    WHERE user_id = v_upload.user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'purged', true,
      'reports', v_report_count,
      'required', v_required,
      'message', 'Content reported and purged — uploader flagged to admin'
    );
  END IF;

  -- Below threshold
  RETURN jsonb_build_object(
    'ok', true,
    'purged', false,
    'reports', v_report_count,
    'required', v_required,
    'message', 'Report recorded'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_report(uuid, uuid, text) TO authenticated;

-- ─── 4. Admin RPCs for managing flagged users ────────────────────────────────

-- Get all flagged users with their details
CREATE OR REPLACE FUNCTION public.get_flagged_users()
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', fu.id,
    'user_id', fu.user_id,
    'full_name', u.full_name,
    'email', u.email,
    'enrollment_id', u.enrollment_id,
    'branch_id', u.branch_id,
    'semester', u.semester,
    'karma_points', u.karma_points,
    'is_banned', u.is_banned,
    'report_count', fu.report_count,
    'flagged_upload_ids', fu.flagged_upload_ids,
    'status', fu.status,
    'created_at', fu.created_at
  )
  FROM public.flagged_users fu
  JOIN public.users u ON u.id = fu.user_id
  WHERE fu.status != 'dismissed'
  ORDER BY fu.report_count DESC, fu.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_flagged_users() TO authenticated;

-- Get all uploads by a specific user (for admin review)
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
    )
  )
  FROM public.uploads u
  LEFT JOIN public.subjects s ON s.id = u.subject_id
  WHERE u.user_id = p_user_id
  ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_uploads(uuid) TO authenticated;

-- Ban a flagged user
CREATE OR REPLACE FUNCTION public.ban_flagged_user(
  p_flagged_user_id uuid,
  p_admin_id        uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id uuid;
BEGIN
  -- Get the user_id from flagged_users
  SELECT user_id INTO v_target_user_id
  FROM public.flagged_users
  WHERE id = p_flagged_user_id;

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Flagged user not found');
  END IF;

  -- Ban the user
  UPDATE public.users SET is_banned = true WHERE id = v_target_user_id;

  -- Update flagged_users status
  UPDATE public.flagged_users
  SET status = 'banned', reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now()
  WHERE id = p_flagged_user_id;

  -- Purge all their UNVERIFIED uploads
  UPDATE public.uploads SET status = 'PURGED'
  WHERE user_id = v_target_user_id AND status = 'UNVERIFIED';

  -- Log the admin action
  INSERT INTO public.admin_logs (admin_id, action_taken, target_user_id, notes)
  VALUES (p_admin_id, 'ACCOUNT_BAN', v_target_user_id, 'Banned for spam/reported content');

  RETURN jsonb_build_object('ok', true, 'message', 'User banned successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION public.ban_flagged_user(uuid, uuid) TO authenticated;

-- Dismiss a flagged user report
CREATE OR REPLACE FUNCTION public.dismiss_flagged_user(
  p_flagged_user_id uuid,
  p_admin_id        uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.flagged_users
  SET status = 'dismissed', reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now()
  WHERE id = p_flagged_user_id;

  RETURN jsonb_build_object('ok', true, 'message', 'Report dismissed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_flagged_user(uuid, uuid) TO authenticated;
