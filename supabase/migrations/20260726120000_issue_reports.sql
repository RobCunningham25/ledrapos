-- Member issue reports / suggestions box.
-- Portal members submit an issue or suggestion with optional photos at
-- /:slug/portal/report-issue; admins review at /:slug/admin/issues.

CREATE TABLE IF NOT EXISTS issue_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  member_id        UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  category         TEXT NOT NULL DEFAULT 'issue'
                   CHECK (category IN ('issue', 'suggestion', 'other')),
  message          TEXT NOT NULL,
  attachment_paths TEXT[] NOT NULL DEFAULT '{}',  -- paths in issue-attachments bucket

  -- Reporter snapshot so the admin view stays meaningful even if the member
  -- record is later edited or removed.
  reporter_name    TEXT,
  reporter_email   TEXT,

  -- Admin workflow
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'in_progress', 'resolved')),
  admin_notes      TEXT,
  resolved_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_issue_reports_venue_status
  ON issue_reports (venue_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_reports_member
  ON issue_reports (venue_id, member_id);

ALTER TABLE issue_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated portal members can submit (the Edge Function uses the service
-- role and bypasses RLS; this also covers direct client inserts).
CREATE POLICY "issue_reports_insert" ON issue_reports
  FOR INSERT WITH CHECK (venue_id IS NOT NULL);

-- Authenticated users (admins) can read and update. Cross-venue isolation is
-- enforced in code (queries always .eq('venue_id', venueId)).
CREATE POLICY "issue_reports_select" ON issue_reports
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "issue_reports_update" ON issue_reports
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "issue_reports_delete" ON issue_reports
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- New public-schema tables need explicit grants (RLS alone doesn't grant privileges).
GRANT SELECT, INSERT, UPDATE, DELETE ON issue_reports TO authenticated;
GRANT ALL ON issue_reports TO service_role;

-- ===== issue-attachments storage bucket =====
-- Private bucket: authenticated members upload photos, authenticated admins read.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'issue-attachments',
  'issue-attachments',
  false,
  10485760, -- 10 MB per file (phone photos can be large)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated members can upload
CREATE POLICY "issue_attachments_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'issue-attachments');

-- Authenticated users (admins + the uploading member) can read
CREATE POLICY "issue_attachments_authenticated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'issue-attachments');

-- Authenticated users can delete (member removes before submit / admin cleanup)
CREATE POLICY "issue_attachments_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'issue-attachments');
