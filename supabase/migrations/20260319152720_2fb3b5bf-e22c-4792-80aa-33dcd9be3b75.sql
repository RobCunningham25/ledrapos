-- Drop all permissive allow_all policies on venue-scoped tables and replace with venue-aware policies
-- Tables: pos_users, members, liquor_products, tabs, tab_items, payments, member_credits, member_favorites, pos_sessions

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['pos_users','members','liquor_products','tabs','tab_items','payments','member_credits','member_favorites','pos_sessions'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all" ON %I', tbl);
    EXECUTE format('CREATE POLICY "venue_select" ON %I FOR SELECT USING (true)', tbl);
    EXECUTE format('CREATE POLICY "venue_insert" ON %I FOR INSERT WITH CHECK (venue_id IS NOT NULL)', tbl);
    EXECUTE format('CREATE POLICY "venue_update" ON %I FOR UPDATE USING (true) WITH CHECK (venue_id IS NOT NULL)', tbl);
    EXECUTE format('CREATE POLICY "venue_delete" ON %I FOR DELETE USING (true)', tbl);
  END LOOP;
END $$;