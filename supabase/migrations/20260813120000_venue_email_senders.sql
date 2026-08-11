-- Per-venue broadcast sender addresses.
--
-- Broadcasts previously always went out as venues.broadcast_from_email. VCA wants
-- some mail to come from finance@ instead of info@ — subscription notices, bar
-- account statements — so the compose page needs a picker.
--
-- Resend verifies the whole DOMAIN, not individual addresses, so every address on
-- an already-verified domain (vaalcruising.co.za) sends with no new DNS or Resend
-- setup. The only thing missing was somewhere to put the choice.
--
-- Scope is broadcasts only. Transactional mail (invites, resets, tab reminders,
-- booking notices) still resolves its sender from venues.broadcast_from_email.

-- ===== 1. venue_email_senders =====

CREATE TABLE IF NOT EXISTS public.venue_email_senders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,

  email       TEXT NOT NULL,
  -- Display name in the From header. NULL falls back to the venue name, so
  -- "VCA Finance <finance@…>" vs "Vaal Cruising Association <info@…>".
  label       TEXT,
  -- Where replies land. NULL means replies go to this same address, which is
  -- the point of picking a sender in the first place.
  reply_to    TEXT,

  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT venue_email_senders_email_shape CHECK (email LIKE '%@%.%')
);

-- One row per address per venue (case-insensitive — mail addresses aren't).
CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_email_senders_unique
  ON public.venue_email_senders (venue_id, lower(email));

-- At most one default per venue.
CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_email_senders_one_default
  ON public.venue_email_senders (venue_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_venue_email_senders_venue
  ON public.venue_email_senders (venue_id, sort_order);

CREATE OR REPLACE FUNCTION public.set_venue_email_senders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venue_email_senders_updated_at ON public.venue_email_senders;
CREATE TRIGGER trg_venue_email_senders_updated_at
  BEFORE UPDATE ON public.venue_email_senders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_venue_email_senders_updated_at();

-- ===== 2. RLS =====
-- Tighter than this codebase's usual permissive pattern on purpose: this table
-- decides which addresses the platform is willing to send AS. A member who could
-- insert a row here could plant an address for an admin to unknowingly send from.
-- Admin-only, both directions. send-broadcast uses the service-role key and is
-- unaffected.

ALTER TABLE public.venue_email_senders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users a
     WHERE a.auth_user_id = auth.uid()
       AND a.is_active
  );
$$;

CREATE POLICY "venue_email_senders_select" ON public.venue_email_senders
  FOR SELECT USING (public.is_active_admin());

CREATE POLICY "venue_email_senders_insert" ON public.venue_email_senders
  FOR INSERT WITH CHECK (public.is_active_admin());

-- FOR UPDATE needs both USING and WITH CHECK — USING alone updates 0 rows.
CREATE POLICY "venue_email_senders_update" ON public.venue_email_senders
  FOR UPDATE USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE POLICY "venue_email_senders_delete" ON public.venue_email_senders
  FOR DELETE USING (public.is_active_admin());

-- New public-schema tables need explicit grants (RLS alone grants nothing).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_email_senders TO authenticated;
GRANT ALL ON public.venue_email_senders TO service_role;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated, service_role;

-- ===== 3. Persist the choice on the broadcast =====
-- Not read from the venue at send time: the cron drainer finishes quota-deferred
-- recipients hours later, and a broadcast that started as finance@ must not
-- finish as info@.

ALTER TABLE public.email_broadcasts
  ADD COLUMN IF NOT EXISTS from_email     TEXT,
  ADD COLUMN IF NOT EXISTS from_label     TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_email TEXT;

COMMENT ON COLUMN public.email_broadcasts.from_email IS
  'Sender chosen at compose time, resolved from venue_email_senders. NULL on pre-existing broadcasts, which fall back to venues.broadcast_from_email.';

-- ===== 4. Seed VCA =====

INSERT INTO public.venue_email_senders (venue_id, email, label, reply_to, is_default, sort_order)
SELECT v.id, 'info@vaalcruising.co.za', v.name, NULL, TRUE, 0
FROM public.venues v
WHERE v.slug = 'vca'
ON CONFLICT DO NOTHING;

INSERT INTO public.venue_email_senders (venue_id, email, label, reply_to, is_default, sort_order)
SELECT v.id, 'finance@vaalcruising.co.za', v.name || ' Finance', NULL, FALSE, 1
FROM public.venues v
WHERE v.slug = 'vca'
ON CONFLICT DO NOTHING;
