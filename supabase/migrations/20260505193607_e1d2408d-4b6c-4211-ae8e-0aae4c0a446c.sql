-- Phase B.2 of Member Broadcast Email feature.
-- Email templates that pre-fill the compose page with subject + body. Per-venue.
-- Placeholders use [SQUARE BRACKETS] so admins can see what to fill in.
-- No merge fields — same body sent to every recipient (worker stays simple).

CREATE TABLE email_templates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         UUID        REFERENCES venues(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  description      TEXT,
  subject_template TEXT        NOT NULL,
  body_html        TEXT        NOT NULL,
  display_order    INT         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX email_templates_venue_order_idx
  ON email_templates (venue_id, display_order);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_templates_select_all" ON email_templates
  FOR SELECT USING (true);
CREATE POLICY "email_templates_insert_authenticated" ON email_templates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "email_templates_update_authenticated" ON email_templates
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "email_templates_delete_authenticated" ON email_templates
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ===== Seed VCA templates =====
-- Each INSERT looks up VCA's id by slug so the migration is portable across environments.

INSERT INTO email_templates (venue_id, name, description, subject_template, body_html, display_order)
SELECT
  id,
  'Letter from the Commodore',
  'Personal letter signed by the Commodore. Use for important announcements with a personal voice.',
  'Letter from the Commodore — [topic]',
  $tpl$<p>Dear fellow members,</p>
<p>[Your opening — context for why you're writing.]</p>
<p>[Main content of the letter. Speak personally. Share what's on your mind.]</p>
<p>[A second paragraph if needed.]</p>
<p>If you'd like to discuss any of this, please reply to this email or catch me at the club.</p>
<p>Yours in fair winds,</p>
<p><strong>[Your name]</strong><br>Commodore<br>Vaal Cruising Association</p>$tpl$,
  1
FROM venues WHERE slug = 'vca';

INSERT INTO email_templates (venue_id, name, description, subject_template, body_html, display_order)
SELECT
  id,
  'Newsletter',
  'Multi-section monthly update from the committee. Use for general member news.',
  'VCA Newsletter — [Month Year]',
  $tpl$<p>Hi everyone,</p>
<p>[Short intro — what's been happening at the club this month.]</p>
<h2>What's coming up</h2>
<ul>
  <li>[Event 1 — date, what, where]</li>
  <li>[Event 2 — date, what, where]</li>
  <li>[Event 3 — date, what, where]</li>
</ul>
<h2>From the bar</h2>
<p>[New stock, special offers, hours changes, anything bar-related.]</p>
<h2>Member news</h2>
<p>[New members, milestones, results from recent racing or events, anything else worth celebrating.]</p>
<p>Happy sailing,</p>
<p><strong>The VCA Committee</strong></p>$tpl$,
  2
FROM venues WHERE slug = 'vca';

INSERT INTO email_templates (venue_id, name, description, subject_template, body_html, display_order)
SELECT
  id,
  'Formal letter from the Committee',
  'Structured formal communication from the committee. Use for AGM notices, rule changes, and official matters.',
  '[Subject of the letter]',
  $tpl$<p>Dear Member,</p>
<p>[Opening paragraph stating the purpose of the letter.]</p>
<ol>
  <li>[First point]</li>
  <li>[Second point]</li>
  <li>[Third point]</li>
</ol>
<p>[Closing paragraph — what action is required, when, who to contact.]</p>
<p>For any queries, please contact the club at info@vaalcruising.co.za.</p>
<p>Yours sincerely,</p>
<p><strong>The Committee</strong><br>Vaal Cruising Association</p>$tpl$,
  3
FROM venues WHERE slug = 'vca';

INSERT INTO email_templates (venue_id, name, description, subject_template, body_html, display_order)
SELECT
  id,
  'Casual notice',
  'Short informal heads-up. Use for last-minute changes, weather warnings, bar hours, etc.',
  '[Short notice headline]',
  $tpl$<p>Hi all,</p>
<p>[The notice — short and to the point. Bar closing early, weather warning, last-minute event change, etc.]</p>
<p>Thanks,</p>
<p><strong>[Your name]</strong></p>$tpl$,
  4
FROM venues WHERE slug = 'vca';
