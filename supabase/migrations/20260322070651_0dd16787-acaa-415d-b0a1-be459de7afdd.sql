CREATE TABLE checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  member_id UUID NOT NULL REFERENCES members(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('credit_load', 'tab_payment')),
  tab_id UUID REFERENCES tabs(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 200),
  yoco_checkout_id TEXT,
  yoco_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checkout_sessions_venue_read" ON checkout_sessions
  FOR SELECT USING (true);

CREATE POLICY "checkout_sessions_venue_insert" ON checkout_sessions
  FOR INSERT WITH CHECK (venue_id IS NOT NULL);

CREATE POLICY "checkout_sessions_venue_update" ON checkout_sessions
  FOR UPDATE USING (venue_id IS NOT NULL);

CREATE INDEX idx_checkout_sessions_yoco_id ON checkout_sessions(yoco_checkout_id);
CREATE INDEX idx_checkout_sessions_member ON checkout_sessions(member_id, venue_id);