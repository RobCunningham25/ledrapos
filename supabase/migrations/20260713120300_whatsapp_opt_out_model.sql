-- WhatsApp consent flips from opt-IN to opt-OUT (mirrors the LedraDesk/Pulse model).
-- Every member is subscribed unless they explicitly opt out (reply STOP, tap the
-- old "No thanks" button, or an admin flips them in MemberDrawer). whatsapp_opt_in
-- keeps its name but now means "not opted out"; whatsapp_opt_out_at is the source
-- of truth for an explicit opt-out.
--
-- Also adds members.whatsapp_notice_sent_at: one-time courtesy notice ("this is
-- VCA, we'll send you tab reminders and club updates, reply STOP to opt out")
-- sent via the repurposed send-whatsapp-optin-invite function. Backfilled from
-- whatsapp_messages for members who already received the old opt-in invite.

-- ===== 1. Widen the opt_in_method values =====
-- 'assumed'       — subscribed by the opt-out model itself (this backfill / new rows)
-- 'admin_cleared' — an admin cleared a previous opt-out in MemberDrawer

ALTER TABLE members DROP CONSTRAINT IF EXISTS members_whatsapp_opt_in_method_check;
ALTER TABLE members
  ADD CONSTRAINT members_whatsapp_opt_in_method_check
    CHECK (whatsapp_opt_in_method IS NULL
           OR whatsapp_opt_in_method IN
              ('admin_imported','invite_button','inbound_yes','assumed','admin_cleared'));

-- ===== 2. Courtesy-notice tracking =====

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS whatsapp_notice_sent_at TIMESTAMPTZ;

-- ===== 3. New members are subscribed by default =====

ALTER TABLE members ALTER COLUMN whatsapp_opt_in SET DEFAULT TRUE;

-- ===== 4. Backfill: everyone without an explicit opt-out is subscribed =====

UPDATE members
   SET whatsapp_opt_in        = TRUE,
       whatsapp_opt_in_at     = COALESCE(whatsapp_opt_in_at, NOW()),
       whatsapp_opt_in_method = COALESCE(whatsapp_opt_in_method, 'assumed')
 WHERE whatsapp_opt_in = FALSE
   AND whatsapp_opt_out_at IS NULL;

-- ===== 5. Members who already got the old opt-in invite don't need the notice =====

UPDATE members m
   SET whatsapp_notice_sent_at = sub.first_invite
  FROM (
    SELECT member_id, MIN(created_at) AS first_invite
      FROM whatsapp_messages
     WHERE related_kind = 'optin_invite'
       AND direction = 'outbound'
       AND status IN ('queued','sent','delivered','read')
       AND member_id IS NOT NULL
     GROUP BY member_id
  ) sub
 WHERE m.id = sub.member_id
   AND m.whatsapp_notice_sent_at IS NULL;

-- ===== 6. get_members_with_auth: project whatsapp_notice_sent_at =====
-- RETURNS TABLE shape changes, so DROP + CREATE (CREATE OR REPLACE would fail
-- with SQLSTATE 42P13), then re-grant EXECUTE.

DROP FUNCTION IF EXISTS get_members_with_auth(UUID);

CREATE FUNCTION get_members_with_auth(p_venue_id UUID)
RETURNS TABLE (
  id                      UUID,
  venue_id                UUID,
  first_name              TEXT,
  last_name               TEXT,
  membership_number       TEXT,
  membership_type         TEXT,
  email                   TEXT,
  phone                   TEXT,
  home_address            TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  partner_name            TEXT,
  partner_first_name      TEXT,
  partner_last_name       TEXT,
  partner_email           TEXT,
  partner_phone           TEXT,
  is_active               BOOLEAN,
  created_at              TIMESTAMPTZ,
  auth_user_id            UUID,
  last_sign_in_at         TIMESTAMPTZ,
  whatsapp_number         TEXT,
  whatsapp_opt_in         BOOLEAN,
  whatsapp_opt_in_at      TIMESTAMPTZ,
  whatsapp_opt_in_method  TEXT,
  whatsapp_opt_out_at     TIMESTAMPTZ,
  whatsapp_notice_sent_at TIMESTAMPTZ
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
    m.home_address,
    m.emergency_contact_name,
    m.emergency_contact_phone,
    m.partner_name,
    m.partner_first_name,
    m.partner_last_name,
    m.partner_email,
    m.partner_phone,
    m.is_active,
    m.created_at,
    m.auth_user_id,
    u.last_sign_in_at,
    m.whatsapp_number,
    m.whatsapp_opt_in,
    m.whatsapp_opt_in_at,
    m.whatsapp_opt_in_method,
    m.whatsapp_opt_out_at,
    m.whatsapp_notice_sent_at
  FROM members m
  LEFT JOIN auth.users u ON u.id = m.auth_user_id
  WHERE m.venue_id = p_venue_id;
$$;

GRANT EXECUTE ON FUNCTION get_members_with_auth(UUID) TO authenticated, anon, service_role;
