-- Add recurrence support to club_events + per-occurrence cancellations

ALTER TABLE club_events
  ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS monthly_mode TEXT NOT NULL DEFAULT 'day_of_month'
    CHECK (monthly_mode IN ('day_of_month', 'nth_weekday'));

CREATE TABLE IF NOT EXISTS event_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id),
  occurrence_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS event_exceptions_event_id_idx
  ON event_exceptions(event_id);
CREATE INDEX IF NOT EXISTS event_exceptions_venue_date_idx
  ON event_exceptions(venue_id, occurrence_date);

ALTER TABLE event_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_exceptions_select_all"
  ON event_exceptions FOR SELECT
  USING (true);

CREATE POLICY "event_exceptions_insert_authenticated"
  ON event_exceptions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "event_exceptions_delete_authenticated"
  ON event_exceptions FOR DELETE
  USING (auth.uid() IS NOT NULL);
