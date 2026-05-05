-- VCA contact info for broadcast emails:
--   address      → injected into the broadcast footer (POPIA compliance)
--   contact_email → used as Reply-To on broadcasts so member replies land in the
--                   shared inbox rather than the no-reply sender mailbox.
-- Both must be set before broadcasts can be sent (compose UI blocks otherwise).

UPDATE venues
SET
  address       = 'Aloe Fjord, R54, Vaal Dam, Gauteng',
  contact_email = 'info@vaalcruising.co.za'
WHERE slug = 'vca';
