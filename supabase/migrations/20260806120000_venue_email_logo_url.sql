-- Email-safe venue logo.
--
-- `venues.logo_url` is an *app* asset reference. For VCA it was '/vca-logo.svg',
-- which breaks in email two ways:
--   1. root-relative — an email client has no base URL, so the <img> never loads
--   2. SVG — Gmail, Outlook and Apple Mail strip SVG entirely
-- Neither shows up in the browser, so every branded email has been going out
-- with a broken logo.
--
-- `email_logo_url` is the explicit, per-tenant override: an absolute https URL
-- to a raster (PNG/JPG) image. The shared email template
-- (supabase/functions/_shared/emailTemplate.ts) prefers it, falls back to
-- resolving logo_url against the venue's portal domain, and refuses SVG.

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS email_logo_url TEXT;

COMMENT ON COLUMN public.venues.email_logo_url IS
  'Absolute https URL to a raster logo (PNG/JPG) used in outgoing email. Email clients cannot resolve relative paths and strip SVG, so this is kept separate from logo_url. Keep the file small (~20-40 KB) — it ships with every message.';

-- VCA: point at the email-sized PNG (480x306, ~22 KB) served from the club's
-- own portal domain, rather than the 4500px source or the unusable SVG.
UPDATE public.venues
SET email_logo_url = 'https://portal.vaalcruising.co.za/vca-logo-email.png'
WHERE slug = 'vca'
  AND email_logo_url IS NULL;
