// unsubscribe — Public endpoint hit from the unsubscribe link in broadcast emails.
//
// GET  /functions/v1/unsubscribe?token=<uuid> — flips members.email_opt_out, then
//                                               302-redirects to ${SITE_URL}/unsubscribed
//                                               where the Vite app renders the confirmation.
// POST /functions/v1/unsubscribe?token=<uuid> — same flip, returns 200 with empty body for
//                                               one-click List-Unsubscribe-Post per RFC 8058.
//
// HTML rendering lives in the Vite app, not here, because Supabase's Edge Function gateway
// wraps direct HTML responses in a sandboxed iframe that breaks styling.
//
// Always redirects with status=invalid (rather than 4xx) when the token doesn't match, so
// token validity can't be enumerated. Logs every event.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_SITE_URL = "https://pos.ledra.co.za";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const url = new URL(req.url);
  let token = url.searchParams.get("token") || "";

  // POSTed one-click unsubscribe may submit the form-encoded body too.
  if (req.method === "POST" && !token) {
    try {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/x-www-form-urlencoded")) {
        const form = await req.formData();
        token = String(form.get("token") || "");
      } else if (ct.includes("application/json")) {
        const body = await req.json();
        token = String(body?.token || "");
      }
    } catch {
      // Ignore body parse errors; we'll fall through to the generic response.
    }
  }

  const isValidFormat = UUID_RE.test(token);

  let venueName: string | null = null;
  let alreadyOptedOut = false;
  let updated = false;

  if (isValidFormat) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: member } = await supabase
        .from("members")
        .select("id, venue_id, email_opt_out, venues(name)")
        .eq("unsubscribe_token", token)
        .maybeSingle();

      if (member) {
        const joined = member as { venues?: { name?: string | null } | null };
        venueName = joined.venues?.name ?? null;
        alreadyOptedOut = member.email_opt_out === true;

        if (!alreadyOptedOut) {
          const { error: updateError } = await supabase
            .from("members")
            .update({
              email_opt_out: true,
              email_opt_out_at: new Date().toISOString(),
            })
            .eq("id", member.id);

          if (updateError) {
            console.error("unsubscribe update error:", updateError.message);
          } else {
            updated = true;
            console.log(`unsubscribe: member ${member.id} opted out (venue ${member.venue_id})`);
          }
        } else {
          console.log(`unsubscribe: member ${member.id} already opted out`);
        }
      } else {
        console.log("unsubscribe: token did not match any member");
      }
    } catch (err) {
      console.error("unsubscribe unexpected error:", err);
    }
  } else {
    console.log("unsubscribe: invalid token format");
  }

  if (req.method === "POST") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const status = updated ? "updated" : alreadyOptedOut ? "already" : "invalid";
  const siteUrl = (Deno.env.get("SITE_URL") || DEFAULT_SITE_URL).replace(/\/+$/, "");
  const params = new URLSearchParams({ status });
  if (venueName) params.set("venue", venueName);

  return new Response(null, {
    status: 302,
    headers: { Location: `${siteUrl}/unsubscribed?${params.toString()}` },
  });
});
