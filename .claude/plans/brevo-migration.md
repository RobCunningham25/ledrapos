# Plan: Migrate transactional + broadcast email from Resend to Brevo

**Status:** Scoped 2026-07-13 — awaiting Rob's manual Brevo setup before implementation.
**Why:** Resend free tier caps at 100 emails/day; a full-club broadcast (74 members + partner
emails) eats most of it. Brevo free tier is 300/day (~9,000/month), no expiry.

---

## Decision caveats — confirm before committing

1. **Brevo free plan adds a "Sent with Brevo" logo/footer to every email.** Removing it costs
   ~$9/month (add-on, requires at least the Starter plan). If badge-free email matters for club
   broadcasts, the honest comparison is Brevo Starter + logo add-on (~$17–18/mo) vs staying on
   Resend paid ($20/mo, 50k emails, **zero code changes**). Migrating to Brevo free only wins if
   the logo is acceptable.
2. **Brevo attachment caps are tighter:** 4 MB/file, 20 MB total (we currently allow 5 MB / 25 MB
   in the broadcast composer). Client caps must be reduced.
3. **Brevo's 300/day is a global limit** — campaigns + transactional combined. All LedraPOS mail
   (broadcasts, invites, password resets, tab reminders, application notifications, AI escalation
   emails) draws from one pool. Our own `broadcast_recipients`-based quota check only counts
   broadcasts, same blind spot as today — keep a reserve margin (use 280 as the threshold).
4. Daily limit reset time is not clearly documented (historically midnight CET). Change UI copy
   from "resets at UTC midnight" to just "resets daily".

## API mapping (Resend → Brevo)

Endpoint: `POST https://api.brevo.com/v3/smtp/email`
Auth header: `api-key: xkeysib-...` (NOT `Authorization: Bearer`)

| Resend field | Brevo field |
|---|---|
| `from: "Name <email>"` (single string) | `sender: { name, email }` (must split the string) |
| `to: ["a@b.c"]` | `to: [{ email: "a@b.c" }]` |
| `subject` | `subject` |
| `html` / `text` | `htmlContent` / `textContent` |
| `reply_to` | `replyTo: { email }` |
| `attachments: [{ filename, content, content_type }]` | `attachment: [{ name, content }]` (base64; type inferred from extension) |
| `headers: {...}` (List-Unsubscribe etc.) | `headers: {...}` (same) |
| Response `{ id }` | Response 201 `{ messageId }` |

Rate limit is generous (free plan allows far more than 10 req/s on this endpoint) — keep the
existing 120 ms throttle in the worker anyway; it's harmless.

## Code changes (implementation session)

1. **New `supabase/functions/_shared/email.ts`** — single `sendEmail()` helper wrapping the Brevo
   call, accepting the logical shape we already use (from-string, to, subject, html, text,
   replyTo, attachments, headers) and returning `{ id }` or `{ error }`. All senders route
   through it so the next provider switch is one file.
2. **Swap 6 call sites** to the helper:
   - `process-broadcast-batch/index.ts` (worker; store Brevo `messageId` in existing
     `resend_message_id` column — don't bother renaming)
   - `invite-member/index.ts`
   - `request-password-reset/index.ts`
   - `send-tab-reminders/index.ts`
   - `submit-membership-application/index.ts`
   - `_shared/aiTools.ts` (WhatsApp AI escalation email, ~line 1026)
3. **Quota constants:**
   - `send-broadcast/index.ts`: `DAILY_QUOTA_THRESHOLD` 95 → 280; revisit `INLINE_SEND_CAP`
     (100 → can stay or rise; worker handles big sends anyway); update comments.
   - `src/pages/admin/BroadcastCompose.tsx`: `DAILY_QUOTA` 100 → 300, `QUOTA_THRESHOLD` 95 → 280,
     reset-time copy, "Resend" wording in UI strings.
4. **Attachment caps** in `BroadcastCompose.tsx`: `PER_FILE_CAP` 5 MB → 4 MB, `COMBINED_CAP`
   25 MB → 20 MB (lines ~83–84 + user-facing strings at ~226/230/842).
5. **Secrets:** new `BREVO_API_KEY`. Keep `RESEND_API_KEY` set during transition for rollback.
   `INVITE_FROM_EMAIL`, `SITE_URL` unchanged. `venues.broadcast_from_email` unchanged (same
   sender address, now verified with Brevo).
6. **Docs:** update CLAUDE.md (External Services table, Rules 12, required secrets,
   Resend-specific comments) and auto-memory `project_resend_free_tier.md`.

Estimated effort: ~2–4 hours of code + tests, after DNS verification clears.

## Rollout order (lowest risk first)

1. Deploy `invite-member` on Brevo → send a real invite to a test address, check headers/DKIM
   pass (Gmail "show original": SPF/DKIM/DMARC all `PASS`, no spam folder).
2. Deploy `request-password-reset`, `submit-membership-application`, `send-tab-reminders`,
   `aiTools` escalation.
3. Deploy `send-broadcast` + `process-broadcast-batch`; send a test broadcast (with an
   attachment) to Rob only; verify unsubscribe link + List-Unsubscribe header + footer render.
4. Full-club broadcast when confident. Keep the Resend account and DNS records live for a month
   as fallback — the two providers' DNS records use different selectors and don't conflict.

## Rob's manual steps (prerequisite)

See instructions delivered in chat 2026-07-13; summary:
1. Create free account at brevo.com (skip marketing onboarding).
2. Settings → Senders, Domains & Dedicated IPs → Domains → add `vaalcruising.co.za` →
   choose **manual** DNS setup → add in cPanel Zone Editor:
   - Brevo code TXT record on the root domain
   - Two DKIM CNAMEs: `mail._domainkey` and `mail2._domainkey` (Brevo-provided targets)
   - DMARC TXT at `_dmarc` — **only if none exists**; if one already exists (check first —
     Resend setup may have created one), keep the existing record and skip Brevo's.
3. Back in Brevo, click "Authenticate this email domain" → wait for green "Value matched" on
   all records (propagation can take minutes–hours).
4. Add `info@vaalcruising.co.za` as a sender (Senders tab).
5. Generate API key: Settings → SMTP & API → API Keys → create (starts `xkeysib-`).
6. Store it: from `C:\Users\MSI\ledrapos\` (with `$env:SUPABASE_ACCESS_TOKEN` loaded from
   `.env.supabase`):
   `supabase secrets set BREVO_API_KEY=xkeysib-... --project-ref fgquwzzyudgcmfbuvmch`
