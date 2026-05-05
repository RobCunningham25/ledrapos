-- WhatsApp foundation (Phase 0).
-- Adds opt-in/phone columns to members, daily-cap + business number to venues, and a
-- whatsapp_messages audit table that backs every outbound + inbound WhatsApp message.
-- Updates get_members_with_auth() so the admin Members page can render opt-in state.

-- ===== members: WhatsApp opt-in columns =====

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS whatsapp_number          TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in          BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_method   TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_last_inbound_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'members_whatsapp_opt_in_method_check'
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT members_whatsapp_opt_in_method_check
        CHECK (whatsapp_opt_in_method IS NULL
               OR whatsapp_opt_in_method IN ('admin_imported','invite_button','inbound_yes'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_members_whatsapp_number
  ON members (venue_id, whatsapp_number)
  WHERE whatsapp_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_members_whatsapp_optin
  ON members (venue_id, whatsapp_opt_in);

-- ===== venues: per-tenant WhatsApp config =====

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS whatsapp_business_number TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_daily_cap       INTEGER NOT NULL DEFAULT 200;

UPDATE venues
   SET whatsapp_business_number = '+27160040192'
 WHERE slug = 'vca'
   AND whatsapp_business_number IS NULL;

-- ===== whatsapp_messages: audit log of every send + inbound =====

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID         NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  member_id     UUID         REFERENCES members(id) ON DELETE SET NULL,
  direction     TEXT         NOT NULL CHECK (direction IN ('outbound','inbound')),
  to_number     TEXT,
  from_number   TEXT,
  template_sid  TEXT,
  body          TEXT,
  twilio_sid    TEXT,
  status        TEXT         NOT NULL DEFAULT 'queued',
  error         TEXT,
  related_kind  TEXT,
  related_id    UUID,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_msgs_venue_created
  ON whatsapp_messages (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_msgs_member
  ON whatsapp_messages (member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_msgs_twilio_sid
  ON whatsapp_messages (twilio_sid)
  WHERE twilio_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_msgs_today_outbound
  ON whatsapp_messages (venue_id, created_at)
  WHERE direction = 'outbound';

CREATE INDEX IF NOT EXISTS idx_wa_msgs_member_kind_created
  ON whatsapp_messages (member_id, related_kind, created_at DESC)
  WHERE member_id IS NOT NULL;

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_messages_select ON whatsapp_messages;
CREATE POLICY whatsapp_messages_select ON whatsapp_messages
  FOR SELECT USING (true);

DROP POLICY IF EXISTS whatsapp_messages_modify ON whatsapp_messages;
CREATE POLICY whatsapp_messages_modify ON whatsapp_messages
  FOR ALL USING (true) WITH CHECK (auth.uid() IS NOT NULL);

-- ===== get_members_with_auth: project the new columns =====
-- Same arg + return shape as before, plus the WhatsApp fields. Frontend Member
-- interfaces will be widened in Members.tsx + MemberDrawer.tsx in Phase 1.

CREATE OR REPLACE FUNCTION get_members_with_auth(p_venue_id UUID)
RETURNS TABLE (
  id                      UUID,
  venue_id                UUID,
  first_name              TEXT,
  last_name               TEXT,
  membership_number       TEXT,
  membership_type         TEXT,
  email                   TEXT,
  phone                   TEXT,
  partner_name            TEXT,
  partner_first_name      TEXT,
  partner_last_name       TEXT,
  is_active               BOOLEAN,
  created_at              TIMESTAMPTZ,
  auth_user_id            UUID,
  last_sign_in_at         TIMESTAMPTZ,
  whatsapp_number         TEXT,
  whatsapp_opt_in         BOOLEAN,
  whatsapp_opt_in_at      TIMESTAMPTZ,
  whatsapp_opt_in_method  TEXT,
  whatsapp_opt_out_at     TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.venue_id,
    m.first_name,
    m.last_name,
    m.membership_number,
    m.membership_type,
    m.email,
    m.phone,
    m.partner_name,
    m.partner_first_name,
    m.partner_last_name,
    m.is_active,
    m.created_at,
    m.auth_user_id,
    u.last_sign_in_at,
    m.whatsapp_number,
    m.whatsapp_opt_in,
    m.whatsapp_opt_in_at,
    m.whatsapp_opt_in_method,
    m.whatsapp_opt_out_at
  FROM members m
  LEFT JOIN auth.users u ON u.id = m.auth_user_id
  WHERE m.venue_id = p_venue_id;
$$;

GRANT EXECUTE ON FUNCTION get_members_with_auth(UUID) TO authenticated, anon, service_role;
