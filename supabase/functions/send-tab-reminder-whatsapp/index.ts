// send-tab-reminder-whatsapp — Admin-triggered. Fires the approved tab-reminder
// Content Template (vca_tab_reminder_v1 → TWILIO_TEMPLATE_TAB_REMINDER_SID) at a
// single member for a specific open tab.
//
// The template carries two quick-reply buttons:
//   - tab_send_link  → whatsapp-webhook generates a Yoco checkout URL and
//                      sends it as a session-window reply
//   - tab_use_portal → whatsapp-webhook acks with the portal URL
//
// Inputs (POST JSON):
//   { venue_id, tab_id }
//
// Auth: Bearer JWT → admin_users cross-check on venue_id.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { normaliseE164 } from "../_shared/twilio.ts";

interface ReminderRequest {
  venue_id: string;
  tab_id: string;
}

interface MemberRow {
  id: string;
  first_name: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  whatsapp_opt_in: boolean;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatRand(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function computeOutstandingForTab(
  supabase: SupabaseClient,
  tabId: string,
): Promise<number> {
  const [{ data: items }, { data: payments }] = await Promise.all([
    supabase.from("tab_items").select("line_total_cents").eq("tab_id", tabId),
    supabase.from("payments").select("amount_cents").eq("tab_id", tabId),
  ]);
  const itemsTotal = ((items || []) as Array<{ line_total_cents: number }>)
    .reduce((s, r) => s + (r.line_total_cents ?? 0), 0);
  const paymentsTotal = ((payments || []) as Array<{ amount_cents: number }>)
    .reduce((s, r) => s + (r.amount_cents ?? 0), 0);
  return Math.max(0, itemsTotal - paymentsTotal);
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
    let body: ReminderRequest;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    if (!body.venue_id || !body.tab_id) {
      return json(400, { error: "venue_id and tab_id required" });
    }
    if (adminUser.venue_id !== body.venue_id) {
      return json(403, { error: "Cross-venue action not allowed" });
    }

    const templateSid = Deno.env.get("TWILIO_TEMPLATE_TAB_REMINDER_SID");
    if (!templateSid) {
      return json(500, {
        error: "TWILIO_TEMPLATE_TAB_REMINDER_SID not configured — submit + approve vca_tab_reminder_v1 in Twilio first",
      });
    }
    const workerToken = Deno.env.get("WHATSAPP_WORKER_TOKEN");
    if (!workerToken) return json(500, { error: "WHATSAPP_WORKER_TOKEN not configured" });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // ===== Load tab + member =====
    const { data: tab, error: tabError } = await supabase
      .from("tabs")
      .select("id, venue_id, member_id, status, is_cash_customer")
      .eq("id", body.tab_id)
      .eq("venue_id", body.venue_id)
      .maybeSingle<{
        id: string;
        venue_id: string;
        member_id: string | null;
        status: string;
        is_cash_customer: boolean;
      }>();

    if (tabError || !tab) return json(404, { error: "Tab not found" });
    if (tab.status !== "OPEN") {
      return json(400, { error: `Tab is ${tab.status}, not OPEN` });
    }
    if (tab.is_cash_customer || !tab.member_id) {
      return json(400, { error: "Cannot send WhatsApp reminder for a cash-customer tab" });
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, first_name, phone, whatsapp_number, whatsapp_opt_in")
      .eq("id", tab.member_id)
      .maybeSingle<MemberRow>();

    if (memberError || !member) return json(404, { error: "Member not found" });
    if (!member.whatsapp_opt_in) {
      return json(403, {
        error: `${member.first_name ?? "Member"} has not opted in to WhatsApp. Send the opt-in invite first.`,
      });
    }

    // Resolve a usable WhatsApp number (heals legacy bad data on the way through).
    const toE164 = normaliseE164(member.whatsapp_number) || normaliseE164(member.phone);
    if (!toE164) return json(400, { error: "Member has no usable WhatsApp number on file" });
    if (member.whatsapp_number !== toE164) {
      await supabase.from("members").update({ whatsapp_number: toE164 }).eq("id", member.id);
    }

    // ===== Compute outstanding balance =====
    const outstanding = await computeOutstandingForTab(supabase, body.tab_id);
    if (outstanding <= 0) {
      return json(400, { error: "This tab has no outstanding balance" });
    }

    // ===== Send via send-whatsapp =====
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Whatsapp-Worker-Token": workerToken,
      },
      body: JSON.stringify({
        venue_id: body.venue_id,
        member_id: member.id,
        to_e164: toE164,
        template_sid: templateSid,
        template_variables: {
          "1": member.first_name || "there",
          "2": formatRand(outstanding),
        },
        related_kind: "tab_reminder",
        related_id: body.tab_id,
      }),
    });

    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || !result?.success) {
      return json(resp.status || 500, {
        success: false,
        error: result?.error || `send-whatsapp ${resp.status}`,
      });
    }

    return json(200, {
      success: true,
      tab_id: body.tab_id,
      member_id: member.id,
      outstanding_cents: outstanding,
      message_id: result.message_id,
    });
  } catch (err) {
    console.error("send-tab-reminder-whatsapp crashed:", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
