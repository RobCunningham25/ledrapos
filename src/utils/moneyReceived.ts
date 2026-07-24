import { supabase } from '@/integrations/supabase/client';

/**
 * Unified "money received" model.
 *
 * Money can enter a venue through several rails, and they overlap:
 *  - Bar tab settlements land in `payments` (CASH / CARD / CREDIT).
 *  - A Yoco online *tab* payment appears in BOTH `payments` (method CARD,
 *    reference "Yoco Online — …") AND `checkout_sessions` (purpose `tab_payment`).
 *    We take it from `payments` only, so it is never double-counted.
 *  - A Yoco *credit top-up* (purpose `credit_load`) and a Yoco *booking* payment
 *    (purpose `booking_payment`) live ONLY in `checkout_sessions` — they never
 *    touch `payments`, so they must be pulled in explicitly or they go missing.
 *
 * `CREDIT` bar payments are the redemption of pre-paid credit, not new money in
 * the door today, so they are flagged `isNewMoney: false` and excluded from the
 * received total (but still shown in the feed as a settlement).
 */

export type MoneyChannel =
  | 'bar_cash'
  | 'bar_card'
  | 'bar_credit'
  | 'yoco_credit_topup'
  | 'yoco_booking';

export interface MoneyEvent {
  id: string;
  at: string; // ISO timestamptz
  amountCents: number;
  channel: MoneyChannel;
  /** True money into the club today. False for credit redemption (pre-paid). */
  isNewMoney: boolean;
  /** Payer name — member, guest, or cash customer. */
  who: string;
  membershipNumber: string | null;
  reference: string | null;
}

export const CHANNEL_META: Record<MoneyChannel, { label: string; color: string }> = {
  bar_cash: { label: 'Bar tab · Cash', color: '#16A34A' },
  bar_card: { label: 'Bar tab · Card', color: '#2563EB' },
  bar_credit: { label: 'Bar tab · Credit', color: '#9333EA' },
  yoco_credit_topup: { label: 'Credit top-up · Yoco', color: '#0891B2' },
  yoco_booking: { label: 'Booking · Yoco', color: '#D97706' },
};

function memberName(m?: { first_name: string | null; last_name: string | null } | null): string {
  if (!m) return '';
  return `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
}

/**
 * Fetch every money-received event for a venue between two ISO timestamps.
 * Timestamps follow the existing Reports convention: local-naive strings such as
 * `2026-07-24T00:00:00` / `2026-07-24T23:59:59`.
 */
export async function fetchMoneyReceived(
  venueId: string,
  fromISO: string,
  toISO: string,
): Promise<MoneyEvent[]> {
  const [paymentsRes, sessionsRes] = await Promise.all([
    supabase
      .from('payments')
      .select('id, amount_cents, method, reference, paid_at, tab_id')
      .eq('venue_id', venueId)
      .gte('paid_at', fromISO)
      .lte('paid_at', toISO),
    supabase
      .from('checkout_sessions')
      .select('id, amount_cents, purpose, completed_at, member_id, booking_id')
      .eq('venue_id', venueId)
      .eq('status', 'completed')
      .in('purpose', ['credit_load', 'booking_payment'])
      .gte('completed_at', fromISO)
      .lte('completed_at', toISO),
  ]);

  if (paymentsRes.error) throw paymentsRes.error;
  if (sessionsRes.error) throw sessionsRes.error;

  const payments = paymentsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];

  // Resolve names for tabs (bar payments), members (top-ups) and bookings.
  const tabIds = [...new Set(payments.map((p) => p.tab_id).filter(Boolean))] as string[];
  const bookingIds = [...new Set(sessions.map((s) => s.booking_id).filter(Boolean))] as string[];

  const [tabsRes, bookingsRes] = await Promise.all([
    tabIds.length
      ? supabase
          .from('tabs')
          .select('id, member_id, is_cash_customer, cash_customer_name')
          .in('id', tabIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length
      ? supabase
          .from('bookings')
          .select('id, guest_name, member_id, membership_number')
          .in('id', bookingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const tabs = tabsRes.data ?? [];
  const bookings = bookingsRes.data ?? [];

  // All member ids we need to name.
  const memberIds = [
    ...new Set(
      [
        ...tabs.map((t) => t.member_id),
        ...sessions.map((s) => s.member_id),
        ...bookings.map((b) => b.member_id),
      ].filter(Boolean),
    ),
  ] as string[];

  const membersRes = memberIds.length
    ? await supabase
        .from('members')
        .select('id, first_name, last_name, membership_number')
        .in('id', memberIds)
    : { data: [] as any[], error: null };

  const memberById = new Map((membersRes.data ?? []).map((m) => [m.id, m]));
  const tabById = new Map(tabs.map((t) => [t.id, t]));
  const bookingById = new Map(bookings.map((b) => [b.id, b]));

  const events: MoneyEvent[] = [];

  for (const p of payments) {
    const method = (p.method ?? '').toUpperCase();
    const channel: MoneyChannel =
      method === 'CASH' ? 'bar_cash' : method === 'CREDIT' ? 'bar_credit' : 'bar_card';
    const tab = p.tab_id ? tabById.get(p.tab_id) : undefined;
    const member = tab?.member_id ? memberById.get(tab.member_id) : undefined;
    const who =
      memberName(member) ||
      tab?.cash_customer_name ||
      (tab?.is_cash_customer ? 'Cash customer' : 'Unknown');
    events.push({
      id: `pay-${p.id}`,
      at: p.paid_at,
      amountCents: p.amount_cents ?? 0,
      channel,
      isNewMoney: channel !== 'bar_credit',
      who,
      membershipNumber: member?.membership_number ?? null,
      reference: p.reference ?? null,
    });
  }

  for (const s of sessions) {
    const member = s.member_id ? memberById.get(s.member_id) : undefined;
    if (s.purpose === 'credit_load') {
      events.push({
        id: `cs-${s.id}`,
        at: s.completed_at,
        amountCents: s.amount_cents ?? 0,
        channel: 'yoco_credit_topup',
        isNewMoney: true,
        who: memberName(member) || 'Member',
        membershipNumber: member?.membership_number ?? null,
        reference: null,
      });
    } else if (s.purpose === 'booking_payment') {
      const booking = s.booking_id ? bookingById.get(s.booking_id) : undefined;
      const bookingMember = booking?.member_id ? memberById.get(booking.member_id) : undefined;
      events.push({
        id: `cs-${s.id}`,
        at: s.completed_at,
        amountCents: s.amount_cents ?? 0,
        channel: 'yoco_booking',
        isNewMoney: true,
        who: booking?.guest_name || memberName(bookingMember) || 'Guest',
        membershipNumber: booking?.membership_number ?? null,
        reference: null,
      });
    }
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events;
}

export interface MoneySummary {
  /** New money in the door (excludes credit redemption). */
  receivedCents: number;
  /** Number of new-money events. */
  count: number;
  byChannel: Record<MoneyChannel, { count: number; totalCents: number }>;
  /** Credit redeemed against tabs — pre-paid, not new money. Shown separately. */
  creditRedeemedCents: number;
}

export function summarizeMoney(events: MoneyEvent[]): MoneySummary {
  const byChannel = {
    bar_cash: { count: 0, totalCents: 0 },
    bar_card: { count: 0, totalCents: 0 },
    bar_credit: { count: 0, totalCents: 0 },
    yoco_credit_topup: { count: 0, totalCents: 0 },
    yoco_booking: { count: 0, totalCents: 0 },
  } as MoneySummary['byChannel'];

  let receivedCents = 0;
  let count = 0;
  let creditRedeemedCents = 0;

  for (const e of events) {
    byChannel[e.channel].count += 1;
    byChannel[e.channel].totalCents += e.amountCents;
    if (e.isNewMoney) {
      receivedCents += e.amountCents;
      count += 1;
    } else {
      creditRedeemedCents += e.amountCents;
    }
  }

  return { receivedCents, count, byChannel, creditRedeemedCents };
}
