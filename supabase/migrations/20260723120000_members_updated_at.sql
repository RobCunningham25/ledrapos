-- Add members.updated_at: a row-level "last updated" timestamp, auto-maintained
-- by a BEFORE UPDATE trigger. Surfaces in the admin Members list column and the
-- Member detail info card. Reflects ANY change to the row (admin edits plus system
-- updates such as WhatsApp consent/notice fields and portal linking).

-- ===== 1. Column, backfilled from created_at =====
-- Existing rows have never been "updated" in the tracked sense, so seed updated_at
-- to created_at (NOW() fallback for the handful of rows with a null created_at)
-- rather than stamping everyone as just-now.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE members
   SET updated_at = COALESCE(created_at, NOW())
 WHERE updated_at IS NOT NULL;  -- all rows; keeps the statement explicit

-- ===== 2. Auto-maintain on every UPDATE =====

CREATE OR REPLACE FUNCTION set_members_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_members_updated_at ON members;
CREATE TRIGGER trg_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION set_members_updated_at();

-- ===== 3. get_members_with_auth: project updated_at =====
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
  updated_at              TIMESTAMPTZ,
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
    m.updated_at,
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
