-- Admin-only notes on a member: gate-remote positions and a free-text notepad.
--
-- NOT visible to members. The members table's RLS is permissive (SELECT USING
-- true) and members hold authenticated Supabase sessions on the portal, so a
-- curious member could read any column added to members directly. These live in
-- a separate table gated by is_active_admin() in BOTH directions — the same
-- tighter-than-usual pattern as venue_email_senders.

CREATE TABLE IF NOT EXISTS public.member_admin_notes (
  member_id     UUID PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  venue_id      UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  -- Gate-remote positions handed to this member, e.g. {'47','48','49'}. Text,
  -- not int — positions like '12A' turn up.
  gate_remotes  TEXT[] NOT NULL DEFAULT '{}',
  -- Free-text admin notepad. Anything that doesn't have its own field.
  notes         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_admin_notes_venue
  ON public.member_admin_notes (venue_id);

CREATE OR REPLACE FUNCTION public.set_member_admin_notes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_admin_notes_updated_at ON public.member_admin_notes;
CREATE TRIGGER trg_member_admin_notes_updated_at
  BEFORE UPDATE ON public.member_admin_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_member_admin_notes_updated_at();

-- ===== RLS: admin-only, both directions =====
-- is_active_admin() already exists (venue_email_senders migration). It returns
-- true for any active admin_users row (admin, superadmin, or manager), which is
-- the right audience for gate remotes and operational notes.

ALTER TABLE public.member_admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_admin_notes_select" ON public.member_admin_notes
  FOR SELECT USING (public.is_active_admin());

CREATE POLICY "member_admin_notes_insert" ON public.member_admin_notes
  FOR INSERT WITH CHECK (public.is_active_admin());

-- FOR UPDATE needs both USING and WITH CHECK — USING alone updates 0 rows.
CREATE POLICY "member_admin_notes_update" ON public.member_admin_notes
  FOR UPDATE USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE POLICY "member_admin_notes_delete" ON public.member_admin_notes
  FOR DELETE USING (public.is_active_admin());

-- New public-schema tables need explicit grants (RLS alone grants nothing).
-- Deliberately no anon grant: this table is admin-only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_admin_notes TO authenticated;
GRANT ALL ON public.member_admin_notes TO service_role;
