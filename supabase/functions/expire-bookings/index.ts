/**
 * expire-bookings — Flips PENDING EFT bookings past their expires_at to EXPIRED.
 *
 * SCHEDULING OPTIONS (configure separately — not implemented in code):
 *
 * Option 1 — Supabase pg_cron (requires pg_cron + pg_net extensions):
 *   SELECT cron.schedule('expire-eft-bookings', '*/15 * * * *', $$
 *     SELECT net.http_post(
 *       url := 'https://fgquwzzyudgcmfbuvmch.supabase.co/functions/v1/expire-bookings',
 *       headers := '{"Content-Type": "application/json", "Authorization": "Bearer <ANON_KEY>"}'::jsonb,
 *       body := '{}'::jsonb
 *     );
 *   $$);
 *
 * Option 2 — External cron (cron-job.org, Vercel cron, GitHub Actions):
 *   POST https://fgquwzzyudgcmfbuvmch.supabase.co/functions/v1/expire-bookings every 15 min
 *
 * Option 3 — Manual via admin panel "Process Expired" button
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find all PENDING EFT bookings past their expiry
    const { data: expired, error: queryError } = await supabase
      .from("bookings")
      .select("id, booking_code, venue_id")
      .eq("status", "PENDING")
      .eq("payment_method", "eft")
      .not("expires_at", "is", null)
      .lt("expires_at", new Date().toISOString());

    if (queryError) {
      console.error("Query error:", queryError.message);
      return new Response(
        JSON.stringify({ error: queryError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!expired || expired.length === 0) {
      return new Response(
        JSON.stringify({ expired_count: 0, booking_codes: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const expiredCodes: string[] = [];
    const errors: string[] = [];

    for (const booking of expired) {
      const { error: updateError } = await supabase
        .from("bookings")
        .update({ status: "EXPIRED" })
        .eq("id", booking.id);

      if (updateError) {
        console.error(`Failed to expire ${booking.booking_code}:`, updateError.message);
        errors.push(booking.booking_code);
      } else {
        console.log(`Expired booking ${booking.booking_code}`);
        expiredCodes.push(booking.booking_code);
      }
    }

    return new Response(
      JSON.stringify({
        expired_count: expiredCodes.length,
        booking_codes: expiredCodes,
        ...(errors.length > 0 ? { failed: errors } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
