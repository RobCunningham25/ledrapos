// send-whatsapp-admin-reply — Lets an admin reply, in their own words, into a
// member or prospect's WhatsApp conversation from the admin UI (WhatsApp
// Assistant → Recent conversations). This is the human-in-the-loop reply path
// for follow-ups: escalate_to_admin flags a conversation, but until now there
// was no way to actually respond on WhatsApp from LedraPOS.
//
// Free-form only (no template) — only works inside the 24h session window,
// which send-whatsapp enforces. Outside the window this returns send-whatsapp's
// 409 unchanged; the admin UI shows that as "the window has closed, contact
// them another way" rather than silently failing.
//
// Inputs (POST JSON): { venue_id, member_id?, prospect_id?, to_e164, body }
// Exactly one of member_id / prospect_id is required.
//
// Auth: Bearer JWT → admin_users cross-check on venue_id (mirrors
// send-tab-reminder-whatsapp). The browser never sees WHATSAPP_WORKER_TOKEN —
// this function holds it server-side and calls send-whatsapp on the admin's
// behalf.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface ReplyRequest {
  venue_id: string;
  member_id?: string | null;
  prospect_id?: string | null;
  to_e164: string;
  body: string;
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

  let body: ReplyRequest;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  if (!body.venue_id || !body.to_e164 || !body.body?.trim()) {
    return json(400, { error: "venue_id, to_e164, and body are required" });
  }
  if (!body.member_id && !body.prospect_id) {
    return json(400, { error: "Either member_id or prospect_id is required" });
  }
  if (body.member_id && body.prospect_id) {
    return json(400, { error: "Provide member_id OR prospect_id, not both" });
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, venue_id")
    .eq("auth_user_id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!adminUser) return json(403, { error: "Admin access required" });
  if (adminUser.venue_id !== body.venue_id) {
    return json(403, { error: "Cross-venue action not allowed" });
  }

  const workerToken = Deno.env.get("WHATSAPP_WORKER_TOKEN");
  if (!workerToken) return json(500, { error: "WHATSAPP_WORKER_TOKEN not configured" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Whatsapp-Worker-Token": workerToken,
    },
    body: JSON.stringify({
      venue_id: body.venue_id,
      member_id: body.member_id ?? null,
      prospect_id: body.prospect_id ?? null,
      to_e164: body.to_e164,
      body: body.body.trim(),
      related_kind: "admin_reply",
      related_id: adminUser.id,
    }),
  });
  const resBody = await res.json().catch(() => ({}));
  return json(res.status, resBody);
});
