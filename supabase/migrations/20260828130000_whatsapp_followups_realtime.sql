-- Enable Realtime on whatsapp_followups too, so the WhatsApp Follow-ups
-- sidebar can live-update its "waiting on me" dots (a new escalation
-- appearing, one being resolved) without a manual refresh — same reasoning
-- as whatsapp_messages in the previous migration.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'whatsapp_followups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_followups;
  END IF;
END $$;
