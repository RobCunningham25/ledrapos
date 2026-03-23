-- Seed booking_sites for VCA
INSERT INTO booking_sites (venue_id, name, site_type, site_number, price_cents, pricing_tiers, capacity, is_virtual, sort_order, description) VALUES
  ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'The Driftwood Den', 'caravan', 1, 35000, NULL, 6, false, 1, 'Caravan stand with power and water. Shaded site near the slipway.'),
  ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'The Lazy Anchor', 'caravan', 2, 35000, NULL, 6, false, 2, 'Caravan stand with power and water. River-facing with braai area.'),
  ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'The Starboard Suite', 'caravan', 24, 35000, NULL, 6, false, 3, 'Caravan stand with power and water. Quiet corner site with extra space.'),
  ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'Camping', 'camping', 100, 25000, '[{"min_guests":1,"max_guests":4,"price_cents":25000},{"min_guests":5,"max_guests":5,"price_cents":30000},{"min_guests":6,"max_guests":99,"price_cents":35000}]'::jsonb, NULL, true, 4, 'Open camping area. Price varies by number of guests.'),
  ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'Day Visitor', 'day_visitor', 101, 0, NULL, NULL, true, 5, 'Day access to club facilities. No overnight stay. Free of charge.');

-- Seed EFT bank details in venue_settings
INSERT INTO venue_settings (venue_id, key, value) VALUES
  ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'eft_bank_name', 'First National Bank'),
  ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'eft_account_holder', 'Vaal Cruising Association'),
  ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'eft_account_number', '63004352603'),
  ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'eft_branch_code', '250655'),
  ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'eft_account_type', 'Cheque Account')
ON CONFLICT ON CONSTRAINT venue_settings_venue_id_key_key DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Seed booking 1: Paid caravan (VCA-001)
INSERT INTO bookings (venue_id, booking_code, member_id, guest_name, guest_email, check_in, check_out, num_guests, total_price_cents, status, payment_method, created_by_member_id, membership_number)
VALUES ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'VCA-K7R3N5', '51a9ba73-377e-403c-acfc-bac9a58480a4', 'Pieter Van der Merwe', 'pieter@email.co.za', '2026-04-10', '2026-04-13', 4, 105000, 'PAID', 'yoco', '51a9ba73-377e-403c-acfc-bac9a58480a4', 'VCA-001');

-- Seed booking 2: Pending EFT camping (VCA-002)
INSERT INTO bookings (venue_id, booking_code, member_id, guest_name, guest_email, check_in, check_out, num_guests, total_price_cents, status, payment_method, created_by_member_id, membership_number, expires_at)
VALUES ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'VCA-M4X8T2', '522c633e-f65d-4548-b30a-ca5076c73aa1', 'Thandi Nkosi', 'thandi@email.co.za', '2026-04-18', '2026-04-20', 5, 60000, 'PENDING', 'eft', '522c633e-f65d-4548-b30a-ca5076c73aa1', 'VCA-002', NOW() + INTERVAL '24 hours');

-- Seed booking 3: Paid day visitor (VCA-003)
INSERT INTO bookings (venue_id, booking_code, member_id, guest_name, guest_email, check_in, check_out, num_guests, total_price_cents, status, payment_method, created_by_member_id, membership_number)
VALUES ('eb1864cd-c9b3-4206-898d-d5300de149a5', 'VCA-P6W2H9', '69e027b2-9787-4301-bef8-e96d9f3ef9bb', 'Johan Botha', 'johan@email.co.za', '2026-04-05', '2026-04-05', 2, 0, 'PAID', 'yoco', '69e027b2-9787-4301-bef8-e96d9f3ef9bb', 'VCA-003');

-- booking_site_link for booking 1
INSERT INTO booking_site_link (venue_id, booking_id, site_id, nights, price_per_night_cents, subtotal_cents)
SELECT 'eb1864cd-c9b3-4206-898d-d5300de149a5', b.id, s.id, 3, 35000, 105000
FROM bookings b, booking_sites s
WHERE b.booking_code = 'VCA-K7R3N5' AND s.name = 'The Driftwood Den' AND s.venue_id = 'eb1864cd-c9b3-4206-898d-d5300de149a5';

-- booking_site_link for booking 2
INSERT INTO booking_site_link (venue_id, booking_id, site_id, nights, price_per_night_cents, subtotal_cents)
SELECT 'eb1864cd-c9b3-4206-898d-d5300de149a5', b.id, s.id, 2, 30000, 60000
FROM bookings b, booking_sites s
WHERE b.booking_code = 'VCA-M4X8T2' AND s.name = 'Camping' AND s.venue_id = 'eb1864cd-c9b3-4206-898d-d5300de149a5';

-- booking_site_link for booking 3
INSERT INTO booking_site_link (venue_id, booking_id, site_id, nights, price_per_night_cents, subtotal_cents)
SELECT 'eb1864cd-c9b3-4206-898d-d5300de149a5', b.id, s.id, 1, 0, 0
FROM bookings b, booking_sites s
WHERE b.booking_code = 'VCA-P6W2H9' AND s.name = 'Day Visitor' AND s.venue_id = 'eb1864cd-c9b3-4206-898d-d5300de149a5';

-- booking_payments for booking 1
INSERT INTO booking_payments (venue_id, booking_id, amount_cents, method, reference, status, confirmed_at)
SELECT 'eb1864cd-c9b3-4206-898d-d5300de149a5', b.id, 105000, 'yoco', 'test_checkout_001', 'confirmed', NOW()
FROM bookings b WHERE b.booking_code = 'VCA-K7R3N5';

-- booking_payments for booking 2
INSERT INTO booking_payments (venue_id, booking_id, amount_cents, method, status)
SELECT 'eb1864cd-c9b3-4206-898d-d5300de149a5', b.id, 60000, 'eft', 'pending'
FROM bookings b WHERE b.booking_code = 'VCA-M4X8T2';

-- booking_payments for booking 3
INSERT INTO booking_payments (venue_id, booking_id, amount_cents, method, reference, status, confirmed_at)
SELECT 'eb1864cd-c9b3-4206-898d-d5300de149a5', b.id, 0, 'yoco', 'test_checkout_003', 'confirmed', NOW()
FROM bookings b WHERE b.booking_code = 'VCA-P6W2H9';