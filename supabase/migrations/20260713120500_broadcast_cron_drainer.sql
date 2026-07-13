-- Broadcast cron drainer: every 10 minutes, re-invoke process-broadcast-batch
-- for any broadcast with work outstanding. This completes:
--   * quota spillover — sends that exceeded the 95/day Resend threshold resume
--     automatically after the daily reset at midnight UTC (02:00 SAST);
--   * scheduled sends — 'queued' broadcasts whose scheduled_for has passed;
--   * crash recovery — 'queued' immediate sends whose synchronous worker
--     invocation failed.
--
-- The worker is idempotent and concurrency-safe (claim_broadcast_batch uses
-- FOR UPDATE SKIP LOCKED), so an overlap between the cron tick and a live
-- send-broadcast invocation is harmless.
--
-- Auth: the X-Broadcast-Worker-Token header is read from Vault at run time.
-- The secret named 'broadcast_worker_token' must exist in Vault holding the
-- same value as the BROADCAST_WORKER_TOKEN function secret (never commit the
-- value itself; it is inserted operationally, not in a migration).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'drain-email-broadcasts',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fgquwzzyudgcmfbuvmch.supabase.co/functions/v1/process-broadcast-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Broadcast-Worker-Token',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'broadcast_worker_token')
    ),
    body := jsonb_build_object('broadcast_id', b.id),
    timeout_milliseconds := 30000
  )
  FROM (
    SELECT eb.id
    FROM email_broadcasts eb
    WHERE (
        eb.status = 'sending'
        AND EXISTS (
          SELECT 1 FROM broadcast_recipients br
          WHERE br.broadcast_id = eb.id AND br.status = 'pending'
        )
      )
      OR (
        eb.status = 'queued'
        AND (eb.scheduled_for IS NULL OR eb.scheduled_for <= NOW())
        -- Give the synchronous path a minute before treating it as stalled.
        AND eb.created_at < NOW() - INTERVAL '2 minutes'
      )
    ORDER BY eb.created_at
    LIMIT 3
  ) b
  $$
);
