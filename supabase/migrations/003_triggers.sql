-- ============================================================
-- Migration 003: Triggers & State Machine
-- Project: Open-Verse (Semester Saviours)
-- ============================================================

-- ─────────────────────────────────────────
-- 2.4.1  Generic updated_at maintenance
-- ─────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

create trigger trg_uploads_updated_at
  before update on uploads
  for each row execute function set_updated_at();

create trigger trg_branches_updated_at
  before update on branches
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────
-- 2.4.2  Net-score recomputation + state
--         transition + karma reward
--         (The core Trust Protocol trigger)
-- ─────────────────────────────────────────
create or replace function recompute_upload_score()
returns trigger
language plpgsql
security definer
as $$
declare
  v_upload_id uuid;
  v_delta     integer;
  v_status    upload_status;
  v_new_score integer;
  v_uploader  uuid;
begin
  -- Determine which row (insert or delete) and the score delta it represents
  if (tg_op = 'INSERT') then
    v_upload_id := new.upload_id;
    v_delta     := case when new.vote_type = 'UP' then 1 else -1 end;
  elsif (tg_op = 'DELETE') then
    v_upload_id := old.upload_id;
    v_delta     := case when old.vote_type = 'UP' then -1 else 1 end;
  end if;

  -- Lock the target upload row to serialize concurrent voters
  select status, net_score, user_id
    into v_status, v_new_score, v_uploader
    from uploads
    where id = v_upload_id
    for update;

  v_new_score := v_new_score + v_delta;
  update uploads set net_score = v_new_score where id = v_upload_id;

  -- Only transition state once, guarded by current status, to avoid re-firing rewards
  if v_status = 'UNVERIFIED' and v_new_score >= 5 then
    update uploads set status = 'VERIFIED' where id = v_upload_id;

    -- +10 karma to uploader
    update users
      set karma_points = karma_points + 10
      where id = v_uploader;

    -- +2 karma to every upvoter who voted correctly
    -- (voted UP on an item that became VERIFIED)
    update users
      set karma_points = karma_points + 2
      where id in (
        select user_id from votes
        where upload_id = v_upload_id and vote_type = 'UP'
      );

  elsif v_status = 'UNVERIFIED' and v_new_score <= -5 then
    update uploads set status = 'PURGED' where id = v_upload_id;

    -- -15 karma penalty to uploader (clamped at 0 — no negative karma)
    update users
      set karma_points = greatest(0, karma_points - 15)
      where id = v_uploader;
  end if;

  return null;
end;
$$;

create trigger trg_votes_recompute_score
  after insert or delete on votes
  for each row execute function recompute_upload_score();

-- ─────────────────────────────────────────
-- 2.4.3  Fair-Access Karma Gate
--         (AI feature unlock at >= 15 karma)
-- ─────────────────────────────────────────
create or replace function has_ai_access(
  p_user_id  uuid,
  p_threshold integer default 15
)
returns boolean
language sql
stable
as $$
  select karma_points >= p_threshold
    from users
    where id = p_user_id;
$$;

-- ─────────────────────────────────────────
-- 2.4.4  Self-vote lock
--         (defense-in-depth beyond RLS)
-- ─────────────────────────────────────────
create or replace function prevent_self_vote()
returns trigger language plpgsql as $$
begin
  if (select user_id from uploads where id = new.upload_id) = new.user_id then
    raise exception 'SELF_VOTE_FORBIDDEN: uploaders cannot vote on their own content';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_vote
  before insert on votes
  for each row execute function prevent_self_vote();

-- ─────────────────────────────────────────
-- 6.1.1  Admin headcount cap (max 3 admins)
-- ─────────────────────────────────────────
create or replace function enforce_admin_headcount()
returns trigger language plpgsql as $$
begin
  if new.role = 'SUPER_ADMIN' and
     (select count(*) from users where role = 'SUPER_ADMIN') >= 3 then
    raise exception 'ADMIN_HEADCOUNT_EXCEEDED: max 3 SUPER_ADMIN accounts permitted';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_admin_headcount
  before insert or update of role on users
  for each row when (new.role = 'SUPER_ADMIN')
  execute function enforce_admin_headcount();

-- ─────────────────────────────────────────
-- 6.6  Reusable rolling-window rate limiter
-- ─────────────────────────────────────────
create or replace function check_rate_limit(
  p_user_id   uuid,
  p_action    text,
  p_max_count integer,
  p_window    interval
)
returns boolean
language sql
stable
as $$
  select count(*) < p_max_count
    from action_log
    where user_id  = p_user_id
      and action   = p_action
      and created_at >= now() - p_window;
$$;
