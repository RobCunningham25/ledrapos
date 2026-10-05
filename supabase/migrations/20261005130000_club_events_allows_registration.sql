-- Events that take competition / participant entries (e.g. the potjie
-- competition), separate from eating RSVPs. Entries live in event_participants.
ALTER TABLE club_events
  ADD COLUMN IF NOT EXISTS allows_registration BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE club_events
   SET allows_registration = TRUE
 WHERE id = '3a69fa08-78b5-4dd0-9a3a-a31181297b9b'
   AND event_date = '2026-10-31';
