-- Per-venue calendar subscription token.
--
-- Backs the public `calendar-feed` Edge Function, which serves an iCalendar
-- (.ics) feed of the venue's club events that Outlook / Google / Apple Calendar
-- can subscribe to. The token makes the feed URL unguessable so the endpoint
-- can stay unauthenticated (calendar apps can't log in), while still being
-- shared by every member of the venue — the feed contains only public club
-- events, no per-member data.
--
-- Rotating the token (set it to a fresh gen_random_uuid()) instantly
-- invalidates every previously-handed-out subscription URL for that venue.

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS calendar_feed_token uuid NOT NULL DEFAULT gen_random_uuid();

-- One token per venue; also lets the feed function look a venue up by token.
CREATE UNIQUE INDEX IF NOT EXISTS venues_calendar_feed_token_key
  ON public.venues (calendar_feed_token);
