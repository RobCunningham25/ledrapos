-- Secondary portal logins (e.g. a member's spouse, using her own email +
-- password against the same membership record).
--
-- members.auth_user_id stays a strict 1:1 UNIQUE mapping — the fast/primary
-- login path, untouched by this migration. A second person can never reuse
-- that column (the unique constraint forbids it), so this adds a purely
-- additive join table instead: one members row can have zero or more active
-- secondary logins, each its own auth.users account.
--
-- resolve_member_id() is the single source of truth for "given this
-- auth.users id, which members row does it act as" — checks the primary
-- column first, falls back to an active row here. Both the RLS helper
-- functions below and the frontend (src/lib/resolvePortalMemberId.ts) go
-- through it, so every existing single-login member's behavior is unchanged.

-- ===== 1. member_auth_logins =====

CREATE TABLE IF NOT EXISTS member_auth_logins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- Set at invite-send time (generateLink() creates the auth.users row
  -- immediately, same as the primary invite flow) — no nullable "pending"
  -- state to track separately.
  auth_user_id  UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  label         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_auth_logins_member ON member_auth_logins (member_id);
CREATE INDEX IF NOT EXISTS idx_member_auth_logins_venue ON member_auth_logins (venue_id, is_active);

-- Collision guard: an auth_user_id that is already someone's own primary
-- login (members.auth_user_id) must never also be attached here — for the
-- same member or, worse, a different one. Without this, an admin typo or a
-- stale invite could silently splice one person's real account onto
-- another member's tab/credit/bookings. Enforced at the DB level as a
-- backstop even though the Edge Function (the only writer) also checks
-- this before insert.
CREATE OR REPLACE FUNCTION public.prevent_primary_secondary_auth_collision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM members WHERE auth_user_id = NEW.auth_user_id) THEN
    RAISE EXCEPTION 'auth_user_id % is already a primary member login', NEW.auth_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_auth_logins_no_collision ON member_auth_logins;
CREATE TRIGGER trg_member_auth_logins_no_collision
  BEFORE INSERT OR UPDATE ON member_auth_logins
  FOR EACH ROW EXECUTE FUNCTION public.prevent_primary_secondary_auth_collision();

-- ===== 2. resolve_member_id =====

CREATE OR REPLACE FUNCTION public.resolve_member_id(p_auth_user_id UUID DEFAULT auth.uid())
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT m.id FROM members m
      WHERE m.auth_user_id = p_auth_user_id AND m.is_active
      LIMIT 1),
    (SELECT mal.member_id FROM member_auth_logins mal
       JOIN members m2 ON m2.id = mal.member_id
      WHERE mal.auth_user_id = p_auth_user_id AND mal.is_active AND m2.is_active
      LIMIT 1)
  );
$$;

-- ===== 3. RLS =====

ALTER TABLE member_auth_logins ENABLE ROW LEVEL SECURITY;

-- Deliberately NOT the members table's USING (true) pattern — this table
-- exposes a second person's email address, which must stay admin-or-self
-- visible only, not readable by every other signed-in member.
CREATE POLICY "member_auth_logins_select" ON member_auth_logins
  FOR SELECT USING (public.is_active_admin() OR auth_user_id = auth.uid());

CREATE POLICY "member_auth_logins_insert" ON member_auth_logins
  FOR INSERT WITH CHECK (public.is_active_admin());

CREATE POLICY "member_auth_logins_update" ON member_auth_logins
  FOR UPDATE USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- No DELETE policy — revoke is soft (is_active = false), same audit-trail
-- posture as water_signouts. Only service_role (Edge Functions) hard-deletes.

-- New public-schema tables need explicit grants (RLS alone grants nothing).
GRANT SELECT, INSERT, UPDATE ON member_auth_logins TO authenticated;
GRANT ALL ON member_auth_logins TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_member_id(UUID) TO authenticated, service_role;

-- ===== 4. Extend the two RLS helpers that gate writes via auth_user_id =====
-- One extra OR EXISTS clause each — everything else byte-identical to the
-- originals in 20260812120000_event_rsvps.sql / 20260910120000_water_signouts.sql.

CREATE OR REPLACE FUNCTION public.can_write_event_rsvp(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM members m
            WHERE m.id = p_member_id AND m.auth_user_id = auth.uid()
         )
      OR EXISTS (
           SELECT 1 FROM member_auth_logins mal
            WHERE mal.member_id = p_member_id AND mal.auth_user_id = auth.uid() AND mal.is_active
         )
      OR EXISTS (
           SELECT 1 FROM admin_users a
            WHERE a.auth_user_id = auth.uid()
         );
$$;

CREATE OR REPLACE FUNCTION public.can_write_water_signout(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM members m
            WHERE m.id = p_member_id AND m.auth_user_id = auth.uid()
         )
      OR EXISTS (
           SELECT 1 FROM member_auth_logins mal
            WHERE mal.member_id = p_member_id AND mal.auth_user_id = auth.uid() AND mal.is_active
         )
      OR public.is_active_admin();
$$;
