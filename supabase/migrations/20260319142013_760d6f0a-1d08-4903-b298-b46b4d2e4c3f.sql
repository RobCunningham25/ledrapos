
-- TABLE: venues
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON venues FOR ALL USING (true) WITH CHECK (true);

-- TABLE: pos_users
CREATE TABLE pos_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'bartender')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pos_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON pos_users FOR ALL USING (true) WITH CHECK (true);

-- TABLE: members
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  membership_number TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  membership_type TEXT NOT NULL DEFAULT 'member' CHECK (membership_type IN ('member', 'associate', 'honorary')),
  partner_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT members_venue_membership_unique UNIQUE (venue_id, membership_number)
);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON members FOR ALL USING (true) WITH CHECK (true);

-- TABLE: liquor_products
CREATE TABLE liquor_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT NOT NULL CHECK (category IN ('beer', 'wine', 'spirits', 'soft_drinks', 'water', 'mixers', 'snacks', 'other')),
  size TEXT,
  abv NUMERIC(4,1),
  purchase_price_cents INTEGER NOT NULL DEFAULT 0,
  selling_price_cents INTEGER NOT NULL DEFAULT 0,
  stock_level INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER NOT NULL DEFAULT 5,
  barcode TEXT,
  supplier TEXT,
  bulk_price_cents INTEGER DEFAULT 0,
  bulk_units INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE liquor_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON liquor_products FOR ALL USING (true) WITH CHECK (true);

-- TABLE: tabs
CREATE TABLE tabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  is_cash_customer BOOLEAN DEFAULT FALSE,
  cash_customer_name TEXT,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON tabs FOR ALL USING (true) WITH CHECK (true);

-- TABLE: tab_items
CREATE TABLE tab_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES liquor_products(id),
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL GENERATED ALWAYS AS (qty * unit_price_cents) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tab_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON tab_items FOR ALL USING (true) WITH CHECK (true);

-- TABLE: payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('CASH', 'CARD', 'CREDIT')),
  reference TEXT,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON payments FOR ALL USING (true) WITH CHECK (true);

-- TABLE: member_credits
CREATE TABLE member_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id),
  amount_cents INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
  method TEXT CHECK (method IN ('CASH', 'CARD', 'ADJUSTMENT')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE member_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON member_credits FOR ALL USING (true) WITH CHECK (true);

-- TABLE: member_favorites
CREATE TABLE member_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES liquor_products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT member_favorites_unique UNIQUE (venue_id, member_id, product_id)
);

ALTER TABLE member_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON member_favorites FOR ALL USING (true) WITH CHECK (true);

-- TABLE: pos_sessions
CREATE TABLE pos_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  pos_user_id UUID NOT NULL REFERENCES pos_users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pos_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON pos_sessions FOR ALL USING (true) WITH CHECK (true);
