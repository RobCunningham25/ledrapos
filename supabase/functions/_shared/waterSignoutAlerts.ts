// waterSignoutAlerts.ts — Shared alerting for the water sign-out (float plan)
// safety system. Used by both check-overdue-signouts (the cron sweep) and
// whatsapp-webhook (the "still out, need help 🚨" button, which escalates
// immediately rather than waiting for the cron).
//
// Two-stage escalation:
//   1. sendMemberReminder — at expected_return_at, nudge the MEMBER first
//      ("did you forget to sign in?") via vca_water_signout_reminder_v1
//      (TWILIO_TEMPLATE_WATER_REMINDER_SID). Carries two quick-reply buttons,
//      handled in whatsapp-webhook:
//        signout_still_out  → snooze: push expected_return_at back
//                              SNOOZE_MINUTES, clear reminder_sent_at so a
//                              fresh reminder can fire later.
//        signout_send_help  → skip the grace period, alert safety contacts
//                              right now.
//   2. alertSafetyContacts — pages venue.water_safety_contacts by email
//      (always attempted) and WhatsApp (vca_water_safety_overdue_v1 /
//      TWILIO_TEMPLATE_WATER_OVERDUE_SID, once approved) if GRACE_MINUTES
//      have passed since the reminder with no response, or immediately on
//      signout_send_help.
//
// Both stages are best-effort — a missing template SID or an unreachable
// contact is logged, never thrown; the caller decides what to mark on the
// water_signouts row regardless of channel success, same philosophy as
// whatsappFollowupNotify.ts.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  detailRows,
  emailFromHeader,
  emailHeading,
  emailParagraph,
  emailShell,
  escapeHtml,
  sendResendEmail,
  venueFooterLines,
  type EmailVenue,
} from "./emailTemplate.ts";
import { normaliseE164 } from "./twilio.ts";

// Time between the member reminder and escalating to the safety contacts if
// they don't respond either way.
export const GRACE_MINUTES = 20;
// How far the "still out, but OK 👍" button pushes expected_return_at out.
export const SNOOZE_MINUTES = 30;

export interface SignoutAlertRow {
  id: string;
  venue_id: string;
  member_id: string;
  boat_name: string;
  passenger_count: number;
  contact_phone: string | null;
  departure_at: string;
  expected_return_at: string;
}

export interface SafetyContact {
  id: string;
  name: string;
  whatsapp_number: string | null;
  email: string | null;
}

export function fmtSAST(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function sendWhatsAppTemplate(
  supabaseUrl: string,
  args: { venueId: string; memberId?: string | null; toE164: string; templateSid: string; variables: Record<string, string>; relatedKind: string; relatedId: string },
): Promise<{ ok: boolean; error?: string }> {
  const workerToken = Deno.env.get("WHATSAPP_WORKER_TOKEN");
  if (!workerToken) return { ok: false, error: "WHATSAPP_WORKER_TOKEN not configured" };
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Whatsapp-Worker-Token": workerToken },
      body: JSON.stringify({
        venue_id: args.venueId,
        member_id: args.memberId ?? null,
        to_e164: args.toE164,
        template_sid: args.templateSid,
        template_variables: args.variables,
        related_kind: args.relatedKind,
        related_id: args.relatedId,
      }),
    });
    if (!res.ok) return { ok: false, error: `${res.status} ${await res.text().catch(() => "")}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Stage 1 — nudge the member themselves. Skips (not fails) if they've opted
 * out of WhatsApp, have no usable number, or the template isn't approved yet.
 */
export async function sendMemberReminder(
  supabase: SupabaseClient,
  supabaseUrl: string,
  row: SignoutAlertRow,
): Promise<{ sent: boolean; note: string }> {
  const templateSid = Deno.env.get("TWILIO_TEMPLATE_WATER_REMINDER_SID");
  if (!templateSid) return { sent: false, note: "TWILIO_TEMPLATE_WATER_REMINDER_SID not configured" };

  const { data: member } = await supabase
    .from("members")
    .select("first_name, whatsapp_number, phone, whatsapp_opt_in")
    .eq("id", row.member_id)
    .maybeSingle();
  if (!member) return { sent: false, note: "member not found" };
  if (!member.whatsapp_opt_in) return { sent: false, note: "member opted out of WhatsApp" };

  const toE164 = normaliseE164(member.whatsapp_number) || normaliseE164(member.phone);
  if (!toE164) return { sent: false, note: "no usable WhatsApp number on file" };

  const result = await sendWhatsAppTemplate(supabaseUrl, {
    venueId: row.venue_id,
    memberId: row.member_id,
    toE164,
    templateSid,
    variables: {
      "1": member.first_name || "there",
      "2": row.boat_name,
      "3": fmtSAST(row.expected_return_at),
    },
    relatedKind: "water_signout_reminder",
    relatedId: row.id,
  });
  return result.ok ? { sent: true, note: "sent" } : { sent: false, note: result.error ?? "send failed" };
}

/**
 * Stage 2 — page the venue's safety contacts. Email is always attempted;
 * WhatsApp only if the template SID is configured. Returns any channel-level
 * error strings (informational — never thrown).
 */
export async function alertSafetyContacts(
  supabaseUrl: string,
  row: SignoutAlertRow,
  memberName: string,
  venue: EmailVenue,
  contacts: SafetyContact[],
): Promise<string[]> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const templateSid = Deno.env.get("TWILIO_TEMPLATE_WATER_OVERDUE_SID");
  const errors: string[] = [];

  await Promise.all(contacts.map(async (contact) => {
    const tasks: Promise<void>[] = [];

    if (contact.email && resendKey) {
      tasks.push((async () => {
        const bodyHtml = [
          emailHeading("Overdue water sign-out"),
          emailParagraph(
            `${escapeHtml(memberName)} has not signed back in after going out on the water. Please check on them or begin the club's safety procedure.`,
          ),
          detailRows([
            { label: "Boat", value: row.boat_name, strong: true },
            { label: "Departed", value: fmtSAST(row.departure_at) },
            { label: "Expected back", value: fmtSAST(row.expected_return_at) },
            { label: "People aboard", value: String(row.passenger_count) },
            { label: "Contact number", value: row.contact_phone || "Not on file" },
          ]),
        ].join("\n      ");

        const html = emailShell({
          venue,
          title: `Overdue water sign-out: ${memberName}`,
          preheader: `${memberName} has not signed back in — expected ${fmtSAST(row.expected_return_at)}`,
          bodyHtml,
          footerLines: [...venueFooterLines(venue), "Sent automatically by the water sign-out safety system."],
        });

        const result = await sendResendEmail({
          apiKey: resendKey,
          from: emailFromHeader(venue),
          to: [contact.email!],
          subject: `⚠️ Overdue water sign-out: ${memberName}`,
          html,
        });
        if (!result.ok) errors.push(`email to ${contact.email}: ${result.error}`);
      })());
    }

    if (contact.whatsapp_number && templateSid) {
      tasks.push((async () => {
        const result = await sendWhatsAppTemplate(supabaseUrl, {
          venueId: row.venue_id,
          toE164: contact.whatsapp_number!,
          templateSid,
          variables: {
            "1": memberName,
            "2": fmtSAST(row.departure_at),
            "3": fmtSAST(row.expected_return_at),
            "4": String(row.passenger_count),
            "5": row.contact_phone || "unknown",
          },
          relatedKind: "water_signout_overdue",
          relatedId: row.id,
        });
        if (!result.ok) errors.push(`whatsapp to ${contact.whatsapp_number}: ${result.error}`);
      })());
    }

    await Promise.all(tasks);
  }));

  return errors;
}
