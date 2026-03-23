
-- Part B: Update VCA venue with explicit branding values
UPDATE venues SET
  primary_color = '#1B3A4B',
  accent_color = '#2A9D8F',
  tertiary_color = '#D4A574',
  hero_gradient = 'linear-gradient(135deg, #1B3A4B 0%, #2A9D8F 100%)',
  page_background = '#FAF8F5',
  card_background = '#FFFFFF',
  card_border = '#E8E0D8',
  card_shadow = '0 2px 8px rgba(43,35,25,0.06)',
  text_primary = '#2D2A26',
  text_secondary = '#5C534A',
  text_muted = '#8B7E74',
  danger_color = '#C0392B',
  warning_color = '#D68910',
  success_color = '#2A9D8F',
  button_radius = '10px',
  card_radius = '12px',
  booking_code_prefix = 'VCA',
  welcome_message = 'Welcome to the VCA Member Portal',
  tagline = 'Vaal Cruising Association'
WHERE slug = 'vca';

-- Part C: Seed Sundowner Bay Yacht Club
INSERT INTO venues (name, slug, contact_email, contact_phone, address, is_active,
  logo_url, primary_color, accent_color, tertiary_color, hero_gradient,
  page_background, card_background, card_border, card_shadow,
  text_primary, text_secondary, text_muted,
  danger_color, warning_color, success_color,
  button_radius, card_radius,
  booking_code_prefix, welcome_message, tagline)
VALUES (
  'Sundowner Bay Yacht Club', 'sundowner',
  'info@sundownerbay.co.za', '+27 16 555 0001',
  '12 Harbour Road, Sundowner Bay, Vaal Triangle', true,
  NULL,
  '#8B2500', '#1B3A5C', '#D4A057',
  'linear-gradient(135deg, #8B2500 0%, #1B3A5C 100%)',
  '#FBF8F4', '#FFFFFF', '#E5DDD4',
  '0 2px 8px rgba(60,40,20,0.07)',
  '#2A2420', '#5C504A', '#8B7E72',
  '#B91C1C', '#D97706', '#15803D',
  '10px', '12px',
  'SBC',
  'Welcome to the Sundowner Bay Member Portal',
  'Sundowner Bay Yacht Club'
);
