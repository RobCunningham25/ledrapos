-- WhatsApp AI Assistant — schema for Claude Haiku-powered inbound replies.
--
-- Adds three pieces of state:
--   1. venues.whatsapp_ai_* columns: per-tenant feature flag + daily AI cap + model pin.
--   2. venue_documents: per-venue knowledge documents (constitution, club_rules, ...).
--      One row per (venue_id, kind). Returned in full by the matching read_<kind> tool.
--   3. whatsapp_followups: escalation queue. Created when the AI calls escalate_to_admin
--      or detects urgency in a member's message. Surfaced in the admin "Follow-ups" page.
--
-- See plan: C:\Users\MSI\.claude\plans\you-can-read-all-imperative-panda.md

-- ===== venues: AI assistant config =====

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS whatsapp_ai_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_ai_daily_cap  INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS whatsapp_ai_model      TEXT    NOT NULL DEFAULT 'claude-haiku-4-5-20251001';

-- ===== venue_documents: knowledge base content =====

CREATE TABLE IF NOT EXISTS venue_documents (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID         NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  kind              TEXT         NOT NULL,
  title             TEXT         NOT NULL,
  content_markdown  TEXT         NOT NULL DEFAULT '',
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by        UUID         REFERENCES admin_users(id) ON DELETE SET NULL,
  CONSTRAINT venue_documents_kind_check
    CHECK (kind IN ('constitution', 'club_rules')),
  UNIQUE (venue_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_venue_documents_venue_kind
  ON venue_documents (venue_id, kind);

ALTER TABLE venue_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_documents_select ON venue_documents;
CREATE POLICY venue_documents_select ON venue_documents
  FOR SELECT USING (true);

DROP POLICY IF EXISTS venue_documents_modify ON venue_documents;
CREATE POLICY venue_documents_modify ON venue_documents
  FOR ALL USING (true) WITH CHECK (auth.uid() IS NOT NULL);

-- Seed empty placeholder rows for VCA so the admin UI has something to render.
-- Content is intentionally empty; admins will fill it in.
INSERT INTO venue_documents (venue_id, kind, title, content_markdown)
SELECT v.id, 'constitution', 'Constitution', ''
  FROM venues v
 WHERE v.slug = 'vca'
   AND NOT EXISTS (
     SELECT 1 FROM venue_documents d
      WHERE d.venue_id = v.id AND d.kind = 'constitution'
   );

INSERT INTO venue_documents (venue_id, kind, title, content_markdown)
SELECT v.id, 'club_rules', 'Club Rules', ''
  FROM venues v
 WHERE v.slug = 'vca'
   AND NOT EXISTS (
     SELECT 1 FROM venue_documents d
      WHERE d.venue_id = v.id AND d.kind = 'club_rules'
   );

-- ===== whatsapp_followups: escalation queue =====

CREATE TABLE IF NOT EXISTS whatsapp_followups (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         UUID         NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  member_id        UUID         REFERENCES members(id) ON DELETE SET NULL,
  summary          TEXT         NOT NULL,
  original_message TEXT         NOT NULL,
  urgency          TEXT         NOT NULL DEFAULT 'normal',
  status           TEXT         NOT NULL DEFAULT 'open',
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID         REFERENCES admin_users(id) ON DELETE SET NULL,
  CONSTRAINT whatsapp_followups_urgency_check
    CHECK (urgency IN ('normal', 'urgent')),
  CONSTRAINT whatsapp_followups_status_check
    CHECK (status IN ('open', 'in_progress', 'resolved'))
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_followups_venue_status
  ON whatsapp_followups (venue_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_followups_member
  ON whatsapp_followups (member_id)
  WHERE member_id IS NOT NULL;

ALTER TABLE whatsapp_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_followups_select ON whatsapp_followups;
CREATE POLICY whatsapp_followups_select ON whatsapp_followups
  FOR SELECT USING (true);

DROP POLICY IF EXISTS whatsapp_followups_modify ON whatsapp_followups;
CREATE POLICY whatsapp_followups_modify ON whatsapp_followups
  FOR ALL USING (true) WITH CHECK (auth.uid() IS NOT NULL);
