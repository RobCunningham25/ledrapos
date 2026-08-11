-- The seed derived the finance label from the venue name, giving
-- "Vaal Cruising Association Finance <finance@…>" — accurate but long enough to
-- truncate in most inbox list views. "VCA Finance" is what members would call it.
--
-- Separate migration rather than editing the seed: 20260813120000 has already run
-- on production, so amending it in place would leave prod and a fresh environment
-- silently disagreeing.

UPDATE public.venue_email_senders s
SET label = 'VCA Finance'
FROM public.venues v
WHERE v.id = s.venue_id
  AND v.slug = 'vca'
  AND lower(s.email) = 'finance@vaalcruising.co.za';
