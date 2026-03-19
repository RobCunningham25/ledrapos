-- Seed 3 favourites for VCA-001 member (Pieter Van der Merwe)
-- Using different categories: beer, wine, spirits
INSERT INTO member_favorites (venue_id, member_id, product_id)
SELECT 
  m.venue_id,
  m.id,
  p.id
FROM members m
CROSS JOIN liquor_products p
WHERE m.membership_number = 'VCA-001'
  AND p.venue_id = m.venue_id
  AND p.name IN ('Castle Lager', 'Sauvignon Blanc', 'Jameson')
ON CONFLICT DO NOTHING;