-- Seed: VCA prospective-member FAQ into venue_knowledge.
--
-- First real content batch for the search_knowledge tool. Sourced from Rob's
-- prospective-member question list (2026-07-08), refined for WhatsApp delivery:
-- plain text, self-contained, ~50-250 words, no markdown.
--
-- FEE FIGURES are taken from src/utils/membershipFees.ts — the schedule the live
-- application form actually charges — NOT from the older constitution/rules text.
-- (The draft list quoted a R2,320 joining fee; the form charges R2,494.)
--
-- Idempotent: re-running deletes and reinserts this batch by its `source` tag.

DELETE FROM venue_knowledge
 WHERE source = 'Prospective member FAQ'
   AND venue_id IN (SELECT id FROM venues WHERE slug = 'vca');

INSERT INTO venue_knowledge (venue_id, category, title, body, keywords, tags, source, priority)
SELECT v.id, x.category, x.title, x.body, x.keywords, x.tags, 'Prospective member FAQ', x.priority
FROM venues v
CROSS JOIN (VALUES

  ('membership', 'Membership categories available', E'VCA has several membership categories. These are the ones you can apply for:\n\nOrdinary — the standard adult membership. Includes your spouse or life partner and children under 12. Ordinary members may own caravan sites, a boat shed and moorings.\n\nSocial — limited to 48 days at the club per year (maximum 14 consecutive days). Includes partner and children under 19.\n\nCrew Visitor — 25% of the Ordinary annual fee, for people who sail as crew. No joining fee or levy.\n\nJunior — for a member''s child aged 12 to 18.\n\nIntermediate — for a member''s child or young adult aged 19 to 30, added onto an Ordinary membership. Intermediate members may also own caravan sites, a boat shed and moorings.\n\nThe club also has Pensioner and Life membership, but these are not categories you apply for — Pensioner is a change of status for an existing member, and Life membership is an honour conferred by the club.\n\nYou can see current fees and apply online at https://pos.ledra.co.za/vca/apply',
   'types of membership, membership categories, kinds of membership, what memberships are there, ordinary social junior intermediate crew visitor, pensioner, life member, join as what',
   ARRAY['membership','categories','joining'], 10),

  ('membership', 'How to apply to join VCA', E'To join VCA you must be proposed and seconded by two members who have each been members for at least one year.\n\nYou then submit an application — the easiest way is the digital application form at https://pos.ledra.co.za/vca/apply (a paper form is also accepted).\n\nOnce submitted, your application is posted on the club notice board for eight weeks so existing members can scrutinise it. After that period you will be interviewed by a quorum of the committee, who then vote on your application.\n\nIf you do not yet know two members who can propose and second you, come down to the club, get to know people, and ask — that is the normal way it happens.',
   'how do I join, how to apply, application form, apply for membership, become a member, proposer seconder, sign up, membership application',
   ARRAY['membership','joining','application'], 10),

  ('membership', 'The eight-week scrutiny period and committee interview', E'After you apply, your application is posted on the club notice board for eight weeks. During this time your proposer is expected to introduce you to as many members and committee members as possible — so use the period to come to the club and get to know people.\n\nAt the end of the eight weeks you are interviewed by a quorum of the committee. The committee then votes. If one third or more of the committee votes against an applicant, membership is denied.\n\nIt is worth being visible and getting involved during those eight weeks; the process is designed so that members know who is joining.',
   'probation period, scrutiny period, eight weeks, 8 weeks, notice board, committee interview, vetting, how long does it take to join, approval process',
   ARRAY['membership','joining','process'], 5),

  ('membership', 'What it costs to join VCA', E'For a new Ordinary member the costs are: a once-off joining fee of R2,494, the annual subscription of R9,979, and a levy of R1,000 a year which is payable for your first five years of membership.\n\nThe subscription is pro-rated depending on when in the club year you join.\n\nSocial membership is R6,288 a year, with the same R2,494 joining fee and the same R1,000 levy for the first five years. Crew Visitor is R2,494 a year with no joining fee and no levy. Junior membership (ages 12 to 18) is R1 a year. Intermediate (ages 19 to 30, added onto an Ordinary membership) is R2,494 a year.\n\nThe club year runs from 1 May to 30 April, and subscriptions are pro-rated by the month you apply — so joining later in the club year costs less for that first year.\n\nThe application form at https://pos.ledra.co.za/vca/apply works out your exact total for you.',
   'joining fee, how much does it cost to join, membership fees, subscription, annual fee, levy, price of membership, what do I pay, cost',
   ARRAY['membership','fees','joining'], 10),

  ('boats', 'What boats are allowed at the club', E'VCA welcomes all types of craft — sailing boats, motor cruisers, motor boats, ski boats and jet skis.\n\nThe committee does reserve the right to refuse a specific vessel if it is considered unsuitable, whether for reasons of safety, its condition, or because it does not fit the club''s facilities. In practice this is rare, but if you have an unusual or very large vessel it is worth checking with the club before you commit.',
   'what boats can I bring, types of boats, allowed vessels, jet ski, ski boat, motor cruiser, yacht, can I bring my boat',
   ARRAY['boats','facilities'], 5),

  ('facilities', 'Caravan sites and boat sheds', E'Yes — Ordinary, Intermediate and Pensioner members may rent a permanent caravan site for an annual fee, and may purchase a boat shed for storage. Moorings are also available to these categories.\n\nOne important thing to know about boat sheds: if you resign your membership, the boat shed reverts to the club.\n\nNote that a permanent caravan site is different from casual caravan or camping bookings, which any member can make for a short stay.',
   'caravan site, permanent site, boat shed, storage, store my boat, mooring, keep a caravan, rent a site',
   ARRAY['facilities','caravan','storage','boats'], 5),

  ('safety', 'Boat safety requirements and certificates', E'All vessels at the club must be registered and comply with SAMSA small craft regulations, and skippers must hold the appropriate skipper''s competency certificate for the vessel they operate.\n\nYou also need to give the club Safety Officer copies of your skipper''s licence, your Certificate of Fitness (COF), and your buoyancy certificates.\n\nIf you are unsure whether your paperwork is in order, speak to the Safety Officer before launching.',
   'safety requirements, SAMSA, skippers licence, skippers ticket, certificate of fitness, COF, buoyancy certificate, safety officer, boat registration, what certificates do I need',
   ARRAY['safety','boats','compliance'], 5),

  ('guests', 'Bringing guests and visitors', E'Members are welcome to introduce guests, within limits.\n\nAny individual guest may visit a maximum of four times a year, and may stay a maximum of four days and three nights per visit.\n\nYou may bring up to six guests on any given day. If you want to bring a larger group than that, make prior arrangements with the committee.',
   'guests, visitors, bring a friend, can I bring guests, visitor limits, how many guests, family visiting',
   ARRAY['guests','policy'], 5),

  ('pets', 'Pets and dogs at the club', E'Only members'' small dogs are allowed on the club grounds, and they must be on a leash and under control at all times.\n\nVisitors'' dogs are not permitted at all.\n\nNo pets are allowed inside the clubhouse, in the pool area, or in the ablution blocks.',
   'dogs, pets, can I bring my dog, pet friendly, animals, puppy',
   ARRAY['pets','policy'], 5),

  ('events', 'Events, racing and club activities', E'VCA runs a mix of sailing and social events. On the water there are keelboat races and long-distance cruising events. Socially there are things like the Easter egg hunt and the Poker Run around the dam.\n\nThe club is affiliated with South African Sailing and with the Northern Region Keelboat Sailing Association.\n\nFor what is coming up next, just ask — I can pull the club calendar for you.',
   'events, activities, racing, regatta, keelboat, poker run, easter egg hunt, social events, what happens at the club, sailing races',
   ARRAY['events','sailing','social'], 5)

) AS x(category, title, body, keywords, tags, priority)
WHERE v.slug = 'vca';
