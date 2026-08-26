// send-whatsapp — Shared WhatsApp sender. Worker-only, gated by X-Whatsapp-Worker-Token.
// Every other Edge Function (send-whatsapp-optin-invite, send-tab-reminder-whatsapp,
// process-whatsapp-broadcast-batch, whatsapp-webhook reply path) goes through here so
// audit logging, daily-cap enforcement, and the 24h session-window rule live in one place.
//
// Inputs (POST JSON):
//   venue_id        UUID
//   member_id       UUID  (optional — set if the recipient is a known member)
//   prospect_id     UUID  (optional — set if the recipient is a non-member prospect;
//                          at most one of member_id/prospect_id should be set)
//   to_e164         string (+27...) — recipient number
//   template_sid?   string (HX...)  — required for messages outside a 24h session window
//   template_variables?  Record<string, string|number> | Array<string|number>
//   body?           string — only valid when template_sid is omitted (free-form session msg)
//   related_kind?   string ('optin_invite' | 'tab_reminder' | 'link_request' | ...)
//   related_id?     UUID
//
// The 24h session window (free-form `body` sends) is checked against
// members.whatsapp_last_inbound_at when member_id is set, or
// whatsapp_prospects.last_inbound_at when prospect_id is set. A send with
// neither (e.g. a staff alert to a number with no contact record) can only
// use template_sid.
//
// Auth: shared-secret header X-Whatsapp-Worker-Token (matches WHATSAPP_WORKER_TOKEN).
// Configured in supabase/config.toml as verify_jwt = false.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildContentVariables,
  mapTwilioError,
  toWhatsAppAddr,
} from "../_shared/twilio.ts";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SendRequest {
  venue_id: string;
  member_id?: string | null;
  prospect_id?: string | null;
  to_e164: string;
  template_sid?: string | null;
  template_variables?: Record<string, string | number> | Array<string | number> | null;
  body?: string | null;
  related_kind?: string | null;
  related_id?: string | null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function checkDailyCap(
  supabase: SupabaseClient,
  venueId: string,
): Promise<{ ok: true; cap: number; sent: number } | { ok: false; cap: number; sent: number }> {
  const { data: venue } = await supabase
    .from("venues")
    .select("whatsapp_daily_cap")
    .eq("id", venueId)
    .maybeSingle();

  const cap = (venue?.whatsapp_daily_cap as number) ?? 200;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueId)
    .eq("direction", "outbound")
    .in("status", ["sent", "delivered", "read", "queued"])
    .gte("created_at", todayStart.toISOString());

  const sent = count ?? 0;
  return { ok: sent < cap, cap, sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // ===== Worker auth =====
  const expectedToken = Deno.env.get("WHATSAPP_WORKER_TOKEN");
  if (!expectedToken) {
    console.error("WHATSAPP_WORKER_TOKEN not configured");
    return json(500, { error: "Worker not configured" });
  }
  const providedToken = req.headers.get("X-Whatsapp-Worker-Token");
  if (providedToken !== expectedToken) {
    return json(401, { error: "Unauthorized" });
  }

  // ===== Twilio config =====
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromAddr = Deno.env.get("TWILIO_WHATSAPP_FROM"); // e.g. "whatsapp:+27160040192"

  if (!accountSid || !authToken || !fromAddr) {
    return json(500, {
      error: "Twilio not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM)",
    });
  }

  // ===== Input validation =====
  let body: SendRequest;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (!body.venue_id || !body.to_e164) {
    return json(400, { error: "venue_id and to_e164 are required" });
  }
  if (!body.template_sid && !body.body) {
    return json(400, { error: "Either template_sid or body must be provided" });
  }
  if (body.template_sid && body.body) {
    return json(400, { error: "Provide template_sid OR body, not both" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ===== 24h session window check (only for free-form body) =====
  if (!body.template_sid) {
    if (!body.member_id && !body.prospect_id) {
      return json(400, {
        error: "Free-form (body) sends require a member_id or prospect_id so we can verify the 24h session window",
      });
    }
    let lastInbound = 0;
    if (body.member_id) {
      const { data: member } = await supabase
        .from("members")
        .select("whatsapp_last_inbound_at")
        .eq("id", body.member_id)
        .maybeSingle();
      lastInbound = member?.whatsapp_last_inbound_at
        ? new Date(member.whatsapp_last_inbound_at).getTime()
        : 0;
    } else {
      const { data: prospect } = await supabase
        .from("whatsapp_prospects")
        .select("last_inbound_at")
        .eq("id", body.prospect_id)
        .maybeSingle();
      lastInbound = prospect?.last_inbound_at
        ? new Date(prospect.last_inbound_at).getTime()
        : 0;
    }
    if (!lastInbound || Date.now() - lastInbound > SESSION_WINDOW_MS) {
      return json(409, {
        error: "Outside 24h customer-service window — must use template_sid",
      });
    }
  }

  // ===== Daily cap check =====
  const cap = await checkDailyCap(supabase, body.venue_id);
  if (!cap.ok) {
    return json(429, {
      error: "Daily WhatsApp cap reached",
      cap: cap.cap,
      sent_today: cap.sent,
    });
  }

  // ===== Insert audit row up front =====
  const auditPayload = {
    venue_id: body.venue_id,
    member_id: body.member_id ?? null,
    prospect_id: body.prospect_id ?? null,
    direction: "outbound" as const,
    to_number: body.to_e164,
    from_number: fromAddr.replace("whatsapp:", ""),
    template_sid: body.template_sid ?? null,
    body: body.body ?? null,
    status: "queued",
    related_kind: body.related_kind ?? null,
    related_id: body.related_id ?? null,
  };

  const { data: auditRow, error: auditError } = await supabase
    .from("whatsapp_messages")
    .insert(auditPayload)
    .select("id")
    .single();

  if (auditError || !auditRow) {
    console.error("audit insert failed:", auditError?.message);
    return json(500, { error: "Failed to record outbound message" });
  }

  // ===== Build Twilio request =====
  const params = new URLSearchParams();
  params.set("From", fromAddr);
  params.set("To", toWhatsAppAddr(body.to_e164));

  if (body.template_sid) {
    params.set("ContentSid", body.template_sid);
    const cv = buildContentVariables(body.template_variables ?? undefined);
    if (cv) params.set("ContentVariables", cv);
  } else if (body.body) {
    params.set("Body", body.body);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const statusCallback = `${supabaseUrl}/functions/v1/whatsapp-status`;
  params.set("StatusCallback", statusCallback);

  const twilioUrl = `${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`;
  const basic = btoa(`${accountSid}:${authToken}`);

  let twilioResp: Response;
  try {
    twilioResp = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("whatsapp_messages")
      .update({ status: "failed", error: `fetch failed: ${msg}`, updated_at: new Date().toISOString() })
      .eq("id", auditRow.id);
    return json(502, { error: `Twilio request failed: ${msg}`, message_id: auditRow.id });
  }

  const respBody = await twilioResp.json().catch(() => ({}));

  if (!twilioResp.ok) {
    const friendly = mapTwilioError(
      respBody?.code,
      `Twilio ${twilioResp.status}: ${respBody?.message ?? "unknown"}`,
    );
    await supabase
      .from("whatsapp_messages")
      .update({
        status: "failed",
        error: friendly,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auditRow.id);
    return json(twilioResp.status, {
      error: friendly,
      twilio_code: respBody?.code,
      message_id: auditRow.id,
    });
  }

  const twilioSid = respBody?.sid as string | undefined;
  await supabase
    .from("whatsapp_messages")
    .update({
      status: "sent",
      twilio_sid: twilioSid ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auditRow.id);

  return json(200, {
    success: true,
    message_id: auditRow.id,
    twilio_sid: twilioSid ?? null,
  });
});
