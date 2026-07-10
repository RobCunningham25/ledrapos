-- Partner emails on broadcasts become opt-in per send. With partners always
-- included, a full-club send blew past the Resend free-tier daily threshold
-- (95 with headroom, 100 hard). The compose page now has an "include partner
-- emails" toggle carried in recipient_filter as {"include_partners": true};
-- default (absent/false) sends to members only.
--
-- Signature and RETURNS are unchanged from 20260710120000, so CREATE OR
-- REPLACE is safe here.

CREATE OR REPLACE FUNCTION select_broadcast_recipients(
  p_venue_id uuid,
  p_filter   jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  id             uuid,
  email          text,
  status         text,
  recipient_type text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_member_ids       uuid[];
  v_include_partners boolean;
BEGIN
  IF p_filter ? 'member_ids' THEN
    SELECT array_agg(j::uuid)
      INTO v_member_ids
      FROM jsonb_array_elements_text(p_filter->'member_ids') j;
  END IF;

  v_include_partners := COALESCE((p_filter->>'include_partners')::boolean, false);

  RETURN QUERY
  -- One row per member (as before)
  SELECT
    m.id,
    COALESCE(m.email, '')::text AS email,
    CASE
      WHEN m.email IS NULL OR m.email = '' THEN 'no_email_skipped'
      WHEN m.email_opt_out                THEN 'opted_out_skipped'
      ELSE                                     'pending'
    END::text AS status,
    'member'::text AS recipient_type
  FROM members m
  WHERE m.venue_id  = p_venue_id
    AND m.is_active = true
    AND (v_member_ids IS NULL OR m.id = ANY(v_member_ids))

  UNION ALL

  -- One extra row per member whose partner has a distinct email address,
  -- only when the send explicitly includes partners.
  SELECT
    m.id,
    m.partner_email::text AS email,
    CASE
      WHEN m.email_opt_out THEN 'opted_out_skipped'
      ELSE                      'pending'
    END::text AS status,
    'partner'::text AS recipient_type
  FROM members m
  WHERE v_include_partners
    AND m.venue_id  = p_venue_id
    AND m.is_active = true
    AND (v_member_ids IS NULL OR m.id = ANY(v_member_ids))
    AND m.partner_email IS NOT NULL
    AND m.partner_email <> ''
    AND lower(m.partner_email) IS DISTINCT FROM lower(COALESCE(m.email, ''));
END;
$$;
