-- Phase 11E-4: RLS Policy Tightening
-- Drop all existing policies and replace with properly scoped ones.
-- POS tables must allow anon access (no auth.uid() check on reads/writes POS needs).
-- Admin/portal tables gate writes on auth.uid() IS NOT NULL.
-- No DELETE on most tables (soft-delete pattern).

-- ===== admin_users =====
DROP POLICY IF EXISTS "admin_users_read" ON admin_users;
DROP POLICY IF EXISTS "admin_users_write" ON admin_users;

CREATE POLICY "admin_users_select_all" ON admin_users FOR SELECT USING (true);
CREATE POLICY "admin_users_insert_authenticated" ON admin_users FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin_users_update_authenticated" ON admin_users FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ===== booking_blackouts =====
DROP POLICY IF EXISTS "Anyone can read booking_blackouts" ON booking_blackouts;
DROP POLICY IF EXISTS "Authenticated users can insert booking_blackouts" ON booking_blackouts;
DROP POLICY IF EXISTS "Authenticated users can update booking_blackouts" ON booking_blackouts;
DROP POLICY IF EXISTS "Authenticated users can delete booking_blackouts" ON booking_blackouts;

CREATE POLICY "booking_blackouts_select_all" ON booking_blackouts FOR SELECT USING (true);
CREATE POLICY "booking_blackouts_insert_authenticated" ON booking_blackouts FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "booking_blackouts_delete_authenticated" ON booking_blackouts FOR DELETE USING (auth.uid() IS NOT NULL);

-- ===== booking_payments =====
DROP POLICY IF EXISTS "Anyone can read booking_payments" ON booking_payments;
DROP POLICY IF EXISTS "Authenticated users can insert booking_payments" ON booking_payments;
DROP POLICY IF EXISTS "Authenticated users can update booking_payments" ON booking_payments;

CREATE POLICY "booking_payments_select_all" ON booking_payments FOR SELECT USING (true);
CREATE POLICY "booking_payments_insert_all" ON booking_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "booking_payments_update_authenticated" ON booking_payments FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ===== booking_site_link =====
DROP POLICY IF EXISTS "Anyone can read booking_site_link" ON booking_site_link;
DROP POLICY IF EXISTS "Authenticated users can insert booking_site_link" ON booking_site_link;
DROP POLICY IF EXISTS "Authenticated users can update booking_site_link" ON booking_site_link;
DROP POLICY IF EXISTS "Authenticated users can delete booking_site_link" ON booking_site_link;

CREATE POLICY "booking_site_link_select_all" ON booking_site_link FOR SELECT USING (true);
CREATE POLICY "booking_site_link_insert_all" ON booking_site_link FOR INSERT WITH CHECK (true);

-- ===== booking_sites =====
DROP POLICY IF EXISTS "Anyone can read booking_sites" ON booking_sites;
DROP POLICY IF EXISTS "Authenticated users can insert booking_sites" ON booking_sites;
DROP POLICY IF EXISTS "Authenticated users can update booking_sites" ON booking_sites;
DROP POLICY IF EXISTS "Authenticated users can delete booking_sites" ON booking_sites;

CREATE POLICY "booking_sites_select_all" ON booking_sites FOR SELECT USING (true);
CREATE POLICY "booking_sites_insert_authenticated" ON booking_sites FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "booking_sites_update_authenticated" ON booking_sites FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ===== bookings =====
DROP POLICY IF EXISTS "Anyone can read bookings" ON bookings;
DROP POLICY IF EXISTS "Authenticated users can insert bookings" ON bookings;
DROP POLICY IF EXISTS "Authenticated users can update bookings" ON bookings;
DROP POLICY IF EXISTS "Authenticated users can delete bookings" ON bookings;

CREATE POLICY "bookings_select_all" ON bookings FOR SELECT USING (true);
CREATE POLICY "bookings_insert_all" ON bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "bookings_update_all" ON bookings FOR UPDATE USING (true) WITH CHECK (true);

-- ===== checkout_sessions =====
DROP POLICY IF EXISTS "checkout_sessions_venue_read" ON checkout_sessions;
DROP POLICY IF EXISTS "checkout_sessions_venue_insert" ON checkout_sessions;
DROP POLICY IF EXISTS "checkout_sessions_venue_update" ON checkout_sessions;

CREATE POLICY "checkout_sessions_select_all" ON checkout_sessions FOR SELECT USING (true);
CREATE POLICY "checkout_sessions_insert_all" ON checkout_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "checkout_sessions_update_all" ON checkout_sessions FOR UPDATE USING (true) WITH CHECK (true);

-- ===== club_events =====
DROP POLICY IF EXISTS "Anyone can read club_events" ON club_events;
DROP POLICY IF EXISTS "Authenticated users can insert club_events" ON club_events;
DROP POLICY IF EXISTS "Authenticated users can update club_events" ON club_events;
DROP POLICY IF EXISTS "Authenticated users can delete club_events" ON club_events;

CREATE POLICY "club_events_select_all" ON club_events FOR SELECT USING (true);
CREATE POLICY "club_events_insert_authenticated" ON club_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "club_events_update_authenticated" ON club_events FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "club_events_delete_authenticated" ON club_events FOR DELETE USING (auth.uid() IS NOT NULL);

-- ===== liquor_products =====
DROP POLICY IF EXISTS "venue_select" ON liquor_products;
DROP POLICY IF EXISTS "venue_insert" ON liquor_products;
DROP POLICY IF EXISTS "venue_update" ON liquor_products;
DROP POLICY IF EXISTS "venue_delete" ON liquor_products;

CREATE POLICY "liquor_products_select_all" ON liquor_products FOR SELECT USING (true);
CREATE POLICY "liquor_products_insert_authenticated" ON liquor_products FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "liquor_products_update_authenticated" ON liquor_products FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ===== member_boat_sheds =====
DROP POLICY IF EXISTS "member_boat_sheds_read" ON member_boat_sheds;
DROP POLICY IF EXISTS "member_boat_sheds_write" ON member_boat_sheds;
DROP POLICY IF EXISTS "member_boat_sheds_update" ON member_boat_sheds;
DROP POLICY IF EXISTS "member_boat_sheds_delete" ON member_boat_sheds;

CREATE POLICY "member_boat_sheds_select_all" ON member_boat_sheds FOR SELECT USING (true);
CREATE POLICY "member_boat_sheds_insert_authenticated" ON member_boat_sheds FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "member_boat_sheds_update_authenticated" ON member_boat_sheds FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "member_boat_sheds_delete_authenticated" ON member_boat_sheds FOR DELETE USING (auth.uid() IS NOT NULL);

-- ===== member_boats =====
DROP POLICY IF EXISTS "member_boats_read" ON member_boats;
DROP POLICY IF EXISTS "member_boats_write" ON member_boats;
DROP POLICY IF EXISTS "member_boats_update" ON member_boats;
DROP POLICY IF EXISTS "member_boats_delete" ON member_boats;

CREATE POLICY "member_boats_select_all" ON member_boats FOR SELECT USING (true);
CREATE POLICY "member_boats_insert_authenticated" ON member_boats FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "member_boats_update_authenticated" ON member_boats FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "member_boats_delete_authenticated" ON member_boats FOR DELETE USING (auth.uid() IS NOT NULL);

-- ===== member_credits =====
DROP POLICY IF EXISTS "venue_select" ON member_credits;
DROP POLICY IF EXISTS "venue_insert" ON member_credits;
DROP POLICY IF EXISTS "venue_update" ON member_credits;
DROP POLICY IF EXISTS "venue_delete" ON member_credits;

CREATE POLICY "member_credits_select_all" ON member_credits FOR SELECT USING (true);
CREATE POLICY "member_credits_insert_all" ON member_credits FOR INSERT WITH CHECK (true);

-- ===== member_favorites =====
DROP POLICY IF EXISTS "venue_select" ON member_favorites;
DROP POLICY IF EXISTS "venue_insert" ON member_favorites;
DROP POLICY IF EXISTS "venue_update" ON member_favorites;
DROP POLICY IF EXISTS "venue_delete" ON member_favorites;

CREATE POLICY "member_favorites_select_all" ON member_favorites FOR SELECT USING (true);
CREATE POLICY "member_favorites_insert_authenticated" ON member_favorites FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "member_favorites_delete_authenticated" ON member_favorites FOR DELETE USING (auth.uid() IS NOT NULL);

-- ===== member_sites =====
DROP POLICY IF EXISTS "member_sites_read" ON member_sites;
DROP POLICY IF EXISTS "member_sites_write" ON member_sites;
DROP POLICY IF EXISTS "member_sites_update" ON member_sites;
DROP POLICY IF EXISTS "member_sites_delete" ON member_sites;

CREATE POLICY "member_sites_select_all" ON member_sites FOR SELECT USING (true);
CREATE POLICY "member_sites_insert_authenticated" ON member_sites FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "member_sites_update_authenticated" ON member_sites FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "member_sites_delete_authenticated" ON member_sites FOR DELETE USING (auth.uid() IS NOT NULL);

-- ===== members =====
DROP POLICY IF EXISTS "venue_select" ON members;
DROP POLICY IF EXISTS "venue_insert" ON members;
DROP POLICY IF EXISTS "venue_update" ON members;
DROP POLICY IF EXISTS "venue_delete" ON members;

CREATE POLICY "members_select_all" ON members FOR SELECT USING (true);
CREATE POLICY "members_insert_authenticated" ON members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "members_update_authenticated" ON members FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ===== payments =====
DROP POLICY IF EXISTS "venue_select" ON payments;
DROP POLICY IF EXISTS "venue_insert" ON payments;
DROP POLICY IF EXISTS "venue_update" ON payments;
DROP POLICY IF EXISTS "venue_delete" ON payments;

CREATE POLICY "payments_select_all" ON payments FOR SELECT USING (true);
CREATE POLICY "payments_insert_all" ON payments FOR INSERT WITH CHECK (true);

-- ===== pos_sessions =====
DROP POLICY IF EXISTS "venue_select" ON pos_sessions;
DROP POLICY IF EXISTS "venue_insert" ON pos_sessions;
DROP POLICY IF EXISTS "venue_update" ON pos_sessions;
DROP POLICY IF EXISTS "venue_delete" ON pos_sessions;

CREATE POLICY "pos_sessions_select_all" ON pos_sessions FOR SELECT USING (true);
CREATE POLICY "pos_sessions_insert_all" ON pos_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "pos_sessions_update_all" ON pos_sessions FOR UPDATE USING (true) WITH CHECK (true);

-- ===== pos_users =====
DROP POLICY IF EXISTS "venue_select" ON pos_users;
DROP POLICY IF EXISTS "venue_insert" ON pos_users;
DROP POLICY IF EXISTS "venue_update" ON pos_users;
DROP POLICY IF EXISTS "venue_delete" ON pos_users;

CREATE POLICY "pos_users_select_all" ON pos_users FOR SELECT USING (true);
CREATE POLICY "pos_users_insert_authenticated" ON pos_users FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "pos_users_update_authenticated" ON pos_users FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ===== tab_items =====
DROP POLICY IF EXISTS "venue_select" ON tab_items;
DROP POLICY IF EXISTS "venue_insert" ON tab_items;
DROP POLICY IF EXISTS "venue_update" ON tab_items;
DROP POLICY IF EXISTS "venue_delete" ON tab_items;

CREATE POLICY "tab_items_select_all" ON tab_items FOR SELECT USING (true);
CREATE POLICY "tab_items_insert_all" ON tab_items FOR INSERT WITH CHECK (true);
CREATE POLICY "tab_items_update_all" ON tab_items FOR UPDATE USING (true) WITH CHECK (true);

-- ===== tabs =====
DROP POLICY IF EXISTS "venue_select" ON tabs;
DROP POLICY IF EXISTS "venue_insert" ON tabs;
DROP POLICY IF EXISTS "venue_update" ON tabs;
DROP POLICY IF EXISTS "venue_delete" ON tabs;

CREATE POLICY "tabs_select_all" ON tabs FOR SELECT USING (true);
CREATE POLICY "tabs_insert_all" ON tabs FOR INSERT WITH CHECK (true);
CREATE POLICY "tabs_update_all" ON tabs FOR UPDATE USING (true) WITH CHECK (true);

-- ===== venue_settings =====
DROP POLICY IF EXISTS "venue_settings_select" ON venue_settings;
DROP POLICY IF EXISTS "venue_settings_insert" ON venue_settings;
DROP POLICY IF EXISTS "venue_settings_update" ON venue_settings;
DROP POLICY IF EXISTS "venue_settings_delete" ON venue_settings;

CREATE POLICY "venue_settings_select_all" ON venue_settings FOR SELECT USING (true);
CREATE POLICY "venue_settings_insert_authenticated" ON venue_settings FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "venue_settings_update_authenticated" ON venue_settings FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ===== venues =====
DROP POLICY IF EXISTS "allow_all" ON venues;

CREATE POLICY "venues_select_all" ON venues FOR SELECT USING (true);
CREATE POLICY "venues_insert_authenticated" ON venues FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "venues_update_authenticated" ON venues FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);