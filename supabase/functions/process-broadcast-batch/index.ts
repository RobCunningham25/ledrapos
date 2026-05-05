// process-broadcast-batch — Worker that drives the actual Resend calls for a queued
// broadcast. Called by send-broadcast (synchronous, immediate sends) and later by
// pg_cron / a scheduled-send worker. Throttles to ~8 emails/sec to stay under the
// Resend free-tier 10/sec cap. Pre-loads + base64-encodes attachments once per run.
//
// Inputs (POST JSON):
//   broadcast_id  UUID
//   batch_size    int — optional, default 25
//
// Auth: shared-secret header X-Broadcast-Worker-Token (must match BROADCAST_WORKER_TOKEN
// env var). NOT a JWT. Configured in supabase/config.toml as verify_jwt = false.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildUnsubscribeUrl,
  wrapWithFooter,
} from "../_shared/broadcastTemplate.ts";

const THROTTLE_MS = 120; // ~8 req/sec, under Resend free tier 10/sec cap.
const DEFAULT_BATCH_SIZE = 25;
const RESEND_API_URL = "https://api.resend.com/emails";

interface WorkerRequest {
  broadcast_id: string;
  batch_size?: number;
}

interface ClaimedRow {
  recipient_id: string;
  member_id: string;
  email: string;
  unsubscribe_token: string;
}

interface AttachmentBlob {
  filename: string;
  content: string;
  content_type?: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractFilename(path: string): string {
  const base = path.split("/").pop() || "attachment";
  const idx = base.indexOf("_");
  return idx >= 0 ? base.slice(idx + 1) : base;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // ===== Worker auth =====
  const expectedToken = Deno.env.get("BROADCAST_WORKER_TOKEN");
  if (!expectedToken) {
    console.error("BROADCAST_WORKER_TOKEN not configured");
    return json(500, { error: "Worker not configured" });
  }
  const providedToken = req.headers.get("X-Broadcast-Worker-Token");
  if (providedToken !== expectedToken) {
    return json(401, { error: "Unauthorized" });
  }

  let body: WorkerRequest;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (!body.broadcast_id) {
    return json(400, { error: "broadcast_id is required" });
  }
  const batchSize = Math.min(Math.max(body.batch_size ?? DEFAULT_BATCH_SIZE, 1), 50);

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    return json(500, { error: "RESEND_API_KEY not configured" });
  }

  const siteUrl = (Deno.env.get("SITE_URL") || "https://pos.ledra.co.za").replace(/\/+$/, "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ===== Load broadcast =====
  const { data: broadcast, error: broadcastError } = await supabase
    .from("email_broadcasts")
    .select("id, venue_id, subject, body_html, attachment_paths, status")
    .eq("id", body.broadcast_id)
    .maybeSingle();

  if (broadcastError || !broadcast) {
    return json(404, { error: "Broadcast not found" });
  }
  if (broadcast.status !== "queued" && broadcast.status !== "sending") {
    return json(409, {
      error: `Broadcast is in status '${broadcast.status}' and cannot be processed`,
    });
  }

  // ===== Load venue =====
  const { data: venue, error: venueError } = await supabase
    .from("venues")
    .select("id, name, address, contact_email, broadcast_from_email")
    .eq("id", broadcast.venue_id)
    .maybeSingle();

  if (venueError || !venue) {
    return json(500, { error: "Venue lookup failed" });
  }

  const fromEmail = venue.broadcast_from_email
    || Deno.env.get("INVITE_FROM_EMAIL")
    || null;

  if (!fromEmail) {
    return json(500, { error: "No sender email configured for venue" });
  }
  const fromHeader = `${venue.name} <${fromEmail}>`;

  // ===== Mark broadcast as sending if not already =====
  if (broadcast.status === "queued") {
    await supabase
      .from("email_broadcasts")
      .update({ status: "sending", started_at: new Date().toISOString() })
      .eq("id", broadcast.id);
  }

  // ===== Pre-load attachments (download + base64 once per run) =====
  const attachments: AttachmentBlob[] = [];
  const attachmentPaths: string[] = Array.isArray(broadcast.attachment_paths)
    ? broadcast.attachment_paths as string[]
    : [];

  for (const path of attachmentPaths) {
    const { data: blob, error: dlError } = await supabase
      .storage
      .from("broadcast-attachments")
      .download(path);

    if (dlError || !blob) {
      console.error(`Attachment download failed for ${path}:`, dlError?.message);
      // Mark broadcast as failed and abort — incomplete attachments would mislead recipients.
      await supabase
        .from("email_broadcasts")
        .update({
          status: "failed",
          sent_at: new Date().toISOString(),
        })
        .eq("id", broadcast.id);
      return json(500, {
        error: `Failed to load attachment: ${path}`,
        broadcast_id: broadcast.id,
      });
    }

    const buf = new Uint8Array(await blob.arrayBuffer());
    attachments.push({
      filename: extractFilename(path),
      content: encodeBase64(buf),
      content_type: blob.type || undefined,
    });
  }

  // ===== Drain pending recipients =====
  let totalSent = 0;
  let totalFailed = 0;
  let lastCallAt = 0;

  while (true) {
    const { data: claimedRaw, error: claimError } = await supabase.rpc(
      "claim_broadcast_batch",
      { p_broadcast_id: broadcast.id, p_limit: batchSize },
    );

    if (claimError) {
      console.error("claim_broadcast_batch failed:", claimError.message);
      break;
    }
    const claimed = (claimedRaw as ClaimedRow[]) || [];
    if (claimed.length === 0) break;

    for (const row of claimed) {
      // Throttle to stay under Resend rate limit.
      const now = Date.now();
      const since = now - lastCallAt;
      if (lastCallAt > 0 && since < THROTTLE_MS) {
        await sleep(THROTTLE_MS - since);
      }

      const unsubscribeUrl = buildUnsubscribeUrl(siteUrl, row.unsubscribe_token);
      const { html, text } = wrapWithFooter({
        subject: broadcast.subject,
        bodyHtml: broadcast.body_html,
        venueName: venue.name,
        venueAddress: venue.address,
        unsubscribeUrl,
      });

      const payload: Record<string, unknown> = {
        from: fromHeader,
        to: [row.email],
        subject: broadcast.subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
      if (venue.contact_email) {
        payload.reply_to = venue.contact_email;
      }
      if (attachments.length > 0) {
        payload.attachments = attachments;
      }

      let resendId: string | null = null;
      let errorMsg: string | null = null;

      try {
        const resendResp = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        lastCallAt = Date.now();

        const resendBody = await resendResp.json().catch(() => ({}));

        if (resendResp.ok) {
          resendId = resendBody?.id ?? null;
        } else {
          errorMsg = `Resend ${resendResp.status}: ${
            resendBody?.message || resendBody?.error || "unknown"
          }`;
        }
      } catch (err) {
        errorMsg = `fetch failed: ${err instanceof Error ? err.message : String(err)}`;
        lastCallAt = Date.now();
      }

      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (resendId) {
        update.status = "sent";
        update.sent_at = new Date().toISOString();
        update.resend_message_id = resendId;
        totalSent++;
      } else {
        update.status = "failed";
        update.error = errorMsg ?? "unknown error";
        totalFailed++;
      }

      const { error: updateError } = await supabase
        .from("broadcast_recipients")
        .update(update)
        .eq("id", row.recipient_id);

      if (updateError) {
        console.error(`Failed to update recipient ${row.recipient_id}:`, updateError.message);
      }
    }

    // If we got fewer than batchSize, the pending pool is drained.
    if (claimed.length < batchSize) break;
  }

  // ===== Finalise broadcast status =====
  // Re-tally from DB to capture any rows already sent before this run started.
  const { data: tally } = await supabase
    .from("broadcast_recipients")
    .select("status")
    .eq("broadcast_id", broadcast.id);

  let sentCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  let skippedCount = 0;
  for (const r of (tally || []) as Array<{ status: string }>) {
    if (r.status === "sent") sentCount++;
    else if (r.status === "failed" || r.status === "bounced" || r.status === "complained") failedCount++;
    else if (r.status === "pending" || r.status === "sending") pendingCount++;
    else skippedCount++;
  }

  let finalStatus = "sent";
  if (pendingCount > 0) finalStatus = "sending"; // more to do later
  else if (failedCount > 0 && sentCount === 0) finalStatus = "failed";
  else if (failedCount > 0) finalStatus = "partial";

  await supabase
    .from("email_broadcasts")
    .update({
      status: finalStatus,
      sent_at: pendingCount === 0 ? new Date().toISOString() : null,
      sent_count: sentCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
    })
    .eq("id", broadcast.id);

  return json(200, {
    broadcast_id: broadcast.id,
    final_status: finalStatus,
    this_run: { sent: totalSent, failed: totalFailed },
    totals: { sent: sentCount, failed: failedCount, pending: pendingCount, skipped: skippedCount },
  });
});
