-- A1: booking_sites
CREATE TABLE booking_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  name TEXT NOT NULL,
  site_type TEXT NOT NULL CHECK (site_type IN ('caravan', 'camping', 'day_visitor')),
  site_number INT,
  price_cents INT NOT NULL DEFAULT 0,
  pricing_tiers JSONB,
  capacity INT,
  is_virtual BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A2: bookings
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  booking_code TEXT NOT NULL UNIQUE,
  member_id UUID REFERENCES members(id),
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT,
  membership_number TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  num_guests INT NOT NULL DEFAULT 1,
  total_price_cents INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED')),
  payment_method TEXT CHECK (payment_method IN ('yoco', 'eft')),
  notes TEXT,
  created_by_member_id UUID REFERENCES members(id),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_booking_code ON bookings(booking_code);
CREATE INDEX idx_bookings_venue_status ON bookings(venue_id, status);
CREATE INDEX idx_bookings_venue_dates ON bookings(venue_id, check_in, check_out);

-- A3: booking_site_link
CREATE TABLE booking_site_link (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES booking_sites(id),
  nights INT NOT NULL,
  price_per_night_cents INT NOT NULL,
  subtotal_cents INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_site_link_booking ON booking_site_link(booking_id);
CREATE INDEX idx_booking_site_link_site_dates ON booking_site_link(site_id);

-- A4: booking_payments
CREATE TABLE booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  amount_cents INT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('yoco', 'eft')),
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_payments_booking ON booking_payments(booking_id);

-- A5: booking_blackouts
CREATE TABLE booking_blackouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  site_id UUID REFERENCES booking_sites(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_blackouts_venue_dates ON booking_blackouts(venue_id, start_date, end_date);

-- RLS
ALTER TABLE booking_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read booking_sites" ON booking_sites FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert booking_sites" ON booking_sites FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "Authenticated users can update booking_sites" ON booking_sites FOR UPDATE USING (true) WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "Authenticated users can delete booking_sites" ON booking_sites FOR DELETE USING (true);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read bookings" ON bookings FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert bookings" ON bookings FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "Authenticated users can update bookings" ON bookings FOR UPDATE USING (true) WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "Authenticated users can delete bookings" ON bookings FOR DELETE USING (true);

ALTER TABLE booking_site_link ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read booking_site_link" ON booking_site_link FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert booking_site_link" ON booking_site_link FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "Authenticated users can update booking_site_link" ON booking_site_link FOR UPDATE USING (true) WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "Authenticated users can delete booking_site_link" ON booking_site_link FOR DELETE USING (true);

ALTER TABLE booking_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read booking_payments" ON booking_payments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert booking_payments" ON booking_payments FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "Authenticated users can update booking_payments" ON booking_payments FOR UPDATE USING (true) WITH CHECK (venue_id IS NOT NULL);

ALTER TABLE booking_blackouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read booking_blackouts" ON booking_blackouts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert booking_blackouts" ON booking_blackouts FOR INSERT WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "Authenticated users can update booking_blackouts" ON booking_blackouts FOR UPDATE USING (true) WITH CHECK (venue_id IS NOT NULL);
CREATE POLICY "Authenticated users can delete booking_blackouts" ON booking_blackouts FOR DELETE USING (true);