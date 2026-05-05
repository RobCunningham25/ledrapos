// whatsapp-status — Twilio message status callback. Updates whatsapp_messages.status
// by twilio_sid lookup. Twilio fires this for every status transition: queued →
// sent → delivered → read (or failed/undelivered).
//
// Validates X-Twilio-Signature like whatsapp-webhook so a third party can't poison
// our delivery state.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { mapTwilioError, parseFormBody, validateTwilioSignature } from "../_shared/twilio.ts";

function blank(status: number): Response {
  return new Response("", {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/xml" },
  });
}

function mapStatus(s: string): string {
  switch (s) {
    case "accepted":
    case "queued":
    case "sending":
      return "queued";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
    case "undelivered":
      return "failed";
    default:
      return s || "unknown";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return blank(405);
  }

  const authToken = Deno.env.get("TWILIO_WEBHOOK_SECRET") || Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken) {
    console.error("Twilio auth token missing");
    return blank(500);
  }

  const signature = req.headers.get("X-Twilio-Signature");
  const formParams = await parseFormBody(req);

  const publicUrl = Deno.env.get("TWILIO_STATUS_URL") || req.url;
  const ok = await validateTwilioSignature(publicUrl, authToken, signature, formParams);
  if (!ok) {
    return blank(403);
  }

  const sid = formParams["MessageSid"] || formParams["SmsSid"];
  const rawStatus = formParams["MessageStatus"] || formParams["SmsStatus"] || "";
  const errorCode = formParams["ErrorCode"];

  if (!sid) {
    return blank(200); // nothing to do
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const update: Record<string, unknown> = {
    status: mapStatus(rawStatus),
    updated_at: new Date().toISOString(),
  };
  if (errorCode) {
    update.error = mapTwilioError(errorCode, `Twilio error code ${errorCode}`);
  }

  const { error } = await supabase
    .from("whatsapp_messages")
    .update(update)
    .eq("twilio_sid", sid);

  if (error) {
    console.error("status update failed:", error.message);
  }

  return blank(200);
});
