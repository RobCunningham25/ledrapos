-- Club account balances imported from Sage (Customer Balances / Days
-- Outstanding report). This is the member's club-account position (subs,
-- levies, mooring fees) — a snapshot as at a statement date, NOT a live
-- balance, and entirely separate from member_credits (the POS bar-credit
-- ledger). Members only ever see total_due_cents + as_of_date; the aging
-- buckets are kept for admin use because Sage puts unallocated payments in
-- them as negatives, which would confuse members.

CREATE TABLE IF NOT EXISTS club_balance_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  as_of_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'sage_csv',
  row_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  unmatched_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_club_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  import_id UUID NOT NULL REFERENCES club_balance_imports(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  total_due_cents BIGINT NOT NULL,
  aging JSONB,
  sage_customer_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (import_id, member_id)
);

-- Remembers how a Sage customer name maps to a member so repeat imports are
-- automatic. Sage's bracket codes are unreliable (several point at the wrong
-- member), so matching is by name with this table as the source of truth.
-- member_id NULL means "known non-member, skip silently".
CREATE TABLE IF NOT EXISTS sage_customer_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  sage_customer_name TEXT NOT NULL,
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (venue_id, sage_customer_name)
);

CREATE INDEX IF NOT EXISTS idx_member_club_balances_member
  ON member_club_balances (venue_id, member_id, as_of_date DESC);

ALTER TABLE club_balance_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_club_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_customer_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_balance_imports_read" ON club_balance_imports FOR SELECT USING (true);
CREATE POLICY "club_balance_imports_write" ON club_balance_imports FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "club_balance_imports_delete" ON club_balance_imports FOR DELETE USING (venue_id IS NOT NULL);

CREATE POLICY "member_club_balances_read" ON member_club_balances FOR SELECT USING (true);
CREATE POLICY "member_club_balances_write" ON member_club_balances FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "member_club_balances_delete" ON member_club_balances FOR DELETE USING (venue_id IS NOT NULL);

CREATE POLICY "sage_customer_map_read" ON sage_customer_map FOR SELECT USING (true);
CREATE POLICY "sage_customer_map_write" ON sage_customer_map FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "sage_customer_map_update" ON sage_customer_map FOR UPDATE USING (venue_id IS NOT NULL);
CREATE POLICY "sage_customer_map_delete" ON sage_customer_map FOR DELETE USING (venue_id IS NOT NULL);

-- New public-schema tables need explicit grants (RLS policies alone don't
-- grant table privileges on this project since 2025-10-30).
GRANT SELECT, INSERT, UPDATE, DELETE ON club_balance_imports TO authenticated;
GRANT SELECT ON club_balance_imports TO anon;
GRANT ALL ON club_balance_imports TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON member_club_balances TO authenticated;
GRANT SELECT ON member_club_balances TO anon;
GRANT ALL ON member_club_balances TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON sage_customer_map TO authenticated;
GRANT SELECT ON sage_customer_map TO anon;
GRANT ALL ON sage_customer_map TO service_role;
