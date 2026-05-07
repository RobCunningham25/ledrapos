// whatsapp-webhook — Receives Twilio inbound message webhooks. Validates the
// X-Twilio-Signature header, records every inbound in whatsapp_messages, opens the
// 24-hour customer-service window on the member, and routes opt-in / opt-out
// keywords + button payloads. Phase 4 will extend this with a keyword intent router
// for tab-balance and event queries.
//
// Twilio sends form-encoded POST. Key fields: From, To, Body, ButtonText,
// ButtonPayload, ProfileName, MessageSid, NumMedia, etc.
//
// Auth: Twilio signs the request using HMAC-SHA1 over the full URL + sorted form
// params (see _shared/twilio.ts). This function uses TWILIO_WEBHOOK_SECRET (which
// is normally just the same value as TWILIO_AUTH_TOKEN; kept distinct so it can be
// rotated independently).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  normaliseE164,
  parseFormBody,
  validateTwilioSignature,
} from "../_shared/twilio.ts";

interface MemberRow {
  id: string;
  venue_id: string;
  first_name: string | null;
  whatsapp_number: string | null;
  phone: string | null;
  whatsapp_opt_in: boolean;
}

function twiml(status: number, body = ""): Response {
  // Twilio is happy with an empty 200 OK; if we want to reply via TwiML we'd return
  // <Response><Message>...</Message></Response>. We instead use the API to send
  // (so the message goes through whatsapp_messages audit), so always return blank.
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/xml" },
  });
}

async function findMember(
  supabase: SupabaseClient,
  fromE164: string,
): Promise<MemberRow | null> {
  // 1. Match on whatsapp_number first.
  const { data: byWa } = await supabase
    .from("members")
    .select("id, venue_id, first_name, whatsapp_number, phone, whatsapp_opt_in")
    .eq("whatsapp_number", fromE164)
    .limit(1);

  if (byWa && byWa.length > 0) return byWa[0] as MemberRow;

  // 2. Fall back to normalised phone match. We pull a candidate set and normalise
  //    in code because phone numbers in members.phone are stored unnormalised.
  const { data: candidates } = await supabase
    .from("members")
    .select("id, venue_id, first_name, whatsapp_number, phone, whatsapp_opt_in")
    .not("phone", "is", null);

  for (const m of (candidates as MemberRow[]) || []) {
    const norm = normaliseE164(m.phone);
    if (norm === fromE164) return m;
  }

  return null;
}

async function sendSessionReply(
  venueId: string,
  memberId: string,
  toE164: string,
  body: string,
  relatedKind: string,
  relatedId?: string | null,
): Promise<void> {
  // Fire and forget — failures are recorded in whatsapp_messages by send-whatsapp.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const workerToken = Deno.env.get("WHATSAPP_WORKER_TOKEN");
  if (!workerToken) {
    console.error("WHATSAPP_WORKER_TOKEN missing — cannot send reply");
    return;
  }
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Whatsapp-Worker-Token": workerToken,
      },
      body: JSON.stringify({
        venue_id: venueId,
        member_id: memberId,
        to_e164: toE164,
        body,
        related_kind: relatedKind,
        related_id: relatedId ?? null,
      }),
    });
  } catch (err) {
    console.error("session reply failed:", err instanceof Error ? err.message : String(err));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return twiml(405);
  }

  // ===== Twilio signature validation =====
  const authToken = Deno.env.get("TWILIO_WEBHOOK_SECRET") || Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken) {
    console.error("Neither TWILIO_WEBHOOK_SECRET nor TWILIO_AUTH_TOKEN configured");
    return twiml(500);
  }

  const signature = req.headers.get("X-Twilio-Signature");
  const formParams = await parseFormBody(req);

  // Twilio computes its signature over the URL it actually called. Supabase's
  // edge runtime hands us req.url with the wrong protocol ("http://") and
  // without the "/functions/v1/" prefix, which never matches Twilio's view.
  // Reconstruct the public URL from SUPABASE_URL. TWILIO_WEBHOOK_URL is an
  // override for non-default deployments (e.g. local tunnel during testing).
  const supabaseBase = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const publicUrl = Deno.env.get("TWILIO_WEBHOOK_URL")
    || `${supabaseBase}/functions/v1/whatsapp-webhook`;

  const ok = await validateTwilioSignature(publicUrl, authToken, signature, formParams);
  if (!ok) {
    console.warn("Twilio signature mismatch", {
      url: publicUrl,
      hasSignature: !!signature,
    });
    return twiml(403);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const fromRaw = formParams["From"] || "";
  const toRaw = formParams["To"] || "";
  const body = (formParams["Body"] || "").trim();
  const buttonPayload = (formParams["ButtonPayload"] || formParams["Payload"] || "").trim();
  const buttonText = (formParams["ButtonText"] || "").trim();
  const profileName = (formParams["ProfileName"] || "").trim();

  const fromE164 = normaliseE164(fromRaw);
  if (!fromE164) {
    console.warn("inbound with no usable From:", fromRaw);
    return twiml(200);
  }

  const member = await findMember(supabase, fromE164);

  // Look up venue: prefer the member's, otherwise match the To-address against
  // venues.whatsapp_business_number.
  let venueId: string | null = member?.venue_id ?? null;
  if (!venueId) {
    const toE164 = normaliseE164(toRaw);
    if (toE164) {
      const { data: venue } = await supabase
        .from("venues")
        .select("id")
        .eq("whatsapp_business_number", toE164)
        .maybeSingle();
      venueId = venue?.id ?? null;
    }
  }

  if (!venueId) {
    // Can't attribute to a venue — record as orphan inbound? For now, drop with 200
    // so Twilio doesn't retry. Operationally we shouldn't ever hit this if venue
    // setup is correct.
    console.warn("inbound could not be attributed to a venue", { fromE164, toRaw });
    return twiml(200);
  }

  // ===== Persist inbound row =====
  await supabase.from("whatsapp_messages").insert({
    venue_id: venueId,
    member_id: member?.id ?? null,
    direction: "inbound",
    to_number: normaliseE164(toRaw),
    from_number: fromE164,
    body: body || (buttonText ? `[button] ${buttonText}` : null),
    status: "delivered",
    related_kind: buttonPayload ? "button_reply" : "inbound_query",
  });

  // ===== Open / refresh the 24h session window =====
  if (member) {
    const updates: Record<string, unknown> = {
      whatsapp_last_inbound_at: new Date().toISOString(),
    };
    if (!member.whatsapp_number) {
      updates.whatsapp_number = fromE164;
    }
    await supabase.from("members").update(updates).eq("id", member.id);
  }

  // ===== Opt-in / opt-out routing =====
  // Quick-reply payloads are authoritative; fall back to text matching.
  const lower = body.toLowerCase();
  const isOptInYes = buttonPayload === "optin_yes"
    || /^(yes|y|opt\s*in|optin)\b/.test(lower);
  const isOptOut = buttonPayload === "optin_no"
    || /^(no|stop|unsub|unsubscribe)\b/.test(lower);

  if (member && isOptInYes) {
    await supabase.from("members").update({
      whatsapp_opt_in: true,
      whatsapp_opt_in_at: new Date().toISOString(),
      whatsapp_opt_in_method: "inbound_yes",
      whatsapp_opt_out_at: null,
    }).eq("id", member.id);

    const greeting = member.first_name ? `Thanks ${member.first_name}!` : "Thanks!";
    await sendSessionReply(
      venueId,
      member.id,
      fromE164,
      `${greeting} You're opted in. You'll get bar-tab reminders and club updates here. Reply STOP any time to opt out.`,
      "optin_reply",
    );
    return twiml(200);
  }

  if (member && isOptOut) {
    await supabase.from("members").update({
      whatsapp_opt_in: false,
      whatsapp_opt_out_at: new Date().toISOString(),
    }).eq("id", member.id);

    await sendSessionReply(
      venueId,
      member.id,
      fromE164,
      "You've been opted out of WhatsApp messages. We won't send any more. Reply YES if you change your mind.",
      "optout_reply",
    );
    return twiml(200);
  }

  // ===== Tab-reminder button replies =====
  // The tab-reminder template carries two quick-reply buttons:
  //   tab_send_link  → mint a Yoco checkout URL and send it
  //   tab_use_portal → reply with the portal URL
  if (member && (buttonPayload === "tab_send_link" || buttonPayload === "tab_use_portal")) {
    const { data: lastReminder } = await supabase
      .from("whatsapp_messages")
      .select("related_id")
      .eq("member_id", member.id)
      .eq("related_kind", "tab_reminder")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const tabId = lastReminder?.related_id as string | null | undefined;

    if (buttonPayload === "tab_use_portal") {
      const { data: venue } = await supabase
        .from("venues")
        .select("slug")
        .eq("id", venueId)
        .maybeSingle();
      const siteUrl = (Deno.env.get("SITE_URL") || "https://pos.ledra.co.za").replace(/\/+$/, "");
      const portalUrl = venue?.slug ? `${siteUrl}/${venue.slug}/portal` : siteUrl;
      await sendSessionReply(
        venueId,
        member.id,
        fromE164,
        `Great — see you in the portal: ${portalUrl}`,
        "portal_reply",
        tabId ?? null,
      );
      return twiml(200);
    }

    // tab_send_link
    if (!tabId) {
      await sendSessionReply(
        venueId,
        member.id,
        fromE164,
        "Sorry, I couldn't find a recent tab reminder to bill against. Please ask the bar to send a fresh reminder.",
        "link_request_failed",
      );
      return twiml(200);
    }

    // Recompute the outstanding balance live — the tab may have been part-paid
    // since the reminder was sent.
    const [{ data: items }, { data: payments }] = await Promise.all([
      supabase.from("tab_items").select("line_total_cents").eq("tab_id", tabId),
      supabase.from("payments").select("amount_cents").eq("tab_id", tabId),
    ]);
    const itemsTotal = ((items || []) as Array<{ line_total_cents: number }>)
      .reduce((s, r) => s + (r.line_total_cents ?? 0), 0);
    const paymentsTotal = ((payments || []) as Array<{ amount_cents: number }>)
      .reduce((s, r) => s + (r.amount_cents ?? 0), 0);
    const outstanding = Math.max(0, itemsTotal - paymentsTotal);

    if (outstanding <= 0) {
      await sendSessionReply(
        venueId,
        member.id,
        fromE164,
        "Looks like this tab has already been settled — no payment needed. Thanks!",
        "link_request_settled",
        tabId,
      );
      return twiml(200);
    }

    // Mint a Yoco checkout via create-checkout. We call it with the
    // service-role anon key so it accepts the call (create-checkout is
    // verify_jwt = false but expects either a JWT or the anon key for browser
    // calls). The function attributes the checkout to the tab via tab_id +
    // metadata so the existing yoco-webhook flow closes the tab on payment.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
      || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const venueSlugRow = await supabase
      .from("venues").select("slug").eq("id", venueId).maybeSingle();

    let checkoutUrl: string | null = null;
    try {
      const checkoutResp = await fetch(`${supabaseUrl}/functions/v1/create-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          member_id: member.id,
          venue_id: venueId,
          venue_slug: venueSlugRow.data?.slug,
          purpose: "tab_payment",
          amount_cents: outstanding,
          tab_id: tabId,
        }),
      });
      const checkoutBody = await checkoutResp.json().catch(() => ({}));
      if (checkoutResp.ok && checkoutBody?.success && checkoutBody?.redirect_url) {
        checkoutUrl = checkoutBody.redirect_url as string;
      } else {
        console.error("create-checkout failed:", checkoutResp.status, checkoutBody);
      }
    } catch (err) {
      console.error("create-checkout fetch failed:", err instanceof Error ? err.message : String(err));
    }

    if (!checkoutUrl) {
      await sendSessionReply(
        venueId,
        member.id,
        fromE164,
        "Sorry, I couldn't generate a payment link right now. Please try again in a few minutes or pay through the member portal.",
        "link_request_failed",
        tabId,
      );
      return twiml(200);
    }

    await sendSessionReply(
      venueId,
      member.id,
      fromE164,
      `Here's your payment link:\n${checkoutUrl}\n\nThanks!`,
      "link_request",
      tabId,
    );
    return twiml(200);
  }

  // Anything else: hand off to the Claude Haiku assistant if it's enabled for
  // this venue and we know who the member is. We fire-and-forget so Twilio gets
  // its 200 inside its retry budget — the agent can take a few seconds to run.
  if (member) {
    const { data: venueAi } = await supabase
      .from("venues")
      .select("whatsapp_ai_enabled")
      .eq("id", venueId)
      .maybeSingle();
    if (venueAi?.whatsapp_ai_enabled) {
      const messageSid = formParams["MessageSid"] || `inbound-${Date.now()}`;
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const workerToken = Deno.env.get("WHATSAPP_WORKER_TOKEN");
      if (workerToken) {
        const aiPromise = fetch(`${supabaseUrl}/functions/v1/whatsapp-ai-reply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Whatsapp-Worker-Token": workerToken,
          },
          body: JSON.stringify({
            venue_id: venueId,
            member_id: member.id,
            inbound_body: body,
            inbound_message_sid: messageSid,
          }),
        }).catch((err) => {
          console.error(
            "whatsapp-ai-reply invocation failed:",
            err instanceof Error ? err.message : String(err),
          );
        });
        // @ts-ignore — EdgeRuntime is provided by the Supabase Edge runtime.
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(aiPromise);
        }
      } else {
        console.error("WHATSAPP_WORKER_TOKEN missing — cannot invoke AI reply");
      }
    }
  }

  return twiml(200);
});
