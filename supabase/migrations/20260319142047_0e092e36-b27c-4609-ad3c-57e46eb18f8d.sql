
-- Seed VCA venue
INSERT INTO venues (name, slug, contact_email, is_active)
VALUES ('VAL Cruising Association', 'vca', 'bar@vca.co.za', true);

-- Seed pos_users
INSERT INTO pos_users (venue_id, name, pin_hash, role, is_active)
SELECT v.id, 'Admin', 'HASH_1968', 'admin', true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Robert', 'HASH_2505', 'bartender', true FROM venues v WHERE v.slug = 'vca';

-- Seed members
INSERT INTO members (venue_id, first_name, last_name, membership_number, email, phone, membership_type, is_active)
SELECT v.id, 'Pieter', 'Van der Merwe', 'VCA-001', 'pieter@email.co.za', '0821234567', 'member', true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Thandi', 'Nkosi', 'VCA-002', 'thandi@email.co.za', '0832345678', 'member', true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Johan', 'Botha', 'VCA-003', 'johan@email.co.za', '0843456789', 'associate', true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Naledi', 'Molefe', 'VCA-004', 'naledi@email.co.za', '0854567890', 'member', true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'André', 'Du Plessis', 'VCA-005', 'andre@email.co.za', '0865678901', 'honorary', true FROM venues v WHERE v.slug = 'vca';

-- Seed liquor_products
INSERT INTO liquor_products (venue_id, name, brand, category, size, abv, purchase_price_cents, selling_price_cents, stock_level, min_stock_level, is_active, is_available)
SELECT v.id, 'Castle Lager', 'Castle', 'beer', '340ml', 5.0, 1800, 3500, 48, 12, true, true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Windhoek Draught', 'Windhoek', 'beer', '440ml', 4.0, 2200, 4500, 36, 12, true, true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Black Label', 'Carling', 'beer', '500ml', 5.5, 2000, 4000, 24, 12, true, true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Sauvignon Blanc', 'Durbanville Hills', 'wine', '175ml', 13.5, 2800, 5500, 20, 5, true, true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Cabernet Sauvignon', 'Beyerskloof', 'wine', '175ml', 14.0, 3000, 6000, 18, 5, true, true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Chenin Blanc', 'Ken Forrester', 'wine', '175ml', 13.0, 2500, 5000, 15, 5, true, true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Jameson', 'Jameson', 'spirits', '25ml', 40.0, 2500, 5000, 30, 10, true, true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Jack Daniels', 'Jack Daniels', 'spirits', '25ml', 40.0, 3000, 5500, 25, 10, true, true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Smirnoff Vodka', 'Smirnoff', 'spirits', '25ml', 37.5, 2000, 4500, 28, 10, true, true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Coca-Cola', 'Coca-Cola', 'soft_drinks', '330ml', NULL, 1000, 2500, 60, 20, true, true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Sprite', 'Sprite', 'soft_drinks', '330ml', NULL, 1000, 2500, 48, 20, true, true FROM venues v WHERE v.slug = 'vca'
UNION ALL
SELECT v.id, 'Still Water', 'Bonaqua', 'water', '500ml', NULL, 600, 1500, 40, 15, true, true FROM venues v WHERE v.slug = 'vca';
