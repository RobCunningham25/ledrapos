-- Booking email notifications
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Idempotency guards so the confirmation / EFT-watch emails are sent once,
--    even if the yoco-webhook retries or a guest re-selects EFT.
-- 2. A daily 08:00 SAST (06:00 UTC) reminder cron. The booking-schedule-reminders
--    Edge Function branches on the day of week:
--      * Friday   → weekend roundup (check-ins Fri/Sat/Sun) → manager@
--      * Mon–Thu  → that day's check-ins → manager@ (cc info@)
--      * Sat/Sun  → no-op (weekend already covered by Friday's roundup)

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS eft_watch_email_sent_at    timestamptz;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent re-schedule: drop any prior job of the same name first.
SELECT cron.unschedule('booking-schedule-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'booking-schedule-reminders');

SELECT cron.schedule(
  'booking-schedule-reminders',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fgquwzzyudgcmfbuvmch.supabase.co/functions/v1/booking-schedule-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  $$
);
