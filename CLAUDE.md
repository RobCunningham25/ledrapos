# CLAUDE.md — LedraPOS Project Context

## What Is LedraPOS

LedraPOS is a multi-tenant, browser-based point-of-sale and club management SaaS platform built
for venue bars (yacht clubs, sports clubs). The first production tenant is the **Vaal Cruising
Association (VCA)**, a yacht club near Vereeniging, South Africa. The platform is sold under the
**Ledra** brand by **Dear Ziva Pty Ltd** (Rob Cunningham).

Stack: **React / Vite / TypeScript**, **Supabase** (`fgquwzzyudgcmfbuvmch.supabase.co`)
for database, RLS, Edge Functions, Auth, and Storage.

---

## Architecture Principles

- **Multi-tenant by `venue_id`** — every table is scoped with RLS policies filtering on `venue_id`.
  Never query without `venue_id` context. Never bypass RLS.
- **Path-based routing** — tenants are served at `/:slug/*` (e.g. `/vca/pos`, `/vca/portal`,
  `/vca/admin`). The slug resolves to a venue via the `venues` table.
- **Schema-first, UI second** — always apply database migrations before wiring up UI components.
- **Edge Functions for sensitive ops** — payment processing, email sending, and PIN auth live in
  Supabase Edge Functions, not the client.

---

## Database — Key Tables

| Table | Purpose |
|---|---|
| `venues` | One row per tenant; includes 21 branding/config columns, `slug`, `logo_url`, `broadcast_from_email` (per-tenant verified Resend sender) |
| `members` | Club members; `venue_id`, `membership_number`, `email_opt_out`, `unsubscribe_token` (per-member, used in broadcast unsubscribe links), plus WhatsApp fields: `whatsapp_number`, `whatsapp_opt_in` (**opt-OUT consent model** — TRUE by default, FALSE only alongside an explicit `whatsapp_opt_out_at`; STOP opts out, START re-subscribes), `whatsapp_opt_in_at`, `whatsapp_opt_in_method` (`assumed` = subscribed by the opt-out model), `whatsapp_opt_out_at`, `whatsapp_notice_sent_at` (one-time "reply STOP to opt out" courtesy notice), `whatsapp_last_inbound_at` (drives the 24h session-window check) |
| `products` | Product catalogue; `venue_id`, `category`, `price`, `purchase_price` (cost-per-shot) |
| `tabs` | Open/closed bar tabs; written on first cart commit, not on tab open |
| `tab_items` | Line items on a tab |
| `payments` | Payment records linked to a tab (cash / credit / card) |
| `member_credits` | Credit ledger; auto-populated in PaymentModal as `MIN(credit_balance, tab_total)` |
| `admin_users` | Admin accounts; first login matched by email to seeded records |
| `bookings` | Accommodation bookings with Yoco and EFT payment support; `total_price_cents` (not `amount_cents`) |
| `booking_payments` | Payments against bookings |
| `club_events` | Admin-created events; columns are `event_date` (date) and `title`; supports recurrence |
| `event_exceptions` | Per-occurrence overrides/cancellations for recurring events |
| `pos_sessions` | Bartender shift sessions |
| `checkout_sessions` | Yoco Checkout API sessions for online payments |
| `member_favorites` | Manual pre-population only — never auto-learn from purchase history |
| `email_broadcasts` | One row per admin-sent broadcast email campaign; `venue_id`, `subject`, `body_html`, `attachment_paths`, status lifecycle |
| `broadcast_recipients` | One row per (broadcast, member); snapshots `email`, tracks `status` (sent/failed/bounced/skipped), `resend_message_id` |
| `email_templates` | Per-venue starter templates for the broadcast compose page (subject + body); seeded via migration |
| `whatsapp_messages` | Audit log of every outbound + inbound WhatsApp message; `direction`, `template_sid`, `twilio_sid`, `status`, `related_kind`/`related_id`. Backs the daily-cap check, recent-reminder lookups, and the inbound webhook router |

**`bookings` is for accommodation only** — it has no `event_id` FK to `club_events`. There is no
event RSVP system. Do not conflate bookings with event attendance. If RSVP tracking is ever needed,
it belongs in a separate `event_rsvps` table in its own phase.

**`club_events` recurrence columns:** `recurrence` (TEXT), `recurrence_end_date` (DATE),
`monthly_mode` TEXT — `'day_of_month'` or `'nth_weekday'`. Expansion logic lives in
`src/utils/eventOccurrences.ts`. Ordinal derived via `ceil(day / 7)`.

**SQL deletion order** (when clearing transaction history):
`tab_items` → `payments` → `checkout_sessions` → `tabs` → `member_credits` →
`booking_payments` → `member_favorites` → `pos_sessions`

---

## Authentication

- **Bartenders:** PIN-based auth via `verify-pin` Supabase Edge Function. PINs are hashed server-side.
- **Admins:** Email/password via Supabase Auth. First login is matched to a seeded `admin_users`
  row by email address.
- **Members:** Portal access via member number or magic link. No PIN on portal.

---

## Payment Rules — Critical

- **Credit:** Auto-populates in PaymentModal as `MIN(credit_balance, tab_total)`. Bartenders
  **confirm manually** — never auto-deplete on commit. This decision is final.
- **Cash customers:** Handled via `is_cash_customer = true` on a tab. **Never create fake member
  records** for cash sales.
- **Card (in-person):** Yoco in-person SDK is Android/iOS native only — impossible in browser.
  Use **manual confirmation** flow for in-person card payments.
- **Yoco Checkout API:** Used for online credit top-ups and bookings only.
- **Yoco webhook ID:** `sub_PgrMwkkpnPmUPlDiRmnHaoNE` — do not replace.
- **Payments are atomic** — the `process_payment` RPC handles split payments in a single
  transaction. Never write payment records outside this RPC.
- **Open tab outstanding balance** = `SUM(tab_items.line_total_cents) - SUM(payments.amount_cents)`
  across open tabs — there is no `total_cents` column on `tabs`. Floor at 0.

---

## Design System (Nautical Warm)

| Token | Value |
|---|---|
| Navy | `#1B3A4B` |
| Teal | `#2A9D8F` |
| Gold | `#D4A574` |
| Off-white | `#FAF8F5` |

Never hardcode colours in components — always reference CSS variables so theming works across
tenants.

Dashboard cards use: white background, `1px solid #E2E8F0` border, `8px` radius, `24px` padding,
`0 1px 3px` shadow. Grid uses `auto-fit` with `260px` min (2-col desktop, 1-col mobile).

---

## What Is Built

- **POS:** Product catalogue, member/cash tab selection, cart, split payments (cash/credit/card)
- **Admin dashboard:** 4 KPI cards (Open Tabs, Pending EFT Bookings, Next Event, Bookings This
  Week) + BarTabRemindersCard; all queries scoped by `venueId`; cents throughout; `formatCents()`
  for display; week starts Monday
- **Admin:** Monthly sales report, top products, inventory; member CRUD (MemberDrawer with Tab
  History / Credit History / Details / Sites+Boats tabs); user management
- **Member portal:** Responsive nautical design; OpenWeather Vaal Dam widget; Bar Tab view;
  My Details; Club Events calendar with recurring event support; Bookings (Yoco + EFT); visitor
  booking at `/booking/:code`; Club Account card (Sage balance snapshot from
  `member_club_balances`); searchable Constitution page (62 sections in `venue_knowledge`
  category `'constitution'`, FTS on `search_tsv`, TOC order via `sort_order`)
- **Auth:** PIN auth (bartenders), email auth (admins), RLS across 20+ tables
- **Branding:** 21-column venue schema; dynamic CSS variable theming per slug
- **Email (Phase 12 partial):** Resend integration scoped — Edge Functions `send-monthly-report`,
  `send-booking-eft-created`, `send-booking-confirmed`; `useEmailService` hook; admin email settings UI
- **Member broadcast email:** Admin "Broadcasts" page with TipTap rich editor, drag-drop attachment
  upload (5 MB/file, 25 MB combined) to `broadcast-attachments` Storage bucket, recipient picker
  (all active members or pick-specific with search), live recipient count, daily quota indicator,
  email preview modal, send-confirmation dialog. Backend: `send-broadcast` (admin-auth) +
  `process-broadcast-batch` (worker-token, throttled to ~8/sec) Edge Functions. Per-member
  unsubscribe via `unsubscribe` Edge Function → 302 redirect to public Vite route `/unsubscribed`.
  4 starter templates seeded for VCA (Letter from Commodore / Newsletter / Formal Letter / Casual
  notice). Footer auto-injected with venue address + unsubscribe link (POPIA + RFC 8058 compliant).
- **Portal password reset:** `request-password-reset` Edge Function (unauthenticated; looks up
  active member by email + venue, generates a recovery link via `generateLink`, sends branded
  email through Resend — never Supabase's rate-limited built-in SMTP) → member lands on
  `/reset-password` (custom domain) or `/:slug/portal/reset-password`, both rendering the shared
  `SetPasswordFromLink` component (also used by AcceptInvite). Redirect targets must be in the
  Supabase Auth URI allowlist (`portal.vaalcruising.co.za/**` and `pos.ledra.co.za/**` are).
- **Data:** 74 VCA members + boats/sites imported; product catalogue with ZAR pricing

---

## What Is NOT Yet Built (Pending)

- **`ledra.co.za` Resend domain verification:** still aspirational (platform-brand sender).
  `vaalcruising.co.za` is verified and used for VCA invites + broadcasts.
- **Broadcast scheduled-send worker:** `email_broadcasts.scheduled_for` column exists and
  `send-broadcast` accepts it, but no pg_cron job picks up due-but-not-sent broadcasts yet.
  Currently MVP is immediate-send only.
- **Broadcast bounce/complaint handling:** No `resend-webhook` Edge Function yet. Hard bounces
  and spam complaints aren't auto-flipping `members.email_opt_out`.
- **WhatsApp WA-1 through WA-5:** Phased build in progress (see `.claude/plans/`). Phase 0
  (foundation: schema, `send-whatsapp` function, audit table) and Phase 1 (consent flow with
  quick-reply buttons) land first. Phases 2–4 cover individual + bulk tab reminders with
  interactive Yoco link, plus an inbound keyword router. WhatsApp number `+27 16 004 0192`.
  Twilio is configured as a Tech Provider sub-account; templates submitted to Meta separately.
  **Consent flipped to opt-OUT on 2026-07-13**: members are subscribed by default; the
  `send-whatsapp-optin-invite` function now sends the one-time "reply STOP" welcome notice
  (`vca_whatsapp_notice_v1` → `TWILIO_TEMPLATE_NOTICE_SID`, falls back to the old opt-in
  template until approved).
- **Phase 11D:** Sundowner Bay Yacht Club demo tenant (deferred to sales phase)
- **Phase 11F-2:** Bar inventory import
- ~~**EFT expiry cron**~~ Done 2026-07-17: pg_cron job `expire-eft-bookings` invokes
  `expire-bookings` every 15 min; also expires abandoned bookings (no payment method
  chosen) 48h after creation
- **PWA (POS/admin):** Parked for later. The **member portal is already a PWA** — per-venue
  manifest built at runtime ([src/utils/portalPwa.ts](src/utils/portalPwa.ts), blob URL + canvas-generated
  icons from `logo_url`), no-cache service worker at `public/sw.js`, one-time install banner
  (`PwaInstallPrompt` in PortalLayout; localStorage-flagged per slug; native prompt on Android,
  instructions on iOS)

---

## External Services

| Service | Purpose | Notes |
|---|---|---|
| Resend | Transactional email + member broadcasts | `vaalcruising.co.za` verified; **free tier (100/day, 10/sec)** — broadcasts must respect this |
| Yoco | Online payments | Checkout API only; webhook registered via API not portal |
| Twilio | WhatsApp tab reminders + inbound router | Tech Provider sub-account on `+27 16 004 0192`; **billed per message** (no free tier) — every venue has a `whatsapp_daily_cap` (default 200) |
| OpenWeather | Vaal Dam weather widget | Integrated in member portal |

**PowerShell note:** `curl` is aliased to `Invoke-WebRequest` in PowerShell — always provide
native PS syntax or use `curl.exe` explicitly when giving CLI instructions.

---

## Rules — Never Violate These

1. **Never bypass RLS** — all queries must be scoped to `venue_id`.
2. **Never auto-learn member favourites** — manual pre-population only.
3. **Never create fake member records** for cash customers — use `is_cash_customer` flag.
4. **Never auto-deplete credit** — bartender must confirm credit amount in PaymentModal.
5. **Never use Yoco in-person SDK** — it does not work in browsers.
6. **Never write payment records outside `process_payment` RPC.**
7. **Never register the Yoco webhook via the Business Portal** — use `POST https://payments.yoco.com/api/webhooks`.
8. **Never register the WhatsApp API number on a phone** — it removes the number from any active app.
9. **Tab records are only written to DB on first cart commit**, not when a tab is opened in the UI.
10. **`purchase_price` on products = cost per shot** (not per bottle). Correct prices before reporting.
11. **Never add `event_id` to `bookings`** — bookings are accommodation records, not event RSVPs.
12. **Never bypass the broadcast daily quota check** — Resend free tier caps at 100/day. `send-broadcast`
    refuses sends that would push past 95/day to leave headroom for invites and other transactional mail.
13. **Never send broadcasts without the auto-injected footer** — venue address + unsubscribe link are
    required for POPIA + Gmail/Yahoo bulk-sender compliance. The `wrapWithFooter` helper in
    [supabase/functions/_shared/broadcastTemplate.ts](supabase/functions/_shared/broadcastTemplate.ts)
    is the only place to render outgoing broadcast HTML.
14. **Never expose the `BROADCAST_WORKER_TOKEN`** — it gates `process-broadcast-batch` so the worker
    can't be invoked from the browser. Lives in Supabase function secrets only.
15. **Never bypass the WhatsApp daily cap** — `venues.whatsapp_daily_cap` (default 200) is enforced by
    `send-whatsapp`. Twilio bills per message; we have no free tier. Raising the cap requires an
    explicit decision per venue, not an inline override.
16. **All outbound WhatsApp outside a 24h session window must reference an approved `template_sid`** —
    free-form `body` sends are rejected by `send-whatsapp` unless `whatsapp_last_inbound_at` is within
    24 hours. Meta returns 63016 if you try to bypass this; Twilio surfaces it as a hard error.
17. **Never expose `TWILIO_AUTH_TOKEN` or `WHATSAPP_WORKER_TOKEN`** — `whatsapp-webhook` validates
    `X-Twilio-Signature` (HMAC-SHA1 of URL + sorted form params using the auth token) and
    `send-whatsapp` requires the worker token. Both live in Supabase function secrets only.

---

## Coding Conventions

- TypeScript strict mode; no `any` unless absolutely necessary
- Supabase client via shared `lib/supabase.ts` — never instantiate a second client
- Edge Functions in `/supabase/functions/` — Deno runtime, TypeScript
- RLS pattern in this codebase is **permissive**: `USING (true)` for SELECT and
  `WITH CHECK (auth.uid() IS NOT NULL)` for INSERT/UPDATE/DELETE on most tables.
  Cross-venue isolation is enforced **explicitly in code** (Edge Functions cross-check `venue_id`
  against the caller's `admin_users` row; client queries always `.eq('venue_id', venueId)`).
  Edge Functions use the service-role key and bypass RLS entirely.
- React components: functional + hooks only; no class components
- Styling: Tailwind CSS utility classes + shadcn/ui components; CSS variables for brand tokens
- File naming: `PascalCase` for components, `camelCase` for hooks/utils
- `event_date` fields must be parsed as local time — always append `'T00:00:00'` before passing
  to `new Date()` to avoid UTC midnight off-by-one errors (SA is UTC+2)

---

## Supabase Project

- **Project ref:** `fgquwzzyudgcmfbuvmch`
- **URL:** `https://fgquwzzyudgcmfbuvmch.supabase.co`
- **Deploy Edge Function:** `supabase functions deploy <n> --project-ref fgquwzzyudgcmfbuvmch`
- **Push migrations:** `supabase db push` (run from `C:\Users\MSI\ledrapos\`)
- **Regenerate types:** `supabase gen types typescript --project-id fgquwzzyudgcmfbuvmch | Out-File -FilePath "src/integrations/supabase/types.ts" -Encoding utf8` (after every schema change)

**Migration history:** Previously drifted because early migrations were applied outside the CLI.
Resolved on 2026-04-20 via `supabase migration repair`. Local and remote are now in sync —
`supabase db push` is the correct path for all future migrations.

**Docker Desktop is NOT installed** — `supabase db pull` requires Docker and will fail. Do not
attempt it. Use Supabase Studio for schema inspection if needed.

**Project directory:** The real project root is `C:\Users\MSI\ledrapos\` (NOT a nested folder —
the `supabase/`, `src/`, and `package.json` all live at this level).

**Required Supabase function secrets:**
- `RESEND_API_KEY` — Resend account API key (used by all email-sending functions)
- `INVITE_FROM_EMAIL` — fallback sender if a venue's `broadcast_from_email` is null
- `SITE_URL` — base URL for unsubscribe links and portal redirects (`https://pos.ledra.co.za`)
- `BROADCAST_WORKER_TOKEN` — shared secret guarding `process-broadcast-batch` from browser access
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — sub-account credentials for the WhatsApp sender
- `TWILIO_WHATSAPP_FROM` — sender address in `whatsapp:+E164` form (e.g. `whatsapp:+27160040192`)
- `TWILIO_WEBHOOK_SECRET` — auth token used to validate `X-Twilio-Signature` on inbound webhooks
  (typically the same value as `TWILIO_AUTH_TOKEN`, but kept separate so it can be rotated)
- `WHATSAPP_WORKER_TOKEN` — shared secret guarding `send-whatsapp` from browser access
- `TWILIO_TEMPLATE_OPTIN_SID` / `TWILIO_TEMPLATE_TAB_REMINDER_SID` /
  `TWILIO_TEMPLATE_GENERIC_SID` — Meta-approved Content Template SIDs (HX...)
- `TWILIO_TEMPLATE_NOTICE_SID` — `vca_whatsapp_notice_v1`, the opt-out-model welcome notice
  ("we'll send tab reminders + club updates here; reply STOP to opt out"). Until set,
  `send-whatsapp-optin-invite` falls back to `TWILIO_TEMPLATE_OPTIN_SID`