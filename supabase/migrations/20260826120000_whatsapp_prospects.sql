-- WhatsApp prospects — lets non-members (people enquiring about joining the
-- club) hold a conversation with the WhatsApp AI assistant, without needing a
-- `members` row (membership_number is NOT NULL + UNIQUE, so a real member
-- record can't be faked for someone who hasn't joined).
--
-- whatsapp_prospects is the prospect analog of the WhatsApp-relevant columns
-- already on `members` (whatsapp_last_inbound_at, opt-out, etc.) — it's what
-- lets the 24h session-window check and the escalation flow work for an
-- unmatched inbound number instead of the message just being dropped.
--
-- Also adds `ai_paused` to both `members` and the new prospects table — an
-- admin "take over this conversation" flag that suppresses the AI hand-off in
-- whatsapp-webhook while a human is replying manually from the admin UI.

-- ===== whatsapp_prospects =====

CREATE TABLE IF NOT EXISTS whatsapp_prospects (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  whatsapp_number TEXT        NOT NULL,
  display_name    TEXT,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_inbound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opted_out       BOOLEAN     NOT NULL DEFAULT FALSE,
  opted_out_at    TIMESTAMPTZ,
  ai_paused       BOOLEAN     NOT NULL DEFAULT FALSE,
  ai_paused_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (venue_id, whatsapp_number)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_prospects_venue
  ON whatsapp_prospects (venue_id, last_inbound_at DESC);

ALTER TABLE whatsapp_prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_prospects_select ON whatsapp_prospects;
CREATE POLICY whatsapp_prospects_select ON whatsapp_prospects
  FOR SELECT USING (true);

DROP POLICY IF EXISTS whatsapp_prospects_modify ON whatsapp_prospects;
CREATE POLICY whatsapp_prospects_modify ON whatsapp_prospects
  FOR ALL USING (true) WITH CHECK (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_prospects TO authenticated;

-- ===== members: human-takeover flag =====

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS ai_paused    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_paused_at TIMESTAMPTZ;

-- ===== whatsapp_messages: prospect attribution =====

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES whatsapp_prospects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_msgs_prospect
  ON whatsapp_messages (prospect_id)
  WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_msgs_prospect_kind_created
  ON whatsapp_messages (prospect_id, related_kind, created_at DESC)
  WHERE prospect_id IS NOT NULL;

-- ===== whatsapp_followups: prospect attribution =====

ALTER TABLE whatsapp_followups
  ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES whatsapp_prospects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_followups_prospect
  ON whatsapp_followups (prospect_id)
  WHERE prospect_id IS NOT NULL;

-- Exactly one of member_id / prospect_id must be set — a follow-up always
-- belongs to a known member or a prospect, never both, never neither.
-- NOT VALID: at least one pre-existing row has member_id NULL (predating this
-- column entirely, from before prospects existed) — enforce for new/updated
-- rows only rather than fail the migration over stale data.
ALTER TABLE whatsapp_followups DROP CONSTRAINT IF EXISTS whatsapp_followups_contact_check;
ALTER TABLE whatsapp_followups
  ADD CONSTRAINT whatsapp_followups_contact_check
    CHECK (num_nonnulls(member_id, prospect_id) = 1) NOT VALID;

-- ===== venues: staff WhatsApp alert number =====
-- Where to send a best-effort WhatsApp ping when a new follow-up is logged.
-- Best-effort because it's a free-form send: it only lands if that number has
-- an open 24h session with the club's WhatsApp number (i.e. staff have texted
-- it recently). The email alert (venues.contact_email) is the reliable
-- channel; this is a bonus if the window happens to be open. A proper
-- any-time alert needs a Meta-approved utility template, which is a Twilio/
-- Meta submission outside this codebase.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS whatsapp_staff_alert_number TEXT;
