# WhatsApp opt-out welcome notice — template submission

Consent flipped to opt-OUT on 2026-07-13: every member is subscribed unless they
reply STOP. This template is the one-time courtesy notice sent by
`send-whatsapp-optin-invite` (function name kept for URL stability).

## Template to submit in Twilio (Content Template Builder)

- **Name:** `vca_whatsapp_notice_v1`
- **Language:** `en`
- **Category:** MARKETING (mentions club news/updates — UTILITY will likely be rejected)
- **Type:** Quick reply (one button) — or plain text if the button is unwanted
- **Variables:** `{{1}}` = member first name

**Body:**

> Hi {{1}}, this is the Vaal Cruising Association. We now use WhatsApp for club
> messages — bar-tab reminders, event news and booking updates. You can also
> message us here any time and our club assistant will help with balances,
> bookings and club info.
>
> If you'd rather not receive these messages, just reply STOP.

**Quick-reply button (optional but recommended — one-tap opt-out):**

- Button text: `Stop messages`
- Payload/ID: `optin_no` (the webhook already routes this payload to opt-out)

## Rollout status (2026-07-13)

1. ✅ Migration pushed as `20260713120300_whatsapp_opt_out_model.sql` (renamed from
   120000 — that version was taken by the same-day `venue_knowledge_sort_order`
   migration). Verified: 82 members all subscribed, 0 opted out, default TRUE.
2. ✅ `whatsapp-webhook`, `send-whatsapp-optin-invite`, `send-tab-reminder-whatsapp`
   deployed.
3. ✅ `TWILIO_TEMPLATE_NOTICE_SID` set to `HX2020934c206c22db2b555f9b43b8a6ec`.
   (If unset, the function falls back to `TWILIO_TEMPLATE_OPTIN_SID`.)
4. ⬜ Admin → Members → "WhatsApp notice (N)" to send the bulk notice. Note: if the
   template was created but not yet Meta-APPROVED, sends fail with a template error —
   check status in Twilio Content Template Builder first.
5. ⬜ Only after the notice has gone out, start sending bulk/individual reminders to
   previously-uncontacted members
