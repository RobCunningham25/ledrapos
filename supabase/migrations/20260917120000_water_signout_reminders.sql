-- Two-stage water sign-out escalation.
--
-- Previously check-overdue-signouts alerted the safety contacts the moment a
-- trip passed expected_return_at. That's a false-alarm machine — most
-- "overdue" cases are just someone forgetting to tap sign-in, not an actual
-- emergency. Now the MEMBER gets nudged first (vca_water_signout_reminder_v1,
-- WhatsApp quick-reply buttons "Still out, but OK 👍" / "Still out, need
-- help 🚨"), and the safety contacts (vca_water_safety_overdue_v1) are only
-- paged after a grace period with no response, or immediately on the
-- "need help" button. See supabase/functions/_shared/waterSignoutAlerts.ts.

ALTER TABLE water_signouts
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS help_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snoozed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snooze_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN water_signouts.reminder_sent_at IS
  'When the member-facing "did you forget to sign in?" reminder was sent. Cleared on snooze so a fresh reminder can fire against the new expected_return_at.';
COMMENT ON COLUMN water_signouts.help_requested_at IS
  'Set when the member taps "Still out, need help" — triggers immediate escalation to water_safety_contacts, bypassing the grace period.';
COMMENT ON COLUMN water_signouts.snoozed_at IS
  'Last time the member tapped "Still out, but OK" to push expected_return_at back.';
