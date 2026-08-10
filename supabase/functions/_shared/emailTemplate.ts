// emailTemplate.ts — the single canonical shell for every outbound LedraPOS email.
//
// Every Edge Function that sends mail (invites, password resets, tab reminders,
// booking notices, broadcasts, issue reports, membership applications, WhatsApp
// escalations) renders through `emailShell()` so the whole platform speaks with
// one voice: Nautical Warm card, venue logo, teal rule, venue footer.
//
// ── Why the logo needs its own resolver ──────────────────────────────────────
// `venues.logo_url` is an *app* asset reference. For VCA it was `/vca-logo.svg`:
//   * root-relative  → an email client has no base URL, so the <img> is broken
//   * SVG            → Gmail, Outlook and Apple Mail all strip SVG entirely
// Neither problem is visible in the browser, which is why it went unnoticed.
// `emailLogoUrl()` resolves to an absolute https URL and refuses SVG outright —
// no logo beats a broken-image icon. Set `venues.email_logo_url` to a raster
// (PNG) URL to control it explicitly per tenant.

export interface EmailVenue {
  name: string;
  slug?: string | null;
  logo_url?: string | null;
  email_logo_url?: string | null;
  portal_domain?: string | null;
  address?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  broadcast_from_email?: string | null;
}

// Convenience select list so every function pulls the same venue columns.
export const VENUE_EMAIL_COLUMNS =
  "id, name, slug, logo_url, email_logo_url, portal_domain, address, contact_email, contact_phone, broadcast_from_email";

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Logo ─────────────────────────────────────────────────────────────────────

function assetBase(venue: EmailVenue): string {
  // Prefer the tenant's own domain so the logo is served on-brand and from the
  // same origin the recipient already trusts.
  if (venue.portal_domain) return `https://${venue.portal_domain}`;
  const site = Deno.env.get("SITE_URL") || "https://pos.ledra.co.za";
  return site.replace(/\/+$/, "");
}

/** Absolute, email-client-safe logo URL for this venue — or null if there isn't one. */
export function emailLogoUrl(venue: EmailVenue): string | null {
  const raw = (venue.email_logo_url || venue.logo_url || "").trim();
  if (!raw) return null;

  // data: URIs are fine in a browser but are blocked by every major mail client.
  if (/^data:/i.test(raw)) return null;

  const absolute = /^https?:\/\//i.test(raw)
    ? raw
    : `${assetBase(venue)}/${raw.replace(/^\/+/, "")}`;

  // SVG is stripped by Gmail/Outlook/Apple Mail — better to show nothing.
  if (/\.svg(\?|#|$)/i.test(absolute)) return null;

  return absolute;
}

// ── Shell ────────────────────────────────────────────────────────────────────

export interface EmailShellArgs {
  venue: EmailVenue;
  /** <title> and the hidden inbox preview line (unless `preheader` overrides). */
  title: string;
  /** Raw HTML for the card body. */
  bodyHtml: string;
  /** Raw HTML lines rendered in the grey footer strip. Escape them yourself. */
  footerLines?: string[];
  /** Overrides the hidden preview text shown next to the subject in the inbox. */
  preheader?: string;
}

export function emailShell(args: EmailShellArgs): string {
  const { venue } = args;
  const safeVenue = escapeHtml(venue.name);
  const logo = emailLogoUrl(venue);

  const logoBlock = logo
    ? `<img src="${escapeHtml(logo)}" alt="${safeVenue}" width="180" style="max-height:60px;max-width:180px;width:auto;height:auto;display:block;margin:0 auto 12px;border:0;outline:none;text-decoration:none;" />`
    : "";

  const headerPhone = venue.contact_phone
    ? `<div style="color:#2A9D8F;font-size:13px;margin-top:6px;letter-spacing:0.01em;">${escapeHtml(venue.contact_phone)}</div>`
    : "";

  const preheader = args.preheader ?? args.title;
  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>`
    : "";

  const footer = (args.footerLines ?? []).filter(Boolean);
  const footerBlock = footer.length
    ? `<div style="background:#F7F9FC;border-top:1px solid #E2E8F0;padding:18px 32px;text-align:center;">${footer
        .map((l) => `<p style="margin:0 0 4px;color:#5A6B7A;font-size:12px;line-height:1.5;">${l}</p>`)
        .join("")}</div>`
    : "";

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(args.title)}</title></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1B3A4B;">
  ${preheaderBlock}
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

      <div style="background:#FFFFFF;padding:26px 32px 20px;text-align:center;border-bottom:3px solid #2A9D8F;">
        ${logoBlock}
        <div style="color:#1B3A4B;font-size:19px;font-weight:700;letter-spacing:0.02em;">${safeVenue}</div>
        ${headerPhone}
      </div>

      <div style="padding:30px 32px;font-size:15px;line-height:1.7;color:#334155;">
${args.bodyHtml}
      </div>

      ${footerBlock}
    </div>
  </div>
</body>
</html>`;
}

// ── Body building blocks ─────────────────────────────────────────────────────

/** The venue identity block used at the bottom of transactional mail. */
export function venueFooterLines(venue: EmailVenue): string[] {
  return [
    escapeHtml(venue.name),
    ...(venue.address ? [escapeHtml(venue.address)] : []),
    ...(venue.contact_phone ? [escapeHtml(venue.contact_phone)] : []),
  ];
}

export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:21px;font-weight:700;color:#1B3A4B;line-height:1.3;">${escapeHtml(text)}</h1>`;
}

export function emailParagraph(html: string, opts?: { muted?: boolean; small?: boolean }): string {
  const color = opts?.muted ? "#5A6B7A" : "#334155";
  const size = opts?.small ? "13px" : "15px";
  return `<p style="margin:0 0 16px;font-size:${size};line-height:1.55;color:${color};">${html}</p>`;
}

export function emailButton(args: { href: string; label: string }): string {
  const href = escapeHtml(args.href);
  return `<div style="text-align:center;margin:28px 0;">
        <a href="${href}" style="display:inline-block;background:#2A9D8F;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:6px;">${escapeHtml(args.label)}</a>
      </div>`;
}

/** "If the button doesn't work, paste this link" fallback — required for auth links. */
export function emailLinkFallback(href: string): string {
  const safe = escapeHtml(href);
  return `<p style="margin:0 0 6px;font-size:13px;color:#5A6B7A;">If the button doesn't work, paste this link into your browser:</p>
      <p style="margin:0 0 20px;font-size:12px;word-break:break-all;"><a href="${safe}" style="color:#2A9D8F;text-decoration:none;">${safe}</a></p>`;
}

/** "Questions? Reply to this email or contact …" sign-off. */
export function emailContactLine(contactEmail: string | null | undefined): string {
  if (!contactEmail) return "";
  const safe = escapeHtml(contactEmail);
  return `<p style="margin:0;color:#5A6B7A;font-size:13px;">Questions? Reply to this email or contact <a href="mailto:${safe}" style="color:#2A9D8F;text-decoration:none;">${safe}</a>.</p>`;
}

/** A labelled key/value table. */
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

// ── Sender ───────────────────────────────────────────────────────────────────

/** `Venue Name <sender@domain>` using the venue's verified Resend sender. */
export function emailFromHeader(venue: EmailVenue, fallbackFrom?: string | null): string {
  const address =
    venue.broadcast_from_email ||
    fallbackFrom ||
    Deno.env.get("INVITE_FROM_EMAIL") ||
    "info@vaalcruising.co.za";
  return `${venue.name} <${address}>`;
}

export async function sendResendEmail(args: {
  apiKey: string;
  from: string;
  to: string[];
  cc?: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const body: Record<string, unknown> = {
    from: args.from,
    to: args.to,
    subject: args.subject,
    html: args.html,
  };
  if (args.text) body.text = args.text;
  if (args.cc && args.cc.length) body.cc = args.cc;
  if (args.replyTo) body.reply_to = args.replyTo;
  if (args.headers) body.headers = args.headers;

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

  const json = await resp.json().catch(() => ({}));
  return { ok: true, id: json?.id };
}

// ── Plain-text alternative ───────────────────────────────────────────────────

/** Best-effort HTML → plain text so Resend can attach a text/plain part. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
