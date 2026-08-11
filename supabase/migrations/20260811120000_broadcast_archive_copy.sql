-- Broadcast archive copy.
--
-- Clubs want a copy of every member broadcast landing in the club inbox, so
-- there's a record of what went out sitting alongside the replies it generates.
--
-- Deliberately ONE copy per broadcast, not a BCC on every message. Resend's free
-- tier is 100 emails/day and the worker sends up to 95. VCA has ~74 active
-- members, so BCC-per-email would make a single broadcast ~148 sends — every
-- broadcast would blow the daily quota and spill half its recipients to the next
-- day, while dumping 74 near-identical copies in the club inbox. The archive copy
-- costs exactly one extra send and shows the same rendered email members receive.
--
-- `email_broadcasts.archive_sent_at` is the idempotency guard: the worker runs
-- more than once per broadcast (send-broadcast invokes it, then the pg_cron
-- drainer finishes any quota-deferred remainder), and the archive must not be
-- resent on each pass.

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS broadcast_archive_email TEXT;

COMMENT ON COLUMN public.venues.broadcast_archive_email IS
  'Optional club inbox that receives a single archive copy of each member broadcast (sent before the member run, subject prefixed "[Copy]", no unsubscribe link). Costs one Resend send per broadcast. NULL disables archiving.';

ALTER TABLE public.email_broadcasts
  ADD COLUMN IF NOT EXISTS archive_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.email_broadcasts.archive_sent_at IS
  'When the archive copy went to venues.broadcast_archive_email. Idempotency guard — process-broadcast-batch runs multiple times per broadcast (initial invoke + cron drainer) and must only archive once.';

-- VCA: club inbox.
UPDATE public.venues
SET broadcast_archive_email = 'info@vaalcruising.co.za'
WHERE slug = 'vca'
  AND broadcast_archive_email IS NULL;
