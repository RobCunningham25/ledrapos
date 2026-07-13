// send-whatsapp-optin-invite — Admin-triggered. Consent is opt-OUT, so this no
// longer *asks* members to opt in: it sends the one-time courtesy notice
// ("this is VCA — we'll send tab reminders and club updates here; reply STOP to
// opt out") to a single member or every eligible member in a venue, and stamps
// members.whatsapp_notice_sent_at. Function keeps its historical name so the
// deployed URL and admin UI invocations don't churn.
//
// Template: vca_whatsapp_notice_v1 → TWILIO_TEMPLATE_NOTICE_SID. Falls back to
// the old opt-in template (TWILIO_TEMPLATE_OPTIN_SID) until the notice template
// is approved — its Yes/No buttons still route correctly in the webhook.
//
// Eligibility for bulk = member has a non-null phone, is active, has not opted
// out, has not already received the notice (or the old opt-in invite), and was
// not messaged one in the last 24h (avoid spamming if the admin double-clicks).
//
// Inputs (POST JSON):
//   { venue_id, member_id }                       — per-row send
//   { venue_id, mode: 'bulk_eligible' }           — send to every eligible member
//
// Auth: Bearer JWT → admin_users cross-check on venue_id (mirrors invite-member).
// Throttles bulk sends to ~5/sec because Twilio's WhatsApp ramp limits start
// tighter than Resend's.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { normaliseE164 } from "../_shared/twilio.ts";

const THROTTLE_MS = 200; // ~5/sec
const RECENT_INVITE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface InviteRequest {
  venue_id: string;
  member_id?: string | null;
  mode?: "single" | "bulk_eligible" | null;
}

interface MemberRow {
  id: string;
  first_name: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  whatsapp_opt_in: boolean;
  whatsapp_opt_out_at: string | null;
  whatsapp_notice_sent_at: string | null;
  is_active: boolean;
}

interface SendOutcome {
  member_id: string;
  status: "sent" | "skipped" | "failed";
  error?: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recentlyInvited(
  supabase: SupabaseClient,
  memberId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - RECENT_INVITE_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .in("related_kind", ["optin_invite", "wa_notice"])
    .in("status", ["queued", "sent", "delivered", "read"])
    .gte("created_at", since);
  return (count ?? 0) > 0;
}

async function sendInviteFor(
  supabase: SupabaseClient,
  member: MemberRow,
  venueId: string,
  templateSid: string,
  workerToken: string,
  supabaseUrl: string,
): Promise<SendOutcome> {
  // Always re-normalise — historical data stored from a buggy earlier version
  // of normaliseE164 may still be in members.whatsapp_number, and we want each
  // send to auto-heal it.
  const toE164 = normaliseE164(member.whatsapp_number) || normaliseE164(member.phone);
  if (!toE164) {
    return { member_id: member.id, status: "skipped", error: "No usable phone number" };
  }

  // Persist the canonical form back to members.whatsapp_number whenever it
  // differs (handles both first-time backfill and one-shot data cleanup).
  if (member.whatsapp_number !== toE164) {
    await supabase.from("members")
      .update({ whatsapp_number: toE164 })
      .eq("id", member.id);
  }

  const resp = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Whatsapp-Worker-Token": workerToken,
    },
    body: JSON.stringify({
      venue_id: venueId,
      member_id: member.id,
      to_e164: toE164,
      template_sid: templateSid,
      template_variables: { "1": member.first_name || "there" },
      related_kind: "wa_notice",
    }),
  });

  const result = await resp.json().catch(() => ({}));
  if (!resp.ok || !result?.success) {
    return {
      member_id: member.id,
      status: "failed",
      error: result?.error || `send-whatsapp ${resp.status}`,
    };
  }

  await supabase.from("members")
    .update({ whatsapp_notice_sent_at: new Date().toISOString() })
    .eq("id", member.id);

  return { member_id: member.id, status: "sent" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ===== Admin auth =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });

    const { data: userData, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !userData?.user) return json(401, { error: "Unauthorized" });

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id, venue_id")
      .eq("auth_user_id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!adminUser) return json(403, { error: "Admin access required" });

    // ===== Input =====
    let body: InviteRequest;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    if (!body.venue_id) return json(400, { error: "venue_id required" });
    if (adminUser.venue_id !== body.venue_id) {
      return json(403, { error: "Cross-venue action not allowed" });
    }

    const templateSid = Deno.env.get("TWILIO_TEMPLATE_NOTICE_SID")
      || Deno.env.get("TWILIO_TEMPLATE_OPTIN_SID");
    if (!templateSid) {
      return json(500, {
        error: "TWILIO_TEMPLATE_NOTICE_SID not configured — submit + approve vca_whatsapp_notice_v1 in Twilio first",
      });
    }
    const workerToken = Deno.env.get("WHATSAPP_WORKER_TOKEN");
    if (!workerToken) return json(500, { error: "WHATSAPP_WORKER_TOKEN not configured" });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const mode = body.mode ?? (body.member_id ? "single" : "bulk_eligible");

    // ===== Single-member send =====
    if (mode === "single") {
      if (!body.member_id) return json(400, { error: "member_id required for single mode" });

      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("id, first_name, phone, whatsapp_number, whatsapp_opt_in, whatsapp_opt_out_at, whatsapp_notice_sent_at, is_active, venue_id")
        .eq("id", body.member_id)
        .eq("venue_id", body.venue_id)
        .maybeSingle<MemberRow & { venue_id: string }>();

      if (memberError || !member) return json(404, { error: "Member not found" });
      if (member.whatsapp_opt_out_at) {
        return json(409, { error: "Member has opted out of WhatsApp — clear the opt-out in their profile first" });
      }

      const outcome = await sendInviteFor(
        supabase,
        member,
        body.venue_id,
        templateSid,
        workerToken,
        supabaseUrl,
      );

      return json(outcome.status === "sent" ? 200 : 500, {
        success: outcome.status === "sent",
        ...outcome,
      });
    }

    // ===== Bulk eligible =====
    const { data: candidates, error: candidatesError } = await supabase
      .from("members")
      .select("id, first_name, phone, whatsapp_number, whatsapp_opt_in, whatsapp_opt_out_at, whatsapp_notice_sent_at, is_active")
      .eq("venue_id", body.venue_id)
      .eq("is_active", true)
      .is("whatsapp_opt_out_at", null)
      .is("whatsapp_notice_sent_at", null)
      .not("phone", "is", null);

    if (candidatesError) {
      return json(500, { error: `Failed to load candidates: ${candidatesError.message}` });
    }

    const eligible: MemberRow[] = ((candidates as MemberRow[]) || []).filter((m) => {
      const norm = m.whatsapp_number || normaliseE164(m.phone);
      return !!norm;
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ member_id: string; error: string }> = [];
    let lastCallAt = 0;

    for (const m of eligible) {
      // Skip if we've recently invited.
      if (await recentlyInvited(supabase, m.id)) {
        skipped++;
        continue;
      }

      // Throttle.
      const now = Date.now();
      const since = now - lastCallAt;
      if (lastCallAt > 0 && since < THROTTLE_MS) {
        await sleep(THROTTLE_MS - since);
      }

      const outcome = await sendInviteFor(
        supabase,
        m,
        body.venue_id,
        templateSid,
        workerToken,
        supabaseUrl,
      );
      lastCallAt = Date.now();

      if (outcome.status === "sent") sent++;
      else if (outcome.status === "skipped") skipped++;
      else {
        failed++;
        errors.push({ member_id: m.id, error: outcome.error || "unknown" });
      }
    }

    return json(200, {
      success: true,
      total_eligible: eligible.length,
      sent,
      skipped,
      failed,
      errors,
    });
  } catch (err) {
    console.error("send-whatsapp-optin-invite crashed:", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
