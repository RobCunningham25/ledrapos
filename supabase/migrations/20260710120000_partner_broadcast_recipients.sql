-- Partner broadcast recipients.
-- Members can record a partner email; partners now receive broadcast emails as an
-- additional recipient row on the same member. recipient_type distinguishes the two
-- rows so delivery state is tracked per address. The partner shares the member's
-- unsubscribe token — unsubscribing opts out the whole household (membership is
-- per family at VCA).

-- ===== broadcast_recipients: allow one member row + one partner row =====
ALTER TABLE broadcast_recipients
  ADD COLUMN recipient_type TEXT NOT NULL DEFAULT 'member'
  CHECK (recipient_type IN ('member', 'partner'));

ALTER TABLE broadcast_recipients
  DROP CONSTRAINT broadcast_recipients_unique;

ALTER TABLE broadcast_recipients
  ADD CONSTRAINT broadcast_recipients_unique UNIQUE (broadcast_id, member_id, recipient_type);

-- ===== select_broadcast_recipients =====
-- RETURNS TABLE shape changes (adds recipient_type), so DROP + CREATE — CREATE OR
-- REPLACE cannot change a function's output columns (SQLSTATE 42P13).

DROP FUNCTION IF EXISTS select_broadcast_recipients(uuid, jsonb);

CREATE FUNCTION select_broadcast_recipients(
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
  v_member_ids uuid[];
BEGIN
  IF p_filter ? 'member_ids' THEN
    SELECT array_agg(j::uuid)
      INTO v_member_ids
      FROM jsonb_array_elements_text(p_filter->'member_ids') j;
  END IF;

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

  -- One extra row per member whose partner has a distinct email address.
  -- Household opt-out: the member's email_opt_out suppresses the partner too.
  SELECT
    m.id,
    m.partner_email::text AS email,
    CASE
      WHEN m.email_opt_out THEN 'opted_out_skipped'
      ELSE                      'pending'
    END::text AS status,
    'partner'::text AS recipient_type
  FROM members m
  WHERE m.venue_id  = p_venue_id
    AND m.is_active = true
    AND (v_member_ids IS NULL OR m.id = ANY(v_member_ids))
    AND m.partner_email IS NOT NULL
    AND m.partner_email <> ''
    AND lower(m.partner_email) IS DISTINCT FROM lower(COALESCE(m.email, ''));
END;
$$;

GRANT EXECUTE ON FUNCTION select_broadcast_recipients(uuid, jsonb) TO anon, authenticated, service_role;
