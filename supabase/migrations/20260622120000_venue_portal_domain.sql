-- Add optional per-venue portal custom domain.
-- When set, invite emails redirect to https://{portal_domain}/accept-invite
-- instead of the default https://pos.ledra.co.za/{slug}/portal/accept-invite.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS portal_domain TEXT;

-- Set for VCA whose portal lives at portal.vaalcruising.co.za
UPDATE venues SET portal_domain = 'portal.vaalcruising.co.za' WHERE slug = 'vca';
