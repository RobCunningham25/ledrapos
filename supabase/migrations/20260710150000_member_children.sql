-- member_children: children attached to a membership (multiple per member),
-- mirroring the member_sites / member_boat_sheds pattern. Only name + DOB are
-- stored; the fee category (Under 12 / Junior 12-18 / Intermediate 19-30) is
-- derived from the DOB in the UI so children move between categories as they
-- age without anyone editing records. The membership application form captures
-- the same data in membership_applications.children / addon_members JSON.

CREATE TABLE IF NOT EXISTS member_children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_children_member
  ON member_children (venue_id, member_id);

ALTER TABLE member_children ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_children_read" ON member_children FOR SELECT USING (true);
CREATE POLICY "member_children_write" ON member_children FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "member_children_update" ON member_children FOR UPDATE USING (venue_id IS NOT NULL);
CREATE POLICY "member_children_delete" ON member_children FOR DELETE USING (venue_id IS NOT NULL);

-- New public-schema tables need explicit grants (RLS policies alone don't
-- grant table privileges on this project since 2025-10-30).
GRANT SELECT, INSERT, UPDATE, DELETE ON member_children TO authenticated;
GRANT SELECT ON member_children TO anon;
GRANT ALL ON member_children TO service_role;
