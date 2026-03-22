
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  auth_user_id UUID UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_users_read" ON admin_users
  FOR SELECT USING (true);

CREATE POLICY "admin_users_write" ON admin_users
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_admin_users_auth ON admin_users(auth_user_id);
CREATE INDEX idx_admin_users_venue ON admin_users(venue_id);

-- Seed Rob's admin account (auth_user_id linked on first login)
INSERT INTO admin_users (venue_id, email, name, role)
SELECT v.id, 'rob@dearziva.co.za', 'Rob Cunningham', 'superadmin'
FROM venues v WHERE v.slug = 'vca';
