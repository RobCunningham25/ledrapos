-- Prepaid electricity meter purchases, imported weekly from a "Sales Per
-- Meter" Excel export. Same workflow as the Sage club-balance import: a
-- dropped file is the import request, Claude parses it and upserts here —
-- no admin upload UI or Edge Function.
--
-- The export reports MONTH-TO-DATE cumulative Rand purchases per meter for
-- the current calendar month (e.g. "01/08/2026 to 18/08/2026"), so each
-- weekly import UPSERTs the current month's row per meter rather than
-- appending — once a month rolls over, its final row is frozen and becomes
-- history.
--
-- Meter numbers in the source file are NOT yet mapped to the correct
-- members (known data issue on the club's side) — member_id stays NULL on
-- every row until a corrected mapping file is provided.

CREATE TABLE IF NOT EXISTS electricity_meters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  meter_number TEXT NOT NULL,
  building TEXT,
  unit_label TEXT,
  description TEXT,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (venue_id, meter_number)
);

CREATE TABLE IF NOT EXISTS electricity_meter_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  period_month DATE NOT NULL,
  as_of_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'meter_xlsx',
  row_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS electricity_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  meter_id UUID NOT NULL REFERENCES electricity_meters(id) ON DELETE CASCADE,
  -- Denormalized from electricity_meters.member_id at import time so the
  -- portal card can query purchases directly by member_id without a join.
  -- Backfilled across historical rows whenever a meter gets (re)mapped.
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  import_id UUID REFERENCES electricity_meter_imports(id) ON DELETE SET NULL,
  period_month DATE NOT NULL,
  as_of_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meter_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_electricity_meters_member
  ON electricity_meters (venue_id, member_id);

CREATE INDEX IF NOT EXISTS idx_electricity_purchases_member
  ON electricity_purchases (venue_id, member_id, period_month DESC);

CREATE INDEX IF NOT EXISTS idx_electricity_purchases_meter
  ON electricity_purchases (venue_id, meter_id, period_month DESC);

ALTER TABLE electricity_meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE electricity_meter_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE electricity_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "electricity_meters_read" ON electricity_meters FOR SELECT USING (true);
CREATE POLICY "electricity_meters_write" ON electricity_meters FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "electricity_meters_update" ON electricity_meters FOR UPDATE USING (venue_id IS NOT NULL);
CREATE POLICY "electricity_meters_delete" ON electricity_meters FOR DELETE USING (venue_id IS NOT NULL);

CREATE POLICY "electricity_meter_imports_read" ON electricity_meter_imports FOR SELECT USING (true);
CREATE POLICY "electricity_meter_imports_write" ON electricity_meter_imports FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "electricity_meter_imports_delete" ON electricity_meter_imports FOR DELETE USING (venue_id IS NOT NULL);

CREATE POLICY "electricity_purchases_read" ON electricity_purchases FOR SELECT USING (true);
CREATE POLICY "electricity_purchases_write" ON electricity_purchases FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "electricity_purchases_update" ON electricity_purchases FOR UPDATE USING (venue_id IS NOT NULL);
CREATE POLICY "electricity_purchases_delete" ON electricity_purchases FOR DELETE USING (venue_id IS NOT NULL);

-- New public-schema tables need explicit grants (RLS policies alone don't
-- grant table privileges on this project since 2025-10-30).
GRANT SELECT, INSERT, UPDATE, DELETE ON electricity_meters TO authenticated;
GRANT SELECT ON electricity_meters TO anon;
GRANT ALL ON electricity_meters TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON electricity_meter_imports TO authenticated;
GRANT SELECT ON electricity_meter_imports TO anon;
GRANT ALL ON electricity_meter_imports TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON electricity_purchases TO authenticated;
GRANT SELECT ON electricity_purchases TO anon;
GRANT ALL ON electricity_purchases TO service_role;
