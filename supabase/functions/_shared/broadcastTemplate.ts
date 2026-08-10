// Broadcast-specific template helpers.
// The card shell itself lives in `emailTemplate.ts` — this file only adds the
// bits unique to bulk member mail: the POPIA/RFC-8058 compliance footer and the
// unsubscribe URL builder.
//
// Used by `send-broadcast` and `process-broadcast-batch`. Mirrored client-side
// in `src/lib/broadcastTemplate.ts` for the compose-page preview (Deno can't
// import from src/, so a copy is unavoidable — keep the two in lock-step).

import {
  emailShell,
  escapeHtml,
  htmlToPlainText,
  type EmailVenue,
} from "./emailTemplate.ts";

export { escapeHtml };

interface WrapInput {
  venue: EmailVenue;
  subject: string;
  bodyHtml: string;
  unsubscribeUrl: string;
}

interface WrapOutput {
  html: string;
  text: string;
}

// Wraps the admin's composed body in the shared email shell + injects the
// compliance footer. Returns both HTML and a plain-text alternative for Resend.
export function wrapWithFooter(input: WrapInput): WrapOutput {
  const { venue } = input;
  const safeVenue = escapeHtml(venue.name);
  const safeUnsub = escapeHtml(input.unsubscribeUrl);

  const footerLines = [
    `You're receiving this because you're a member of ${safeVenue}.`,
    ...(venue.address ? [escapeHtml(venue.address)] : []),
    ...(venue.contact_phone ? [escapeHtml(venue.contact_phone)] : []),
    `<a href="${safeUnsub}" style="color:#2A9D8F;text-decoration:underline;">Unsubscribe from ${safeVenue} emails</a>`,
  ];

  const html = emailShell({
    venue,
    title: input.subject,
    bodyHtml: input.bodyHtml,
    footerLines,
  });

  const text =
    `[ ${venue.name} ]` +
    (venue.contact_phone ? `\n${venue.contact_phone}` : "") +
    `\n${"─".repeat(40)}\n\n` +
    htmlToPlainText(input.bodyHtml) +
    "\n\n--\n" +
    `You're receiving this because you're a member of ${venue.name}.\n` +
    (venue.address ? `${venue.address}\n` : "") +
    (venue.contact_phone ? `${venue.contact_phone}\n` : "") +
    `\nUnsubscribe: ${input.unsubscribeUrl}\n`;

  return { html, text };
}

// Builds the unsubscribe URL for a member. Edge Functions construct this with
// SITE_URL from env so the link is whatever the deployed Supabase project URL is.
export function buildUnsubscribeUrl(siteUrl: string, token: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/functions/v1/unsubscribe?token=${encodeURIComponent(token)}`;
}
