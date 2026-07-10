-- Members: home_address column + full contact projection in get_members_with_auth.
-- The admin member profile page renders Emergency Contact (and now home address)
-- from this RPC's output; without these columns it always showed "—" even when
-- the data was saved. membership_applications already captures home_address —
-- this adds the equivalent on the member record itself.
--
-- RETURNS TABLE shape changes, so DROP + CREATE (CREATE OR REPLACE would fail
-- with SQLSTATE 42P13), then re-grant EXECUTE.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS home_address TEXT;

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
    m.whatsapp_opt_out_at
  FROM members m
  LEFT JOIN auth.users u ON u.id = m.auth_user_id
  WHERE m.venue_id = p_venue_id;
$$;

GRANT EXECUTE ON FUNCTION get_members_with_auth(UUID) TO authenticated, anon, service_role;
