// Required Supabase Edge Function secrets (set in Supabase Dashboard → Edge Functions → Secrets):
// - YOCO_WEBHOOK_SECRET: Webhook signing secret from Yoco dashboard (starts with whsec_)
// - SUPABASE_URL: Auto-available
// - SUPABASE_SERVICE_ROLE_KEY: Auto-available

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const rawBody = await req.text();

    // Verify webhook signature
    const webhookId = req.headers.get("webhook-id");
    const webhookTimestamp = req.headers.get("webhook-timestamp");
    const webhookSignature = req.headers.get("webhook-signature");

    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      return new Response("Missing webhook headers", { status: 401 });
    }

    // Validate timestamp (3 minute tolerance)
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTimestamp - parseInt(webhookTimestamp)) > 180) {
      return new Response("Timestamp too old", { status: 401 });
    }

    const YOCO_WEBHOOK_SECRET = Deno.env.get("YOCO_WEBHOOK_SECRET");
    if (!YOCO_WEBHOOK_SECRET) {
      console.error("YOCO_WEBHOOK_SECRET not configured");
      return new Response("Server misconfigured", { status: 500 });
    }

    // Compute expected signature
    const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
    const secret = YOCO_WEBHOOK_SECRET.split("_")[1];
    const secretBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedContent)
    );
    const expectedSignature = btoa(
      String.fromCharCode(...new Uint8Array(signatureBytes))
    );

    const receivedSignatures = webhookSignature.split(" ");
    const isValid = receivedSignatures.some((sig) => {
      const [, sigValue] = sig.split(",");
      return sigValue === expectedSignature;
    });

    if (!isValid) {
      return new Response("Invalid signature", { status: 401 });
    }

    // Parse event
    const event = JSON.parse(rawBody);

    // Only process payment.succeeded
    if (event.type !== "payment.succeeded") {
      return new Response("OK", { status: 200 });
    }

    const payload = event.payload;
    const sessionId = payload?.metadata?.checkout_session_id;

    if (!sessionId) {
      console.error("No checkout_session_id in webhook metadata");
      return new Response("OK", { status: 200 });
    }

    // Look up session
    const { data: session, error: sessionErr } = await supabase
      .from("checkout_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr || !session) {
      console.error("Checkout session not found:", sessionId);
      return new Response("OK", { status: 200 });
    }

    // Idempotency check
    if (session.status === "completed") {
      return new Response("OK", { status: 200 });
    }

    try {
      if (session.purpose === "credit_load") {
        await supabase.from("member_credits").insert({
          venue_id: session.venue_id,
          member_id: session.member_id,
          amount_cents: session.amount_cents,
          type: "CREDIT",
          method: "CARD",
          description: `Online top-up via Yoco — Checkout ${session.yoco_checkout_id}`,
        });
      } else if (session.purpose === "tab_payment") {
        // Check if tab is still open
        const { data: tab } = await supabase
          .from("tabs")
          .select("id, status")
          .eq("id", session.tab_id)
          .eq("status", "OPEN")
          .maybeSingle();

        if (!tab) {
          // Tab already closed — convert to credit
          await supabase.from("member_credits").insert({
            venue_id: session.venue_id,
            member_id: session.member_id,
            amount_cents: session.amount_cents,
            type: "CREDIT",
            method: "CARD",
            description: `Tab already closed — converted to credit. Checkout ${session.yoco_checkout_id}`,
          });

          await supabase
            .from("checkout_sessions")
            .update({
              status: "completed",
              yoco_payment_id: payload.id,
              completed_at: new Date().toISOString(),
              metadata: {
                ...session.metadata,
                fallback: "converted_to_credit",
                reason: "tab_already_closed",
              },
            })
            .eq("id", session.id);

          return new Response("OK", { status: 200 });
        }

        // Tab is open — call process_payment RPC
        const { error: rpcErr } = await supabase.rpc("process_payment", {
          p_venue_id: session.venue_id,
          p_tab_id: session.tab_id,
          p_member_id: session.member_id,
          p_credit_amount: 0,
          p_cash_amount: 0,
          p_card_amount: session.amount_cents,
          p_card_reference: `Yoco Online — ${session.yoco_checkout_id}`,
        });

        if (rpcErr) {
          throw new Error(`process_payment failed: ${rpcErr.message}`);
        }
      } else if (session.purpose === "booking_payment") {
        const bookingId = session.booking_id;

        // Fetch booking
        const { data: booking, error: bookingError } = await supabase
          .from("bookings")
          .select("id, status, total_price_cents")
          .eq("id", bookingId)
          .single();

        if (bookingError || !booking) {
          console.error("Booking not found for payment:", bookingId);
          await supabase
            .from("checkout_sessions")
            .update({
              status: "failed",
              yoco_payment_id: payload.id,
              completed_at: new Date().toISOString(),
              metadata: { ...session.metadata, error: "Booking not found" },
            })
            .eq("id", session.id);
          return new Response("OK", { status: 200 });
        }

        if (booking.status === "PAID") {
          // Idempotent — booking already paid
          await supabase
            .from("checkout_sessions")
            .update({
              status: "completed",
              yoco_payment_id: payload.id,
              completed_at: new Date().toISOString(),
              metadata: { ...session.metadata, note: "Booking was already PAID — idempotent" },
            })
            .eq("id", session.id);
          return new Response("OK", { status: 200 });
        }

        if (booking.status === "CANCELLED" || booking.status === "EXPIRED") {
          // Convert to member credit — money is never lost
        if (session.member_id) {
            await supabase.from("member_credits").insert({
              venue_id: session.venue_id,
              member_id: session.member_id,
              amount_cents: session.amount_cents,
              type: "CREDIT",
              method: "CARD",
              description: `Booking ${session.metadata?.booking_code || bookingId} was ${booking.status.toLowerCase()} — payment converted to credit`,
            });
          }
          const creditNote = session.member_id
            ? `Booking was ${booking.status} — converted to member credit`
            : `Booking was ${booking.status} — visitor payment, no member to credit. Manual refund may be needed.`;
          await supabase
            .from("checkout_sessions")
            .update({
              status: "completed",
              yoco_payment_id: payload.id,
              completed_at: new Date().toISOString(),
              metadata: { ...session.metadata, note: creditNote },
            })
            .eq("id", session.id);
          return new Response("OK", { status: 200 });
        }

        // Normal case: booking is PENDING — process payment
        // 1. Insert confirmed booking_payment
        await supabase.from("booking_payments").insert({
          venue_id: session.venue_id,
          booking_id: bookingId,
          amount_cents: session.amount_cents,
          method: "yoco",
          reference: session.yoco_checkout_id,
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        });

        // 2. Update booking status to PAID
        await supabase
          .from("bookings")
          .update({ status: "PAID" })
          .eq("id", bookingId);
      }

      // Mark completed
      await supabase
        .from("checkout_sessions")
        .update({
          status: "completed",
          yoco_payment_id: payload.id,
          completed_at: new Date().toISOString(),
        })
        .eq("id", session.id);
    } catch (processingErr) {
      console.error("Processing error:", processingErr);
      await supabase
        .from("checkout_sessions")
        .update({
          status: "failed",
          metadata: {
            ...session.metadata,
            error: processingErr.message,
          },
        })
        .eq("id", session.id);
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("OK", { status: 200 });
  }
});
