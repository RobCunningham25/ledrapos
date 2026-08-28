-- Enable Realtime on whatsapp_messages so the admin conversation UI (WhatsApp
-- Assistant "Recent conversations" + the Follow-ups drawer) can show new
-- inbound/outbound messages and status updates live instead of only on the
-- next manual refresh/reselect.
--
-- Guarded with an existence check since ALTER PUBLICATION ... ADD TABLE
-- errors (not no-ops) if the table is already a publication member, and
-- migrations must stay re-runnable.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
  END IF;
END $$;
