// send-booking-email — thin HTTP wrapper around the shared sendBookingEmail core.
// Called by the client at two moments:
//   * EFT selected  → { booking_id, kind: "eft_pending" }  (portal + public page)
//   * admin confirms EFT receipt → { booking_id, kind: "paid_confirmation" }
// The yoco-webhook (instant card payment) calls the shared core directly instead.
//
// Idempotency is handled inside sendBookingEmail via the *_email_sent_at guard
// columns, so duplicate invocations (retries, re-selecting EFT) are safe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendBookingEmail, type BookingEmailKind } from "../_shared/bookingEmails.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { booking_id, kind } = await req.json();

    if (!booking_id || typeof booking_id !== "string") return json(400, { error: "booking_id is required" });
    if (kind !== "paid_confirmation" && kind !== "eft_pending") {
      return json(400, { error: "kind must be 'paid_confirmation' or 'eft_pending'" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const result = await sendBookingEmail(supabase, booking_id, kind as BookingEmailKind);
    if (result.error && !result.sent) {
      console.error("[send-booking-email]", kind, booking_id, result.error);
      // Return 200 so the client's fire-and-forget call never surfaces an error to
      // the guest — the booking itself already succeeded.
      return json(200, { success: false, ...result });
    }
    return json(200, { success: true, ...result });
  } catch (err) {
    console.error("[send-booking-email] crash:", err);
    return json(200, { success: false, error: err instanceof Error ? err.message : String(err) });
  }
});
