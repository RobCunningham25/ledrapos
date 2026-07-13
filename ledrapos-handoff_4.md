# LedraPOS Session Handoff #4

**Date:** 2026-04-20
**Session theme:** Admin dashboard polish, invite flow fixes, member last-login visibility

---

## TL;DR

Three independent pieces of work on the admin side:

1. **Dashboard "Open Bar Tabs" card** — fixed a silent filter bug that kept the card stuck at 0, and added a clickable drawer that lists every open tab with member name, opened-at, item count, and outstanding balance.
2. **Member invite flow** — added a Resend button next to every "Invited" badge, rebuilt the `invite-member` edge function to handle resends (delete+recreate unconfirmed auth users, refuse if the user has already signed in), and replaced the opaque "Failed to send invite" string with the actual Supabase Auth error message.
3. **Member last-login visibility** — new "Last Login" column on the Members table and a matching field on the MemberDetail info card, powered by a new DB RPC `get_members_with_auth`.

**One outstanding action for Rob:** redeploy the `invite-member` edge function — the new resend path and surfaced error messages are in source but not yet live.

---

## What shipped this session

### 1. Dashboard — Open Tabs bug fix + drawer

**Bug:** `src/pages/admin/Dashboard.tsx` was querying `tabs.status = 'open'` (lowercase). The DB has `CHECK (status IN ('OPEN', 'CLOSED'))`, so the query silently returned zero rows and the card never showed any open tabs. Every other query in the codebase already uses `'OPEN'`. Fixed.

**New component:** [`src/components/admin/OpenTabsDrawer.tsx`](src/components/admin/OpenTabsDrawer.tsx)

- Right-side slide-in drawer (matches the `MemberDrawer` visual pattern)
- Lists all open tabs for the venue: member name (or cash-customer name), membership #, opened date/time, item count, amount paid so far, and outstanding balance
- Each member-linked row is clickable and navigates to `/:slug/admin/members/:id`; cash-customer rows are non-clickable
- Applies the same "hide ghost cash tabs with zero items" rule that `OpenTabsPanel.tsx` uses in the POS
- Does **not** use the new `get_members_with_auth` RPC — a plain `tabs`+`members` PostgREST join is fine here; the RPC is reserved for places that actually need `last_sign_in_at`

**Dashboard wiring:** added a "View Open Tabs" outlined button on the `OpenTabsCard` that opens the drawer. Button only renders when count > 0.

### 2. Member invite flow — Resend + real error messages

**UI:** [`src/pages/admin/Members.tsx`](src/pages/admin/Members.tsx)

- When `auth_user_id` is set, the Portal cell now shows "✓ Invited" **plus** a small outlined "Resend" button
- `handleInvite(member, resend = false)` — second argument routes to the resend branch
- The `toast.error` now extracts the JSON body from `res.error.context` before falling back to the generic supabase-js message — so the real Supabase Auth error finally makes it to the admin

**Edge function:** [`supabase/functions/invite-member/index.ts`](supabase/functions/invite-member/index.ts) — rewritten

- Accepts optional `resend: boolean` in the request body
- Four distinct branches, all returning structured JSON with an `action` field (`invited` / `linked` / `resent`) on success:
  - **New invite** (no `auth_user_id`, no existing auth user with this email) → `inviteUserByEmail`
  - **Link existing** (email already in `auth.users` but member row not linked, no resend flag) → silently link, no email sent
  - **Already linked, no resend flag** → 409 "Use Resend"
  - **Resend** → look up existing auth user by member's `auth_user_id` or email; if `last_sign_in_at` is set, refuse (they've already signed in); otherwise **delete the unconfirmed auth user, then re-invite fresh** — this regenerates the invite token and triggers a new email through Supabase Auth
- Every error path now returns the real `inviteError.message` / `err.message` instead of the generic string — admin now sees *why* it failed

### 3. Member Last Login column + card

**Depends on a new DB RPC** that Rob added mid-session: `get_members_with_auth(p_venue_id)` — returns every column the UI was fetching from `members` plus a nullable `last_sign_in_at` from `auth.users` via `members.auth_user_id`.

**New helper:** [`src/utils/time.ts`](src/utils/time.ts) — exports `formatRelativeTime(iso)` that produces `Just now` / `5m ago` / `3h ago` / `Yesterday` / `12d ago` / `4mo ago` / `2y ago`.

**`src/pages/admin/Members.tsx`:**
- `fetchMembers` now calls `.rpc('get_members_with_auth', { p_venue_id: venueId })` instead of `.from('members').select(...)`
- New "Last Login" column between **Portal** and **Actions** — em dash if never signed in, relative time if they have, with full local date/time on hover (`title` attribute)
- Colspans on the loading and empty-state rows bumped from 7 to 8

**`src/pages/admin/MemberDetail.tsx`:**
- `fetchMember` now uses the same RPC, filtered server-side with `.eq('id', id).maybeSingle()`
- New "Last Login" label/value block inside the existing read-only info card, inserted right after "Member since" — matches the surrounding `fontSize: 13 / 15` styling exactly
- The editable `MemberDetailsTab` and the `MemberDrawer` edit form were **not** touched — this is a read-only signal

---

## Design decisions

| Decision | Choice | Why |
|---|---|---|
| Where should "Last Login" live in MemberDetail? | In the **top info card** (alongside Member since, Credit balance, etc.) | The info card is already the read-only summary; the Details tab is editable fields and would make Last Login feel like something you can change. |
| Resend behaviour for unconfirmed users? | **Delete+recreate**, not `generateLink` | Supabase's `generateLink` returns a URL but doesn't auto-send email unless a custom hook is wired. Delete+`inviteUserByEmail` reuses the existing working email path and guarantees a fresh token. |
| Resend behaviour when user has already signed in? | **Refuse**, tell admin to use a password reset | We don't want to invalidate a working account. The 409 response now says exactly this. |
| Separate `formatRelativeTime` helper vs inline? | **Separate file** (`src/utils/time.ts`) | Used in two places (Members list + MemberDetail). Inlining twice would duplicate; a one-function file is not a premature abstraction. |
| Use `get_members_with_auth` for the OpenTabsDrawer? | **No** — stick with `tabs`+`members` join | The drawer doesn't need `last_sign_in_at`. Keeps the RPC's scope narrow. |

Plan file (reference): `C:\Users\MSI\.claude\plans\member-last-login-smooth-hummingbird.md` (final, approved)

---

## Current state

### What's in source (committed or uncommitted — Rob's call)
- [`src/pages/admin/Dashboard.tsx`](src/pages/admin/Dashboard.tsx) — OpenTabsCard status casing fix + View Open Tabs button
- [`src/components/admin/OpenTabsDrawer.tsx`](src/components/admin/OpenTabsDrawer.tsx) — new drawer
- [`src/pages/admin/Members.tsx`](src/pages/admin/Members.tsx) — RPC swap, Last Login column, Resend button, better error surfacing
- [`src/pages/admin/MemberDetail.tsx`](src/pages/admin/MemberDetail.tsx) — RPC swap, Last Login info-card field
- [`src/utils/time.ts`](src/utils/time.ts) — new `formatRelativeTime` helper
- [`supabase/functions/invite-member/index.ts`](supabase/functions/invite-member/index.ts) — rewritten with resend path

### Verified
- `npx tsc --noEmit` → clean
- `npm run build` → passes
- `npx eslint` on the three touched UI files → only pre-existing warnings/errors, no new ones introduced

### Not yet verified end-to-end
- Manual test of the Resend button flow — **pending edge function deploy**
- Manual confirmation that `last_sign_in_at` renders correctly for real VCA members after a portal login

---

## What Rob needs to do next

1. **Deploy the invite-member edge function** — this is the only part of this session that is NOT live:
   ```bash
   supabase functions deploy invite-member --project-ref fgquwzzyudgcmfbuvmch
   ```
2. **Resend the 3 stuck invites** — click the new "Resend" button next to each. The function will delete their unconfirmed auth users and send fresh invite emails.
3. **If any Resend still fails**, the toast will now show the actual Supabase Auth message. Rob confirmed during this session that custom SMTP is configured in the Supabase dashboard, so the root cause should no longer be the default-SMTP rate limit — whatever the real error is will now be visible.
4. **Smoke-test the Last Login column** by signing into the portal as a member, then opening `/vca/admin/members` as the admin — the row should flip from `—` to `Just now` / `1m ago`.
5. Eyeball the **Open Tabs drawer**: open from the dashboard, click through to a member, confirm `venueId` scoping (no tabs from other tenants appear).

---

## Known context / gotchas

- **`tabs.status` is uppercase** — the DB enforces `CHECK (status IN ('OPEN', 'CLOSED'))`. Lowercase queries return zero rows silently. This session's bug was exactly that. (Saved to persistent memory.)
- **Portal invites do NOT go through the Resend integration.** They use `supabase.auth.admin.inviteUserByEmail`, which delivers via Supabase Auth's SMTP pipeline (dashboard → Auth → SMTP). The Resend service is wired only into the other transactional email edge functions (`send-monthly-report`, `send-booking-eft-created`, `send-booking-confirmed`). If invite emails go missing, the diagnosis is Auth SMTP config in the dashboard, not the edge function code. (Saved to persistent memory.)
- **PostgREST filter-on-RPC works** — `supabase.rpc(...).eq('id', id).maybeSingle()` is valid against a `SETOF` RPC and is used by `MemberDetail.fetchMember`. If that ever stops working, fall back to fetching all rows and filtering client-side (74 members — negligible cost).
- **Parallel work:** during this session Rob was also shipping the admin-access promote/demote feature from handoff #1 (Shield icon, `set-member-admin` edge function, superadmin role gating on MemberDetail). That work shows up in the same files this session touched (Members.tsx, MemberDetail.tsx) but is orthogonal — merges are clean because the changes are in different regions of the files.
- **Invite function behaviour matrix — keep in mind when debugging:**
  | State | `resend` flag | Action |
  |---|---|---|
  | No `auth_user_id`, email not in `auth.users` | false | Fresh invite |
  | No `auth_user_id`, email already in `auth.users` | false | Silently link (no email) |
  | `auth_user_id` set | false | 409 "Use Resend" |
  | `auth_user_id` set, `last_sign_in_at` null | true | Delete + fresh invite |
  | `auth_user_id` set, `last_sign_in_at` set | true | 409 "Use password reset" |

---

## Possible follow-ups (not done)

- **Pipe invites through Resend** instead of Supabase Auth SMTP — would unify all email on one provider and bypass Auth's rate limits. Implementation: switch `inviteUserByEmail` to `generateLink({ type: 'invite' })` + manual Resend send in the edge function.
- **Sortable columns on the Members table** — Last Login would be useful to sort by.
- **Surface `email_confirmed_at`** on MemberDetail too — currently we only show `last_sign_in_at`. A member could have confirmed but never actually signed in.
- **Code-split the build** — Vite is warning that the bundle is >500 kB; gzipped it's 270 kB. Not this session's problem, but it'll come up.
