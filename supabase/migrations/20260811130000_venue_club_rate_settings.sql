-- Permanent caravan site + electricity rates for the portal "Current Club Rates" modal.
--
-- These live in venue_settings rather than in code because they are re-set by the
-- committee (typically at the AGM) and the modal is member-facing — a stale figure
-- here is a member being quoted the wrong price. Editable from Admin → Settings.
--
-- Stored in CENTS as text, consistent with the rest of the platform's money handling.

INSERT INTO venue_settings (venue_id, key, value)
SELECT v.id, x.key, x.value
FROM venues v
CROSS JOIN (VALUES
  ('rate_caravan_site_annual_cents', '544700'),
  ('rate_electricity_annual_cents', '309500')
) AS x(key, value)
WHERE v.slug = 'vca'
ON CONFLICT ON CONSTRAINT venue_settings_venue_id_key_key
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
