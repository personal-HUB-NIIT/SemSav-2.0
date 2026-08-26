-- Migration 026: Study Materials — verified notes auto-sync
-- Creates study_materials table and modifies submit_queue_vote to populate it

-- ─── 1. study_materials table ────────────────────────────────────────────────
-- Stores ONLY verified notes. Assignments and tests are excluded.

CREATE TABLE IF NOT EXISTS public.study_materials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id     uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  subject_id    uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  branch_id     uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  semester      int  NOT NULL,
  title         text NOT NULL,
  file_url      text,
  uploader_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  uploader_name text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.study_materials ENABLE ROW LEVEL SECURITY;

-- Students can read study materials for their branch+semester
CREATE POLICY "Students can read study materials"
ON public.study_materials FOR SELECT
TO authenticated
USING (
  branch_id = auth_branch_id()
  AND semester = auth_semester()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sm_subject_branch_sem
  ON public.study_materials (subject_id, branch_id, semester);
CREATE INDEX IF NOT EXISTS idx_sm_upload
  ON public.study_materials (upload_id);

-- Grants
GRANT SELECT ON public.study_materials TO authenticated;

-- ─── 2. Modify submit_queue_vote to auto-populate study_materials ─────────────

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
  v_uploader   uuid;
  v_delta_up   int := 0;
  v_delta_down int := 0;
  v_new_up     int;
  v_new_down   int;
  v_uploader_name text;
BEGIN
  -- Lock the upload row
  SELECT id, user_id, branch_id, semester, status, category, subject_id
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

  -- Check for existing vote (toggle/change logic)
  SELECT id, vote_type INTO v_existing
  FROM public.votes
  WHERE upload_id = p_upload_id AND user_id = p_user_id;

  IF v_existing IS NOT NULL THEN
    IF v_existing.vote_type = p_vote_type THEN
      RETURN jsonb_build_object('error', 'You have already voted on this item');
    END IF;
    -- Changing vote: delete old, adjust deltas
    DELETE FROM public.votes WHERE id = v_existing.id;
    IF v_existing.vote_type = 'UP' THEN
      v_delta_up := -1;
    ELSE
      v_delta_down := -1;
    END IF;
  END IF;

  -- Validate vote type
  IF p_vote_type NOT IN ('UP', 'DOWN') THEN
    RETURN jsonb_build_object('error', 'Invalid vote type');
  END IF;

  -- Insert the new vote
  INSERT INTO public.votes (user_id, upload_id, vote_type)
  VALUES (p_user_id, p_upload_id, p_vote_type::vote_type);

  IF p_vote_type = 'UP' THEN
    v_delta_up := v_delta_up + 1;
  ELSE
    v_delta_down := v_delta_down + 1;
  END IF;

  -- Count current votes for this upload
  SELECT
    COALESCE(SUM(CASE WHEN vote_type = 'UP' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN vote_type = 'DOWN' THEN 1 ELSE 0 END), 0)
  INTO v_new_up, v_new_down
  FROM public.votes
  WHERE upload_id = p_upload_id;

  -- Calculate required votes: 5% of branch+semester students, minimum 1
  SELECT COUNT(*) INTO v_total
  FROM public.users
  WHERE branch_id = v_upload.branch_id
    AND semester = v_upload.semester
    AND is_banned = false;

  v_required := GREATEST(1, CEIL(v_total * 0.05));

  -- Check thresholds
  IF v_new_up >= v_required THEN
    -- VERIFIED: promote to live data
    UPDATE public.uploads
    SET status = 'VERIFIED'
    WHERE id = p_upload_id;

    -- Award +25 karma to uploader
    UPDATE public.users
    SET karma_points = karma_points + 25
    WHERE id = v_upload.user_id;

    -- Award +2 karma to each upvoter
    UPDATE public.users
    SET karma_points = karma_points + 2
    WHERE id IN (
      SELECT user_id FROM public.votes
      WHERE upload_id = p_upload_id AND vote_type = 'UP'
    );

    -- AUTO-SYNC: If this is a verified NOTE, add to study_materials
    IF v_upload.category = 'NOTES' AND v_upload.subject_id IS NOT NULL THEN
      SELECT full_name INTO v_uploader_name
      FROM public.users WHERE id = v_upload.user_id;

      INSERT INTO public.study_materials (
        upload_id, subject_id, branch_id, semester,
        title, file_url, uploader_id, uploader_name
      )
      SELECT
        u.id, u.subject_id, u.branch_id, u.semester,
        u.title_syllabus, u.file_url, u.user_id, v_uploader_name
      FROM public.uploads u
      WHERE u.id = p_upload_id;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'upvotes', v_new_up,
      'downvotes', v_new_down,
      'required', v_required,
      'status', 'VERIFIED',
      'message', 'Upload verified and promoted to live data'
    );

  ELSIF v_new_down >= v_required THEN
    -- PURGED: rejected by community
    UPDATE public.uploads
    SET status = 'PURGED'
    WHERE id = p_upload_id;

    -- Penalty -15 karma to uploader (min 0)
    UPDATE public.users
    SET karma_points = greatest(0, karma_points - 15)
    WHERE id = v_upload.user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'upvotes', v_new_up,
      'downvotes', v_new_down,
      'required', v_required,
      'status', 'PURGED',
      'message', 'Upload rejected by community'
    );
  END IF;

  -- Still pending — award +2 karma to voter
  UPDATE public.users
  SET karma_points = karma_points + 2
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'upvotes', v_new_up,
    'downvotes', v_new_down,
    'required', v_required,
    'status', 'UNVERIFIED',
    'message', 'Vote recorded'
  );
END;
$$;

-- Re-grant execute (in case of recreation)
GRANT EXECUTE ON FUNCTION public.submit_queue_vote(uuid, uuid, text) TO authenticated;
