-- Refine members.updated_at so it means "membership details last changed" rather
-- than "row last touched". Two problems with the first cut (20260723120000):
--
--   1. It bumped on ANY column write, including whatsapp_last_inbound_at — which is
--      stamped on every inbound WhatsApp message. A member who chats often would show
--      a fresh "last updated" daily even though none of their details changed.
--   2. Detail edits live in child tables too (sites, boat sheds, boats, children).
--      Adding a boat never touches the members row, so it went untracked.
--
-- Fix: (a) guard the members trigger to fire only when a real detail column changes,
-- and (b) cascade child-table add/edit/remove back onto the parent member. This is
-- DB-level, so it covers edits by admin (MemberDrawer / Details tab) AND by members
-- (portal My Details) alike.

-- ===== 1. members trigger: only bump when a detail column actually changed =====
-- Detail columns = anything a person edits about the membership. Deliberately excludes
-- consent/audit/system fields: whatsapp_opt_in / _at / _method / _out_at,
-- whatsapp_notice_sent_at, whatsapp_last_inbound_at, email_opt_out / _at,
-- auth_user_id, unsubscribe_token, created_at.
-- The whatsapp_number field IS a contact detail, so it stays in.
--
-- The ELSIF lets an explicit updated_at write survive — that's how the child-table
-- cascade below (which sets updated_at = NOW()) gets through this guard.

CREATE OR REPLACE FUNCTION set_members_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (
       NEW.first_name              IS DISTINCT FROM OLD.first_name
    OR NEW.last_name               IS DISTINCT FROM OLD.last_name
    OR NEW.email                   IS DISTINCT FROM OLD.email
    OR NEW.phone                   IS DISTINCT FROM OLD.phone
    OR NEW.home_address            IS DISTINCT FROM OLD.home_address
    OR NEW.emergency_contact_name  IS DISTINCT FROM OLD.emergency_contact_name
    OR NEW.emergency_contact_phone IS DISTINCT FROM OLD.emergency_contact_phone
    OR NEW.partner_name            IS DISTINCT FROM OLD.partner_name
    OR NEW.partner_first_name      IS DISTINCT FROM OLD.partner_first_name
    OR NEW.partner_last_name       IS DISTINCT FROM OLD.partner_last_name
    OR NEW.partner_email           IS DISTINCT FROM OLD.partner_email
    OR NEW.partner_phone           IS DISTINCT FROM OLD.partner_phone
    OR NEW.membership_number       IS DISTINCT FROM OLD.membership_number
    OR NEW.membership_type         IS DISTINCT FROM OLD.membership_type
    OR NEW.is_active               IS DISTINCT FROM OLD.is_active
    OR NEW.whatsapp_number         IS DISTINCT FROM OLD.whatsapp_number
  ) THEN
    NEW.updated_at := NOW();
  ELSIF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    -- Explicit bump (e.g. the child-table cascade) — leave NEW.updated_at as set.
    NULL;
  ELSE
    -- A non-detail write (WhatsApp inbound, consent flip, portal link, etc.):
    -- keep the existing timestamp.
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger trg_members_updated_at already exists from 20260723120000; the CREATE OR
-- REPLACE above swaps in the new body, so no trigger change is needed here.

-- ===== 2. Child-table cascade =====
-- SECURITY DEFINER so the cascade always lands regardless of which role edited the
-- child row (admin service-role, authenticated portal member, etc.).

CREATE OR REPLACE FUNCTION bump_member_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE members
     SET updated_at = NOW()
   WHERE id = COALESCE(NEW.member_id, OLD.member_id);
  RETURN NULL;  -- AFTER trigger: return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_member_sites_bump ON member_sites;
CREATE TRIGGER trg_member_sites_bump
  AFTER INSERT OR UPDATE OR DELETE ON member_sites
  FOR EACH ROW EXECUTE FUNCTION bump_member_updated_at();

DROP TRIGGER IF EXISTS trg_member_boat_sheds_bump ON member_boat_sheds;
CREATE TRIGGER trg_member_boat_sheds_bump
  AFTER INSERT OR UPDATE OR DELETE ON member_boat_sheds
  FOR EACH ROW EXECUTE FUNCTION bump_member_updated_at();

DROP TRIGGER IF EXISTS trg_member_boats_bump ON member_boats;
CREATE TRIGGER trg_member_boats_bump
  AFTER INSERT OR UPDATE OR DELETE ON member_boats
  FOR EACH ROW EXECUTE FUNCTION bump_member_updated_at();

DROP TRIGGER IF EXISTS trg_member_children_bump ON member_children;
CREATE TRIGGER trg_member_children_bump
  AFTER INSERT OR UPDATE OR DELETE ON member_children
  FOR EACH ROW EXECUTE FUNCTION bump_member_updated_at();
