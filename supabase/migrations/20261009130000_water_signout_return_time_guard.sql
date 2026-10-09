-- Water sign-out: guard expected_return_at at the database level.
--
-- The overdue alert only fires once expected_return_at has passed, so a return
-- time days in the future (typo, wrong date picker, or a forgotten sign-in on
-- a trip that really ended) silently disables the safety net for that member
-- AND leaves a phantom "out" row that blocks their next sign-out via
-- idx_water_signouts_one_open_per_member. Seen in production 2026-10-04: a
-- 5-day return time on a day trip.
--
-- Enforced in a trigger (not a CHECK) because it depends on now(). Covers
-- every write path at once: portal, WhatsApp AI tool, snooze button, admin.

CREATE OR REPLACE FUNCTION public.water_signouts_guard_return_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  max_hours CONSTANT integer := 24;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'out' THEN
      IF NEW.expected_return_at <= now() THEN
        RAISE EXCEPTION 'Expected return time must be in the future.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.expected_return_at > now() + make_interval(hours => max_hours) THEN
        RAISE EXCEPTION 'Expected return time must be within % hours of sign-out. For a longer trip, sign out again each day.', max_hours
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSIF NEW.status = 'out'
        AND NEW.expected_return_at IS DISTINCT FROM OLD.expected_return_at
        AND NEW.expected_return_at > now() + make_interval(hours => max_hours) THEN
    -- Updates (snooze, admin edits): only the upper bound; a past value is
    -- harmless there because it just makes the trip overdue sooner.
    RAISE EXCEPTION 'Expected return time must be within % hours from now.', max_hours
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_water_signouts_guard_return_time ON public.water_signouts;
CREATE TRIGGER trg_water_signouts_guard_return_time
  BEFORE INSERT OR UPDATE ON public.water_signouts
  FOR EACH ROW EXECUTE FUNCTION public.water_signouts_guard_return_time();
