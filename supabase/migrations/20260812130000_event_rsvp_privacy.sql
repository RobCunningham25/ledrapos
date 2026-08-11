-- Tighten event_rsvps reads.
--
-- The initial policy let any signed-in member SELECT every RSVP row, which
-- includes other members' free-text notes (dietary requirements, allergies) —
-- personal information that shouldn't leave the club's admins.
--
-- Members now read only their own RSVP; admins still read everything. The
-- "N people are going" head count members see in the portal comes from an
-- aggregate-only RPC instead, which exposes no names and no notes.

DROP POLICY IF EXISTS "event_rsvps_select" ON event_rsvps;

CREATE POLICY "event_rsvps_select" ON event_rsvps
  FOR SELECT USING (can_write_event_rsvp(member_id));

-- Aggregate head counts per occurrence. SECURITY DEFINER so it sees past the
-- policy above; it returns counts only, never member identity or notes.
CREATE OR REPLACE FUNCTION public.event_rsvp_counts(
  p_venue_id UUID,
  p_from     DATE,
  p_to       DATE
)
RETURNS TABLE (
  event_id        UUID,
  occurrence_date DATE,
  parties         BIGINT,
  heads           BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.event_id,
         r.occurrence_date,
         COUNT(*)                     AS parties,
         SUM(r.adults + r.children)   AS heads
    FROM event_rsvps r
   WHERE r.venue_id = p_venue_id
     AND r.status = 'attending'
     AND r.occurrence_date >= p_from
     AND r.occurrence_date <= p_to
   GROUP BY r.event_id, r.occurrence_date;
$$;

GRANT EXECUTE ON FUNCTION public.event_rsvp_counts(UUID, DATE, DATE) TO authenticated, service_role;
