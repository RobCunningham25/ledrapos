// Client mirror of supabase/functions/_shared/broadcastTemplate.ts.
// Used to render the compose-page preview so admins see the same final email
// shape that the Edge Function will send. Keep these two files in lock-step;
// Deno can't import from src/, so a copy is unavoidable.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface BroadcastFooterContext {
  venueName: string;
  venueAddress: string | null;
  unsubscribeUrl: string;
}

interface WrapInput extends BroadcastFooterContext {
  subject: string;
  bodyHtml: string;
}

interface WrapOutput {
  html: string;
  text: string;
}

export function wrapWithFooter(input: WrapInput): WrapOutput {
  const safeVenue = escapeHtml(input.venueName);
  const safeSubject = escapeHtml(input.subject);
  const safeUnsub = escapeHtml(input.unsubscribeUrl);
  const addressLine = input.venueAddress
    ? `<p style="margin:0 0 6px 0;color:#5A6B7A;font-size:12px;line-height:1.5;">${escapeHtml(input.venueAddress)}</p>`
    : "";

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${safeSubject}</title></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1B3A4B;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <div style="font-size:15px;line-height:1.6;color:#334155;">
${input.bodyHtml}
      </div>
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:28px 0 18px 0;" />
      <p style="margin:0 0 6px 0;color:#5A6B7A;font-size:12px;line-height:1.5;">You're receiving this because you're a member of ${safeVenue}.</p>
      ${addressLine}
      <p style="margin:8px 0 0 0;color:#5A6B7A;font-size:12px;line-height:1.5;">
        <a href="${safeUnsub}" style="color:#2A9D8F;text-decoration:underline;">Unsubscribe from ${safeVenue} emails</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = htmlToPlainText(input.bodyHtml) +
    "\n\n--\n" +
    `You're receiving this because you're a member of ${input.venueName}.\n` +
    (input.venueAddress ? `${input.venueAddress}\n` : "") +
    `\nUnsubscribe: ${input.unsubscribeUrl}\n`;

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
