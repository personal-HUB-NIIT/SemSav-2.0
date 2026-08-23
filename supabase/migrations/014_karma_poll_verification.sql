-- Migration 014: Karma Poll Verification System
-- Tables: verification_queue, queue_votes
-- Function: handle_queue_vote (5% dynamic threshold, karma awards)

-- ─── 1. verification_queue ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.verification_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  semester     int  NOT NULL,
  item_type    text NOT NULL CHECK (item_type IN ('NOTE','ASSIGNMENT','TEST_DATE','PYQ')),
  title        text NOT NULL,
  description  text,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  upvotes      int  NOT NULL DEFAULT 0,
  downvotes    int  NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.verification_queue ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read queue items (for their branch)
CREATE POLICY "Authenticated users can read verification_queue"
ON public.verification_queue FOR SELECT
TO authenticated
USING (true);

-- Uploader can insert their own items
CREATE POLICY "Users can insert own verification_queue items"
ON public.verification_queue FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = uploader_id);

-- Only function can update status/votes (via SECURITY DEFINER)
-- No direct update policy needed for regular users

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vq_branch_sem_status
  ON public.verification_queue (branch_id, semester, status);
CREATE INDEX IF NOT EXISTS idx_vq_uploader
  ON public.verification_queue (uploader_id);

-- ─── 2. queue_votes ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.queue_votes (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id  uuid NOT NULL REFERENCES public.verification_queue(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_type text NOT NULL CHECK (vote_type IN ('UP','DOWN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_id, user_id)
);

ALTER TABLE public.queue_votes ENABLE ROW LEVEL SECURITY;

-- Users can read all votes (needed for UI state)
CREATE POLICY "Authenticated users can read queue_votes"
ON public.queue_votes FOR SELECT
TO authenticated
USING (true);

-- Users can insert their own vote (function also handles this via SECURITY DEFINER)
CREATE POLICY "Users can insert own queue_votes"
ON public.queue_votes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qv_queue ON public.queue_votes (queue_id);
CREATE INDEX IF NOT EXISTS idx_qv_user  ON public.queue_votes (user_id);

-- ─── 3. handle_queue_vote function ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_queue_vote(
  p_queue_id  uuid,
  p_user_id   uuid,
  p_vote_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue       record;
  v_existing    record;
  v_total       int;
  v_required    int;
  v_delta_up    int := 0;
  v_delta_down  int := 0;
BEGIN
  -- Lock the queue row to prevent races
  SELECT * INTO v_queue
  FROM public.verification_queue
  WHERE id = p_queue_id
  FOR UPDATE;

  IF v_queue IS NULL THEN
    RETURN jsonb_build_object('error', 'Queue item not found');
  END IF;

  IF v_queue.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'This item is no longer pending');
  END IF;

  -- Check for existing vote
  SELECT * INTO v_existing
  FROM public.queue_votes
  WHERE queue_id = p_queue_id AND user_id = p_user_id;

  IF v_existing IS NOT NULL THEN
    IF v_existing.vote_type = p_vote_type THEN
      RETURN jsonb_build_object('error', 'You have already voted on this item');
    END IF;
    -- Changing vote: delete old, adjust deltas
    DELETE FROM public.queue_votes WHERE id = v_existing.id;
    IF v_existing.vote_type = 'UP' THEN
      v_delta_up := -1;
    ELSE
      v_delta_down := -1;
    END IF;
  END IF;

  -- Insert the new vote
  INSERT INTO public.queue_votes (queue_id, user_id, vote_type)
  VALUES (p_queue_id, p_user_id, p_vote_type);

  IF p_vote_type = 'UP' THEN
    v_delta_up := v_delta_up + 1;
  ELSE
    v_delta_down := v_delta_down + 1;
  END IF;

  -- Update counts
  UPDATE public.verification_queue
  SET upvotes   = upvotes + v_delta_up,
      downvotes = downvotes + v_delta_down
  WHERE id = p_queue_id
  RETURNING * INTO v_queue;

  -- Calculate required votes: 5% of branch+semester students, minimum 1
  SELECT COUNT(*) INTO v_total
  FROM public.users
  WHERE branch_id = v_queue.branch_id
    AND semester = v_queue.semester
    AND is_banned = false;

  v_required := GREATEST(1, CEIL(v_total * 0.05));

  -- Check thresholds
  IF v_queue.upvotes >= v_required THEN
    UPDATE public.verification_queue
    SET status = 'verified'
    WHERE id = p_queue_id;

    -- Award karma to uploader
    UPDATE public.users
    SET karma_points = karma_points + 25
    WHERE id = v_queue.uploader_id;
  ELSIF v_queue.downvotes >= v_required THEN
    UPDATE public.verification_queue
    SET status = 'rejected'
    WHERE id = p_queue_id;
  END IF;

  -- Award +2 karma to voter
  UPDATE public.users
  SET karma_points = karma_points + 2
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'upvotes',    v_queue.upvotes,
    'downvotes',  v_queue.downvotes,
    'required',   v_required,
    'status',     v_queue.status
  );
END;
$$;

-- ─── 4. Grant execute to authenticated role ─────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.handle_queue_vote(uuid, uuid, text) TO authenticated;

-- ─── 5. Convenience view: unvoted pending count per branch+semester ─────────────

CREATE OR REPLACE VIEW public.v_unvoted_queue_count AS
SELECT
  vq.branch_id,
  vq.semester,
  COUNT(*) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM public.queue_votes qv
      WHERE qv.queue_id = vq.id AND qv.user_id = auth.uid()
    )
  )::int AS unvoted_count
FROM public.verification_queue vq
WHERE vq.status = 'pending'
GROUP BY vq.branch_id, vq.semester;

GRANT SELECT ON public.v_unvoted_queue_count TO authenticated;

-- ─── 6. Index for leaderboard query ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_u_karma ON public.users (karma_points DESC);
