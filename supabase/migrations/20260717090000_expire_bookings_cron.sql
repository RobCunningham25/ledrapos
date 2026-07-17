-- EFT booking expiry cron: every 15 minutes, invoke the expire-bookings Edge
-- Function so PENDING bookings past their deadline flip to EXPIRED and stop
-- blocking caravan-site availability (the portal conflict check only counts
-- PENDING + PAID). Covers:
--   * EFT bookings whose 24h expires_at has passed;
--   * abandoned bookings where no payment method was ever chosen (48h grace,
--     enforced inside the function).
--
-- The function is idempotent and takes no input, so unauthenticated invocation
-- is harmless (it only ever expires rows that are already overdue). The admin
-- "Process Expired" button calls the same function.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'expire-eft-bookings',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fgquwzzyudgcmfbuvmch.supabase.co/functions/v1/expire-bookings',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  $$
);
