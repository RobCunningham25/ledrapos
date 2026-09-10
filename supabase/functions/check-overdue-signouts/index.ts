// check-overdue-signouts — Finds water_signouts past their expected_return_at
// that haven't been closed out, and pages that venue's water_safety_contacts:
//   * Email (always attempted) — the reliable channel, works from day one.
//   * WhatsApp (attempted only if TWILIO_TEMPLATE_WATER_OVERDUE_SID is set) —
//     needs a Meta-approved utility template since this must reach contacts
//     outside any 24h session window; skipped (not failed) until one exists.
//
// Scheduled by pg_cron every 5 minutes (migration 20260910130000). Idempotent
// and takes no input — unauthenticated invocation is harmless, same reasoning
// as expire-bookings. overdue_alert_sent_at stops the same trip re-alerting
// on every tick.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  detailRows,
  emailHeading,
  emailParagraph,
  emailShell,
  escapeHtml,
  sendResendEmail,
  venueFooterLines,
  VENUE_EMAIL_COLUMNS,
  emailFromHeader,
  type EmailVenue,
} from "../_shared/emailTemplate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OverdueRow {
  id: string;
  venue_id: string;
  boat_name: string;
  passenger_count: number;
  contact_phone: string | null;
  departure_at: string;
  expected_return_at: string;
  members: { first_name: string; last_name: string } | null;
}

interface SafetyContact {
  id: string;
  name: string;
  whatsapp_number: string | null;
  email: string | null;
}

function fmtSAST(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function alertContact(
  supabaseUrl: string,
  row: OverdueRow,
  memberName: string,
  venue: EmailVenue,
  contact: SafetyContact,
  errors: string[],
) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const templateSid = Deno.env.get("TWILIO_TEMPLATE_WATER_OVERDUE_SID");
  const workerToken = Deno.env.get("WHATSAPP_WORKER_TOKEN");

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

  if (contact.whatsapp_number && templateSid && workerToken) {
    tasks.push((async () => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Whatsapp-Worker-Token": workerToken },
          body: JSON.stringify({
            venue_id: row.venue_id,
            to_e164: contact.whatsapp_number,
            template_sid: templateSid,
            template_variables: [
              memberName,
              row.boat_name,
              fmtSAST(row.departure_at),
              fmtSAST(row.expected_return_at),
              String(row.passenger_count),
              row.contact_phone || "unknown",
            ],
            related_kind: "water_signout_overdue",
            related_id: row.id,
          }),
        });
        if (!res.ok) {
          errors.push(`whatsapp to ${contact.whatsapp_number}: ${res.status} ${await res.text().catch(() => "")}`);
        }
      } catch (err) {
        errors.push(`whatsapp to ${contact.whatsapp_number} threw: ${err instanceof Error ? err.message : String(err)}`);
      }
    })());
  }

  await Promise.all(tasks);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const nowIso = new Date().toISOString();
    const { data: overdue, error: queryError } = await supabase
      .from("water_signouts")
      .select("id, venue_id, boat_name, passenger_count, contact_phone, departure_at, expected_return_at, members(first_name, last_name)")
      .eq("status", "out")
      .lt("expected_return_at", nowIso)
      .is("overdue_alert_sent_at", null);

    if (queryError) {
      console.error("Query error:", queryError.message);
      return new Response(JSON.stringify({ error: queryError.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!overdue || overdue.length === 0) {
      return new Response(JSON.stringify({ alerted_count: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const alertedIds: string[] = [];
    const failedIds: string[] = [];
    const allErrors: string[] = [];

    // Cache venue + contacts per venue_id since multiple overdue trips can
    // share a venue.
    const venueCache = new Map<string, EmailVenue>();
    const contactsCache = new Map<string, SafetyContact[]>();

    for (const row of overdue as unknown as OverdueRow[]) {
      const memberName = row.members
        ? `${row.members.first_name} ${row.members.last_name}`.trim()
        : "A member";

      if (!venueCache.has(row.venue_id)) {
        const { data } = await supabase
          .from("venues")
          .select(VENUE_EMAIL_COLUMNS)
          .eq("id", row.venue_id)
          .maybeSingle<EmailVenue>();
        venueCache.set(row.venue_id, data ?? { name: "Club" });
      }
      if (!contactsCache.has(row.venue_id)) {
        const { data } = await supabase
          .from("water_safety_contacts")
          .select("id, name, whatsapp_number, email")
          .eq("venue_id", row.venue_id)
          .eq("is_active", true)
          .order("sort_order");
        contactsCache.set(row.venue_id, (data as SafetyContact[]) ?? []);
      }

      const venue = venueCache.get(row.venue_id)!;
      const contacts = contactsCache.get(row.venue_id)!;
      const rowErrors: string[] = [];

      await Promise.all(contacts.map((c) => alertContact(supabaseUrl, row, memberName, venue, c, rowErrors)));

      const { error: updateError } = await supabase
        .from("water_signouts")
        .update({ overdue_alert_sent_at: new Date().toISOString() })
        .eq("id", row.id);

      if (updateError) {
        console.error(`Failed to mark ${row.id} alerted:`, updateError.message);
        failedIds.push(row.id);
      } else {
        alertedIds.push(row.id);
      }
      if (rowErrors.length) {
        console.error(`Alert errors for signout ${row.id}:`, rowErrors.join("; "));
        allErrors.push(...rowErrors.map((e) => `${row.id}: ${e}`));
      }
    }

    return new Response(
      JSON.stringify({
        alerted_count: alertedIds.length,
        signout_ids: alertedIds,
        ...(failedIds.length ? { failed_to_mark: failedIds } : {}),
        ...(allErrors.length ? { channel_errors: allErrors } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
