-- Event participants (e.g. potjie competition entries).
--
-- Distinct from event_rsvps: an RSVP says "I'm coming and eating", a
-- participant row says "I'm entering the competition / taking part". A member
-- can have either, both, or neither. Keyed per occurrence like RSVPs, because
-- club_events rows can be recurring series.

CREATE TABLE IF NOT EXISTS event_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,

  -- Free text: the potjie / team name and anything the organisers should know.
  entry_name      TEXT,
  note            TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT event_participants_unique_per_occurrence
    UNIQUE (event_id, occurrence_date, member_id)
);

CREATE INDEX IF NOT EXISTS idx_event_participants_occurrence
  ON event_participants (venue_id, event_id, occurrence_date);
CREATE INDEX IF NOT EXISTS idx_event_participants_member
  ON event_participants (member_id, occurrence_date);

CREATE OR REPLACE FUNCTION set_event_participants_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_participants_updated_at ON event_participants;
CREATE TRIGGER trg_event_participants_updated_at
  BEFORE UPDATE ON event_participants
  FOR EACH ROW
  EXECUTE FUNCTION set_event_participants_updated_at();

ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;

-- Same ownership rule as event_rsvps: a member touches only their own row,
-- admins touch any. Entries carry free-text notes, so reads are not open to
-- every signed-in member either.
CREATE POLICY "event_participants_select" ON event_participants
  FOR SELECT USING (can_write_event_rsvp(member_id));

CREATE POLICY "event_participants_insert" ON event_participants
  FOR INSERT WITH CHECK (can_write_event_rsvp(member_id));

CREATE POLICY "event_participants_update" ON event_participants
  FOR UPDATE USING (can_write_event_rsvp(member_id))
  WITH CHECK (can_write_event_rsvp(member_id));

CREATE POLICY "event_participants_delete" ON event_participants
  FOR DELETE USING (can_write_event_rsvp(member_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON event_participants TO authenticated;
GRANT ALL ON event_participants TO service_role;

-- The Halloween Potjie event takes eating RSVPs through the portal.
UPDATE club_events
   SET requires_rsvp = TRUE
 WHERE id = '3a69fa08-78b5-4dd0-9a3a-a31181297b9b'
   AND event_date = '2026-10-31';
