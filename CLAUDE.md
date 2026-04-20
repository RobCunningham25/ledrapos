# CLAUDE.md — LedraPOS Project Context

## What Is LedraPOS

LedraPOS is a multi-tenant, browser-based point-of-sale and club management SaaS platform built
for venue bars (yacht clubs, sports clubs). The first production tenant is the **Vaal Cruising
Association (VCA)**, a yacht club near Vereeniging, South Africa. The platform is sold under the
**Ledra** brand by **Dear Ziva Pty Ltd** (Rob Cunningham).

Stack: **React / Vite / TypeScript** (Lovable), **Supabase** (`fgquwzzyudgcmfbuvmch.supabase.co`)
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
| `venues` | One row per tenant; includes 21 branding/config columns, `slug`, `logo_url` |
| `members` | Club members; `venue_id`, `member_number`, `is_cash_customer` flag |
| `products` | Product catalogue; `venue_id`, `category`, `price`, `purchase_price` (cost-per-shot) |
| `tabs` | Open/closed bar tabs; written on first cart commit, not on tab open |
| `tab_items` | Line items on a tab |
| `payments` | Payment records linked to a tab (cash / credit / card) |
| `member_credits` | Credit ledger; auto-populated in PaymentModal as `MIN(credit_balance, tab_total)` |
| `admin_users` | Admin accounts; first login matched by email to seeded records |
| `bookings` | Facility/event bookings with Yoco and EFT payment support |
| `booking_payments` | Payments against bookings |
| `club_events` | Admin-created events shown on member portal calendar |
| `pos_sessions` | Bartender shift sessions |
| `checkout_sessions` | Yoco Checkout API sessions for online payments |
| `member_favorites` | Manual pre-population only — never auto-learn from purchase history |

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

---

## Design System (Nautical Warm)

| Token | Value |
|---|---|
| Navy | `#1B3A4B` |
| Teal | `#2A9D8F` |
| Gold | `#D4A574` |
| Off-white | `#FAF8F5` |

These are defined in the venue branding schema and applied dynamically via CSS variables. Never
hardcode colours in components — always reference CSS variables so theming works across tenants.

---

## What Is Built (Phases 1–12 partial)

- **POS:** Product catalogue, member/cash tab selection, cart, split payments (cash/credit/card)
- **Admin:** Monthly sales report, KPI cards, top products, inventory; admin CRUD for members
  (MemberDrawer with Tab History / Credit History / Details / Sites+Boats tabs); user management
- **Member portal:** Responsive nautical design; OpenWeather Vaal Dam widget; Bar Tab view;
  My Details; Club Events calendar; Bookings (Yoco + EFT payment flows); visitor booking at
  `/booking/:code`
- **Auth:** PIN auth (bartenders), email auth (admins), RLS across 20+ tables
- **Branding:** 21-column venue schema; dynamic CSS variable theming per slug
- **Email (Phase 12 partial):** Resend integration scoped — Edge Functions `send-monthly-report`,
  `send-booking-eft-created`, `send-booking-confirmed`; `useEmailService` hook; admin email settings UI
- **Data:** 74 VCA members + boats/sites imported; product catalogue with ZAR pricing

---

## What Is NOT Yet Built (Pending)

- **Phase 12 complete:** Resend account setup, domain verification (`ledra.co.za`), API key in
  Supabase secrets, Edge Function deployment via Supabase CLI
- **WhatsApp WA-1:** Manual tab reminder button per member (Twilio); pending Meta App Review
- **Phase 11D:** Sundowner Bay Yacht Club demo tenant (deferred to sales phase)
- **Phase 11F-2:** Bar inventory import (Rob to provide document)
- **EFT expiry cron:** Server-side enforcement deferred (currently visual-only)
- **PWA:** Parked for later

---

## External Services

| Service | Purpose | Notes |
|---|---|---|
| Resend | Transactional email | `ledra.co.za` domain needs verification |
| Yoco | Online payments | Checkout API only; webhook registered via API not portal |
| Twilio | WhatsApp tab reminders | Meta App Review pending; two separate numbers recommended |
| OpenWeather | Vaal Dam weather widget | Integrated in member portal |

**PowerShell note:** `curl` is aliased to `Invoke-WebRequest` in PowerShell — always provide
native PS syntax or use `curl.exe` explicitly when giving CLI instructions to Rob.

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

---

## Coding Conventions

- TypeScript strict mode; no `any` unless absolutely necessary
- Supabase client via shared `lib/supabase.ts` — never instantiate a second client
- Edge Functions in `/supabase/functions/` — Deno runtime, TypeScript
- RLS policies follow pattern: `auth.uid() IN (SELECT user_id FROM venue_users WHERE venue_id = ...)`
  or service-role bypass for Edge Functions
- React components: functional + hooks only; no class components
- Styling: Tailwind CSS utility classes + shadcn/ui components; CSS variables for brand tokens
- File naming: `PascalCase` for components, `camelCase` for hooks/utils

---

## Session Workflow

Rob applies changes in **Lovable** (a stateless AI builder) and reports results. When writing
Lovable prompts:
- Every prompt must be **fully self-contained** — include exact file paths, hex colours, column
  names, and a **"What Must Not Change"** section to prevent regressions
- Break large phases into sub-phases (A/B/C) and validate each before proceeding
- Schema migrations always precede UI work in separate sub-phases

Handoff documents (`ledrapos-handoff_N.md`) are generated at the end of each session and uploaded
at the start of the next to maintain context continuity.

---

## Supabase Project

- **Project ref:** `fgquwzzyudgcmfbuvmch`
- **URL:** `https://fgquwzzyudgcmfbuvmch.supabase.co`
- **CLI:** `supabase functions deploy <name> --project-ref fgquwzzyudgcmfbuvmch`
