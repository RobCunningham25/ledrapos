// Client mirror of supabase/functions/_shared/emailTemplate.ts + broadcastTemplate.ts.
// Used to render the compose-page preview so admins see the same final email
// shape that the Edge Function will send. Keep these in lock-step; Deno can't
// import from src/, so a copy is unavoidable.
//
// The only intentional difference: the Edge Function resolves the asset base URL
// from SITE_URL, which doesn't exist in the browser — here it falls back to the
// current origin. Both prefer venues.portal_domain, so for any venue with a
// custom domain the two produce byte-identical output.

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailVenue {
  name: string;
  logo_url?: string | null;
  email_logo_url?: string | null;
  portal_domain?: string | null;
  address?: string | null;
  contact_phone?: string | null;
}

/** Absolute, email-client-safe logo URL — or null. Mirrors emailLogoUrl() in Deno. */
export function emailLogoUrl(venue: EmailVenue): string | null {
  const raw = (venue.email_logo_url || venue.logo_url || '').trim();
  if (!raw) return null;
  if (/^data:/i.test(raw)) return null;

  const base = venue.portal_domain
    ? `https://${venue.portal_domain}`
    : (typeof window !== 'undefined' ? window.location.origin : '');

  const absolute = /^https?:\/\//i.test(raw)
    ? raw
    : `${base.replace(/\/+$/, '')}/${raw.replace(/^\/+/, '')}`;

  // SVG is stripped by Gmail/Outlook/Apple Mail — better to show nothing.
  if (/\.svg(\?|#|$)/i.test(absolute)) return null;

  return absolute;
}

interface WrapInput {
  venue: EmailVenue;
  subject: string;
  bodyHtml: string;
  // null ONLY for the club archive copy (see the Deno original) — it goes to the
  // venue's own inbox, so there is no member token to unsubscribe.
  unsubscribeUrl: string | null;
}

interface WrapOutput {
  html: string;
  text: string;
}

export function wrapWithFooter(input: WrapInput): WrapOutput {
  const { venue } = input;
  const safeVenue = escapeHtml(venue.name);
  const safeSubject = escapeHtml(input.subject);
  const safeUnsub = input.unsubscribeUrl ? escapeHtml(input.unsubscribeUrl) : null;
  const logo = emailLogoUrl(venue);

  const logoBlock = logo
    ? `<img src="${escapeHtml(logo)}" alt="${safeVenue}" width="180" style="max-height:60px;max-width:180px;width:auto;height:auto;display:block;margin:0 auto 12px;border:0;outline:none;text-decoration:none;" />`
    : '';

  const headerPhone = venue.contact_phone
    ? `<div style="color:#2A9D8F;font-size:13px;margin-top:6px;letter-spacing:0.01em;">${escapeHtml(venue.contact_phone)}</div>`
    : '';

  const footerLines = [
    ...(safeUnsub
      ? [`You're receiving this because you're a member of ${safeVenue}.`]
      : [`Archive copy of a message sent to ${safeVenue} members.`]),
    ...(venue.address ? [escapeHtml(venue.address)] : []),
    ...(venue.contact_phone ? [escapeHtml(venue.contact_phone)] : []),
    ...(safeUnsub
      ? [`<a href="${safeUnsub}" style="color:#2A9D8F;text-decoration:underline;">Unsubscribe from ${safeVenue} emails</a>`]
      : []),
  ];

  const footerBlock = `<div style="background:#F7F9FC;border-top:1px solid #E2E8F0;padding:18px 32px;text-align:center;">${footerLines
    .map((l) => `<p style="margin:0 0 4px;color:#5A6B7A;font-size:12px;line-height:1.5;">${l}</p>`)
    .join('')}</div>`;

  const preheaderBlock = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${safeSubject}</div>`;

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeSubject}</title></head>
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
${input.bodyHtml}
      </div>

      ${footerBlock}
    </div>
  </div>
</body>
</html>`;

  const text =
    `[ ${venue.name} ]` +
    (venue.contact_phone ? `\n${venue.contact_phone}` : '') +
    `\n${'─'.repeat(40)}\n\n` +
    htmlToPlainText(input.bodyHtml) +
    "\n\n--\n" +
    (input.unsubscribeUrl
      ? `You're receiving this because you're a member of ${venue.name}.\n`
      : `Archive copy of a message sent to ${venue.name} members.\n`) +
    (venue.address ? `${venue.address}\n` : "") +
    (venue.contact_phone ? `${venue.contact_phone}\n` : "") +
    (input.unsubscribeUrl ? `\nUnsubscribe: ${input.unsubscribeUrl}\n` : "");

  return { html, text };
}

function htmlToPlainText(html: string): string {
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
