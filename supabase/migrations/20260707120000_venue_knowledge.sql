-- venue_knowledge — granular, searchable knowledge base for the WhatsApp AI assistant.
--
-- Design goals (see redesign session 2026-07-07):
--   * Breadth: many small, self-contained entries instead of two monolithic documents.
--   * Cost: the assistant retrieves the 3-4 matching entries per question (a few
--     hundred tokens) rather than dumping a whole constitution into Haiku's context.
--   * No new vendor: ranking uses native Postgres full-text search (tsvector +
--     websearch_to_tsquery). pgvector semantic search is a documented future upgrade,
--     not required now.
--
-- One row = one answer-sized entry (~50-250 words): an FAQ, a facility description,
-- a procedure, a fee, a policy, a contact-routing rule, a piece of history.
--
-- `category` is intentionally free-form TEXT (not an enum) so content is not
-- constrained to a fixed taxonomy — real member questions drive what gets added.
--
-- The constitution/club_rules documents in venue_documents are kept as-is for
-- verbatim governance lookups; this table covers everything else (and, over time,
-- chunked clauses from those documents can be added here too).

CREATE TABLE IF NOT EXISTS venue_knowledge (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  category     TEXT        NOT NULL DEFAULT 'general',
  title        TEXT        NOT NULL,
  body         TEXT        NOT NULL DEFAULT '',
  -- Extra synonyms / alternate phrasings to boost recall, e.g. for a "bar hours"
  -- entry: "opening times, closing time, when does the bar open, last call".
  keywords     TEXT        NOT NULL DEFAULT '',
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  -- Provenance so admins can trace an answer: 'constitution §4', 'newsletter 2019',
  -- 'committee handover', 'NotebookLM', etc.
  source       TEXT,
  -- Tiebreaker when two entries rank equally on text relevance (higher = preferred).
  priority     INTEGER     NOT NULL DEFAULT 0,
  is_published BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   UUID        REFERENCES admin_users(id) ON DELETE SET NULL,

  -- Weighted full-text search vector, maintained by a BEFORE INSERT/UPDATE trigger
  -- (below). A plain column + trigger is used instead of a GENERATED column because
  -- to_tsvector with a text config name is only STABLE, which a generated column
  -- rejects (42P17). The trigger has no immutability requirement.
  search_tsv   TSVECTOR
);

-- Title matches rank highest (A), synonyms/tags next (B), body last (C).
CREATE OR REPLACE FUNCTION venue_knowledge_tsv_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.keywords, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.body, '')), 'C');
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venue_knowledge_tsv ON venue_knowledge;
CREATE TRIGGER trg_venue_knowledge_tsv
  BEFORE INSERT OR UPDATE ON venue_knowledge
  FOR EACH ROW EXECUTE FUNCTION venue_knowledge_tsv_update();

CREATE INDEX IF NOT EXISTS idx_venue_knowledge_search
  ON venue_knowledge USING GIN (search_tsv);

CREATE INDEX IF NOT EXISTS idx_venue_knowledge_venue_published
  ON venue_knowledge (venue_id, is_published);

ALTER TABLE venue_knowledge ENABLE ROW LEVEL SECURITY;

-- Permissive pattern consistent with the rest of the codebase: cross-venue
-- isolation is enforced in code (edge function scopes by venue_id; admin UI
-- queries .eq('venue_id', venueId)). The assistant reads via the service-role
-- key and bypasses RLS entirely.
DROP POLICY IF EXISTS venue_knowledge_select ON venue_knowledge;
CREATE POLICY venue_knowledge_select ON venue_knowledge
  FOR SELECT USING (true);

DROP POLICY IF EXISTS venue_knowledge_modify ON venue_knowledge;
CREATE POLICY venue_knowledge_modify ON venue_knowledge
  FOR ALL USING (true) WITH CHECK (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON venue_knowledge TO authenticated;

-- ===== Knowledge-gap capture =====
-- When the assistant escalates or fails, record WHY on the follow-up so admins get
-- a "questions we couldn't answer" list. That list is the content roadmap: real
-- gaps become new venue_knowledge entries. Existing rows default to 'escalation'.
ALTER TABLE whatsapp_followups
  ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT 'escalation';

CREATE INDEX IF NOT EXISTS idx_whatsapp_followups_reason
  ON whatsapp_followups (venue_id, reason, created_at DESC);

-- ===== Ranked search RPC =====
-- PostgREST can filter on a tsvector but cannot ORDER BY ts_rank, so the assistant
-- calls this function. Returns the top matches for a venue, ranked by weighted text
-- relevance, then priority, then recency. p_limit is clamped to [1, 8].
CREATE OR REPLACE FUNCTION search_venue_knowledge(
  p_venue_id UUID,
  p_query    TEXT,
  p_limit    INTEGER DEFAULT 4
)
RETURNS TABLE (id UUID, category TEXT, title TEXT, body TEXT, source TEXT, rank REAL)
LANGUAGE sql STABLE AS $$
  WITH q AS (SELECT websearch_to_tsquery('english', p_query) AS query)
  SELECT k.id, k.category, k.title, k.body, k.source,
         ts_rank_cd(k.search_tsv, q.query) AS rank
    FROM venue_knowledge k, q
   WHERE k.venue_id = p_venue_id
     AND k.is_published
     AND k.search_tsv @@ q.query
   ORDER BY rank DESC, k.priority DESC, k.updated_at DESC
   LIMIT GREATEST(1, LEAST(coalesce(p_limit, 4), 8));
$$;

GRANT EXECUTE ON FUNCTION search_venue_knowledge(UUID, TEXT, INTEGER)
  TO authenticated, service_role;
