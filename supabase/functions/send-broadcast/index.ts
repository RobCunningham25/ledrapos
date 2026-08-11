// send-broadcast — Admin-triggered: creates a broadcast row, enqueues recipient rows,
// then invokes process-broadcast-batch synchronously to actually send. Designed for the
// Resend free tier (100 emails/day, 10/sec). Sends that exceed the remaining daily
// quota are NOT refused: the worker sends what fits under 95/day and leaves the rest
// pending; the pg_cron drainer finishes them after the quota resets at midnight UTC
// (02:00 SAST).
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
const ENQUEUE_CAP = 500;           // sanity ceiling on recipients per broadcast.

interface BroadcastRequest {
  venue_id: string;
  subject: string;
  body_html: string;
  attachment_paths?: string[];
  recipient_filter?: Record<string, unknown>;
  scheduled_for?: string | null;
  // Row id from venue_email_senders — NOT an address. The client must never be
  // able to name the From header directly, or any admin could send as any
  // address on the venue's verified domain. Omitted = the venue's default sender.
  sender_id?: string | null;
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
      .select("id, name, slug, address, contact_email, broadcast_from_email, broadcast_archive_email")
      .eq("id", body.venue_id)
      .maybeSingle();

    if (venueError || !venue) return json(404, { error: "Venue not found" });

    // ===== Resolve the sender =====
    // Always looked up against this venue's own rows, so a forged or borrowed
    // sender_id from another tenant resolves to nothing rather than sending.
    let senderQuery = supabase
      .from("venue_email_senders")
      .select("id, email, label, reply_to")
      .eq("venue_id", body.venue_id)
      .eq("is_active", true);

    senderQuery = body.sender_id
      ? senderQuery.eq("id", body.sender_id)
      : senderQuery.eq("is_default", true);

    const { data: sender } = await senderQuery.maybeSingle();

    if (body.sender_id && !sender) {
      return json(400, { error: "Unknown or inactive sender for this venue" });
    }

    // No sender rows configured yet → fall back to the venue's single legacy address.
    const fromEmail = sender?.email
      || venue.broadcast_from_email
      || Deno.env.get("INVITE_FROM_EMAIL")
      || null;

    if (!fromEmail) {
      return json(500, {
        error:
          "No sender email configured for this venue (add a venue_email_senders row, or set venues.broadcast_from_email)",
      });
    }
    const fromLabel = sender?.label || venue.name;
    // Replies default to the sending address — the whole point of a finance@
    // broadcast is that the replies land at finance@, not the club inbox.
    const replyToEmail = sender?.reply_to || fromEmail;

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

    if (sendableCount > ENQUEUE_CAP) {
      return json(400, {
        error:
          `Broadcasts support up to ${ENQUEUE_CAP} recipients per send (would have sent ${sendableCount}). Narrow the recipient filter.`,
      });
    }

    // ===== Daily quota (Resend free tier) — informational only =====
    // Sends beyond the remaining quota are enqueued anyway; the worker sends what
    // fits today and the cron drainer finishes the rest after the UTC reset.
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
    const quotaRemaining = Math.max(0, DAILY_QUOTA_THRESHOLD - todayCount);
    // The worker also archives to the club inbox when configured — one extra
    // message per broadcast, not per recipient. It goes to the standing archive
    // address plus the sending address when they differ, so a finance@ broadcast
    // is recorded in both inboxes. Counted per address: one Resend call with two
    // recipients may or may not bill as two, so assume the worse of the two.
    const archiveTo = venue.broadcast_archive_email
      ? [...new Set([venue.broadcast_archive_email.toLowerCase(), fromEmail.toLowerCase()])]
      : [];
    const archiveSends = archiveTo.length;
    const willDefer = Math.max(0, sendableCount + archiveSends - quotaRemaining);

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
        from_email: fromEmail,
        from_label: fromLabel,
        reply_to_email: replyToEmail,
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
      quota_remaining_before: quotaRemaining,
      deferred_estimate: willDefer,
      worker_status: workerResp.status,
      worker_result: workerResult,
    });
  } catch (err) {
    console.error("send-broadcast unexpected error:", err);
    return json(500, { error: "Internal server error" });
  }
});
