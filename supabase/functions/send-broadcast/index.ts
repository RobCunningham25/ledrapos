// send-broadcast — Admin-triggered: creates a broadcast row, enqueues recipient rows,
// then invokes process-broadcast-batch synchronously to actually send. Designed for the
// Resend free tier (100 emails/day, 10/sec) — refuses sends that would push us past
// 95 emails sent in the current UTC day to leave a small buffer for invites.
//
// Inputs (POST JSON):
//   venue_id          UUID — must match the calling admin's venue_id
//   subject           string
//   body_html         string — admin-composed body BEFORE footer injection
//   attachment_paths  string[] — paths in the broadcast-attachments bucket (optional)
//   recipient_filter  jsonb — {} for all active members; {"member_ids": [...]} for testing
//   scheduled_for     ISO timestamp — if set in the future, broadcast stays 'queued'
//                                     and the worker is NOT invoked (Phase D will pick up)
//
// Auth pattern mirrors invite-member: Bearer → auth.getUser → admin_users lookup with
// is_active and venue_id cross-check.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const DAILY_QUOTA_THRESHOLD = 95; // Resend free tier is 100/day; reserve 5 for invites.
const INLINE_SEND_CAP = 100;       // larger broadcasts must wait for the scheduled worker.

interface BroadcastRequest {
  venue_id: string;
  subject: string;
  body_html: string;
  attachment_paths?: string[];
  recipient_filter?: Record<string, unknown>;
  scheduled_for?: string | null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    // ===== Auth =====
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

    // ===== Input validation =====
    let body: BroadcastRequest;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    if (!body.venue_id || !body.subject || !body.body_html) {
      return json(400, { error: "venue_id, subject, and body_html are required" });
    }
    if (adminUser.venue_id !== body.venue_id) {
      return json(403, { error: "Cross-venue action not allowed" });
    }
    const subject = body.subject.trim();
    if (subject.length === 0 || subject.length > 200) {
      return json(400, { error: "subject must be 1-200 characters" });
    }
    if (body.body_html.trim().length === 0) {
      return json(400, { error: "body_html must not be empty" });
    }
    const attachmentPaths = Array.isArray(body.attachment_paths)
      ? body.attachment_paths.filter((p) => typeof p === "string")
      : [];
    const recipientFilter = body.recipient_filter ?? {};

    // ===== Look up venue =====
    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .select("id, name, slug, address, contact_email, broadcast_from_email")
      .eq("id", body.venue_id)
      .maybeSingle();

    if (venueError || !venue) return json(404, { error: "Venue not found" });

    const fromEmail = venue.broadcast_from_email
      || Deno.env.get("INVITE_FROM_EMAIL")
      || null;

    if (!fromEmail) {
      return json(500, {
        error:
          "No sender email configured for this venue (set venues.broadcast_from_email or INVITE_FROM_EMAIL env)",
      });
    }

    // ===== Resolve recipients via SQL helper =====
    const { data: candidates, error: recipientError } = await supabase.rpc(
      "select_broadcast_recipients",
      { p_venue_id: body.venue_id, p_filter: recipientFilter },
    );

    if (recipientError) {
      console.error("recipient resolution failed:", recipientError.message);
      return json(500, { error: "Failed to resolve recipients" });
    }

    const allRecipients = (candidates as Array<{ id: string; email: string; status: string; recipient_type: string }>) || [];
    const sendable = allRecipients.filter((r) => r.status === "pending");
    const totalCount = allRecipients.length;
    const sendableCount = sendable.length;

    if (sendableCount === 0) {
      return json(400, {
        error: "No eligible recipients (all skipped due to missing email or opt-out)",
        total: totalCount,
      });
    }

    if (sendableCount > INLINE_SEND_CAP) {
      return json(400, {
        error:
          `MVP supports up to ${INLINE_SEND_CAP} recipients per send (would have sent ${sendableCount}). Narrow the recipient filter.`,
      });
    }

    // ===== Daily quota check (Resend free tier) =====
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count: todaySent, error: quotaError } = await supabase
      .from("broadcast_recipients")
      .select("id, email_broadcasts!inner(venue_id)", { count: "exact", head: true })
      .eq("status", "sent")
      .eq("email_broadcasts.venue_id", body.venue_id)
      .gte("sent_at", todayStart.toISOString());

    if (quotaError) {
      console.error("quota check failed:", quotaError.message);
      return json(500, { error: "Failed to check daily quota" });
    }

    const todayCount = todaySent ?? 0;
    if (todayCount + sendableCount > DAILY_QUOTA_THRESHOLD) {
      return json(429, {
        error: "Daily email quota would be exceeded",
        today_sent: todayCount,
        would_send: sendableCount,
        threshold: DAILY_QUOTA_THRESHOLD,
        message: `Already sent ${todayCount} today. Sending ${sendableCount} more would exceed the ${DAILY_QUOTA_THRESHOLD}/day limit. Try again after UTC midnight.`,
      });
    }

    // ===== Schedule: scheduled_for in the future leaves status='queued' =====
    const scheduledFor = body.scheduled_for ? new Date(body.scheduled_for) : null;
    const isScheduled = scheduledFor !== null && scheduledFor.getTime() > Date.now() + 60_000;

    // ===== Insert broadcast row =====
    let skippedNoEmail = 0;
    let skippedOptedOut = 0;
    for (const r of allRecipients) {
      if (r.status === "no_email_skipped") skippedNoEmail++;
      else if (r.status === "opted_out_skipped") skippedOptedOut++;
    }
    const skippedTotal = skippedNoEmail + skippedOptedOut;

    const { data: broadcast, error: insertError } = await supabase
      .from("email_broadcasts")
      .insert({
        venue_id: body.venue_id,
        created_by: adminUser.id,
        subject,
        body_html: body.body_html,
        attachment_paths: attachmentPaths,
        recipient_filter: recipientFilter,
        status: "queued",
        total_recipients: totalCount,
        skipped_count: skippedTotal,
        scheduled_for: scheduledFor ? scheduledFor.toISOString() : null,
      })
      .select("id")
      .single();

    if (insertError || !broadcast) {
      console.error("broadcast insert failed:", insertError?.message);
      return json(500, { error: "Failed to create broadcast" });
    }

    // ===== Bulk insert recipient rows =====
    const recipientRows = allRecipients.map((r) => ({
      broadcast_id: broadcast.id,
      member_id: r.id,
      email: r.email || "",
      status: r.status,
      recipient_type: r.recipient_type || "member",
    }));

    const { error: recipientInsertError } = await supabase
      .from("broadcast_recipients")
      .insert(recipientRows);

    if (recipientInsertError) {
      console.error("recipient insert failed:", recipientInsertError.message);
      return json(500, {
        error: "Failed to enqueue recipients",
        broadcast_id: broadcast.id,
      });
    }

    // ===== If scheduled, return now (worker picks up later) =====
    if (isScheduled) {
      return json(202, {
        broadcast_id: broadcast.id,
        status: "queued",
        scheduled_for: scheduledFor!.toISOString(),
        total_recipients: totalCount,
        sendable: sendableCount,
        skipped: skippedTotal,
        message: "Broadcast queued for scheduled send",
      });
    }

    // ===== Otherwise invoke worker synchronously =====
    const workerToken = Deno.env.get("BROADCAST_WORKER_TOKEN");
    if (!workerToken) {
      return json(500, { error: "BROADCAST_WORKER_TOKEN not configured" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const workerResp = await fetch(`${supabaseUrl}/functions/v1/process-broadcast-batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Broadcast-Worker-Token": workerToken,
      },
      body: JSON.stringify({ broadcast_id: broadcast.id }),
    });

    const workerResult = await workerResp.json().catch(() => ({}));

    return json(workerResp.ok ? 200 : 502, {
      broadcast_id: broadcast.id,
      total_recipients: totalCount,
      sendable: sendableCount,
      skipped: skippedTotal,
      worker_status: workerResp.status,
      worker_result: workerResult,
    });
  } catch (err) {
    console.error("send-broadcast unexpected error:", err);
    return json(500, { error: "Internal server error" });
  }
});
