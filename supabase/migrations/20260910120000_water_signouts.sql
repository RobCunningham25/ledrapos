-- Water sign-out / sign-in (float plan) safety system.
--
-- VCA members are required to log a float plan before going out on the water
-- (who, what boat, how many people, when they're due back) so the club can
-- raise the alarm if they don't return. Members can log one via the portal
-- (PortalWaterSignout) or by texting the club's WhatsApp number (see the
-- water_signout_ai_enabled flag below and the new AI-assistant tools). Both
-- paths write to the same water_signouts table so the admin board and the
-- overdue-alert cron treat them identically.
--
-- Phase 1: sign-out/sign-in + an overdue alert to a small duty-contact list
-- (water_safety_contacts). GPS/geofence-triggered "you're near the water"
-- push notifications are explicitly out of scope — not achievable from a web
-- portal (see project discussion); not attempted here.

-- ===== 1. water_signouts =====

CREATE TABLE IF NOT EXISTS water_signouts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id                UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  member_id               UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  member_boat_id          UUID REFERENCES member_boats(id) ON DELETE SET NULL,
  -- Snapshot text, independent of member_boat_id: covers a boat not yet
  -- registered in member_boats, a boat later renamed/deleted, or a free-text
  -- answer typed straight into WhatsApp.
  boat_name               TEXT NOT NULL,

  passenger_count         INTEGER NOT NULL DEFAULT 0 CHECK (passenger_count >= 0 AND passenger_count <= 50),
  passenger_note          TEXT,

  -- Contact snapshot at sign-out time, so the record (and any overdue alert)
  -- stays meaningful even if the member later edits their details.
  contact_phone           TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,

  departure_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_return_at      TIMESTAMPTZ NOT NULL,
  actual_return_at        TIMESTAMPTZ,

  status                  TEXT NOT NULL DEFAULT 'out' CHECK (status IN ('out', 'in')),

  -- Guards against re-alerting every cron tick once a trip is overdue.
  overdue_alert_sent_at   TIMESTAMPTZ,

  -- How the sign-out was logged, for reporting/debugging only.
  source                  TEXT NOT NULL DEFAULT 'portal' CHECK (source IN ('portal', 'whatsapp'))
);

CREATE INDEX IF NOT EXISTS idx_water_signouts_venue_status
  ON water_signouts (venue_id, status, expected_return_at);
CREATE INDEX IF NOT EXISTS idx_water_signouts_member
  ON water_signouts (member_id, status);

-- A member can only have one open trip at a time — enforced at the DB level,
-- not just in the UI/assistant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_water_signouts_one_open_per_member
  ON water_signouts (member_id)
  WHERE status = 'out';

-- ===== 2. water_safety_contacts =====
-- The duty-alert list an overdue trip pages. Admin-managed, at least a
-- couple of people so it isn't a single point of failure.

CREATE TABLE IF NOT EXISTS water_safety_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  name            TEXT NOT NULL,
  whatsapp_number TEXT,
  email           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT water_safety_contacts_has_channel
    CHECK (whatsapp_number IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_water_safety_contacts_venue
  ON water_safety_contacts (venue_id, sort_order)
  WHERE is_active;

-- ===== 3. venues: WhatsApp AI sign-out flag =====
-- Off everywhere by default. The whatsapp-ai-reply Edge Function is a single
-- live production function shared by every real member's WhatsApp thread —
-- there's no branch/preview environment for it — so the new sign-out tools
-- only enter a venue's tool list once this is explicitly flipped on, same
-- idea as the existing whatsapp_ai_enabled toggle.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS water_signout_ai_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ===== 4. RLS =====

ALTER TABLE water_signouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_safety_contacts ENABLE ROW LEVEL SECURITY;

-- Tighter than this codebase's usual permissive pattern on purpose — same
-- reasoning as can_write_event_rsvp: a plain auth.uid() IS NOT NULL WITH
-- CHECK would let any signed-in member edit or close out another member's
-- trip. Uses is_active_admin() (not "any admin_users row") since this is
-- safety-critical — an inactive/former admin account should not be able to
-- write here. SECURITY DEFINER so the lookups aren't themselves subject to
-- RLS. is_active_admin() is already defined by
-- 20260813120000_venue_email_senders.sql.
CREATE OR REPLACE FUNCTION public.can_write_water_signout(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM members m
            WHERE m.id = p_member_id AND m.auth_user_id = auth.uid()
         )
      OR public.is_active_admin();
$$;

CREATE POLICY "water_signouts_select" ON water_signouts
  FOR SELECT USING (can_write_water_signout(member_id));

CREATE POLICY "water_signouts_insert" ON water_signouts
  FOR INSERT WITH CHECK (can_write_water_signout(member_id));

-- FOR UPDATE needs both USING and WITH CHECK — USING alone updates 0 rows.
CREATE POLICY "water_signouts_update" ON water_signouts
  FOR UPDATE USING (can_write_water_signout(member_id))
  WITH CHECK (can_write_water_signout(member_id));

-- No DELETE policy — this is a safety audit trail, same spirit as never
-- deleting payment records. Only the service role (Edge Functions) can
-- remove rows, and nothing in this feature ever does.

-- water_safety_contacts: admin-only both directions, same pattern as
-- venue_email_senders — it decides who gets paged, not something a member
-- should be able to plant an address/number into.
CREATE POLICY "water_safety_contacts_select" ON water_safety_contacts
  FOR SELECT USING (public.is_active_admin());

CREATE POLICY "water_safety_contacts_insert" ON water_safety_contacts
  FOR INSERT WITH CHECK (public.is_active_admin());

CREATE POLICY "water_safety_contacts_update" ON water_safety_contacts
  FOR UPDATE USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE POLICY "water_safety_contacts_delete" ON water_safety_contacts
  FOR DELETE USING (public.is_active_admin());

-- New public-schema tables need explicit grants (RLS alone grants nothing).
GRANT SELECT, INSERT, UPDATE ON water_signouts TO authenticated;
GRANT ALL ON water_signouts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON water_safety_contacts TO authenticated;
GRANT ALL ON water_safety_contacts TO service_role;
GRANT EXECUTE ON FUNCTION public.can_write_water_signout(UUID) TO authenticated, service_role;

-- ===== 5. Seed VCA safety contacts =====
-- Placeholder — all three point at Rob (rob@dearziva.co.za) for testing.
-- Swap in the real duty-officer roster via the admin UI before this goes
-- live to members.

INSERT INTO water_safety_contacts (venue_id, name, whatsapp_number, email, sort_order)
SELECT v.id, 'Rob Cunningham (placeholder 1)', '+27822654357', 'rob@dearziva.co.za', 0
FROM venues v WHERE v.slug = 'vca'
ON CONFLICT DO NOTHING;

INSERT INTO water_safety_contacts (venue_id, name, whatsapp_number, email, sort_order)
SELECT v.id, 'Rob Cunningham (placeholder 2)', '+27822654357', 'rob@dearziva.co.za', 1
FROM venues v WHERE v.slug = 'vca'
ON CONFLICT DO NOTHING;

INSERT INTO water_safety_contacts (venue_id, name, whatsapp_number, email, sort_order)
SELECT v.id, 'Rob Cunningham (placeholder 3)', '+27822654357', 'rob@dearziva.co.za', 2
FROM venues v WHERE v.slug = 'vca'
ON CONFLICT DO NOTHING;
