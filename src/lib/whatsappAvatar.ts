// whatsappAvatar.ts — Deterministic avatar initials/colour for the WhatsApp
// conversation UI, mirroring LedraDesk's inbox (same hashing approach, mapped
// onto LedraPOS's own Tailwind palette instead of LedraDesk's brand tokens).

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

// 6 deterministic hues so a contact/prospect gets a stable colour without us
// tracking one. Plain Tailwind color utilities (no custom theme tokens).
const AVATAR_PALETTE = [
  'bg-teal-500/15 text-teal-700',
  'bg-blue-500/15 text-blue-700',
  'bg-amber-500/15 text-amber-700',
  'bg-violet-500/15 text-violet-700',
  'bg-rose-500/15 text-rose-700',
  'bg-slate-500/15 text-slate-700',
] as const;

export function whatsAppAvatarClasses(key: string | null | undefined): string {
  if (!key) return AVATAR_PALETTE[0];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
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
