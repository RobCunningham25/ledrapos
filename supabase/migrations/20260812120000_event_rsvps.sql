-- Event RSVPs.
--
-- Admins flag an event as "requires RSVP" (optionally with a cut-off N days
-- before the event). Portal members then respond attending / not attending
-- with an adults + children head count and an optional note (dietary
-- requirements, etc.). Admins read the attendee list per occurrence and
-- export it as CSV for the caterer.
--
-- RSVPs are keyed on (event_id, occurrence_date) — NOT on event_id alone —
-- because club_events rows can be recurring series. A weekly braai needs a
-- separate RSVP per week, and event_exceptions can cancel individual dates.
--
-- This is deliberately a separate table from `bookings`: bookings are
-- accommodation records and must never carry an event_id.

-- ===== 1. club_events: RSVP configuration =====

ALTER TABLE club_events
  ADD COLUMN IF NOT EXISTS requires_rsvp BOOLEAN NOT NULL DEFAULT FALSE,
  -- NULL = RSVPs stay open until the end of the event day. A number closes
  -- them N days earlier. Stored as a relative offset rather than an absolute
  -- date so it works for every occurrence of a recurring series.
  ADD COLUMN IF NOT EXISTS rsvp_close_days_before INTEGER
    CHECK (rsvp_close_days_before IS NULL OR rsvp_close_days_before >= 0);

-- ===== 2. event_rsvps =====

CREATE TABLE IF NOT EXISTS event_rsvps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,

  status          TEXT NOT NULL DEFAULT 'attending'
                  CHECK (status IN ('attending', 'not_attending')),
  -- Head count for catering. Adults includes the member themselves, so an
  -- attending RSVP always has adults >= 1; a not_attending RSVP is zeroed.
  adults          INTEGER NOT NULL DEFAULT 1 CHECK (adults >= 0 AND adults <= 50),
  children        INTEGER NOT NULL DEFAULT 0 CHECK (children >= 0 AND children <= 50),
  note            TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One RSVP per member per occurrence; changing your mind updates in place.
  CONSTRAINT event_rsvps_unique_per_occurrence
    UNIQUE (event_id, occurrence_date, member_id)
);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_occurrence
  ON event_rsvps (venue_id, event_id, occurrence_date);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_member
  ON event_rsvps (member_id, occurrence_date);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_venue_date
  ON event_rsvps (venue_id, occurrence_date);

CREATE OR REPLACE FUNCTION set_event_rsvps_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_rsvps_updated_at ON event_rsvps;
CREATE TRIGGER trg_event_rsvps_updated_at
  BEFORE UPDATE ON event_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION set_event_rsvps_updated_at();

-- ===== 3. RLS =====

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

-- Writes are tighter than this codebase's usual permissive pattern on purpose:
-- a plain `auth.uid() IS NOT NULL` WITH CHECK would let any signed-in member
-- overwrite or delete another member's RSVP straight from the browser.
-- SECURITY DEFINER so the lookups aren't themselves subject to RLS.
CREATE OR REPLACE FUNCTION public.can_write_event_rsvp(p_member_id UUID)
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
      OR EXISTS (
           SELECT 1 FROM admin_users a
            WHERE a.auth_user_id = auth.uid()
         );
$$;

-- Any signed-in user can read: members see the head count for an event they're
-- deciding on, admins see the full attendee list. Cross-venue isolation is
-- enforced in code — every query filters .eq('venue_id', venueId).
CREATE POLICY "event_rsvps_select" ON event_rsvps
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "event_rsvps_insert" ON event_rsvps
  FOR INSERT WITH CHECK (can_write_event_rsvp(member_id));

-- FOR UPDATE needs both USING (which rows are visible to update) and
-- WITH CHECK (what they may become) — USING alone silently updates 0 rows.
CREATE POLICY "event_rsvps_update" ON event_rsvps
  FOR UPDATE USING (can_write_event_rsvp(member_id))
  WITH CHECK (can_write_event_rsvp(member_id));

CREATE POLICY "event_rsvps_delete" ON event_rsvps
  FOR DELETE USING (can_write_event_rsvp(member_id));

-- New public-schema tables need explicit grants (RLS alone doesn't grant privileges).
GRANT SELECT, INSERT, UPDATE, DELETE ON event_rsvps TO authenticated;
GRANT ALL ON event_rsvps TO service_role;
GRANT EXECUTE ON FUNCTION public.can_write_event_rsvp(UUID) TO authenticated, service_role;
