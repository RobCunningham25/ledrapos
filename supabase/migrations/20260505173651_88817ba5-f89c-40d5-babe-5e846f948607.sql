-- Phase B/C of Member Broadcast Email feature.
-- Storage bucket for attachments + recipient-resolution SQL helper.

-- ===== broadcast-attachments storage bucket =====
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'broadcast-attachments',
  'broadcast-attachments',
  false,
  5242880, -- 5 MB per file
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for broadcast-attachments. Matches the codebase's permissive pattern:
-- authenticated users can read/write/delete; venue isolation is enforced at the UI/EF
-- layer (admin UI scopes paths by venue_id; Edge Functions use service-role).
CREATE POLICY "broadcast_attachments_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'broadcast-attachments');

CREATE POLICY "broadcast_attachments_authenticated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'broadcast-attachments');

CREATE POLICY "broadcast_attachments_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'broadcast-attachments');

-- ===== claim_broadcast_batch =====
-- Atomically claims up to p_limit pending broadcast_recipients for a given broadcast,
-- flips them to 'sending', and returns the joined data the worker needs to call Resend
-- (unsubscribe_token comes from members so the worker can build per-member List-Unsubscribe).
-- Uses FOR UPDATE SKIP LOCKED so multiple workers can run safely.

CREATE OR REPLACE FUNCTION claim_broadcast_batch(
  p_broadcast_id uuid,
  p_limit        int DEFAULT 25
)
RETURNS TABLE(
  recipient_id      uuid,
  member_id         uuid,
  email             text,
  unsubscribe_token uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE broadcast_recipients br
    SET status     = 'sending',
        attempts   = attempts + 1,
        updated_at = NOW()
    WHERE br.id IN (
      SELECT br2.id
      FROM broadcast_recipients br2
      WHERE br2.broadcast_id = p_broadcast_id
        AND br2.status       = 'pending'
      ORDER BY br2.id
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING br.id, br.member_id, br.email
  )
  SELECT c.id, c.member_id, c.email, m.unsubscribe_token
  FROM claimed c
  JOIN members m ON m.id = c.member_id;
END;
$$;

-- ===== select_broadcast_recipients =====
-- Resolves the recipient set for a broadcast given a venue and filter.
-- Returns one row per candidate member with a status indicating whether they will
-- be sent ('pending') or skipped ('no_email_skipped' / 'opted_out_skipped').
-- Used by both send-broadcast (to enqueue) and (later) the compose UI preview.
--
-- Supported filter shape (Phase B MVP):
--   {} — all active members of the venue
--   {"member_ids": ["<uuid>", ...]} — only the listed members (used for testing/segments)

CREATE OR REPLACE FUNCTION select_broadcast_recipients(
  p_venue_id uuid,
  p_filter   jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  id     uuid,
  email  text,
  status text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_member_ids uuid[];
BEGIN
  IF p_filter ? 'member_ids' THEN
    SELECT array_agg(j::uuid)
      INTO v_member_ids
      FROM jsonb_array_elements_text(p_filter->'member_ids') j;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    COALESCE(m.email, '')::text AS email,
    CASE
      WHEN m.email IS NULL OR m.email = '' THEN 'no_email_skipped'
      WHEN m.email_opt_out                THEN 'opted_out_skipped'
      ELSE                                     'pending'
    END::text AS status
  FROM members m
  WHERE m.venue_id  = p_venue_id
    AND m.is_active = true
    AND (v_member_ids IS NULL OR m.id = ANY(v_member_ids));
END;
$$;
