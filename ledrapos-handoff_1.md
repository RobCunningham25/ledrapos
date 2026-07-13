# LedraPOS Session Handoff #1

**Date:** 2026-04-20
**Session theme:** Grant admin rights to certain members

---

## TL;DR

Added the ability for a superadmin to promote a **member** to admin (or superadmin) without creating a separate account. Reuses the existing `admin_users` + `AdminAuthContext` infrastructure — no schema changes.

One outstanding action for Rob: **redeploy the edge function** after the `config.toml` fix below.

---

## What shipped this session

### 1. New edge function — `set-member-admin`

Path: `supabase/functions/set-member-admin/index.ts`

- Caller must be an active `admin_users` row with `role = 'superadmin'`
- Accepts `{ member_id, venue_id, grant: boolean, role: 'admin' | 'superadmin' }`
- On grant: upserts an `admin_users` row whose `email` matches the member's email (and `auth_user_id` if the member has one — otherwise self-links on first admin login via the existing email lookup in `AdminAuthContext`)
- On revoke: flips `is_active = false` (no delete — keeps audit trail)
- Guards: member must have an email; cross-venue calls blocked; you cannot change your own admin access

### 2. `MemberDetail.tsx` — Admin access card

- Shield badge in the header row when the member currently has active admin access (visible to all admins)
- "Admin access" card with role selector (`admin` / `superadmin`) and Grant / Update role / Revoke buttons — visible **only to superadmins**
- Disabled state with a clear message when the member has no email

### 3. `Members.tsx` — Shield icon

- Fetches active `admin_users` emails for the venue alongside the member list (single extra query)
- Renders a small Shield icon next to the name of any member who is also an active admin

### 4. `supabase/config.toml`

- Added `[functions.set-member-admin] verify_jwt = false` to match the pattern used by all other functions in the repo

---

## Design decisions (answers Rob picked)

| Decision | Choice |
|---|---|
| Who can grant/revoke admin rights? | **Only superadmins** |
| Default role on promote? | **Promoter chooses** (admin or superadmin) |
| "Go to admin" link in portal nav? | **No** — admin-members type `/vca/admin` directly |

Rejected alternatives and why (captured in the plan file):

- **Add `is_admin` flag to `members`** — creates two sources of truth for admin status; duplicates existing `role`/`is_active` logic.
- **Merge `members` and `admin_users`** — they model different concepts (club membership vs. staff/committee access).

Plan file (reference): `C:\Users\MSI\.claude\plans\i-want-the-ability-harmonic-flamingo.md`

---

## Current state

- All code changes are committed in `f2808f6` except `supabase/config.toml`, which is modified but uncommitted.
- Typecheck is clean (`npx tsc --noEmit` — no output).
- The edge function **is deployed** (confirmed by Supabase Boot log) **but was deployed before the `config.toml` fix**, so it is currently unusable — requests are intercepted by the platform's default `verify_jwt = true` and never reach our handler.

### Reproducing the bug we ended on

When Rob clicked "Grant admin access", the client showed:
> Edge Function returned a non-2xx status code

Supabase dashboard showed only a **Boot** event for `set-member-admin` — no invocation log. This is the signature of `verify_jwt = true` blocking the request before the function runs.

---

## What Rob needs to do next

1. **Commit the config.toml fix** (one line added in the `[functions.set-member-admin]` block).
2. **Redeploy**:
   ```bash
   supabase functions deploy set-member-admin --project-ref fgquwzzyudgcmfbuvmch
   ```
3. **Test the full flow** (verification plan in the plan file):
   - Open a member's detail page → Grant admin access → confirm a row appears in `admin_users`
   - Sign out, sign in as that member at `/vca/admin/login` → confirm they land on the admin dashboard
   - Sign back in as Rob → Revoke → confirm the promoted member is booted out of `/admin` on next auth resolve
   - Confirm a non-superadmin admin does not see the "Admin access" card

---

## Known context / gotchas

- **Only one seeded admin exists:** `rob@dearziva.co.za` as `superadmin` (migration `20260322102928`). Other `admin_users` rows, if any, came via the `invite-admin` edge function or direct DB insert.
- **Self-link pattern:** `AdminAuthContext.tsx:42-57` looks up admins by `auth_user_id` **or** `email`, and lazily populates `auth_user_id` on first login. This is why creating an `admin_users` row for a member with a null `auth_user_id` is safe — the link happens on their first admin login.
- **`supabase functions logs` doesn't exist on Rob's CLI version.** Use the dashboard for function logs: `https://supabase.com/dashboard/project/fgquwzzyudgcmfbuvmch/functions/set-member-admin/logs`.
- **Brand colour in admin UI is `#2E5FA3` (blue),** not the teal mentioned in CLAUDE.md. Existing `MemberDetail.tsx` and `Members.tsx` both use the blue, so new components in this session matched that.
- **Plan mode was used twice this session** — first to design the feature, second to diagnose the deployment bug. Both iterations are captured in the single plan file.

---

## Possible follow-ups (not done)

- Expose the "Go to admin" link in the portal for promoted members (we explicitly chose not to for now).
- Add an audit trail of promote/revoke actions (currently only `is_active` flip is preserved).
- Tighten `admin_users` RLS — it is currently permissive (`auth.uid() IS NOT NULL` can write), and the edge function uses service-role to enforce superadmin-only writes. App-level enforcement works but a proper RLS policy would be more defensive.
