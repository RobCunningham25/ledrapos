// whatsapp-ai-reply — The Claude Haiku tool-using agent that handles inbound
// WhatsApp messages that don't match a hardcoded keyword/button payload.
//
// Two callers:
//   1. whatsapp-webhook (production path): fire-and-forget POST with the
//      X-Whatsapp-Worker-Token header. Runs the full agent + sends the reply
//      via send-whatsapp.
//   2. Admin "Test in chat" pane (dry-run path): browser POST with a Supabase
//      auth token + { dry_run: true }. Runs the agent against the same tools
//      but does NOT count against the daily cap and does NOT send via WhatsApp;
//      returns the assistant text + tool trace inline so the admin can iterate.
//
// Pass 1 wiring: tools return stubs (see _shared/aiTools.ts). The loop, logging,
// guardrails, and dispatch are real. Pass 2 will replace the stubs with real
// data + tune the system prompt.
//
// Auth strategy: WHATSAPP_WORKER_TOKEN header OR (dry_run + admin JWT). Anything
// else returns 401.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  TOOL_DEFINITIONS,
  runTool,
  type ToolContext,
} from "../_shared/aiTools.ts";
import { buildSystemPrompt } from "../_shared/aiAssistantPrompt.ts";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOOL_ITERATIONS = 5;
const MAX_OUTPUT_TOKENS = 1500;
const REPLY_TRUNCATE_AT = 1400;
const PER_MEMBER_RATE_LIMIT_MS = 30 * 1000;

interface RequestBody {
  venue_id: string;
  member_id: string;
  inbound_body: string;
  inbound_message_sid: string;
  dry_run?: boolean;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ===== Anthropic types (only what we actually use) =====

type AnthropicTextBlock = { type: "text"; text: string };
type AnthropicToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;
type AnthropicMessage = { role: "user" | "assistant"; content: unknown };
type AnthropicResponse = {
  id: string;
  content: AnthropicContentBlock[];
  stop_reason: string;
};

async function callAnthropic(params: {
  apiKey: string;
  model: string;
  system: string;
  messages: AnthropicMessage[];
  tools: typeof TOOL_DEFINITIONS;
}): Promise<AnthropicResponse> {
  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: params.system,
      messages: params.messages,
      tools: params.tools,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text}`);
  }
  return await res.json() as AnthropicResponse;
}

// ===== Logging helpers =====

async function logAiEvent(
  supabase: SupabaseClient,
  args: {
    venue_id: string;
    member_id: string;
    direction: "outbound" | "inbound";
    related_kind: "ai_reply" | "ai_tool_call" | "ai_error";
    body: string;
    /** Twilio MessageSid of the triggering inbound — stored in twilio_sid for idempotency. */
    inbound_twilio_sid?: string | null;
    status?: string;
  },
): Promise<void> {
  await supabase.from("whatsapp_messages").insert({
    venue_id: args.venue_id,
    member_id: args.member_id,
    direction: args.direction,
    body: args.body,
    related_kind: args.related_kind,
    twilio_sid: args.inbound_twilio_sid ?? null,
    status: args.status ?? "delivered",
  });
}

// ===== Pre-flight checks =====

async function preflight(
  supabase: SupabaseClient,
  body: RequestBody,
): Promise<{ ok: true } | { ok: false; reason: string; httpStatus: number }> {
  // 1. Feature flag
  const { data: venue } = await supabase
    .from("venues")
    .select("whatsapp_ai_enabled, whatsapp_ai_daily_cap, whatsapp_ai_model, name, slug")
    .eq("id", body.venue_id)
    .maybeSingle();
  if (!venue) {
    return { ok: false, reason: "venue not found", httpStatus: 404 };
  }
  if (!venue.whatsapp_ai_enabled) {
    return { ok: false, reason: "AI assistant disabled for this venue", httpStatus: 200 };
  }

  // 2. Daily cap
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: todayCount } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", body.venue_id)
    .eq("related_kind", "ai_reply")
    .gte("created_at", todayStart.toISOString());
  if ((todayCount ?? 0) >= (venue.whatsapp_ai_daily_cap ?? 200)) {
    return { ok: false, reason: "daily AI cap reached", httpStatus: 429 };
  }

  // 3. Per-member rate limit
  const since = new Date(Date.now() - PER_MEMBER_RATE_LIMIT_MS).toISOString();
  const { count: recentCount } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("member_id", body.member_id)
    .eq("related_kind", "ai_reply")
    .gte("created_at", since);
  if ((recentCount ?? 0) > 0) {
    return { ok: false, reason: "per-member rate limit", httpStatus: 429 };
  }

  // 4. Idempotency on inbound MessageSid (stored in twilio_sid on the ai_reply row)
  const { count: dupCount } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("member_id", body.member_id)
    .eq("related_kind", "ai_reply")
    .eq("twilio_sid", body.inbound_message_sid);
  if ((dupCount ?? 0) > 0) {
    return { ok: false, reason: "duplicate inbound (Twilio retry)", httpStatus: 200 };
  }

  return { ok: true };
}

// ===== Context build =====

async function buildContext(
  supabase: SupabaseClient,
  venueId: string,
  memberId: string,
): Promise<{
  venueName: string;
  venueSlug: string;
  memberFirstName: string | null;
  memberMembershipNumber: string | null;
  memberE164: string | null;
  recentMessages: string[];
  isFirstAiReplyEver: boolean;
}> {
  const [venueRes, memberRes, recentRes, priorAiReplies] = await Promise.all([
    supabase.from("venues").select("name, slug").eq("id", venueId).maybeSingle(),
    supabase
      .from("members")
      .select("first_name, membership_number, whatsapp_number, phone")
      .eq("id", memberId)
      .maybeSingle(),
    supabase
      .from("whatsapp_messages")
      .select("direction, body, related_kind, created_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .eq("member_id", memberId)
      .eq("related_kind", "ai_reply"),
  ]);

  const recent = (recentRes.data ?? [])
    .reverse()
    .map((m) => {
      const tag = m.direction === "inbound" ? "member" : "assistant";
      const text = (m.body ?? "").trim().slice(0, 200);
      return `${tag}: ${text}`;
    })
    .filter((s) => s.length > 0);

  return {
    venueName: venueRes.data?.name ?? "the club",
    venueSlug: venueRes.data?.slug ?? "",
    memberFirstName: memberRes.data?.first_name ?? null,
    memberMembershipNumber: memberRes.data?.membership_number ?? null,
    memberE164: memberRes.data?.whatsapp_number ?? memberRes.data?.phone ?? null,
    recentMessages: recent,
    isFirstAiReplyEver: (priorAiReplies.count ?? 0) === 0,
  };
}

// ===== Send WhatsApp reply via send-whatsapp =====

async function sendWhatsAppReply(args: {
  venueId: string;
  memberId: string;
  toE164: string;
  body: string;
  inboundMessageSid: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const workerToken = Deno.env.get("WHATSAPP_WORKER_TOKEN");
  if (!workerToken) {
    return { ok: false, error: "WHATSAPP_WORKER_TOKEN missing" };
  }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Whatsapp-Worker-Token": workerToken,
      },
      body: JSON.stringify({
        venue_id: args.venueId,
        member_id: args.memberId,
        to_e164: args.toE164,
        body: args.body,
        related_kind: "ai_reply",
        related_id: null,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `send-whatsapp ${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ===== Auth: worker token OR admin JWT (dry_run only) =====

async function authoriseRequest(
  req: Request,
  supabase: SupabaseClient,
  body: RequestBody,
): Promise<{ ok: true; isDryRun: boolean } | { ok: false; httpStatus: number; error: string }> {
  const workerToken = Deno.env.get("WHATSAPP_WORKER_TOKEN");
  const provided = req.headers.get("X-Whatsapp-Worker-Token");
  if (workerToken && provided && provided === workerToken) {
    // Worker path: full mode. dry_run flag is ignored here — the webhook
    // never sets it; only the admin test pane does.
    return { ok: true, isDryRun: !!body.dry_run };
  }

  // Fall back to admin JWT path — only valid when dry_run is requested.
  if (!body.dry_run) {
    return { ok: false, httpStatus: 401, error: "missing worker token" };
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, httpStatus: 401, error: "missing bearer token" };
  }
  const { data: userData, error: userErr } = await supabase.auth.getUser(match[1]);
  if (userErr || !userData?.user) {
    return { ok: false, httpStatus: 401, error: "invalid auth token" };
  }
  const { data: admin } = await supabase
    .from("admin_users")
    .select("id, venue_id")
    .eq("auth_user_id", userData.user.id)
    .eq("venue_id", body.venue_id)
    .maybeSingle();
  if (!admin) {
    return { ok: false, httpStatus: 403, error: "not an admin of this venue" };
  }
  return { ok: true, isDryRun: true };
}

// ===== Main handler =====

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (!body.venue_id || !body.member_id || !body.inbound_body || !body.inbound_message_sid) {
    return json(400, {
      error: "venue_id, member_id, inbound_body, inbound_message_sid are required",
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const auth = await authoriseRequest(req, supabase, body);
  if (!auth.ok) return json(auth.httpStatus, { error: auth.error });
  const { isDryRun } = auth;

  // Pre-flight (dry_run skips the daily cap + idempotency checks because
  // it's an admin testing the loop, not a production reply).
  if (!isDryRun) {
    const pre = await preflight(supabase, body);
    if (!pre.ok) {
      await logAiEvent(supabase, {
        venue_id: body.venue_id,
        member_id: body.member_id,
        direction: "outbound",
        related_kind: "ai_error",
        body: `preflight skipped: ${pre.reason}`,
        status: "skipped",
      });
      return json(pre.httpStatus, { skipped: true, reason: pre.reason });
    }
  }

  // Anthropic API key check — done late so preflight can reject without it.
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await logAiEvent(supabase, {
      venue_id: body.venue_id,
      member_id: body.member_id,
      direction: "outbound",
      related_kind: "ai_error",
      body: "ANTHROPIC_API_KEY not configured",
      status: "failed",
    });
    return json(500, { error: "ANTHROPIC_API_KEY not configured" });
  }

  // Resolve venue model + slug + name + the member's E.164 + recent history.
  const ctx = await buildContext(supabase, body.venue_id, body.member_id);
  const { data: venueRow } = await supabase
    .from("venues")
    .select("whatsapp_ai_model")
    .eq("id", body.venue_id)
    .maybeSingle();
  const model = venueRow?.whatsapp_ai_model ?? "claude-haiku-4-5-20251001";

  const systemPrompt = buildSystemPrompt({
    venueName: ctx.venueName,
    memberFirstName: ctx.memberFirstName,
    memberMembershipNumber: ctx.memberMembershipNumber,
    nowSaIso: new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" }),
    recentMessages: ctx.recentMessages,
    isFirstAiReplyEver: ctx.isFirstAiReplyEver,
  });

  const toolCtx: ToolContext = {
    supabase,
    venueId: body.venue_id,
    venueSlug: ctx.venueSlug,
    memberId: body.member_id,
    inboundBody: body.inbound_body,
    dryRun: isDryRun,
  };

  // ===== Tool-use loop =====

  const messages: AnthropicMessage[] = [
    { role: "user", content: body.inbound_body.slice(0, 1000) },
  ];
  const trace: Array<{ tool: string; input: unknown; output: unknown }> = [];

  let finalText = "";
  let stopReason = "";

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    let resp: AnthropicResponse;
    try {
      resp = await callAnthropic({
        apiKey,
        model,
        system: systemPrompt,
        messages,
        tools: TOOL_DEFINITIONS,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await logAiEvent(supabase, {
        venue_id: body.venue_id,
        member_id: body.member_id,
        direction: "outbound",
        related_kind: "ai_error",
        body: `Anthropic call failed: ${errMsg.slice(0, 500)}`,
        status: "failed",
      });
      return json(502, { error: "Anthropic call failed", detail: errMsg });
    }

    stopReason = resp.stop_reason;

    // Append the assistant turn to the messages array as-is so subsequent
    // tool_result blocks reference the same tool_use ids.
    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason !== "tool_use") {
      // end_turn / max_tokens / stop_sequence — extract text and exit.
      finalText = resp.content
        .filter((b): b is AnthropicTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }

    // Execute each tool_use block, build tool_result blocks for the next turn.
    const toolUseBlocks = resp.content.filter(
      (b): b is AnthropicToolUseBlock => b.type === "tool_use",
    );

    const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

    for (const block of toolUseBlocks) {
      let result;
      try {
        result = await runTool(block.name, block.input, toolCtx);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        result = {
          output: { error: `tool ${block.name} threw: ${errMsg}` },
          logSummary: `ERROR ${block.name}`,
        };
      }
      trace.push({ tool: block.name, input: block.input, output: result.output });

      // Log tool call (skipped during dry_run to keep test runs out of the audit log).
      if (!isDryRun) {
        await logAiEvent(supabase, {
          venue_id: body.venue_id,
          member_id: body.member_id,
          direction: "outbound",
          related_kind: "ai_tool_call",
          body: result.logSummary,
          inbound_twilio_sid: body.inbound_message_sid,
          status: "delivered",
        });
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result.output),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  if (!finalText) {
    // The model exhausted its iterations without producing any text. Treat
    // this as an automatic escalation so the member doesn't get a dead reply
    // and admins notice it in the follow-ups queue.
    if (!isDryRun) {
      try {
        await supabase.from("whatsapp_followups").insert({
          venue_id: body.venue_id,
          member_id: body.member_id,
          summary: "Assistant could not generate a reply — automatic escalation.",
          original_message: body.inbound_body.slice(0, 2000),
          urgency: "normal",
          status: "open",
        });
      } catch (err) {
        console.error(
          "auto-escalation insert failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    finalText =
      "Sorry — I couldn't put a reply together just now. I've passed your message on so someone from the club can follow up.";
    stopReason = stopReason || "no_text";
  }
  if (finalText.length > REPLY_TRUNCATE_AT) {
    finalText = finalText.slice(0, REPLY_TRUNCATE_AT - 3) + "...";
  }

  // ===== Send + log final reply =====

  if (isDryRun) {
    return json(200, {
      dry_run: true,
      reply: finalText,
      stop_reason: stopReason,
      trace,
    });
  }

  if (!ctx.memberE164) {
    await logAiEvent(supabase, {
      venue_id: body.venue_id,
      member_id: body.member_id,
      direction: "outbound",
      related_kind: "ai_error",
      body: "member has no resolvable E.164 — cannot send reply",
      status: "failed",
    });
    return json(500, { error: "no member phone on file" });
  }

  const sendRes = await sendWhatsAppReply({
    venueId: body.venue_id,
    memberId: body.member_id,
    toE164: ctx.memberE164,
    body: finalText,
    inboundMessageSid: body.inbound_message_sid,
  });

  await logAiEvent(supabase, {
    venue_id: body.venue_id,
    member_id: body.member_id,
    direction: "outbound",
    related_kind: "ai_reply",
    body: finalText,
    inbound_twilio_sid: body.inbound_message_sid,
    status: sendRes.ok ? "delivered" : "failed",
  });

  if (!sendRes.ok) {
    return json(502, { error: "send-whatsapp failed", detail: sendRes.error });
  }

  return json(200, { ok: true, reply: finalText, tool_calls: trace.length });
});
