-- Migration 024: Fix missing GRANTs + Karma Queue RPC
-- Fixes 406 errors for class_schedule, verification_queue, queue_votes
-- Adds submit_queue_vote() function with 5% dynamic threshold

-- ─── 1. Fix missing GRANTs (causes 406 Not Acceptable) ──────────────────────
-- Tables created in migrations 013/014 had RLS policies but no GRANT statements.
-- PostgREST requires both to serve data to the authenticated role.

GRANT SELECT ON public.class_schedule     TO authenticated;
GRANT SELECT ON public.verification_queue TO authenticated;
GRANT SELECT ON public.queue_votes        TO authenticated;
GRANT SELECT, INSERT ON public.queue_votes TO authenticated;

-- Also ensure delete on votes works for vote retraction
GRANT DELETE ON public.votes TO authenticated;

-- ─── 2. submit_queue_vote RPC ────────────────────────────────────────────────
-- Handles voting on UNVERIFIED uploads with 5% dynamic threshold.
-- When upvotes >= 5% of branch+semester students → VERIFIED
-- When downvotes >= 5% of branch+semester students → PURGED

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

-- ─── 3. Grant execute ────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.submit_queue_vote(uuid, uuid, text) TO authenticated;
