// Shared helpers for accommodation-booking notification emails.
// Used by:
//   * yoco-webhook            → sends the paid-confirmation on instant card payment
//   * send-booking-email      → thin HTTP wrapper the client calls (EFT selected /
//                               admin confirms EFT receipt)
//   * booking-schedule-reminders → daily manager reminders (own render fns below)
//
// From-address is the venue's verified Resend sender (broadcast_from_email),
// falling back to the INVITE_FROM_EMAIL secret. reply_to is the venue contact.
//
// Internal staff recipients are hardcoded VCA addresses (per product decision).
// They only fire for the VCA venue; other venues get guest-facing mail only.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Recipients (VCA) ─────────────────────────────────────────────────────────
export const VCA_SLUG = "vca";
export const RECIPIENTS = {
  manager: "manager@vaalcruising.co.za",
  info: "info@vaalcruising.co.za",
  finance: "finance@vaalcruising.co.za",
};

// ── Small formatting helpers ─────────────────────────────────────────────────
export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatCentsZAR(cents: number): string {
  const v = (cents ?? 0) / 100;
  return `R ${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// bookings.check_in / check_out are DATE strings ('YYYY-MM-DD'). Parse at noon to
// dodge UTC off-by-one (SA is UTC+2).
export function fmtDate(d: string, withWeekday = true): string {
  try {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("en-ZA", {
      ...(withWeekday ? { weekday: "long" } : {}),
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

// ── Email shell (Nautical Warm card) ─────────────────────────────────────────
export function emailShell(args: {
  venueName: string;
  logoUrl?: string | null;
  title: string;
  bodyHtml: string;
  footerLines?: string[];
}): string {
  const safeVenue = escapeHtml(args.venueName);
  const logoBlock = args.logoUrl
    ? `<img src="${escapeHtml(args.logoUrl)}" alt="${safeVenue}" style="max-height:56px;max-width:180px;display:block;margin:0 auto 12px;object-fit:contain;" />`
    : "";
  const footer = (args.footerLines ?? [])
    .map((l) => `<p style="margin:0 0 4px;color:#5A6B7A;font-size:12px;line-height:1.5;">${l}</p>`)
    .join("");

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(args.title)}</title></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1B3A4B;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <div style="background:#FFFFFF;padding:26px 32px 20px;text-align:center;border-bottom:3px solid #2A9D8F;">
        ${logoBlock}
        <div style="color:#1B3A4B;font-size:19px;font-weight:700;letter-spacing:0.02em;">${safeVenue}</div>
      </div>
      <div style="padding:30px 32px;">
${args.bodyHtml}
      </div>
      ${footer ? `<div style="background:#F7F9FC;border-top:1px solid #E2E8F0;padding:18px 32px;text-align:center;">${footer}</div>` : ""}
    </div>
  </div>
</body>
</html>`;
}

// A labelled key/value block used inside booking emails.
export function detailRows(rows: Array<{ label: string; value: string; strong?: boolean }>): string {
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 4px;">${rows
    .map(
      (r) => `<tr>
      <td style="padding:9px 0;border-bottom:1px solid #EEF2F6;font-size:14px;color:#5A6B7A;">${escapeHtml(r.label)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #EEF2F6;font-size:14px;color:#1B3A4B;font-weight:${r.strong ? 700 : 500};text-align:right;">${escapeHtml(r.value)}</td>
    </tr>`,
    )
    .join("")}</table>`;
}

// ── Resend sender ────────────────────────────────────────────────────────────
export async function sendResendEmail(args: {
  apiKey: string;
  from: string;
  to: string[];
  cc?: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, unknown> = {
    from: args.from,
    to: args.to,
    subject: args.subject,
    html: args.html,
  };
  if (args.cc && args.cc.length) body.cc = args.cc;
  if (args.replyTo) body.reply_to = args.replyTo;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    let detail: string;
    try {
      const j = await resp.json();
      detail = j?.message || j?.name || JSON.stringify(j);
    } catch {
      detail = `HTTP ${resp.status}`;
    }
    return { ok: false, error: detail };
  }
  return { ok: true };
}

// ── Types ────────────────────────────────────────────────────────────────────
export type BookingEmailKind = "paid_confirmation" | "eft_pending";

interface BookingRow {
  id: string;
  booking_code: string;
  guest_name: string;
  guest_email: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price_cents: number;
  status: string;
  payment_method: string | null;
  expires_at: string | null;
  venue_id: string;
  confirmation_email_sent_at: string | null;
  eft_watch_email_sent_at: string | null;
  booking_site_link: Array<{ nights: number; booking_sites: { name: string } | null }> | null;
}

interface VenueRow {
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  broadcast_from_email: string | null;
}

function siteSummary(b: BookingRow): { names: string; nights: number } {
  const links = b.booking_site_link ?? [];
  const names = links.map((l) => l.booking_sites?.name).filter(Boolean).join(", ") || "—";
  const nights = links[0]?.nights ?? 0;
  return { names, nights };
}

function stayLines(b: BookingRow): Array<{ label: string; value: string; strong?: boolean }> {
  const { names, nights } = siteSummary(b);
  const isDayVisit = b.check_in === b.check_out;
  const rows: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: "Booking code", value: b.booking_code },
    { label: "Site", value: names },
    { label: "Check-in", value: fmtDate(b.check_in) },
  ];
  if (!isDayVisit) rows.push({ label: "Check-out", value: fmtDate(b.check_out) });
  rows.push({ label: isDayVisit ? "Duration" : "Nights", value: isDayVisit ? "Day visit" : `${nights} night${nights !== 1 ? "s" : ""}` });
  rows.push({ label: "Guests", value: String(b.num_guests) });
  return rows;
}

// ── Core: send the notification(s) for one booking ───────────────────────────
export async function sendBookingEmail(
  supabase: SupabaseClient,
  bookingId: string,
  kind: BookingEmailKind,
): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not configured" };
  const fallbackFrom = Deno.env.get("INVITE_FROM_EMAIL") ?? RECIPIENTS.info;

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select(
      "id, booking_code, guest_name, guest_email, check_in, check_out, num_guests, total_price_cents, status, payment_method, expires_at, venue_id, confirmation_email_sent_at, eft_watch_email_sent_at, booking_site_link(nights, booking_sites(name))",
    )
    .eq("id", bookingId)
    .single<BookingRow>();

  if (bErr || !booking) return { sent: false, error: `Booking not found: ${bErr?.message ?? bookingId}` };

  const { data: venue, error: vErr } = await supabase
    .from("venues")
    .select("name, slug, logo_url, address, contact_email, contact_phone, broadcast_from_email")
    .eq("id", booking.venue_id)
    .single<VenueRow>();

  if (vErr || !venue) return { sent: false, error: `Venue not found: ${vErr?.message ?? booking.venue_id}` };

  const from = `${venue.name} <${venue.broadcast_from_email || fallbackFrom}>`;
  const isVca = venue.slug === VCA_SLUG;
  const footerLines = [
    escapeHtml(venue.name),
    ...(venue.address ? [escapeHtml(venue.address)] : []),
    ...(venue.contact_phone ? [escapeHtml(venue.contact_phone)] : []),
  ];
  const { names } = siteSummary(booking);

  if (kind === "paid_confirmation") {
    if (booking.confirmation_email_sent_at) return { sent: false, skipped: "already_sent" };

    // Guest confirmation
    const method = booking.payment_method === "eft" ? "EFT / Bank transfer" : "Card (Yoco)";
    const guestBody = `
      <h1 style="margin:0 0 14px;font-size:21px;font-weight:700;color:#1B3A4B;">Your booking is confirmed 🎉</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155;">Hi ${escapeHtml(booking.guest_name)}, thank you — we've received your payment and your booking at ${escapeHtml(venue.name)} is confirmed.</p>
      ${detailRows([
        ...stayLines(booking),
        { label: "Amount paid", value: formatCentsZAR(booking.total_price_cents), strong: true },
        { label: "Payment method", value: method },
      ])}
      <p style="margin:18px 0 0;font-size:14px;line-height:1.55;color:#334155;">We look forward to welcoming you. If you need to change anything, just reply to this email${venue.contact_phone ? ` or call ${escapeHtml(venue.contact_phone)}` : ""}.</p>`;

    const guestHtml = emailShell({ venueName: venue.name, logoUrl: venue.logo_url, title: "Booking confirmed", bodyHtml: guestBody, footerLines });
    const guestRes = booking.guest_email
      ? await sendResendEmail({ apiKey, from, to: [booking.guest_email], replyTo: venue.contact_email, subject: `Booking confirmed — ${booking.booking_code}`, html: guestHtml })
      : { ok: false, error: "no guest email" };

    // Internal notice → manager + info (VCA only)
    if (isVca) {
      const staffBody = `
        <h1 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#1B3A4B;">New paid booking</h1>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#334155;">A booking has been paid and confirmed.</p>
        ${detailRows([
          { label: "Guest", value: booking.guest_name },
          { label: "Email", value: booking.guest_email || "—" },
          ...stayLines(booking),
          { label: "Amount", value: formatCentsZAR(booking.total_price_cents), strong: true },
          { label: "Method", value: booking.payment_method === "eft" ? "EFT / Bank transfer" : "Card (Yoco)" },
        ])}`;
      const staffHtml = emailShell({ venueName: venue.name, logoUrl: venue.logo_url, title: "New paid booking", bodyHtml: staffBody, footerLines });
      await sendResendEmail({
        apiKey,
        from,
        to: [RECIPIENTS.manager, RECIPIENTS.info],
        replyTo: venue.contact_email,
        subject: `Paid booking — ${names} · ${booking.booking_code}`,
        html: staffHtml,
      });
    }

    // Mark sent (guard) — do this even if the internal mail failed; the guest mail is the important one.
    await supabase.from("bookings").update({ confirmation_email_sent_at: new Date().toISOString() }).eq("id", booking.id);

    if (!guestRes.ok) return { sent: true, error: `guest email failed: ${guestRes.error}` };
    return { sent: true };
  }

  if (kind === "eft_pending") {
    if (!isVca) return { sent: false, skipped: "non_vca" };
    if (booking.eft_watch_email_sent_at) return { sent: false, skipped: "already_sent" };

    const staffBody = `
      <h1 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#1B3A4B;">EFT booking — watch for payment</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#334155;">A guest has chosen to pay by EFT. Please watch for the proof of payment (POP) or the deposit on the bank statement, then confirm receipt in the admin portal to mark the booking as paid.</p>
      ${detailRows([
        { label: "Guest", value: booking.guest_name },
        { label: "Email", value: booking.guest_email || "—" },
        ...stayLines(booking),
        { label: "Amount due", value: formatCentsZAR(booking.total_price_cents), strong: true },
        { label: "Payment reference", value: booking.booking_code, strong: true },
        ...(booking.expires_at ? [{ label: "Holds until", value: fmtDate(booking.expires_at) }] : []),
      ])}
      <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#8B7E74;">The booking auto-expires if payment isn't confirmed within the hold window.</p>`;
    const staffHtml = emailShell({ venueName: venue.name, logoUrl: venue.logo_url, title: "EFT booking — watch for payment", bodyHtml: staffBody, footerLines });

    const res = await sendResendEmail({
      apiKey,
      from,
      to: [RECIPIENTS.info, RECIPIENTS.finance],
      replyTo: venue.contact_email,
      subject: `EFT to watch for — ${formatCentsZAR(booking.total_price_cents)} · ref ${booking.booking_code}`,
      html: staffHtml,
    });

    await supabase.from("bookings").update({ eft_watch_email_sent_at: new Date().toISOString() }).eq("id", booking.id);

    if (!res.ok) return { sent: false, error: res.error };
    return { sent: true };
  }

  return { sent: false, error: `Unknown kind: ${kind}` };
}
