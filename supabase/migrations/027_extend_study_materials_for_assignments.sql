-- Migration 027: Extend study_materials to include verified assignments
-- Adds material_type column to distinguish notes from assignments
-- Updates submit_queue_vote to auto-sync verified assignments too

-- ─── 1. Add material_type column ─────────────────────────────────────────────

ALTER TABLE public.study_materials
  ADD COLUMN IF NOT EXISTS material_type text NOT NULL DEFAULT 'NOTE'
  CHECK (material_type IN ('NOTE', 'ASSIGNMENT'));

-- Backfill existing rows as NOTE
UPDATE public.study_materials SET material_type = 'NOTE' WHERE material_type IS NULL;

-- Add index for filtering by type
CREATE INDEX IF NOT EXISTS idx_sm_type ON public.study_materials (material_type);
CREATE INDEX IF NOT EXISTS idx_sm_type_subject_branch
  ON public.study_materials (material_type, subject_id, branch_id, semester);

-- ─── 2. Updated submit_queue_vote with assignment sync ────────────────────────

CREATE OR REPLACE FUNCTION public.submit_queue_vote(
  p_upload_id  uuid,
  p_user_id    uuid,
  p_vote_type  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upload     record;
  v_existing   record;
  v_total      int;
  v_required   int;
  v_delta_up   int := 0;
  v_delta_down int := 0;
  v_new_up     int;
  v_new_down   int;
  v_uploader_name text;
  v_mat_type   text;
BEGIN
  -- Lock the upload row
  SELECT id, user_id, branch_id, semester, status, category, subject_id, due_date_time
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

  -- Self-vote prevention
  IF v_upload.user_id = p_user_id THEN
    RETURN jsonb_build_object('error', 'You cannot vote on your own upload');
  END IF;

  -- Check for existing vote
  SELECT id, vote_type INTO v_existing
  FROM public.votes
  WHERE upload_id = p_upload_id AND user_id = p_user_id;

  IF v_existing IS NOT NULL THEN
    IF v_existing.vote_type = p_vote_type THEN
      RETURN jsonb_build_object('error', 'You have already voted on this item');
    END IF;
    DELETE FROM public.votes WHERE id = v_existing.id;
    IF v_existing.vote_type = 'UP' THEN v_delta_up := -1;
    ELSE v_delta_down := -1; END IF;
  END IF;

  IF p_vote_type NOT IN ('UP', 'DOWN') THEN
    RETURN jsonb_build_object('error', 'Invalid vote type');
  END IF;

  INSERT INTO public.votes (user_id, upload_id, vote_type)
  VALUES (p_user_id, p_upload_id, p_vote_type::vote_type);

  IF p_vote_type = 'UP' THEN v_delta_up := v_delta_up + 1;
  ELSE v_delta_down := v_delta_down + 1; END IF;

  -- Count current votes
  SELECT
    COALESCE(SUM(CASE WHEN vote_type = 'UP' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN vote_type = 'DOWN' THEN 1 ELSE 0 END), 0)
  INTO v_new_up, v_new_down
  FROM public.votes
  WHERE upload_id = p_upload_id;

  -- 5% threshold
  SELECT COUNT(*) INTO v_total
  FROM public.users
  WHERE branch_id = v_upload.branch_id
    AND semester = v_upload.semester
    AND is_banned = false;
  v_required := GREATEST(1, CEIL(v_total * 0.05));

  IF v_new_up >= v_required THEN
    -- VERIFIED
    UPDATE public.uploads SET status = 'VERIFIED' WHERE id = p_upload_id;

    UPDATE public.users SET karma_points = karma_points + 25 WHERE id = v_upload.user_id;

    UPDATE public.users SET karma_points = karma_points + 2
    WHERE id IN (
      SELECT user_id FROM public.votes
      WHERE upload_id = p_upload_id AND vote_type = 'UP'
    );

    -- AUTO-SYNC: NOTES and ASSIGNMENTS only (tests excluded)
    IF v_upload.subject_id IS NOT NULL AND v_upload.category IN ('NOTES', 'ASSIGNMENT') THEN
      SELECT full_name INTO v_uploader_name
      FROM public.users WHERE id = v_upload.user_id;

      IF v_upload.category = 'NOTES' THEN
        v_mat_type := 'NOTE';
      ELSE
        v_mat_type := 'ASSIGNMENT';
      END IF;

      INSERT INTO public.study_materials (
        upload_id, material_type, subject_id, branch_id, semester,
        title, file_url, uploader_id, uploader_name
      )
      SELECT
        u.id, v_mat_type, u.subject_id, u.branch_id, u.semester,
        u.title_syllabus, u.file_url, u.user_id, v_uploader_name
      FROM public.uploads u
      WHERE u.id = p_upload_id;
    END IF;

    RETURN jsonb_build_object(
      'ok', true, 'upvotes', v_new_up, 'downvotes', v_new_down,
      'required', v_required, 'status', 'VERIFIED',
      'message', 'Upload verified and promoted to live data'
    );

  ELSIF v_new_down >= v_required THEN
    UPDATE public.uploads SET status = 'PURGED' WHERE id = p_upload_id;
    UPDATE public.users SET karma_points = greatest(0, karma_points - 15) WHERE id = v_upload.user_id;

    RETURN jsonb_build_object(
      'ok', true, 'upvotes', v_new_up, 'downvotes', v_new_down,
      'required', v_required, 'status', 'PURGED',
      'message', 'Upload rejected by community'
    );
  END IF;

  -- Still pending
  UPDATE public.users SET karma_points = karma_points + 2 WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true, 'upvotes', v_new_up, 'downvotes', v_new_down,
    'required', v_required, 'status', 'UNVERIFIED',
    'message', 'Vote recorded'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_queue_vote(uuid, uuid, text) TO authenticated;
