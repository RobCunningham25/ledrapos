
-- A1: New columns on members table
ALTER TABLE members ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS partner_first_name TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS partner_last_name TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS partner_email TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS partner_phone TEXT;

-- A2: member_sites table
CREATE TABLE IF NOT EXISTS member_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  site_number TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE member_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_sites_read" ON member_sites FOR SELECT USING (true);
CREATE POLICY "member_sites_write" ON member_sites FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "member_sites_update" ON member_sites FOR UPDATE USING (venue_id IS NOT NULL);
CREATE POLICY "member_sites_delete" ON member_sites FOR DELETE USING (venue_id IS NOT NULL);

-- A3: member_boat_sheds table
CREATE TABLE IF NOT EXISTS member_boat_sheds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  shed_number TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE member_boat_sheds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_boat_sheds_read" ON member_boat_sheds FOR SELECT USING (true);
CREATE POLICY "member_boat_sheds_write" ON member_boat_sheds FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "member_boat_sheds_update" ON member_boat_sheds FOR UPDATE USING (venue_id IS NOT NULL);
CREATE POLICY "member_boat_sheds_delete" ON member_boat_sheds FOR DELETE USING (venue_id IS NOT NULL);

-- A4: member_boats table
CREATE TABLE IF NOT EXISTS member_boats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  boat_name TEXT NOT NULL,
  registration_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE member_boats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_boats_read" ON member_boats FOR SELECT USING (true);
CREATE POLICY "member_boats_write" ON member_boats FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "member_boats_update" ON member_boats FOR UPDATE USING (venue_id IS NOT NULL);
CREATE POLICY "member_boats_delete" ON member_boats FOR DELETE USING (venue_id IS NOT NULL);
