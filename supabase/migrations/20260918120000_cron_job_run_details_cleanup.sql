-- pg_cron's own execution log (cron.job_run_details) is never pruned by
-- Supabase or by pg_cron itself. With 5 jobs running as often as every
-- 5/10/15 minutes, this table grows forever and is never autovacuumed
-- (checked 2026-09-18: 18k+ rows, 24MB, autovacuum_count = 0 — by far the
-- largest table in the whole database, all real app tables are <1MB).
-- That constant unbounded write growth is what was driving the "Disk IO
-- Budget" warning, not application queries. Prune anything older than 3
-- days, daily at 03:00 UTC (05:00 SAST) — well outside any batch job window.

SELECT cron.schedule(
  'cron-job-run-details-cleanup',
  '0 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days'$$
);
