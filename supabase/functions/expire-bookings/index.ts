// expire-bookings — Flips overdue PENDING bookings to EXPIRED so they stop
// blocking site availability. Two cases:
//   * EFT bookings past their expires_at (24h deadline set at payment choice)
//   * Abandoned bookings where no payment method was ever chosen, 48h after
//     creation (covers members who bail at the payment step and visitors who
//     never open their /booking/:code link)
//
// Scheduled by pg_cron every 15 min (migration 20260717090000); also invoked
// manually via the "Process Expired" button in the admin panel.

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

    // Find PENDING bookings that are overdue: EFT past its expires_at, or
    // no payment method chosen within 48h of creation.
    const nowIso = new Date().toISOString();
    const abandonedCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: expired, error: queryError } = await supabase
      .from("bookings")
      .select("id, booking_code, venue_id")
      .eq("status", "PENDING")
      .or(
        `and(payment_method.eq.eft,expires_at.lt.${nowIso}),and(payment_method.is.null,created_at.lt.${abandonedCutoff})`
      );

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
