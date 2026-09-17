// check-overdue-signouts — Two-stage water sign-out escalation, run by
// pg_cron every 5 minutes:
//
//   Stage 1: any trip that just reached expected_return_at (still status
//            'out', never reminded) gets a WhatsApp nudge to the MEMBER —
//            "did you forget to sign in?" — with quick-reply buttons handled
//            in whatsapp-webhook (still_out / send_help).
//   Stage 2: any trip where GRACE_MINUTES have passed since that reminder
//            with no response — or where the member tapped "need help" —
//            gets escalated to the venue's water_safety_contacts by email
//            (always) and WhatsApp (once TWILIO_TEMPLATE_WATER_OVERDUE_SID
//            is configured).
//
// See _shared/waterSignoutAlerts.ts for the actual sends. Idempotent and
// takes no input — unauthenticated invocation is harmless, same reasoning as
// expire-bookings. reminder_sent_at / overdue_alert_sent_at stop either stage
// re-firing for the same trip.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { VENUE_EMAIL_COLUMNS, type EmailVenue } from "../_shared/emailTemplate.ts";
import {
  alertSafetyContacts,
  GRACE_MINUTES,
  sendMemberReminder,
  type SafetyContact,
  type SignoutAlertRow,
} from "../_shared/waterSignoutAlerts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SELECT_ROW = "id, venue_id, member_id, boat_name, passenger_count, contact_phone, departure_at, expected_return_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const nowIso = new Date().toISOString();
    const graceCutoffIso = new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString();

    // ===== Stage 1: member reminders =====
    const { data: needReminder, error: reminderQueryError } = await supabase
      .from("water_signouts")
      .select(SELECT_ROW)
      .eq("status", "out")
      .lt("expected_return_at", nowIso)
      .is("reminder_sent_at", null);

    if (reminderQueryError) {
      console.error("Stage 1 query error:", reminderQueryError.message);
    }

    const remindedIds: string[] = [];
    const reminderNotes: string[] = [];
    for (const row of (needReminder ?? []) as unknown as SignoutAlertRow[]) {
      const result = await sendMemberReminder(supabase, supabaseUrl, row);
      reminderNotes.push(`${row.id}: ${result.note}`);
      // Mark attempted regardless of outcome — a skip (opted out, no
      // number, template not approved yet) still needs to fall through to
      // the grace-period-from-expected_return_at path in Stage 2 rather than
      // retry every 5 minutes forever.
      const { error: updateError } = await supabase
        .from("water_signouts")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", row.id);
      if (updateError) console.error(`Failed to mark ${row.id} reminded:`, updateError.message);
      else remindedIds.push(row.id);
    }

    // ===== Stage 2: escalate to safety contacts =====
    // Fires when: the member asked for help outright, OR the reminder was
    // sent at least GRACE_MINUTES ago with no response, OR (no WhatsApp
    // reminder could ever be sent) expected_return_at itself is that old.
    const { data: needEscalation, error: escalationQueryError } = await supabase
      .from("water_signouts")
      .select(`${SELECT_ROW}, members(first_name, last_name)`)
      .eq("status", "out")
      .is("overdue_alert_sent_at", null)
      .or(
        `help_requested_at.not.is.null,and(reminder_sent_at.not.is.null,reminder_sent_at.lt.${graceCutoffIso}),and(reminder_sent_at.is.null,expected_return_at.lt.${graceCutoffIso})`,
      );

    if (escalationQueryError) {
      console.error("Stage 2 query error:", escalationQueryError.message);
    }

    const alertedIds: string[] = [];
    const failedIds: string[] = [];
    const allErrors: string[] = [];
    const venueCache = new Map<string, EmailVenue>();
    const contactsCache = new Map<string, SafetyContact[]>();

    for (const row of (needEscalation ?? []) as unknown as Array<SignoutAlertRow & { members: { first_name: string; last_name: string } | null }>) {
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

      const rowErrors = await alertSafetyContacts(
        supabaseUrl,
        row,
        memberName,
        venueCache.get(row.venue_id)!,
        contactsCache.get(row.venue_id)!,
      );

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
        reminded_count: remindedIds.length,
        reminder_notes: reminderNotes,
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
