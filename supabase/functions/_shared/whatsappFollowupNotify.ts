// whatsappFollowupNotify.ts — Notifies staff when a new whatsapp_followups row
// is created, whether raised by the AI's escalate_to_admin tool or by the
// automatic "couldn't generate a reply" safety net. Used for BOTH member and
// prospect conversations.
//
// Two channels, fired for every follow-up regardless of urgency (previously
// only 'urgent' escalations emailed anyone, and normal/knowledge_gap ones sat
// silently in the admin queue):
//   1. Email to venue_settings.report_recipient_email (falls back to
//      venues.contact_email) via Resend — the reliable channel, always
//      attempted.
//   2. Best-effort WhatsApp ping to venues.whatsapp_staff_alert_number via
//      send-whatsapp. This is a free-form send, so it only lands if that
//      number has an open 24h session with the club's WhatsApp number (i.e.
//      staff have texted it themselves recently) — send-whatsapp's 409 for a
//      closed window is swallowed here, not surfaced. A guaranteed any-time
//      WhatsApp alert needs a Meta-approved utility template (a Twilio/Meta
//      submission outside this codebase); until one exists, email is the
//      channel to rely on.
//
// Both channels are best-effort: failures are logged to console and never
// thrown — the follow-up row is already committed and is the source of truth.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  emailButton,
  emailHeading,
  emailParagraph,
  emailShell,
  escapeHtml,
  venueFooterLines,
  VENUE_EMAIL_COLUMNS,
  type EmailVenue,
} from "./emailTemplate.ts";

const SITE_URL = (Deno.env.get("SITE_URL") ?? Deno.env.get("PORTAL_BASE_URL") ?? "https://pos.ledra.co.za").replace(/\/+$/, "");

export interface FollowupNotifyArgs {
  supabase: SupabaseClient;
  venueId: string;
  venueSlug: string;
  /** Exactly one of memberId / prospectId is set. */
  memberId: string | null;
  prospectId: string | null;
  followupId: string;
  summary: string;
  urgency: "normal" | "urgent";
  reason: string;
  originalMessage: string;
}

interface ContactInfo {
  name: string;
  phone: string | null;
  isProspect: boolean;
}

async function resolveContact(
  supabase: SupabaseClient,
  memberId: string | null,
  prospectId: string | null,
): Promise<ContactInfo> {
  if (memberId) {
    const { data } = await supabase
      .from("members")
      .select("first_name, last_name, membership_number, phone, whatsapp_number")
      .eq("id", memberId)
      .maybeSingle();
    const name = data
      ? `${(data.first_name as string | null) ?? ""} ${(data.last_name as string | null) ?? ""}`.trim() || "Unknown member"
      : "Unknown member";
    const ref = (data?.membership_number as string | null | undefined) ? ` #${data.membership_number}` : "";
    return {
      name: `${name}${ref}`,
      phone: (data?.whatsapp_number as string | null | undefined) ?? (data?.phone as string | null | undefined) ?? null,
      isProspect: false,
    };
  }
  if (prospectId) {
    const { data } = await supabase
      .from("whatsapp_prospects")
      .select("display_name, whatsapp_number")
      .eq("id", prospectId)
      .maybeSingle();
    return {
      name: (data?.display_name as string | null | undefined) || "New WhatsApp enquiry (not a member)",
      phone: (data?.whatsapp_number as string | null | undefined) ?? null,
      isProspect: true,
    };
  }
  return { name: "Unknown contact", phone: null, isProspect: false };
}

async function sendEmail(
  args: FollowupNotifyArgs,
  contact: ContactInfo,
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;

  const [{ data: setting }, { data: venue }] = await Promise.all([
    args.supabase
      .from("venue_settings")
      .select("value")
      .eq("venue_id", args.venueId)
      .eq("key", "report_recipient_email")
      .maybeSingle(),
    args.supabase
      .from("venues")
      .select(VENUE_EMAIL_COLUMNS)
      .eq("id", args.venueId)
      .maybeSingle<EmailVenue>(),
  ]);

  const recipient = (setting?.value as string | undefined) ?? (venue?.contact_email as string | undefined);
  if (!recipient) return;

  const fromEmail = (venue?.broadcast_from_email as string | undefined)
    ?? Deno.env.get("INVITE_FROM_EMAIL")
    ?? "noreply@ledra.co.za";
  const emailVenue: EmailVenue = venue ?? { name: "Club" };
  const venueName = emailVenue.name;

  const adminUrl = `${SITE_URL}/${args.venueSlug}/admin/whatsapp/followups`;
  const kindLabel = contact.isProspect ? "prospective member" : "member";
  const urgencyLabel = args.urgency === "urgent" ? "Urgent" : "New";

  const subject = `[${venueName}] ${urgencyLabel} WhatsApp follow-up (${kindLabel}): ${args.summary.slice(0, 70)}`;
  const bodyHtml = [
    emailHeading(`${urgencyLabel} WhatsApp follow-up`),
    emailParagraph(`A follow-up has been logged from the WhatsApp assistant, from a ${escapeHtml(kindLabel)}.`),
    emailParagraph(
      `<strong>From:</strong> ${escapeHtml(contact.name)}${contact.phone ? ` &middot; ${escapeHtml(contact.phone)}` : ""}`,
    ),
    emailParagraph(`<strong>Summary:</strong> ${escapeHtml(args.summary)}`),
    emailParagraph("<strong>Original message:</strong>"),
    `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #D4A574;background:#FAF8F5;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(args.originalMessage).replace(/\n/g, "<br>")}</blockquote>`,
    emailButton({ href: adminUrl, label: "Open in admin" }),
  ].join("\n      ");

  const html = emailShell({
    venue: emailVenue,
    title: `${urgencyLabel} WhatsApp follow-up`,
    preheader: args.summary.slice(0, 120),
    bodyHtml,
    footerLines: [
      ...venueFooterLines(emailVenue),
      `Sent automatically by the ${escapeHtml(venueName)} WhatsApp AI assistant.`,
    ],
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromEmail, to: recipient, subject, html }),
    });
    if (!res.ok) {
      console.error("followup notify email failed:", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("followup notify email threw:", err instanceof Error ? err.message : String(err));
  }
}

async function sendStaffWhatsAppPing(args: FollowupNotifyArgs, contact: ContactInfo): Promise<void> {
  const { data: venue } = await args.supabase
    .from("venues")
    .select("whatsapp_staff_alert_number")
    .eq("id", args.venueId)
    .maybeSingle();
  const staffNumber = venue?.whatsapp_staff_alert_number as string | null | undefined;
  if (!staffNumber) return;

  const workerToken = Deno.env.get("WHATSAPP_WORKER_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!workerToken || !supabaseUrl) return;

  const kindLabel = contact.isProspect ? "prospective member" : "member";
  const text = `[${args.urgency === "urgent" ? "URGENT " : ""}WhatsApp follow-up] ${contact.name} (${kindLabel}): ${args.summary}`.slice(0, 1500);

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Whatsapp-Worker-Token": workerToken,
      },
      body: JSON.stringify({
        venue_id: args.venueId,
        to_e164: staffNumber,
        body: text,
        related_kind: "staff_alert",
        related_id: args.followupId,
      }),
    });
    if (!res.ok) {
      // Expected/common failure: 409 outside the staff number's own 24h
      // session window. Log at info level, not error — this channel is
      // explicitly best-effort until a utility template is approved.
      console.log("staff WhatsApp alert not delivered:", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("staff WhatsApp alert threw:", err instanceof Error ? err.message : String(err));
  }
}

export async function notifyNewFollowup(args: FollowupNotifyArgs): Promise<void> {
  const contact = await resolveContact(args.supabase, args.memberId, args.prospectId);
  await Promise.all([
    sendEmail(args, contact),
    sendStaffWhatsAppPing(args, contact),
  ]);
}
