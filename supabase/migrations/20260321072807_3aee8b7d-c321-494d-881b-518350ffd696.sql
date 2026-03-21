CREATE TABLE venue_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (venue_id, key)
);
ALTER TABLE venue_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venue_settings_select" ON venue_settings FOR SELECT USING (true);
CREATE POLICY "venue_settings_insert" ON venue_settings FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "venue_settings_update" ON venue_settings FOR UPDATE USING (true) WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "venue_settings_delete" ON venue_settings FOR DELETE USING (true);