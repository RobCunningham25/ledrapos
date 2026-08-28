// whatsappAvatar.ts — Small formatting helpers for the WhatsApp conversation
// UI (avatar initials, relative timestamps), mirroring LedraPulse's
// Conversations page.

export function whatsAppInitials(label: string | null | undefined): string {
  if (!label) return '?';
  const cleaned = label.trim();
  if (!cleaned) return '?';
  // E.164 phone fallback: use the last two digits.
  if (/^\+?\d{6,}$/.test(cleaned)) return cleaned.slice(-2);
  const parts = cleaned.split(/[\s_.@-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function whatsAppRelativeTime(input: string | null | undefined): string {
  if (!input) return '';
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  return new Date(input).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
}
