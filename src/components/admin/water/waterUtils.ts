// Mirrors water_signouts_guard_return_time and the edge-function constants in
// supabase/functions/_shared/waterSignoutAlerts.ts.
export const MAX_TRIP_HOURS = 24;
export const GRACE_MINUTES = 20;
export const SNOOZE_MINUTES = 30;

export function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Normalise a South African WhatsApp number to +E.164, or null if unusable. */
export function normaliseSaNumber(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, '');
  let e164: string;
  if (/^\+\d+$/.test(digits)) e164 = digits;
  else if (/^27\d{9}$/.test(digits)) e164 = `+${digits}`;
  else if (/^0\d{9}$/.test(digits)) e164 = `+27${digits.slice(1)}`;
  else return null;
  return /^\+\d{10,15}$/.test(e164) ? e164 : null;
}
