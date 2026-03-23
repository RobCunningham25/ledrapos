// Required Supabase Edge Function secrets (set in Supabase Dashboard → Edge Functions → Secrets):
// - YOCO_SECRET_KEY: Yoco API secret key (starts with sk_test_ for test mode, sk_live_ for live)
// - PORTAL_BASE_URL: Full origin URL of the portal (e.g. https://ledrapos.lovable.app) — no trailing slash
// - SUPABASE_URL: Auto-available
// - SUPABASE_SERVICE_ROLE_KEY: Auto-available

// TODO: Phase 7 — validate Supabase Auth JWT from portal session

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { member_id, venue_id, venue_slug, purpose, amount_cents, tab_id, booking_id } = body;

    // Validate required fields — member_id is optional for booking_payment (visitor bookings)
    if (!venue_id || !purpose || !amount_cents) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: venue_id, purpose, amount_cents" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!venue_slug || typeof venue_slug !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing required field: venue_slug" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // member_id is required for non-booking_payment purposes
    if (purpose !== "booking_payment" && !member_id) {
      return new Response(
        JSON.stringify({ error: "member_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (amount_cents < 200) {
      return new Response(
        JSON.stringify({ error: "Minimum amount is R 2.00" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (purpose !== "credit_load" && purpose !== "tab_payment" && purpose !== "booking_payment") {
      return new Response(
        JSON.stringify({ error: "Invalid purpose. Must be 'credit_load', 'tab_payment', or 'booking_payment'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (purpose === "tab_payment" && !tab_id) {
      return new Response(
        JSON.stringify({ error: "tab_id is required for tab payments" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (purpose === "booking_payment" && !booking_id) {
      return new Response(
        JSON.stringify({ error: "booking_id is required for booking payments" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate member (only if member_id is provided)
    let member: any = null;
    if (member_id) {
      const { data: memberData, error: memberErr } = await supabase
        .from("members")
        .select("id, first_name, last_name, membership_number, venue_id")
        .eq("id", member_id)
        .eq("venue_id", venue_id)
        .eq("is_active", true)
        .maybeSingle();

      if (memberErr || !memberData) {
        return new Response(
          JSON.stringify({ error: "Member not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      member = memberData;
    }

    // Validate venue
    const { data: venue, error: venueErr } = await supabase
      .from("venues")
      .select("id, name")
      .eq("id", venue_id)
      .maybeSingle();

    if (venueErr || !venue) {
      return new Response(
        JSON.stringify({ error: "Venue not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Tab payment validations
    if (purpose === "tab_payment") {
      const { data: tab, error: tabErr } = await supabase
        .from("tabs")
        .select("id")
        .eq("id", tab_id)
        .eq("venue_id", venue_id)
        .eq("member_id", member_id)
        .eq("status", "OPEN")
        .maybeSingle();

      if (tabErr || !tab) {
        return new Response(
          JSON.stringify({ error: "No open tab found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Compute outstanding balance
      const { data: itemsData } = await supabase
        .from("tab_items")
        .select("line_total_cents")
        .eq("tab_id", tab_id)
        .eq("venue_id", venue_id);

      const tabTotal = (itemsData || []).reduce((s: number, i: any) => s + i.line_total_cents, 0);

      const { data: paymentsData } = await supabase
        .from("payments")
        .select("amount_cents")
        .eq("tab_id", tab_id)
        .eq("venue_id", venue_id);

      const totalPaid = (paymentsData || []).reduce((s: number, p: any) => s + p.amount_cents, 0);
      const outstanding = tabTotal - totalPaid;

      if (amount_cents !== outstanding) {
        return new Response(
          JSON.stringify({ error: "Amount must equal the full outstanding balance" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Booking payment validations
    let bookingData: any = null;
    if (purpose === "booking_payment") {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id, status, total_price_cents, booking_code, guest_name, venue_id")
        .eq("id", booking_id)
        .single();

      if (bookingError || !booking) {
        return new Response(
          JSON.stringify({ error: "Booking not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (booking.status !== "PENDING") {
        return new Response(
          JSON.stringify({ error: "Booking is not in PENDING status" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (booking.venue_id !== venue_id) {
        return new Response(
          JSON.stringify({ error: "Booking does not belong to this venue" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (amount_cents !== booking.total_price_cents) {
        return new Response(
          JSON.stringify({ error: "Amount must equal booking total" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      bookingData = booking;
    }

    // Build line item description
    let lineItemDescription: string;
    if (purpose === "credit_load") {
      lineItemDescription = `${venue.name} — Credit Top-Up`;
    } else if (purpose === "tab_payment") {
      lineItemDescription = `${venue.name} — Bar Tab Payment`;
    } else {
      lineItemDescription = `${venue.name} — Booking ${bookingData.booking_code}`;
    }

    // Build metadata
    const metadata: any = {
      venue_name: venue.name,
      line_item_description: lineItemDescription,
    };
    if (member) {
      metadata.member_name = `${member.first_name} ${member.last_name}`;
      metadata.membership_number = member.membership_number;
    }
    if (purpose === "booking_payment") {
      metadata.booking_code = bookingData.booking_code;
      metadata.guest_name = bookingData.guest_name;
      if (!member) {
        metadata.member_name = bookingData.guest_name;
        metadata.membership_number = null;
      }
    }

    // Create checkout session record
    const sessionInsert: any = {
      venue_id,
      member_id: member_id || null,
      purpose,
      tab_id: purpose === "tab_payment" ? tab_id : null,
      booking_id: purpose === "booking_payment" ? booking_id : null,
      amount_cents,
      status: "pending",
      metadata,
    };

    const { data: session, error: sessionErr } = await supabase
      .from("checkout_sessions")
      .insert(sessionInsert)
      .select("id")
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: "Failed to create checkout session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update booking payment_method to yoco
    if (purpose === "booking_payment") {
      await supabase
        .from("bookings")
        .update({ payment_method: "yoco" })
        .eq("id", booking_id);
    }

    const YOCO_SECRET_KEY = Deno.env.get("YOCO_SECRET_KEY");
    const PORTAL_BASE_URL = Deno.env.get("PORTAL_BASE_URL");

    if (!YOCO_SECRET_KEY || !PORTAL_BASE_URL) {
      return new Response(
        JSON.stringify({ error: "Payment gateway not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine return URLs based on whether this is a visitor (no member_id) booking payment
    let successUrl: string;
    let cancelUrl: string;
    let failureUrl: string;

    if (purpose === "booking_payment" && !member_id) {
      // Visitor payment — return to public booking page
      successUrl = `${PORTAL_BASE_URL}/booking/${bookingData.booking_code}?payment=success`;
      cancelUrl = `${PORTAL_BASE_URL}/booking/${bookingData.booking_code}?payment=cancelled`;
      failureUrl = `${PORTAL_BASE_URL}/booking/${bookingData.booking_code}?payment=failed`;
    } else {
      // Member payment — return to portal payment result
      successUrl = `${PORTAL_BASE_URL}/portal/payment-result?session_id=${session.id}&status=success`;
      cancelUrl = `${PORTAL_BASE_URL}/portal/payment-result?session_id=${session.id}&status=cancelled`;
      failureUrl = `${PORTAL_BASE_URL}/portal/payment-result?session_id=${session.id}&status=failed`;
    }

    // Call Yoco Checkout API
    const yocoRes = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${YOCO_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amount_cents,
        currency: "ZAR",
        successUrl,
        cancelUrl,
        failureUrl,
        metadata: {
          checkout_session_id: session.id,
          purpose,
          member_id: member_id || null,
          venue_id,
        },
        lineItems: [
          {
            displayName: lineItemDescription,
            quantity: 1,
            pricingDetails: { price: amount_cents },
          },
        ],
      }),
    });

    const yocoData = await yocoRes.json();

    if (!yocoRes.ok) {
      await supabase
        .from("checkout_sessions")
        .update({ status: "failed" })
        .eq("id", session.id);

      return new Response(
        JSON.stringify({ error: yocoData.message || "Payment gateway error" }),
        { status: yocoRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update session with Yoco checkout ID
    await supabase
      .from("checkout_sessions")
      .update({ yoco_checkout_id: yocoData.id })
      .eq("id", session.id);

    return new Response(
      JSON.stringify({
        success: true,
        redirect_url: yocoData.redirectUrl,
        session_id: session.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
