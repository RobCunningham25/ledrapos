-- Fix: the digital application form is served at portal.vaalcruising.co.za/apply
-- (the portal custom domain — see src/App.tsx's customDomainConfig.section ===
-- 'portal' route tree), not pos.ledra.co.za/vca/apply. The July 2026 prospective
-- member FAQ seed used the wrong host; correct the already-seeded rows in place
-- rather than re-running the whole seed migration.

UPDATE venue_knowledge
   SET body = REPLACE(body, 'https://pos.ledra.co.za/vca/apply', 'https://portal.vaalcruising.co.za/apply')
 WHERE source = 'Prospective member FAQ'
   AND body LIKE '%pos.ledra.co.za/vca/apply%'
   AND venue_id IN (SELECT id FROM venues WHERE slug = 'vca');
