-- Phase A of Member Broadcast Email feature.
-- Schema + opt-out plumbing. UI and send pipeline land in later migrations.

-- ===== venues: per-tenant sender identity =====
ALTER TABLE venues
  ADD COLUMN broadcast_from_email TEXT;

UPDATE venues
SET broadcast_from_email = 'info@vaalcruising.co.za'
WHERE slug = 'vca';

-- ===== members: opt-out + per-member unsubscribe token =====
ALTER TABLE members
  ADD COLUMN email_opt_out      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN email_opt_out_at   TIMESTAMPTZ,
  ADD COLUMN unsubscribe_token  UUID        NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE members
  ADD CONSTRAINT members_unsubscribe_token_unique UNIQUE (unsubscribe_token);

CREATE INDEX members_venue_optout_idx
  ON members (venue_id, email_opt_out)
  WHERE is_active AND email IS NOT NULL;

-- ===== email_broadcasts: one row per campaign =====
CREATE TABLE email_broadcasts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id          UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_by        UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  subject           TEXT NOT NULL,
  body_html         TEXT NOT NULL,
  body_text         TEXT,
  attachment_paths  JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipient_filter  JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','queued','sending','sent','partial','failed','cancelled')),
  total_recipients  INTEGER NOT NULL DEFAULT 0,
  sent_count        INTEGER NOT NULL DEFAULT 0,
  failed_count      INTEGER NOT NULL DEFAULT 0,
  skipped_count     INTEGER NOT NULL DEFAULT 0,
  scheduled_for     TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX email_broadcasts_venue_created_idx
  ON email_broadcasts (venue_id, created_at DESC);

ALTER TABLE email_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_broadcasts_select_all" ON email_broadcasts
  FOR SELECT USING (true);
CREATE POLICY "email_broadcasts_insert_authenticated" ON email_broadcasts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "email_broadcasts_update_authenticated" ON email_broadcasts
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ===== broadcast_recipients: per-recipient delivery state =====
CREATE TABLE broadcast_recipients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id        UUID NOT NULL REFERENCES email_broadcasts(id) ON DELETE CASCADE,
  member_id           UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','sending','sent','failed','bounced','complained','opted_out_skipped','no_email_skipped')),
  resend_message_id   TEXT,
  error               TEXT,
  attempts            SMALLINT NOT NULL DEFAULT 0,
  sent_at             TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT broadcast_recipients_unique UNIQUE (broadcast_id, member_id)
);

CREATE INDEX broadcast_recipients_pending_idx
  ON broadcast_recipients (broadcast_id, status)
  WHERE status IN ('pending','sending');

CREATE INDEX broadcast_recipients_resend_msg_idx
  ON broadcast_recipients (resend_message_id)
  WHERE resend_message_id IS NOT NULL;

ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broadcast_recipients_select_all" ON broadcast_recipients
  FOR SELECT USING (true);
CREATE POLICY "broadcast_recipients_insert_authenticated" ON broadcast_recipients
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "broadcast_recipients_update_authenticated" ON broadcast_recipients
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
