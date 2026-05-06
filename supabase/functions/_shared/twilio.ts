// Twilio helpers shared by every WhatsApp Edge Function.
// - validateTwilioSignature: HMAC-SHA1 of full URL + sorted form params, compared
//   against the X-Twilio-Signature header.
// - normaliseE164: strips Twilio's "whatsapp:" prefix and tidies phone numbers
//   to a canonical +<digits> form.
// - buildContentVariables: Twilio expects ContentVariables as a JSON string keyed
//   by "1", "2", ... — this just stringifies a numeric-keyed map.
// - mapTwilioError: friendly text for the codes we hit most often.

import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

export const WHATSAPP_PREFIX = "whatsapp:";

/**
 * Validate Twilio's HMAC-SHA1 signature on an inbound webhook request.
 *
 * Twilio's algorithm (https://www.twilio.com/docs/usage/webhooks/webhooks-security):
 *  1. Take the full URL Twilio called (including query string, no fragment).
 *  2. If POST + form-encoded, append each form parameter sorted alphabetically by
 *     key, concatenating "key" + "value" (no separators) onto the URL string.
 *  3. HMAC-SHA1 the resulting string using your auth token as the key.
 *  4. Base64-encode the digest.
 *  5. Compare with the X-Twilio-Signature header (constant-time).
 */
export async function validateTwilioSignature(
  url: string,
  authToken: string,
  signatureHeader: string | null,
  formParams: Record<string, string>,
): Promise<boolean> {
  if (!signatureHeader || !authToken) return false;

  const sortedKeys = Object.keys(formParams).sort();
  let payload = url;
  for (const k of sortedKeys) {
    payload += k + formParams[k];
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expected = encodeBase64(new Uint8Array(sig));

  // Constant-time compare.
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Normalise a phone number to E.164 (`+<countrycode><digits>`).
 *
 * Returns null if the input has too few digits to be a real number.
 *
 * South-African defaulting: the platform is currently SA-only (VCA), and most
 * member.phone values are stored in local format (e.g. "082 123 4567"). Without
 * a country-code hint, naively prepending "+" gives "+0821234567" which Twilio
 * rejects with error 21211. The rules below try common SA layouts before
 * falling back to a "trust the digits" pass.
 *
 * If we ever onboard non-SA tenants, this should look up the venue's country
 * and use that as the default.
 */
export function normaliseE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(WHATSAPP_PREFIX, "");
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 9) return null;

  // Already explicit international.
  if (hadPlus) return "+" + digits;

  // SA local: 10 digits starting with 0 → strip the 0, prefix 27.
  if (digits.length === 10 && digits.startsWith("0")) {
    return "+27" + digits.slice(1);
  }

  // SA international without the leading +: 11 digits starting with 27.
  if (digits.length === 11 && digits.startsWith("27")) {
    return "+" + digits;
  }

  // SA mobile without the leading 0 (e.g. "821234567"): 9 digits, mobile prefix.
  if (digits.length === 9 && /^[6-8]/.test(digits)) {
    return "+27" + digits;
  }

  // Fallback — assume the digits already include a country code.
  return "+" + digits;
}

/** Add the Twilio whatsapp: prefix to an E.164 number. */
export function toWhatsAppAddr(e164: string): string {
  if (e164.startsWith(WHATSAPP_PREFIX)) return e164;
  return WHATSAPP_PREFIX + e164;
}

/**
 * Twilio Content API expects ContentVariables as a JSON-encoded object whose
 * keys are positional ("1", "2", ...). This helper accepts either a string-keyed
 * object or an array, returning a JSON string ready to pass to Twilio.
 */
export function buildContentVariables(
  vars: Record<string, string | number> | Array<string | number> | undefined,
): string | undefined {
  if (!vars) return undefined;
  let map: Record<string, string>;
  if (Array.isArray(vars)) {
    map = {};
    vars.forEach((v, i) => {
      map[String(i + 1)] = String(v);
    });
  } else {
    map = {};
    for (const [k, v] of Object.entries(vars)) {
      map[k] = String(v);
    }
  }
  return JSON.stringify(map);
}

/** Friendly text for Twilio error codes we expect to encounter. */
export function mapTwilioError(code: number | string | undefined, fallback: string): string {
  const c = String(code ?? "");
  switch (c) {
    case "63016":
      return "WhatsApp 24-hour session expired or no approved template — outbound must use a Content Template (63016)";
    case "63007":
      return "Twilio could not find a Channel with the specified From address (63007)";
    case "63015":
      return "Recipient is not a valid WhatsApp user (63015)";
    case "63017":
      return "Twilio rejected the message because the user has not opted in (63017)";
    case "21211":
      return "Invalid 'To' phone number (21211)";
    case "21408":
      return "Twilio account does not have permission to send WhatsApp messages from this number (21408)";
    case "21610":
      return "The recipient has unsubscribed (21610)";
    case "20003":
      return "Twilio authentication failed — check ACCOUNT_SID + AUTH_TOKEN (20003)";
    default:
      return fallback;
  }
}

/** Parse a form-encoded body into a plain string-keyed map. */
export async function parseFormBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    // Twilio always posts urlencoded for messaging webhooks; bail otherwise.
    return {};
  }
  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return out;
}
