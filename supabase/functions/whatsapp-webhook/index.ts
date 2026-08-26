// whatsapp-webhook — Receives Twilio inbound message webhooks. Validates the
// X-Twilio-Signature header, records every inbound in whatsapp_messages, opens the
// 24-hour customer-service window on the member (or prospect), and routes STOP/START
// consent keywords + button payloads. Consent is opt-OUT: members and prospects are
// subscribed by default; STOP (exact-match keywords) opts them out, START/YES
// re-subscribes. Anything else falls through to the tab buttons or the AI assistant.
//
// Unmatched numbers (nobody who has ever messaged this venue before) are treated as
// prospects — people enquiring about the club from outside membership — rather than
// dropped. A whatsapp_prospects row tracks them the way `members` tracks the WhatsApp
// state of an actual member, and the AI hand-off runs a much smaller, non-member tool
// catalog for them (see whatsapp-ai-reply + _shared/aiTools.ts PROSPECT_TOOL_DEFINITIONS).
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
import { notifyNewFollowup } from "../_shared/whatsappFollowupNotify.ts";

interface MemberRow {
  id: string;
  venue_id: string;
  first_name: string | null;
  whatsapp_number: string | null;
  phone: string | null;
  partner_phone: string | null;
  whatsapp_opt_in: boolean;
  ai_paused: boolean;
}

// How the inbound number was matched. Partner matches get full conversational
// access (AI assistant, tab buttons) but must never mutate the member's own
// opt-in state or whatsapp_number.
interface MemberMatch {
  member: MemberRow;
  matchedVia: "member" | "partner";
}

interface ProspectRow {
  id: string;
  venue_id: string;
  whatsapp_number: string;
  display_name: string | null;
  opted_out: boolean;
  ai_paused: boolean;
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
): Promise<MemberMatch | null> {
  const SELECT = "id, venue_id, first_name, whatsapp_number, phone, partner_phone, whatsapp_opt_in, ai_paused";

  // 1. Match on whatsapp_number first.
  const { data: byWa } = await supabase
    .from("members")
    .select(SELECT)
    .eq("whatsapp_number", fromE164)
    .limit(1);

  if (byWa && byWa.length > 0) {
    return { member: byWa[0] as unknown as MemberRow, matchedVia: "member" };
  }

  // 2. Fall back to normalised phone match. We pull a candidate set and normalise
  //    in code because phone numbers in members.phone are stored unnormalised.
  const { data: candidates } = await supabase
    .from("members")
    .select(SELECT)
    .or("phone.not.is.null,partner_phone.not.is.null");

  const rows = (candidates as unknown as MemberRow[]) || [];
  for (const m of rows) {
    if (m.phone && normaliseE164(m.phone) === fromE164) {
      return { member: m, matchedVia: "member" };
    }
  }

  // 3. Finally, match against the partner's cellphone so partners can chat too.
  for (const m of rows) {
    if (m.partner_phone && normaliseE164(m.partner_phone) === fromE164) {
      return { member: m, matchedVia: "partner" };
    }
  }

  return null;
}

// Look up or create the whatsapp_prospects row for an inbound number that
// didn't match any member. Returns isNew=true only the very first time this
// number has ever contacted this venue — used to trigger the one-time "new
// enquiry" staff notification.
async function findOrCreateProspect(
  supabase: SupabaseClient,
  venueId: string,
  fromE164: string,
  profileName: string,
): Promise<{ prospect: ProspectRow; isNew: boolean }> {
  const { data: existing } = await supabase
    .from("whatsapp_prospects")
    .select("id, venue_id, whatsapp_number, display_name, opted_out, ai_paused")
    .eq("venue_id", venueId)
    .eq("whatsapp_number", fromE164)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, unknown> = { last_inbound_at: new Date().toISOString() };
    if (!existing.display_name && profileName) updates.display_name = profileName;
    await supabase.from("whatsapp_prospects").update(updates).eq("id", existing.id);
    return { prospect: existing as unknown as ProspectRow, isNew: false };
  }

  const { data: created, error } = await supabase
    .from("whatsapp_prospects")
    .insert({
      venue_id: venueId,
      whatsapp_number: fromE164,
      display_name: profileName || null,
    })
    .select("id, venue_id, whatsapp_number, display_name, opted_out, ai_paused")
    .single();

  if (error || !created) {
    // Extremely unlikely (unique constraint race). Best-effort re-fetch.
    const { data: refetched } = await supabase
      .from("whatsapp_prospects")
      .select("id, venue_id, whatsapp_number, display_name, opted_out, ai_paused")
      .eq("venue_id", venueId)
      .eq("whatsapp_number", fromE164)
      .maybeSingle();
    return { prospect: (refetched ?? {
      id: "", venue_id: venueId, whatsapp_number: fromE164, display_name: null, opted_out: false, ai_paused: false,
    }) as ProspectRow, isNew: false };
  }

  return { prospect: created as unknown as ProspectRow, isNew: true };
}

async function sendSessionReply(
  venueId: string,
  contact: { memberId?: string; prospectId?: string },
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
        member_id: contact.memberId ?? null,
        prospect_id: contact.prospectId ?? null,
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

  const match = await findMember(supabase, fromE164);
  const member = match?.member ?? null;
  const isPartner = match?.matchedVia === "partner";

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

  // ===== No member matched: this is a prospect (or a returning prospect) =====
  let prospect: ProspectRow | null = null;
  let isNewProspect = false;
  if (!member) {
    const result = await findOrCreateProspect(supabase, venueId, fromE164, profileName);
    prospect = result.prospect;
    isNewProspect = result.isNew;
  }

  // ===== Persist inbound row =====
  await supabase.from("whatsapp_messages").insert({
    venue_id: venueId,
    member_id: member?.id ?? null,
    prospect_id: prospect?.id ?? null,
    direction: "inbound",
    to_number: normaliseE164(toRaw),
    from_number: fromE164,
    body: body || (buttonText ? `[button] ${buttonText}` : null),
    status: "delivered",
    related_kind: buttonPayload ? "button_reply" : "inbound_query",
  });

  // ===== Open / refresh the 24h session window (members only — prospects were
  // already refreshed inside findOrCreateProspect) =====
  if (member) {
    const updates: Record<string, unknown> = {
      whatsapp_last_inbound_at: new Date().toISOString(),
    };
    // Never let a partner's number become the member's WhatsApp number.
    if (!member.whatsapp_number && !isPartner) {
      updates.whatsapp_number = fromE164;
    }
    await supabase.from("members").update(updates).eq("id", member.id);
  }

  // ===== New prospect: alert staff so a first-ever enquiry doesn't sit
  // unnoticed. Reuses the follow-up queue/notify path rather than a separate
  // mechanism, so it shows up in the same admin page as everything else. =====
  if (isNewProspect && prospect) {
    const summary = `New WhatsApp enquiry${profileName ? ` from ${profileName}` : ""} (not a member).`;
    try {
      const { data: followup, error } = await supabase
        .from("whatsapp_followups")
        .insert({
          venue_id: venueId,
          prospect_id: prospect.id,
          summary,
          original_message: (body || (buttonText ? `[button] ${buttonText}` : "(no text)")).slice(0, 2000),
          urgency: "normal",
          status: "open",
          reason: "new_prospect",
        })
        .select("id")
        .single();
      if (!error && followup) {
        const { data: venueSlugRow } = await supabase
          .from("venues").select("slug").eq("id", venueId).maybeSingle();
        await notifyNewFollowup({
          supabase,
          venueId,
          venueSlug: venueSlugRow?.slug ?? "",
          memberId: null,
          prospectId: prospect.id,
          followupId: followup.id as string,
          summary,
          urgency: "normal",
          reason: "new_prospect",
          originalMessage: body || "(no text)",
        });
      }
    } catch (err) {
      console.error("new-prospect notify failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // ===== Opt-out / re-subscribe routing =====
  // Consent is opt-OUT: every member/prospect is subscribed unless they say stop.
  // Keywords match the ENTIRE message (exact, case-insensitive) — the earlier
  // prefix match would have opted members out for chatting "stop by the bar..."
  // or "no worries". "NO" is deliberately not an opt-out keyword: it's far too
  // common in normal conversation, especially in replies to the AI assistant.
  const lower = body.toLowerCase().replace(/[.!?]+$/, "").trim();
  const isOptOut = buttonPayload === "optin_no"
    || ["stop", "stopall", "stop all", "unsub", "unsubscribe", "opt out", "optout"].includes(lower);
  // Re-subscribe keywords only act on a member/prospect who is currently opted
  // out — otherwise a plain "yes" (e.g. answering the AI assistant) must fall
  // through to the conversation router below. The old opt-in template's Yes
  // button stays authoritative either way.
  const isResubscribe = buttonPayload === "optin_yes"
    || (member && !member.whatsapp_opt_in
        && ["start", "unstop", "yes", "opt in", "optin"].includes(lower))
    || (prospect?.opted_out
        && ["start", "unstop", "yes", "opt in", "optin"].includes(lower));

  // Opt-out/re-subscribe only applies to the member's own number — a partner
  // texting STOP/START must not flip the member's subscription (we never
  // proactively message the partner's number, so there is nothing for them to
  // opt out of).
  if (member && !isPartner && isOptOut) {
    await supabase.from("members").update({
      whatsapp_opt_in: false,
      whatsapp_opt_out_at: new Date().toISOString(),
    }).eq("id", member.id);

    await sendSessionReply(
      venueId,
      { memberId: member.id },
      fromE164,
      "You've been opted out of WhatsApp messages from the club. We won't send any more. Reply START if you change your mind.",
      "optout_reply",
    );
    return twiml(200);
  }

  if (member && !isPartner && isResubscribe) {
    await supabase.from("members").update({
      whatsapp_opt_in: true,
      whatsapp_opt_in_at: new Date().toISOString(),
      whatsapp_opt_in_method: "inbound_yes",
      whatsapp_opt_out_at: null,
    }).eq("id", member.id);

    const greeting = member.first_name ? `Thanks ${member.first_name}!` : "Thanks!";
    await sendSessionReply(
      venueId,
      { memberId: member.id },
      fromE164,
      `${greeting} You're subscribed again. You'll get bar-tab reminders and club updates here. Reply STOP any time to opt out.`,
      "optin_reply",
    );
    return twiml(200);
  }

  if (prospect && isOptOut) {
    await supabase.from("whatsapp_prospects").update({
      opted_out: true,
      opted_out_at: new Date().toISOString(),
    }).eq("id", prospect.id);

    await sendSessionReply(
      venueId,
      { prospectId: prospect.id },
      fromE164,
      "You've been opted out — we won't message this number again. Reply START if you change your mind.",
      "optout_reply",
    );
    return twiml(200);
  }

  if (prospect && isResubscribe) {
    await supabase.from("whatsapp_prospects").update({
      opted_out: false,
      opted_out_at: null,
    }).eq("id", prospect.id);

    await sendSessionReply(
      venueId,
      { prospectId: prospect.id },
      fromE164,
      "Thanks! You're all set — ask away.",
      "optin_reply",
    );
    return twiml(200);
  }

  // ===== Tab-reminder button replies (members only) =====
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
        .select("slug, portal_domain")
        .eq("id", venueId)
        .maybeSingle();
      const siteUrl = (Deno.env.get("SITE_URL") || "https://booking.vaalcruising.co.za").replace(/\/+$/, "");
      const portalUrl = venue?.portal_domain
        ? `https://${venue.portal_domain}`
        : venue?.slug ? `${siteUrl}/${venue.slug}/portal` : siteUrl;
      await sendSessionReply(
        venueId,
        { memberId: member.id },
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
        { memberId: member.id },
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
        { memberId: member.id },
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
        { memberId: member.id },
        fromE164,
        "Sorry, I couldn't generate a payment link right now. Please try again in a few minutes or pay through the member portal.",
        "link_request_failed",
        tabId,
      );
      return twiml(200);
    }

    await sendSessionReply(
      venueId,
      { memberId: member.id },
      fromE164,
      `Here's your payment link:\n${checkoutUrl}\n\nThanks!`,
      "link_request",
      tabId,
    );
    return twiml(200);
  }

  // Anything else: hand off to the Claude Haiku assistant if it's enabled for
  // this venue, we know who's messaging (member or prospect), and nobody has
  // taken over the conversation from the admin UI. We fire-and-forget so
  // Twilio gets its 200 inside its retry budget — the agent can take a few
  // seconds to run.
  const aiPaused = member?.ai_paused ?? prospect?.ai_paused ?? false;
  if ((member || prospect) && !aiPaused) {
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
            member_id: member?.id ?? null,
            prospect_id: prospect?.id ?? null,
            inbound_body: body,
            inbound_message_sid: messageSid,
            reply_to_e164: fromE164,
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
