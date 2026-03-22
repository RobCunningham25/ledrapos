-- Migrate existing partner_name data to partner_first_name
UPDATE members SET partner_first_name = partner_name WHERE partner_name IS NOT NULL AND partner_first_name IS NULL;

-- Seed default portal feature toggles for VCA
INSERT INTO venue_settings (venue_id, key, value)
SELECT v.id, s.key, s.value
FROM venues v
CROSS JOIN (VALUES
  ('portal_tab_calendar', 'true'),
  ('portal_tab_my_details', 'true'),
  ('portal_tab_bookings', 'true')
) AS s(key, value)
WHERE v.slug = 'vca'
ON CONFLICT (venue_id, key) DO NOTHING;
