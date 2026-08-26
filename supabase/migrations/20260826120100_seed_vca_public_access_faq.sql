-- Seed: public-access FAQ into venue_knowledge, for the prospect-facing
-- WhatsApp assistant. VCA is a private members-only club — the single most
-- common question a stranger texting the club's WhatsApp number will ask is
-- some form of "can I come use the water", and the assistant must answer it
-- correctly rather than guessing.
--
-- Idempotent: re-running deletes and reinserts this batch by its `source` tag.

DELETE FROM venue_knowledge
 WHERE source = 'Public access FAQ'
   AND venue_id IN (SELECT id FROM venues WHERE slug = 'vca');

INSERT INTO venue_knowledge (venue_id, category, title, body, keywords, tags, source, priority)
SELECT v.id, x.category, x.title, x.body, x.keywords, x.tags, 'Public access FAQ', x.priority
FROM venues v
CROSS JOIN (VALUES

  ('membership', 'Can I launch my boat or use the water without being a member?',
   E'No — VCA is a private members-only club, not a public boat launch or public stretch of water. There is no day-pass, public launch fee, or public access of any kind.\n\nThe only ways to be on the property or the water are: (1) as a member, or (2) as the guest of a member, which comes with limits (a guest may visit up to four times a year, and any bigger group needs prior arrangement with the committee).\n\nIf you want ongoing access, the way in is to apply for membership.',
   'can I launch my boat, public launch, day visitor, day pass, non member access, use the water without joining, is the club open to the public, can anyone launch here, public slipway, public boat ramp',
   ARRAY['membership','access','guests'], 10),

  ('membership', 'Is VCA open to the public / can I just come and look around?',
   E'VCA is a private club, so you can''t simply walk in or visit as a member of the public. The normal way to see the club is to be invited by an existing member as their guest, or to come along when you''re in the process of applying for membership (your proposer is expected to introduce you around during the application''s scrutiny period).\n\nIf you don''t yet know a member, the club welcomes genuine enquiries — ask and someone can point you in the right direction.',
   'is the club open to the public, can I visit, come look around, tour the club, open day, public access, non member visit',
   ARRAY['membership','access'], 8)

) AS x(category, title, body, keywords, tags, priority)
WHERE v.slug = 'vca';
