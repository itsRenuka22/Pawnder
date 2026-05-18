-- Pawnder: Pet Voting App Schema
-- Idempotent: safe to run multiple times

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  breed       text,
  species     text        NOT NULL,
  description text,
  image_url   text        NOT NULL,
  age_label   text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.votes (
  id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id  uuid        NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  choice   text        NOT NULL CHECK (choice IN ('yes', 'no')),
  voted_at timestamptz DEFAULT now(),
  UNIQUE (user_id, item_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS votes_user_id_idx ON public.votes (user_id);
CREATE INDEX IF NOT EXISTS votes_item_id_idx ON public.votes (item_id);

-- ============================================================
-- VIEW
-- ============================================================

CREATE OR REPLACE VIEW public.results AS
SELECT
  item_id,
  COUNT(*) FILTER (WHERE choice = 'yes')                        AS yes_count,
  COUNT(*) FILTER (WHERE choice = 'no')                         AS no_count,
  COUNT(*)                                                       AS total_votes,
  ROUND(
    COUNT(*) FILTER (WHERE choice = 'yes') * 100.0 / NULLIF(COUNT(*), 0),
    2
  )                                                              AS yes_percentage
FROM public.votes
GROUP BY item_id;

CREATE OR REPLACE VIEW public.analytics AS
SELECT
  COUNT(*)                                                              AS total_votes,
  COUNT(*) FILTER (WHERE voted_at >= now() - INTERVAL '24 hours')      AS active_sessions_24h,
  COUNT(*) FILTER (WHERE voted_at >= now() - INTERVAL '1 hour')        AS votes_last_hour,
  COUNT(DISTINCT user_id)                                               AS total_voters,
  COUNT(DISTINCT user_id)
    FILTER (WHERE voted_at >= now() - INTERVAL '24 hours')             AS active_voters_24h
FROM public.votes;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating (idempotent)
DROP POLICY IF EXISTS "items_public_read"          ON public.items;
DROP POLICY IF EXISTS "votes_authenticated_insert"  ON public.votes;
DROP POLICY IF EXISTS "votes_own_select"            ON public.votes;

-- items: anyone can read
CREATE POLICY "items_public_read"
  ON public.items
  FOR SELECT
  USING (true);

-- votes: authenticated users can insert their own vote
CREATE POLICY "votes_authenticated_insert"
  ON public.votes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- votes: authenticated users can read only their own votes
CREATE POLICY "votes_own_select"
  ON public.votes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- results view: grant public read via a policy on the underlying table
-- Views inherit the caller's permissions; grant SELECT so anon can query results
GRANT SELECT ON public.results   TO anon, authenticated;
GRANT SELECT ON public.analytics TO anon, authenticated;
