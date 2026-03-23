
CREATE TABLE club_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE club_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read club_events"
  ON club_events FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert club_events"
  ON club_events FOR INSERT
  WITH CHECK (venue_id IS NOT NULL);

CREATE POLICY "Authenticated users can update club_events"
  ON club_events FOR UPDATE
  USING (true)
  WITH CHECK (venue_id IS NOT NULL);

CREATE POLICY "Authenticated users can delete club_events"
  ON club_events FOR DELETE
  USING (true);
