// aiTools.ts — Tool catalog for the WhatsApp AI assistant (whatsapp-ai-reply).
//
// Real handlers (Pass 2). Each runs server-side with the service-role Supabase
// client. Identity (venue_id, member_id) comes from ToolContext — the model
// only supplies query/filter parameters, never identity.
//
// Output-shape contract: tool results are JSON the model reads. Keep keys
// readable (the model uses them verbatim sometimes), use ZAR rand units (not
// cents) for any monetary value the model might quote, and always include a
// `status` field when the tool can fail or return "nothing useful" so the model
// can branch cleanly on it.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type EventSeries,
  expandAllOccurrences,
} from "./eventOccurrences.ts";

// ===== Anthropic tool definitions (passed verbatim to messages.create) =====

export const TOOL_DEFINITIONS = [
  {
    name: "search_knowledge",
    description:
      "Search the club's knowledge base for the answer to almost any general question about the club — facilities and how to use them (slipway, moorings, gate/boom access, wifi, ablutions, braai/hall), hours, fees and prices, booking and payment procedures, sailing and racing info, club policies, who to contact about a particular issue, club history, and general FAQs. This is your FIRST stop for any factual club question. Pass a short natural-language query describing what the member wants to know (you may rephrase their message into good search terms, e.g. member says 'when can I put my boat in' → query 'slipway launch hours procedure'). Returns the most relevant knowledge entries. If it returns nothing useful, only THEN fall back to read_constitution / read_club_rules for governance matters, or escalate_to_admin.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural-language search query describing what the member wants to know. Rephrase into clear search terms; include synonyms if the wording is unusual.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_constitution",
    description:
      "Read the full text of the club's constitution. Call this when the member asks about constitutional matters: voting rights, AGM procedures, membership categories, board composition, current OR past office-bearers (commodores, vice-commodores, treasurers, secretaries), honour rolls, life members, or anything that would be defined or historically recorded in the club's founding document. If the member asks whether a specific named person ever held a club office, check this and read_club_rules before saying you don't know.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "read_club_rules",
    description:
      "Read the full text of the club's general rules, bylaws and any club history captured there. Call this for questions about day-to-day conduct (dress code, guest policy, slipway use, pet policy, alcohol service, parking, quiet hours), and also for any historical record kept in this document — past commodores, honour rolls, trophy winners, life members. If the member asks whether a specific named person ever held a club office, check this and read_constitution before saying you don't know.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "lookup_member",
    description:
      "Look up another club member by name and return their basic directory info (full name, membership number, membership type, partner name, phone, email). Use this when the member asks for another member's contact details or who someone is, e.g. 'what is Delaine's phone number', 'is Mike a member', 'who is the Smiths' partner'. Search is case-insensitive and matches on first OR last name. NEVER use this to look up bar tabs, credit balances, or payment data for other members — that data is private and only get_my_tab / get_my_credit_balance (for the calling member) can return it.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "First name, last name, or partial name to search for.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_my_tab",
    description:
      "Look up the calling member's open bar tab(s) and outstanding balance. Use this when the member asks 'what's my tab', 'how much do I owe at the bar', or anything about current bar charges.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_my_credit_balance",
    description:
      "Look up the calling member's current bar credit balance (ZAR). Use this when the member asks 'how much credit do I have', 'what's my credit', or anything about their pre-paid bar credit.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_my_club_balance",
    description:
      "Look up the calling member's CLUB ACCOUNT statement balance — the annual subscriptions and levies they owe the club, per the latest statement imported from the club's accounting system. This is a DIFFERENT thing from the bar tab (get_my_tab) and from pre-paid bar credit (get_my_credit_balance): it is the member's formal club-fees account. Use this when the member asks 'what do I owe the club', 'what are my subs', 'my club account balance', 'do I owe any levies'. It returns a statement snapshot as at a date — it is NOT live — so always tell the member the as-of date and that any payment they've made since then may not be reflected yet. There is no payment link for club fees; never offer pay_my_tab_link for a club-account balance. Like the bar tab, this is private to the calling member and there is no way to look it up for anyone else.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_my_bookings",
    description:
      "List the calling member's upcoming caravan / accommodation bookings. Optionally filter by status.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Optional booking status filter. Common values: 'PENDING' (awaiting payment), 'PAID' (confirmed). Omit to return all upcoming.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_my_details",
    description:
      "Look up the calling member's basic profile: name, membership number, contact details. Use only when the member is verifying or asking what's on file for them.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_upcoming_events",
    description:
      "List the next club events on the calendar (regattas, prize-givings, social nights). Returns expanded occurrences for recurring events.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "How many upcoming events to return. Defaults to 5.",
          minimum: 1,
          maximum: 20,
        },
      },
      required: [],
    },
  },
  {
    name: "check_caravan_availability",
    description:
      "Check which CARAVAN sites are free for a given date range. Use this when the member asks about caravan availability specifically (caravan stock is limited). DO NOT call this for camping-only questions — camping is always available at VCA. Returns caravan stock and a redundant camping flag for combined queries.",
    input_schema: {
      type: "object",
      properties: {
        check_in: {
          type: "string",
          description: "Check-in date in ISO format (YYYY-MM-DD).",
        },
        check_out: {
          type: "string",
          description: "Check-out date in ISO format (YYYY-MM-DD). Must be after check_in.",
        },
      },
      required: ["check_in", "check_out"],
    },
  },
  {
    name: "get_vaal_dam_weather",
    description:
      "Get the current weather conditions at the Vaal Dam (where the club is located). Useful for sailing-related questions like 'how's the wind today' or 'is it nice out there'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "pay_my_tab_link",
    description:
      "Generate a Yoco payment link the member can click to settle their outstanding bar tab. Only call this AFTER verifying with get_my_tab that there is an outstanding balance.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "topup_credit_link",
    description:
      "Generate a Yoco payment link for the member to top up their bar credit by a given amount in ZAR. Amount must be between R50 and R10000.",
    input_schema: {
      type: "object",
      properties: {
        amount_zar: {
          type: "number",
          description: "The top-up amount in South African Rand. Minimum R50, maximum R10000.",
          minimum: 50,
          maximum: 10000,
        },
      },
      required: ["amount_zar"],
    },
  },
  {
    name: "book_caravan_link",
    description:
      "Generate a portal deep-link the member can use to finalise a caravan OR camping booking with dates pre-filled. Use for both caravan and camping bookings. The member picks the specific site (or camping) and completes payment on the portal — this tool does NOT charge anything.",
    input_schema: {
      type: "object",
      properties: {
        check_in: {
          type: "string",
          description: "Desired check-in date (YYYY-MM-DD).",
        },
        check_out: {
          type: "string",
          description: "Desired check-out date (YYYY-MM-DD).",
        },
        site_id: {
          type: "string",
          description: "Optional specific site UUID. Omit to let the member pick on the portal.",
        },
      },
      required: ["check_in", "check_out"],
    },
  },
  {
    name: "escalate_to_admin",
    description:
      "Hand this conversation to a human at the club. Call this when: (a) the member explicitly asks to speak to staff, (b) the member raises a complaint, refund request, or sensitive matter, (c) the question is outside what the available tools can answer. Someone from the club will follow up directly. After calling this, your final reply to the member should confirm that you've passed it on — do not name 'the office' or invent a specific role; just say someone from the club will be in touch shortly.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "A one-sentence summary of what the member needs help with. Will be shown to whoever picks this up.",
        },
        urgency: {
          type: "string",
          enum: ["normal", "urgent"],
          description:
            "Use 'urgent' for complaints, safety concerns, or anything time-sensitive. Otherwise 'normal'.",
        },
      },
      required: ["summary", "urgency"],
    },
  },
] as const;

export type ToolName = typeof TOOL_DEFINITIONS[number]["name"];

// ===== Dispatcher =====

export interface ToolContext {
  supabase: SupabaseClient;
  venueId: string;
  venueSlug: string;
  memberId: string;
  /** Verbatim text the member sent — needed for escalate_to_admin to record original_message. */
  inboundBody: string;
  dryRun: boolean;
}

export interface ToolResult {
  output: unknown;
  logSummary: string;
}

const PORTAL_BASE_URL = (Deno.env.get("PORTAL_BASE_URL") ?? "https://pos.ledra.co.za").replace(/\/+$/, "");
const SITE_URL = (Deno.env.get("SITE_URL") ?? PORTAL_BASE_URL).replace(/\/+$/, "");

const centsToZar = (cents: number) => Math.round(cents) / 100;

// ===== Knowledge base (searchable) =====

async function tool_search_knowledge(
  ctx: ToolContext,
  input: { query: string },
): Promise<ToolResult> {
  const query = (input.query ?? "").trim();
  if (query.length < 2) {
    return {
      output: {
        status: "invalid_query",
        note: "Need at least 2 characters to search.",
      },
      logSummary: "search_knowledge: query too short",
    };
  }

  const { data, error } = await ctx.supabase.rpc("search_venue_knowledge", {
    p_venue_id: ctx.venueId,
    p_query: query,
    p_limit: 4,
  });

  if (error) {
    console.error("search_knowledge rpc failed:", error);
    return {
      output: { status: "error", note: "Knowledge search failed." },
      logSummary: `search_knowledge: rpc error ${error.message?.slice(0, 80)}`,
    };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    category: string;
    title: string;
    body: string;
    source: string | null;
  }>;

  if (rows.length === 0) {
    return {
      output: {
        status: "no_matches",
        query,
        note:
          "Nothing in the knowledge base matched. Do NOT invent an answer. Consider read_constitution / read_club_rules if this is a governance question, otherwise tell the member you don't have that on file and escalate if it matters.",
      },
      logSummary: `search_knowledge: 0 matches for "${query.slice(0, 60)}"`,
    };
  }

  const entries = rows.map((r) => ({
    title: r.title,
    category: r.category,
    answer: r.body,
    source: r.source ?? undefined,
  }));

  return {
    output: {
      status: "ok",
      count: entries.length,
      entries,
      note:
        "Answer from these entries only. If none actually addresses the question, say you don't have that on file rather than guessing.",
    },
    logSummary: `search_knowledge: ${entries.length} hit(s) for "${query.slice(0, 60)}"`,
  };
}

// ===== Knowledge documents =====

async function readVenueDocument(
  ctx: ToolContext,
  kind: "constitution" | "club_rules",
): Promise<ToolResult> {
  const { data } = await ctx.supabase
    .from("venue_documents")
    .select("title, content_markdown, updated_at")
    .eq("venue_id", ctx.venueId)
    .eq("kind", kind)
    .maybeSingle();
  if (!data || !data.content_markdown || data.content_markdown.trim().length === 0) {
    return {
      output: {
        status: "no_document",
        note: `The ${kind === "constitution" ? "constitution" : "club rules"} document hasn't been uploaded for this club yet. Tell the member you don't have it on file but they can ask staff for a copy, or escalate if they need an answer.`,
      },
      logSummary: `read_${kind}: empty`,
    };
  }
  return {
    output: {
      status: "ok",
      title: data.title,
      content: data.content_markdown,
      last_updated: data.updated_at,
    },
    logSummary: `read_${kind}: ${data.content_markdown.length} chars`,
  };
}

// ===== Member data =====

async function tool_get_my_tab(ctx: ToolContext): Promise<ToolResult> {
  const { data: tabs } = await ctx.supabase
    .from("tabs")
    .select("id, opened_at, created_at")
    .eq("venue_id", ctx.venueId)
    .eq("member_id", ctx.memberId)
    .eq("status", "OPEN")
    .order("created_at", { ascending: false });

  if (!tabs || tabs.length === 0) {
    return {
      output: { status: "no_open_tab" },
      logSummary: "get_my_tab: none open",
    };
  }

  const tabIds = tabs.map((t) => t.id as string);
  const [itemsRes, paymentsRes] = await Promise.all([
    ctx.supabase
      .from("tab_items")
      .select("tab_id, qty, line_total_cents, created_at, liquor_products(name)")
      .in("tab_id", tabIds)
      .order("created_at", { ascending: false }),
    ctx.supabase
      .from("payments")
      .select("tab_id, amount_cents")
      .in("tab_id", tabIds),
  ]);

  if (itemsRes.error) {
    console.error("get_my_tab tab_items query failed:", itemsRes.error);
  }
  if (paymentsRes.error) {
    console.error("get_my_tab payments query failed:", paymentsRes.error);
  }

  type ItemRow = {
    tab_id: string;
    qty: number | null;
    line_total_cents: number | null;
    liquor_products: { name: string | null } | { name: string | null }[] | null;
  };

  const itemsByTab = new Map<string, Array<{ name: string; qty: number; line_total_cents: number }>>();
  let totalItemsCents = 0;
  for (const it of (itemsRes.data ?? []) as ItemRow[]) {
    let arr = itemsByTab.get(it.tab_id);
    if (!arr) {
      arr = [];
      itemsByTab.set(it.tab_id, arr);
    }
    const productRel = it.liquor_products;
    const productName = Array.isArray(productRel)
      ? (productRel[0]?.name ?? "Item")
      : (productRel?.name ?? "Item");
    arr.push({
      name: productName,
      qty: it.qty ?? 1,
      line_total_cents: it.line_total_cents ?? 0,
    });
    totalItemsCents += it.line_total_cents ?? 0;
  }
  let totalPaymentsCents = 0;
  for (const p of (paymentsRes.data ?? []) as Array<{ amount_cents: number }>) {
    totalPaymentsCents += p.amount_cents ?? 0;
  }
  const outstandingCents = Math.max(0, totalItemsCents - totalPaymentsCents);

  // For multi-tab cases, prefer the most recent tab as the "primary" for payment.
  const primaryTab = tabs[0] as { id: string; opened_at: string | null; created_at: string };
  const primaryItems = (itemsByTab.get(primaryTab.id) ?? []).slice(0, 15);

  return {
    output: {
      status: outstandingCents > 0 ? "open_with_balance" : "open_settled",
      outstanding_zar: centsToZar(outstandingCents),
      items_total_zar: centsToZar(totalItemsCents),
      payments_total_zar: centsToZar(totalPaymentsCents),
      open_tab_count: tabs.length,
      primary_tab_id: primaryTab.id,
      primary_tab_opened_at: primaryTab.opened_at ?? primaryTab.created_at,
      primary_tab_items: primaryItems.map((it) => ({
        item: it.name,
        qty: it.qty,
        line_total_zar: centsToZar(it.line_total_cents),
      })),
      note: outstandingCents > 0
        ? "The tab is open and there is an outstanding balance. You may offer pay_my_tab_link to settle."
        : "The tab is open but everything ordered so far has been paid for (probably paid in cash or credit at the bar; bartender may not have closed it yet). Tell the member the tab is open with no balance owing and list what's been ordered.",
    },
    logSummary: outstandingCents > 0
      ? `get_my_tab: R${centsToZar(outstandingCents).toFixed(2)} owed across ${tabs.length} tab(s), ${primaryItems.length} items`
      : `get_my_tab: open & settled (R${centsToZar(totalItemsCents).toFixed(2)} ordered, R${centsToZar(totalPaymentsCents).toFixed(2)} paid), ${primaryItems.length} items`,
  };
}

async function tool_get_my_credit_balance(ctx: ToolContext): Promise<ToolResult> {
  const { data } = await ctx.supabase
    .from("member_credits")
    .select("amount_cents, type")
    .eq("venue_id", ctx.venueId)
    .eq("member_id", ctx.memberId);

  let balance = 0;
  for (const row of (data ?? []) as Array<{ amount_cents: number; type: string }>) {
    const cents = row.amount_cents ?? 0;
    if (row.type === "CREDIT") balance += cents;
    else if (row.type === "DEBIT") balance -= cents;
  }
  balance = Math.max(0, balance);

  return {
    output: { status: "ok", credit_zar: centsToZar(balance) },
    logSummary: `get_my_credit_balance: R${centsToZar(balance).toFixed(2)}`,
  };
}

async function tool_get_my_club_balance(ctx: ToolContext): Promise<ToolResult> {
  // Latest statement snapshot for THIS member only. Only total_due_cents +
  // as_of_date are exposed — the aging buckets carry Sage's unallocated-payment
  // negatives, which confuse members (mirrors the portal ClubAccountCard).
  const { data } = await ctx.supabase
    .from("member_club_balances")
    .select("total_due_cents, as_of_date")
    .eq("venue_id", ctx.venueId)
    .eq("member_id", ctx.memberId)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return {
      output: {
        status: "no_statement",
        note: "No club-account statement has been imported for this member yet. Tell the member there's nothing on file and they can check with the club if they expected a statement.",
      },
      logSummary: "get_my_club_balance: none",
    };
  }

  const cents = (data.total_due_cents as number) ?? 0;
  const state = cents > 0 ? "owing" : cents < 0 ? "in_credit" : "settled";
  const asOf = data.as_of_date as string;

  return {
    output: {
      status: "ok",
      state,
      amount_zar: centsToZar(Math.abs(cents)),
      as_of_date: asOf,
      note: state === "owing"
        ? "Amount owing to the club (subs and levies) as at as_of_date. This is a statement snapshot, NOT live — tell the member the as-of date and that any payment made after it won't show yet. There is NO payment link for club fees; do NOT offer pay_my_tab_link (that settles the bar tab only). If they want to pay or query it, they should contact the club."
        : state === "in_credit"
        ? "The member's club account is IN CREDIT by this amount as at as_of_date. Snapshot, not live — mention the as-of date."
        : "Nothing owing on the club account as at as_of_date. Snapshot, not live — mention the as-of date.",
    },
    logSummary: `get_my_club_balance: ${state} R${centsToZar(Math.abs(cents)).toFixed(2)} as at ${asOf}`,
  };
}

async function tool_get_my_bookings(
  ctx: ToolContext,
  input: { status?: string },
): Promise<ToolResult> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);

  let q = ctx.supabase
    .from("bookings")
    .select("id, booking_code, check_in, check_out, status, total_price_cents, payment_method")
    .eq("venue_id", ctx.venueId)
    .eq("member_id", ctx.memberId)
    .gte("check_out", todayIso)
    .order("check_in", { ascending: true });
  if (input.status) {
    q = q.eq("status", input.status);
  } else {
    q = q.in("status", ["PENDING", "PAID"]);
  }
  const { data } = await q;

  const bookings = ((data ?? []) as Array<{
    id: string;
    booking_code: string;
    check_in: string;
    check_out: string;
    status: string;
    total_price_cents: number;
    payment_method: string | null;
  }>).map((b) => ({
    booking_code: b.booking_code,
    check_in: b.check_in,
    check_out: b.check_out,
    status: b.status,
    total_zar: centsToZar(b.total_price_cents ?? 0),
    payment_method: b.payment_method,
  }));

  return {
    output: { status: "ok", count: bookings.length, bookings },
    logSummary: `get_my_bookings: ${bookings.length} upcoming`,
  };
}

async function tool_lookup_member(
  ctx: ToolContext,
  input: { name: string },
): Promise<ToolResult> {
  const query = (input.name ?? "").trim();
  if (query.length < 2) {
    return {
      output: {
        status: "invalid_query",
        note: "Need at least 2 characters to search by name.",
      },
      logSummary: `lookup_member: query too short`,
    };
  }

  // Escape PostgREST `or` wildcards. The `,` separates clauses, `*` is the
  // wildcard, `%` would also work. Strip both to keep the query safe.
  const safe = query.replace(/[,*%]/g, " ").trim();
  const pattern = `%${safe}%`;

  const { data } = await ctx.supabase
    .from("members")
    .select("first_name, last_name, membership_number, membership_type, partner_name, phone, whatsapp_number, email, is_active")
    .eq("venue_id", ctx.venueId)
    .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},partner_name.ilike.${pattern}`)
    .limit(10);

  const rows = (data ?? []) as Array<{
    first_name: string;
    last_name: string;
    membership_number: string;
    membership_type: string;
    partner_name: string | null;
    phone: string | null;
    whatsapp_number: string | null;
    email: string | null;
    is_active: boolean | null;
  }>;

  if (rows.length === 0) {
    return {
      output: { status: "no_matches", query: safe },
      logSummary: `lookup_member: 0 matches for "${safe}"`,
    };
  }

  const matches = rows.map((m) => ({
    name: `${m.first_name} ${m.last_name}`.trim(),
    membership_number: m.membership_number,
    membership_type: m.membership_type,
    partner_name: m.partner_name,
    phone: m.whatsapp_number ?? m.phone,
    email: m.email,
    is_active: m.is_active !== false,
  }));

  return {
    output: { status: "ok", count: matches.length, matches },
    logSummary: `lookup_member: ${matches.length} match(es) for "${safe}"`,
  };
}

async function tool_get_my_details(ctx: ToolContext): Promise<ToolResult> {
  const { data } = await ctx.supabase
    .from("members")
    .select("first_name, last_name, membership_number, membership_type, email, phone, whatsapp_number")
    .eq("id", ctx.memberId)
    .maybeSingle();
  if (!data) {
    return {
      output: { status: "not_found" },
      logSummary: "get_my_details: member not found",
    };
  }
  return {
    output: {
      status: "ok",
      first_name: data.first_name,
      last_name: data.last_name,
      membership_number: data.membership_number,
      membership_type: data.membership_type,
      email: data.email,
      phone: data.phone,
      whatsapp_number: data.whatsapp_number,
    },
    logSummary: "get_my_details: ok",
  };
}

// ===== Club data =====

async function tool_get_upcoming_events(
  ctx: ToolContext,
  input: { limit?: number },
): Promise<ToolResult> {
  const limit = Math.min(20, Math.max(1, input.limit ?? 5));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);
  const horizon = new Date(today);
  horizon.setMonth(horizon.getMonth() + 6);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const [eventsRes, exceptionsRes] = await Promise.all([
    ctx.supabase
      .from("club_events")
      .select("id, title, description, event_date, start_time, end_time, location, recurrence, recurrence_end_date, monthly_mode")
      .eq("venue_id", ctx.venueId),
    ctx.supabase
      .from("event_exceptions")
      .select("event_id, occurrence_date")
      .eq("venue_id", ctx.venueId),
  ]);

  const seriesList = (eventsRes.data ?? []) as EventSeries[];
  const exceptions = (exceptionsRes.data ?? []) as Array<{ event_id: string; occurrence_date: string }>;
  const occurrences = expandAllOccurrences(seriesList, todayIso, horizonIso, exceptions).slice(0, limit);

  const events = occurrences.map((o) => ({
    date: o.occurrence_date,
    title: o.title,
    description: o.description,
    start_time: o.start_time,
    end_time: o.end_time,
    location: o.location,
    is_recurring: o.is_recurring,
  }));

  return {
    output: { status: "ok", count: events.length, events },
    logSummary: `get_upcoming_events: ${events.length} returned`,
  };
}

async function tool_check_caravan_availability(
  ctx: ToolContext,
  input: { check_in: string; check_out: string },
): Promise<ToolResult> {
  const { check_in, check_out } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(check_in) || !/^\d{4}-\d{2}-\d{2}$/.test(check_out)) {
    return {
      output: { status: "invalid_dates", note: "Both check_in and check_out must be ISO dates (YYYY-MM-DD)." },
      logSummary: "check_caravan_availability: invalid dates",
    };
  }
  if (check_out <= check_in) {
    return {
      output: { status: "invalid_dates", note: "check_out must be after check_in." },
      logSummary: "check_caravan_availability: bad order",
    };
  }

  const [sitesRes, linksRes, blackoutsRes] = await Promise.all([
    ctx.supabase
      .from("booking_sites")
      .select("id, name, site_type, site_number, capacity, price_cents")
      .eq("venue_id", ctx.venueId)
      .eq("is_active", true)
      .in("site_type", ["caravan", "camping"]),
    ctx.supabase
      .from("booking_site_link")
      .select("site_id, booking:bookings!inner(id, check_in, check_out, status)")
      .eq("venue_id", ctx.venueId)
      .in("booking.status", ["PENDING", "PAID"]),
    ctx.supabase
      .from("booking_blackouts")
      .select("site_id, start_date, end_date")
      .eq("venue_id", ctx.venueId),
  ]);

  const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
    aStart < bEnd && bStart < aEnd;

  const blockedSiteIds = new Set<string>();
  for (const link of (linksRes.data ?? []) as Array<{
    site_id: string;
    booking: { check_in: string; check_out: string; status: string } | null;
  }>) {
    const b = link.booking;
    if (!b) continue;
    if (overlaps(check_in, check_out, b.check_in, b.check_out)) {
      blockedSiteIds.add(link.site_id);
    }
  }
  for (const bo of (blackoutsRes.data ?? []) as Array<{
    site_id: string | null;
    start_date: string;
    end_date: string;
  }>) {
    if (overlaps(check_in, check_out, bo.start_date, bo.end_date)) {
      if (bo.site_id) blockedSiteIds.add(bo.site_id);
    }
  }

  const allSites = (sitesRes.data ?? []) as Array<{
    id: string;
    name: string;
    site_type: string;
    site_number: number | null;
    capacity: number | null;
    price_cents: number;
  }>;

  // Caravans are specific numbered sites with limited stock — list them.
  const caravanSites = allSites.filter((s) => s.site_type === "caravan");
  const caravansAvailable = caravanSites
    .filter((s) => !blockedSiteIds.has(s.id))
    .map((s) => ({
      site_id: s.id,
      name: s.name,
      site_number: s.site_number,
      capacity: s.capacity,
      price_per_night_zar: centsToZar(s.price_cents),
    }));

  // Camping is a general bucket — there is plenty of space, so we report it as
  // a yes/no rather than enumerating "sites". If at least one camping row
  // exists and isn't fully blocked, treat it as available.
  const campingSites = allSites.filter((s) => s.site_type === "camping");
  const campingHasAvailability = campingSites.some((s) => !blockedSiteIds.has(s.id));
  const campingAnyConfigured = campingSites.length > 0;

  return {
    output: {
      status: "ok",
      check_in,
      check_out,
      caravans: {
        total_count: caravanSites.length,
        available_count: caravansAvailable.length,
        available: caravansAvailable,
      },
      camping: campingAnyConfigured
        ? {
          available: campingHasAvailability,
          note: campingHasAvailability
            ? "Camping is a general area, not a specific numbered site. Tell the member there's plenty of space to camp on these dates — no need to reserve a particular spot."
            : "No camping availability on these dates.",
        }
        : {
          available: false,
          note: "No camping facilities are configured for this venue.",
        },
    },
    logSummary: `check_caravan_availability: caravans ${caravansAvailable.length}/${caravanSites.length} free, camping ${campingHasAvailability ? "ok" : "blocked"}`,
  };
}

async function tool_get_vaal_dam_weather(_ctx: ToolContext): Promise<ToolResult> {
  const apiKey = Deno.env.get("OPENWEATHER_API_KEY");
  if (!apiKey) {
    return {
      output: {
        status: "unavailable",
        note: "Weather lookup is not configured for this venue.",
      },
      logSummary: "get_vaal_dam_weather: no API key",
    };
  }
  // Vaal Dam wall (approximate club location):
  const lat = -26.880;
  const lon = 28.114;
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        output: { status: "error", note: `weather API ${res.status}` },
        logSummary: `get_vaal_dam_weather: ${res.status}`,
      };
    }
    const json = await res.json() as {
      weather?: Array<{ description: string }>;
      main?: { temp: number; feels_like: number; humidity: number };
      wind?: { speed: number; deg: number };
      dt?: number;
    };
    const desc = json.weather?.[0]?.description ?? "unknown";
    const tempC = json.main?.temp ?? null;
    const feelsLikeC = json.main?.feels_like ?? null;
    const humidity = json.main?.humidity ?? null;
    const windKmh = json.wind?.speed ? Math.round(json.wind.speed * 3.6 * 10) / 10 : null;
    const windDeg = json.wind?.deg ?? null;
    const observedAt = json.dt ? new Date(json.dt * 1000).toISOString() : null;
    return {
      output: {
        status: "ok",
        description: desc,
        temperature_c: tempC,
        feels_like_c: feelsLikeC,
        humidity_pct: humidity,
        wind_speed_kmh: windKmh,
        wind_direction_deg: windDeg,
        observed_at: observedAt,
      },
      logSummary: `get_vaal_dam_weather: ${desc}, ${tempC}°C`,
    };
  } catch (err) {
    return {
      output: { status: "error", note: err instanceof Error ? err.message : String(err) },
      logSummary: "get_vaal_dam_weather: fetch failed",
    };
  }
}

// ===== Action tools =====

async function callCreateCheckout(
  ctx: ToolContext,
  payload: Record<string, unknown>,
): Promise<{ ok: true; redirect_url: string } | { ok: false; error: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.success && body?.redirect_url) {
      return { ok: true, redirect_url: body.redirect_url as string };
    }
    return { ok: false, error: (body?.error as string) ?? `create-checkout ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function tool_pay_my_tab_link(ctx: ToolContext): Promise<ToolResult> {
  if (ctx.dryRun) {
    return {
      output: {
        status: "dry_run",
        note: "Skipped Yoco call in dry-run mode. In production this would return a payment URL.",
      },
      logSummary: "pay_my_tab_link: dry_run",
    };
  }
  // Recompute outstanding to make sure we're not minting a stale link.
  const tabResult = await tool_get_my_tab(ctx);
  const tabOutput = tabResult.output as {
    status: string;
    outstanding_zar?: number;
    primary_tab_id?: string;
  };
  if (tabOutput.status !== "open_with_balance" || !tabOutput.primary_tab_id || !tabOutput.outstanding_zar) {
    return {
      output: { status: "no_outstanding", note: "There's nothing outstanding to pay." },
      logSummary: "pay_my_tab_link: nothing to pay",
    };
  }
  const amountCents = Math.round(tabOutput.outstanding_zar * 100);
  const result = await callCreateCheckout(ctx, {
    member_id: ctx.memberId,
    venue_id: ctx.venueId,
    venue_slug: ctx.venueSlug,
    purpose: "tab_payment",
    amount_cents: amountCents,
    tab_id: tabOutput.primary_tab_id,
  });
  if (!result.ok) {
    return {
      output: { status: "error", note: result.error },
      logSummary: `pay_my_tab_link: error ${result.error.slice(0, 80)}`,
    };
  }
  return {
    output: {
      status: "ok",
      amount_zar: tabOutput.outstanding_zar,
      payment_url: result.redirect_url,
    },
    logSummary: `pay_my_tab_link: R${tabOutput.outstanding_zar.toFixed(2)} link minted`,
  };
}

async function tool_topup_credit_link(
  ctx: ToolContext,
  input: { amount_zar: number },
): Promise<ToolResult> {
  const amountZar = Math.round(input.amount_zar);
  if (!Number.isFinite(amountZar) || amountZar < 50 || amountZar > 10000) {
    return {
      output: {
        status: "invalid_amount",
        note: "Top-up amount must be between R50 and R10000.",
      },
      logSummary: `topup_credit_link: invalid amount ${input.amount_zar}`,
    };
  }
  if (ctx.dryRun) {
    return {
      output: {
        status: "dry_run",
        amount_zar: amountZar,
        note: "Skipped Yoco call in dry-run mode. In production this would return a payment URL.",
      },
      logSummary: `topup_credit_link: dry_run R${amountZar}`,
    };
  }
  const result = await callCreateCheckout(ctx, {
    member_id: ctx.memberId,
    venue_id: ctx.venueId,
    venue_slug: ctx.venueSlug,
    purpose: "credit_load",
    amount_cents: amountZar * 100,
  });
  if (!result.ok) {
    return {
      output: { status: "error", note: result.error },
      logSummary: `topup_credit_link: error ${result.error.slice(0, 80)}`,
    };
  }
  return {
    output: {
      status: "ok",
      amount_zar: amountZar,
      payment_url: result.redirect_url,
    },
    logSummary: `topup_credit_link: R${amountZar} link minted`,
  };
}

function tool_book_caravan_link(
  ctx: ToolContext,
  input: { check_in: string; check_out: string; site_id?: string },
): ToolResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.check_in) || !/^\d{4}-\d{2}-\d{2}$/.test(input.check_out)) {
    return {
      output: { status: "invalid_dates", note: "Both check_in and check_out must be ISO dates (YYYY-MM-DD)." },
      logSummary: "book_caravan_link: invalid dates",
    };
  }
  const params = new URLSearchParams({
    check_in: input.check_in,
    check_out: input.check_out,
  });
  if (input.site_id) params.set("site_id", input.site_id);
  const url = `${SITE_URL}/${ctx.venueSlug}/portal/bookings?${params.toString()}`;
  return {
    output: { status: "ok", portal_url: url, check_in: input.check_in, check_out: input.check_out },
    logSummary: `book_caravan_link: ${input.check_in} → ${input.check_out}`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Best-effort: when an `urgent` escalation is created, email the venue's
 * configured recipient (Settings → "Report recipient email") so they don't
 * have to refresh the admin page to notice. Failures are logged but never
 * propagate — the followup row is the source of truth.
 */
async function maybeSendUrgentEscalationEmail(
  ctx: ToolContext,
  args: { followupId: string; summary: string },
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;

  // Recipient: prefer venue_settings.report_recipient_email, fall back to
  // venues.contact_email. If neither is set, skip silently.
  const [{ data: setting }, { data: venue }] = await Promise.all([
    ctx.supabase
      .from("venue_settings")
      .select("value")
      .eq("venue_id", ctx.venueId)
      .eq("key", "report_recipient_email")
      .maybeSingle(),
    ctx.supabase
      .from("venues")
      .select("name, contact_email, broadcast_from_email")
      .eq("id", ctx.venueId)
      .maybeSingle(),
  ]);

  const recipient = (setting?.value as string | undefined)
    ?? (venue?.contact_email as string | undefined);
  if (!recipient) return;

  const fromEmail = (venue?.broadcast_from_email as string | undefined)
    ?? Deno.env.get("INVITE_FROM_EMAIL")
    ?? "noreply@ledra.co.za";
  const venueName = (venue?.name as string | undefined) ?? "Club";

  const { data: member } = await ctx.supabase
    .from("members")
    .select("first_name, last_name, membership_number, phone, whatsapp_number")
    .eq("id", ctx.memberId)
    .maybeSingle();

  const memberName = member
    ? `${(member.first_name as string | null) ?? ""} ${(member.last_name as string | null) ?? ""}`.trim() || "Unknown member"
    : "Unknown member";
  const memberRef = (member?.membership_number as string | null | undefined) ? `#${member.membership_number}` : "";
  const memberPhone = (member?.whatsapp_number as string | null | undefined)
    ?? (member?.phone as string | null | undefined)
    ?? "";

  const adminUrl = `${SITE_URL}/${ctx.venueSlug}/admin/whatsapp/followups`;

  const subject = `[${venueName}] Urgent WhatsApp follow-up: ${args.summary.slice(0, 80)}`;
  const html = [
    `<p><strong>An urgent follow-up has been logged from the WhatsApp assistant.</strong></p>`,
    `<p><strong>Member:</strong> ${escapeHtml(memberName)} ${escapeHtml(memberRef)}${memberPhone ? ` &middot; ${escapeHtml(memberPhone)}` : ""}</p>`,
    `<p><strong>Summary:</strong> ${escapeHtml(args.summary)}</p>`,
    `<p><strong>Original message:</strong></p>`,
    `<blockquote style="margin: 0 0 1em 0; padding: 0.5em 1em; border-left: 3px solid #D4A574; background: #FAF8F5;">${escapeHtml(ctx.inboundBody).replace(/\n/g, "<br>")}</blockquote>`,
    `<p><a href="${adminUrl}">Open in admin →</a></p>`,
    `<hr><p style="font-size: 12px; color: #999;">Sent automatically by ${escapeHtml(venueName)} WhatsApp AI assistant.</p>`,
  ].join("");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipient,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error(
        "urgent escalation email failed:",
        res.status,
        await res.text().catch(() => ""),
      );
    }
  } catch (err) {
    console.error(
      "urgent escalation email threw:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function tool_escalate_to_admin(
  ctx: ToolContext,
  input: { summary: string; urgency: string },
): Promise<ToolResult> {
  const urgency = input.urgency === "urgent" ? "urgent" : "normal";
  const summary = (input.summary ?? "").slice(0, 500) || "Member needs help with something outside the assistant's scope.";
  if (ctx.dryRun) {
    return {
      output: {
        status: "dry_run",
        summary,
        urgency,
        note: "In production this would create a follow-up row for admins to action.",
      },
      logSummary: `escalate_to_admin: dry_run (${urgency})`,
    };
  }
  const { data, error } = await ctx.supabase
    .from("whatsapp_followups")
    .insert({
      venue_id: ctx.venueId,
      member_id: ctx.memberId,
      summary,
      original_message: ctx.inboundBody.slice(0, 2000),
      urgency,
      status: "open",
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      output: { status: "error", note: error?.message ?? "Failed to create follow-up" },
      logSummary: `escalate_to_admin: error ${error?.message?.slice(0, 80)}`,
    };
  }

  // Fire urgent email side-effect after the row is committed. Best-effort —
  // any failure stays in console logs, never rolls back the follow-up.
  if (urgency === "urgent") {
    await maybeSendUrgentEscalationEmail(ctx, {
      followupId: data.id as string,
      summary,
    });
  }

  return {
    output: {
      status: "ok",
      followup_id: data.id,
      urgency,
      note: "A follow-up has been logged. Confirm to the member that someone from the club will be in touch shortly.",
    },
    logSummary: `escalate_to_admin: ${urgency} created`,
  };
}

// ===== Dispatch =====

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case "search_knowledge":
      return await tool_search_knowledge(ctx, input as { query: string });
    case "read_constitution":
      return await readVenueDocument(ctx, "constitution");
    case "read_club_rules":
      return await readVenueDocument(ctx, "club_rules");
    case "get_my_tab":
      return await tool_get_my_tab(ctx);
    case "get_my_credit_balance":
      return await tool_get_my_credit_balance(ctx);
    case "get_my_club_balance":
      return await tool_get_my_club_balance(ctx);
    case "get_my_bookings":
      return await tool_get_my_bookings(ctx, input as { status?: string });
    case "get_my_details":
      return await tool_get_my_details(ctx);
    case "lookup_member":
      return await tool_lookup_member(ctx, input as { name: string });
    case "get_upcoming_events":
      return await tool_get_upcoming_events(ctx, input as { limit?: number });
    case "check_caravan_availability":
      return await tool_check_caravan_availability(
        ctx,
        input as { check_in: string; check_out: string },
      );
    case "get_vaal_dam_weather":
      return await tool_get_vaal_dam_weather(ctx);
    case "pay_my_tab_link":
      return await tool_pay_my_tab_link(ctx);
    case "topup_credit_link":
      return await tool_topup_credit_link(ctx, input as { amount_zar: number });
    case "book_caravan_link":
      return tool_book_caravan_link(
        ctx,
        input as { check_in: string; check_out: string; site_id?: string },
      );
    case "escalate_to_admin":
      return await tool_escalate_to_admin(ctx, input as { summary: string; urgency: string });
    default:
      return {
        output: { error: `Unknown tool: ${name}` },
        logSummary: `UNKNOWN ${name}`,
      };
  }
}
