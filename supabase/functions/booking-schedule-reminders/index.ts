// booking-schedule-reminders — invoked daily at 06:00 UTC (08:00 SAST) by pg_cron.
// Branches on the SAST day of week:
//   * Friday   → weekend roundup: bookings checking in Fri/Sat/Sun → manager@
//                (always sent, even if empty — a weekly heartbeat)
//   * Mon–Thu  → that day's check-ins → manager@ (cc info@); skipped if none
//   * Sat/Sun  → no-op (already covered by Friday's roundup)
//
// Scoped to the VCA venue (recipients are hardcoded VCA addresses).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  RECIPIENTS,
  VCA_SLUG,
  escapeHtml,
  formatCentsZAR,
  fmtDate,
  emailShell,
  sendResendEmail,
} from "../_shared/bookingEmails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReminderBooking {
  booking_code: string;
  guest_name: string;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price_cents: number;
  status: string;
  payment_method: string | null;
  booking_site_link: Array<{ booking_sites: { name: string } | null }> | null;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

function siteNames(b: ReminderBooking): string {
  return (b.booking_site_link ?? []).map((l) => l.booking_sites?.name).filter(Boolean).join(", ") || "—";
}

function bookingsTable(rows: ReminderBooking[]): string {
  if (rows.length === 0) {
    return `<p style="margin:14px 0 0;font-size:14px;color:#5A6B7A;">No bookings scheduled.</p>`;
  }
  const head = ["Arrival", "Site", "Guest", "Pax", "Status", "Amount"]
    .map((h) => `<th style="text-align:left;padding:8px 10px;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#5A6B7A;border-bottom:2px solid #E2E8F0;">${h}</th>`)
    .join("");
  const body = rows
    .map((b) => {
      const isPending = b.status === "PENDING";
      const statusBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:600;${
        isPending ? "background:#FEF3C7;color:#92400E;" : "background:#D1FAE5;color:#065F46;"
      }">${escapeHtml(b.status)}</span>`;
      return `<tr>
        <td style="padding:9px 10px;font-size:13px;color:#1B3A4B;border-bottom:1px solid #EEF2F6;">${escapeHtml(fmtDate(b.check_in, false))}</td>
        <td style="padding:9px 10px;font-size:13px;color:#1B3A4B;border-bottom:1px solid #EEF2F6;">${escapeHtml(siteNames(b))}</td>
        <td style="padding:9px 10px;font-size:13px;color:#1B3A4B;border-bottom:1px solid #EEF2F6;">${escapeHtml(b.guest_name)}${
          b.guest_phone ? `<br><span style="color:#8B7E74;font-size:12px;">${escapeHtml(b.guest_phone)}</span>` : ""
        }</td>
        <td style="padding:9px 10px;font-size:13px;color:#1B3A4B;border-bottom:1px solid #EEF2F6;">${b.num_guests}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #EEF2F6;">${statusBadge}</td>
        <td style="padding:9px 10px;font-size:13px;color:#1B3A4B;border-bottom:1px solid #EEF2F6;font-weight:600;">${escapeHtml(formatCentsZAR(b.total_price_cents))}</td>
      </tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin-top:14px;">
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const respond = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return respond({ error: "RESEND_API_KEY not configured" });

    // SAST calendar day (UTC+2). At 06:00 UTC the +2h shift keeps us on the same date.
    const sast = new Date(Date.now() + 2 * 3600 * 1000);
    const dow = sast.getUTCDay(); // 0=Sun … 5=Fri, 6=Sat

    if (dow === 6 || dow === 0) {
      return respond({ skipped: "weekend", note: "Sat/Sun covered by Friday roundup" });
    }

    const { data: venue, error: vErr } = await supabase
      .from("venues")
      .select("id, name, slug, logo_url, address, contact_email, contact_phone, broadcast_from_email")
      .eq("slug", VCA_SLUG)
      .single();
    if (vErr || !venue) return respond({ error: `VCA venue not found: ${vErr?.message}` });

    const from = `${venue.name} <${venue.broadcast_from_email || Deno.env.get("INVITE_FROM_EMAIL") || RECIPIENTS.info}>`;
    const footerLines = [
      escapeHtml(venue.name),
      ...(venue.address ? [escapeHtml(venue.address)] : []),
      ...(venue.contact_phone ? [escapeHtml(venue.contact_phone)] : []),
    ];

    const isFriday = dow === 5;
    const startDate = ymd(sast);
    const endDate = isFriday ? ymd(addDays(sast, 2)) : startDate; // Fri..Sun, else just today

    const { data: bookings, error: bErr } = await supabase
      .from("bookings")
      .select(
        "booking_code, guest_name, guest_phone, check_in, check_out, num_guests, total_price_cents, status, payment_method, booking_site_link(booking_sites(name))",
      )
      .eq("venue_id", venue.id)
      .in("status", ["PAID", "PENDING"])
      .gte("check_in", startDate)
      .lte("check_in", endDate)
      .order("check_in", { ascending: true });

    if (bErr) return respond({ error: bErr.message });
    const rows = (bookings ?? []) as ReminderBooking[];

    // Weekday reminder with nothing arriving → stay quiet.
    if (!isFriday && rows.length === 0) {
      return respond({ sent: false, note: "no weekday check-ins today" });
    }

    const paidTotal = rows.filter((r) => r.status === "PAID").reduce((s, r) => s + r.total_price_cents, 0);
    const count = rows.length;

    let title: string;
    let intro: string;
    let subject: string;
    let to: string[];
    let cc: string[] | undefined;

    if (isFriday) {
      title = "This weekend's bookings";
      intro = `Bookings arriving this weekend (${fmtDate(startDate, false)} – ${fmtDate(endDate, false)}).`;
      subject = `This weekend at ${venue.name} — ${count} booking${count !== 1 ? "s" : ""}`;
      to = [RECIPIENTS.manager];
      cc = undefined;
    } else {
      title = "Bookings arriving today";
      intro = `The following ${count === 1 ? "booking is" : "bookings are"} scheduled to arrive today, ${fmtDate(startDate)}.`;
      subject = `Arriving today at ${venue.name} — ${count} booking${count !== 1 ? "s" : ""}`;
      to = [RECIPIENTS.manager];
      cc = [RECIPIENTS.info];
    }

    const body = `
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#1B3A4B;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.55;color:#334155;">${escapeHtml(intro)}</p>
      ${bookingsTable(rows)}
      ${
        count > 0
          ? `<p style="margin:16px 0 0;font-size:13px;color:#5A6B7A;">${count} booking${count !== 1 ? "s" : ""} · confirmed revenue ${escapeHtml(formatCentsZAR(paidTotal))}${
              rows.some((r) => r.status === "PENDING") ? " · some still PENDING payment" : ""
            }</p>`
          : ""
      }`;

    const html = emailShell({ venueName: venue.name, logoUrl: venue.logo_url, title, bodyHtml: body, footerLines });
    const res = await sendResendEmail({ apiKey, from, to, cc, replyTo: venue.contact_email, subject, html });

    if (!res.ok) {
      console.error("[booking-schedule-reminders] send failed:", res.error);
      return respond({ sent: false, error: res.error, count });
    }
    return respond({ sent: true, mode: isFriday ? "weekend" : "weekday", count });
  } catch (err) {
    console.error("[booking-schedule-reminders] crash:", err);
    return respond({ error: err instanceof Error ? err.message : String(err) });
  }
});
