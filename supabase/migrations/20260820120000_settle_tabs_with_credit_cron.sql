-- Weekly credit settlement: every Monday 06:00 SAST (04:00 UTC), invoke the
-- settle-tabs-with-credit Edge Function so open bar tabs get paid down (or
-- closed) with each member's own account credit before that week's tab
-- reminders go out. See settle-tabs-with-credit/index.ts for the settlement
-- logic; process_payment remains the only place money moves (rule 6).
--
-- The function is idempotent and takes no input, so unauthenticated
-- invocation is harmless — it only ever applies credit a member already has
-- against debt they already owe.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'settle-tabs-with-credit-weekly',
  '0 4 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://fgquwzzyudgcmfbuvmch.supabase.co/functions/v1/settle-tabs-with-credit',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  $$
);
