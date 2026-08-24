import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/**
 * Yoco's checkout-link fee, derived empirically from the club's own Yoco
 * transaction export (2024-06 to 2026-08, 79 approved transactions): fee /
 * gross averaged 3.39%, consistent across both "checkout" and "payment_link"
 * methods. Yoco doesn't publish this rate anywhere we can query — it's a
 * measured estimate. Re-derive from a fresh export if actual payouts drift
 * from this figure.
 *
 * Scope: this only applies to transactions that actually went through Yoco's
 * Checkout API (`checkout_sessions`) — online bookings, credit top-ups, and
 * "pay my tab" links. Manual in-person card swipes at the bar are a separate
 * card machine; we have no fee data for those.
 */
export const YOCO_FEE_RATE = 0.0339;

export type YocoPurpose = 'tab_payment' | 'credit_load' | 'booking_payment';

export const PURPOSE_LABEL: Record<YocoPurpose, string> = {
  tab_payment: 'Bar tab payment',
  credit_load: 'Credit top-up',
  booking_payment: 'Caravan / site booking',
};

export interface YocoTransaction {
  id: string;
  at: string; // ISO
  purpose: YocoPurpose;
  who: string;
  membershipNumber: string | null;
  grossCents: number;
  feeCents: number;
  netCents: number;
}

export function estimateFeeCents(grossCents: number): number {
  return Math.round(grossCents * YOCO_FEE_RATE);
}

function memberName(m?: { first_name: string | null; last_name: string | null } | null): string {
  return m ? `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() : '';
}

/** Every completed Yoco Checkout transaction in the period, named and fee-estimated. */
export async function fetchYocoTransactions(
  venueId: string,
  fromISO: string,
  toISO: string,
): Promise<YocoTransaction[]> {
  const { data, error } = await supabase
    .from('checkout_sessions')
    .select('id, amount_cents, purpose, completed_at, member_id, booking_id, tab_id')
    .eq('venue_id', venueId)
    .eq('status', 'completed')
    .gte('completed_at', fromISO)
    .lte('completed_at', toISO);
  if (error) throw error;
  const sessions = (data ?? []) as Array<{
    id: string; amount_cents: number; purpose: YocoPurpose; completed_at: string;
    member_id: string | null; booking_id: string | null; tab_id: string | null;
  }>;

  const bookingIds = [...new Set(sessions.map((s) => s.booking_id).filter(Boolean))] as string[];
  const tabIds = [...new Set(sessions.map((s) => s.tab_id).filter(Boolean))] as string[];

  const [bookingsRes, tabsRes] = await Promise.all([
    bookingIds.length
      ? supabase.from('bookings').select('id, guest_name, member_id, membership_number').in('id', bookingIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    tabIds.length
      ? supabase.from('tabs').select('id, member_id, is_cash_customer, cash_customer_name').in('id', tabIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  const bookings = bookingsRes.data ?? [];
  const tabs = tabsRes.data ?? [];

  const memberIds = [...new Set([
    ...sessions.map((s) => s.member_id),
    ...bookings.map((b: any) => b.member_id),
    ...tabs.map((t: any) => t.member_id),
  ].filter(Boolean))] as string[];

  const membersRes = memberIds.length
    ? await supabase.from('members').select('id, first_name, last_name, membership_number').in('id', memberIds)
    : { data: [] as any[], error: null };

  const memberById = new Map((membersRes.data ?? []).map((m: any) => [m.id, m]));
  const bookingById = new Map(bookings.map((b: any) => [b.id, b]));
  const tabById = new Map(tabs.map((t: any) => [t.id, t]));

  return sessions
    .map((s) => {
      let who = 'Member';
      let membershipNumber: string | null = null;
      if (s.purpose === 'credit_load') {
        const m = s.member_id ? memberById.get(s.member_id) : undefined;
        who = memberName(m) || 'Member';
        membershipNumber = m?.membership_number ?? null;
      } else if (s.purpose === 'booking_payment') {
        const booking = s.booking_id ? bookingById.get(s.booking_id) : undefined;
        const bm = booking?.member_id ? memberById.get(booking.member_id) : undefined;
        who = booking?.guest_name || memberName(bm) || 'Guest';
        membershipNumber = booking?.membership_number ?? null;
      } else if (s.purpose === 'tab_payment') {
        const tab = s.tab_id ? tabById.get(s.tab_id) : undefined;
        const tm = tab?.member_id ? memberById.get(tab.member_id) : undefined;
        who = memberName(tm) || tab?.cash_customer_name || 'Member';
        membershipNumber = tm?.membership_number ?? null;
      }
      const grossCents = s.amount_cents ?? 0;
      const feeCents = estimateFeeCents(grossCents);
      return {
        id: s.id,
        at: s.completed_at,
        purpose: s.purpose,
        who,
        membershipNumber,
        grossCents,
        feeCents,
        netCents: grossCents - feeCents,
      };
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export interface YocoPayoutBatch {
  key: string;
  label: string;
  payoutDate: string; // yyyy-MM-dd, estimated
  grossCents: number;
  feeCents: number;
  netCents: number;
  count: number;
  transactions: YocoTransaction[];
}

function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay(); // 0 Sun .. 6 Sat
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

/**
 * Groups Yoco transactions into estimated payout batches: Friday + Saturday +
 * Sunday land together in one payout (dated as if all fell on the Friday),
 * every other day pays out on its own, 2 business days later. This mirrors
 * what the club sees on its bank statement — check the first few real
 * payouts against these estimates and adjust the rule here if it drifts.
 */
export function batchYocoPayouts(transactions: YocoTransaction[]): YocoPayoutBatch[] {
  const batches = new Map<string, YocoPayoutBatch>();

  for (const t of transactions) {
    const d = new Date(t.at);
    const dow = d.getDay(); // 0 Sun .. 6 Sat
    let anchor: Date;
    let key: string;
    let label: string;

    if (dow === 5 || dow === 6 || dow === 0) {
      const offsetToFriday = dow === 5 ? 0 : dow === 6 ? 1 : 2;
      const friday = new Date(d);
      friday.setDate(friday.getDate() - offsetToFriday);
      anchor = friday;
      key = `weekend-${format(friday, 'yyyy-MM-dd')}`;
      const sunday = new Date(friday);
      sunday.setDate(sunday.getDate() + 2);
      label = `Weekend ${format(friday, 'd')}–${format(sunday, 'd MMM')}`;
    } else {
      anchor = d;
      key = `day-${format(d, 'yyyy-MM-dd')}`;
      label = format(d, 'EEE d MMM');
    }

    let batch = batches.get(key);
    if (!batch) {
      batch = {
        key,
        label,
        payoutDate: format(addBusinessDays(anchor, 2), 'yyyy-MM-dd'),
        grossCents: 0,
        feeCents: 0,
        netCents: 0,
        count: 0,
        transactions: [],
      };
      batches.set(key, batch);
    }
    batch.grossCents += t.grossCents;
    batch.feeCents += t.feeCents;
    batch.netCents += t.netCents;
    batch.count += 1;
    batch.transactions.push(t);
  }

  return [...batches.values()].sort((a, b) => a.payoutDate.localeCompare(b.payoutDate));
}
