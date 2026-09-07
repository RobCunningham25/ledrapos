-- Individual admin note entries per member (add / remove one at a time),
-- replacing the single free-text member_admin_notes.notes blob.
--
-- Same admin-only RLS as member_admin_notes — members must never see these.
-- Gate remotes stay on member_admin_notes (one row per member); only the
-- free-text notepad becomes a list.

CREATE TABLE IF NOT EXISTS public.member_admin_note_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  -- auth.uid() of the admin who added it, for "added by" display. Nullable:
  -- historical rows and service-role inserts won't have one.
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_admin_note_items_member
  ON public.member_admin_note_items (venue_id, member_id, created_at DESC);

-- Carry over any existing single-blob notes as a first entry (no-op today —
-- the table is empty — but keeps the migration safe to replay).
INSERT INTO public.member_admin_note_items (venue_id, member_id, body, created_at)
SELECT venue_id, member_id, notes, updated_at
FROM public.member_admin_notes
WHERE notes IS NOT NULL AND btrim(notes) <> '';

ALTER TABLE public.member_admin_notes DROP COLUMN IF EXISTS notes;

-- ===== RLS: admin-only, both directions (mirrors member_admin_notes) =====

ALTER TABLE public.member_admin_note_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_admin_note_items_select" ON public.member_admin_note_items
  FOR SELECT USING (public.is_active_admin());

CREATE POLICY "member_admin_note_items_insert" ON public.member_admin_note_items
  FOR INSERT WITH CHECK (public.is_active_admin());

CREATE POLICY "member_admin_note_items_update" ON public.member_admin_note_items
  FOR UPDATE USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE POLICY "member_admin_note_items_delete" ON public.member_admin_note_items
  FOR DELETE USING (public.is_active_admin());

-- New public-schema tables need explicit grants. No anon grant: admin-only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_admin_note_items TO authenticated;
GRANT ALL ON public.member_admin_note_items TO service_role;
