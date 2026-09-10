-- Overdue water sign-out check: every 5 minutes, invoke check-overdue-signouts
-- so a trip past its expected_return_at pages the venue's water_safety_contacts
-- (email always; WhatsApp once a Meta-approved template SID is configured).
-- Tighter interval than the 15-minute booking-expiry cron since this one is
-- safety-critical.
--
-- The function is idempotent and takes no input (unauthenticated invocation is
-- harmless — it only ever alerts on trips that are already overdue, and
-- overdue_alert_sent_at stops it re-firing for the same trip), same reasoning
-- as expire-eft-bookings.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'check-overdue-signouts',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fgquwzzyudgcmfbuvmch.supabase.co/functions/v1/check-overdue-signouts',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  $$
);
