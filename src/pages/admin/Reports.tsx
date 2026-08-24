import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVenue } from '@/contexts/VenueContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { getCategoryLabel, CATEGORY_COLORS } from '@/constants/productCategories';
import { fetchMoneyReceived, summarizeMoney, CHANNEL_META } from '@/utils/moneyReceived';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

interface RangeProps {
  venueId: string;
  fromISO: string;
  toISO: string;
}

const INK = '#1A202C';
const MUTED = '#718096';

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-card rounded-lg border border-border overflow-hidden">{children}</div>;
}

function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-lg font-semibold" style={{ color: INK }}>{title}</h3>
      {note && <p className="text-[13px] italic mt-0.5" style={{ color: MUTED }}>{note}</p>}
    </div>
  );
}

interface Col<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
}

function DataTable<T>({ columns, rows, empty }: { columns: Col<T>[]; rows: T[]; empty: string }) {
  return (
    <SectionCard>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#F4F6F9' }}>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="px-4 py-3 text-[13px] font-semibold uppercase"
                  style={{ color: MUTED, textAlign: c.align ?? 'left' }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-muted-foreground">{empty}</td></tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="h-12" style={{ background: i % 2 === 1 ? '#FAFAFA' : 'white', color: INK }}>
                  {columns.map((c) => (
                    <td key={c.key} className="px-4" style={{ textAlign: c.align ?? 'left' }}>{c.render(row)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function KpiGrid({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((kpi) => (
        <div key={kpi.label} className="bg-card rounded-lg border border-border p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <p className="text-[13px] font-medium" style={{ color: MUTED }}>{kpi.label}</p>
          <p className="text-[26px] font-bold mt-1" style={{ color: INK }}>{kpi.value}</p>
          {kpi.hint && <p className="text-[12px] mt-0.5" style={{ color: '#94A3B8' }}>{kpi.hint}</p>}
        </div>
      ))}
    </div>
  );
}

function HBars({ data }: { data: { label: string; value: number; display: string; color?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <SectionCard>
      <div className="p-4 space-y-2.5">
        {data.length === 0 && <p className="text-sm text-muted-foreground">No data for this period.</p>}
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-3">
            <div className="text-[13px] shrink-0" style={{ width: 92, color: INK }}>{d.label}</div>
            <div className="flex-1 h-6 rounded" style={{ background: '#F1F5F9', overflow: 'hidden' }}>
              <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: d.color ?? '#2E5FA3', borderRadius: 4, minWidth: d.value > 0 ? 3 : 0 }} />
            </div>
            <div className="text-[13px] font-semibold shrink-0 text-right" style={{ width: 96, color: INK }}>{d.display}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function Loading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function useReportData<T>(fetcher: () => Promise<T>, deps: React.DependencyList) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ok'; data: T }>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetcher()
      .then((data) => { if (!cancelled) setState({ status: 'ok', data }); })
      .catch((err) => { console.error(err); if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function ErrorNote() {
  return <p className="text-sm" style={{ color: '#DC2626' }}>Failed to load this report. Try Generate again.</p>;
}

// Fetch closed-tab line items with product info for a period (sales basis = tab close).
async function fetchSoldItems(venueId: string, fromISO: string, toISO: string) {
  const { data: closedTabs, error: e1 } = await supabase
    .from('tabs')
    .select('id')
    .eq('venue_id', venueId)
    .eq('status', 'CLOSED')
    .gte('closed_at', fromISO)
    .lte('closed_at', toISO);
  if (e1) throw e1;
  const ids = (closedTabs ?? []).map((t) => t.id);
  if (ids.length === 0) return [] as Array<{ product_id: string; qty: number; line_total_cents: number; name: string; category: string; purchase_price_cents: number | null }>;

  const { data: items, error: e2 } = await supabase
    .from('tab_items')
    .select('product_id, qty, line_total_cents, liquor_products(name, category, purchase_price_cents)')
    .eq('venue_id', venueId)
    .in('tab_id', ids);
  if (e2) throw e2;

  return (items ?? []).map((it) => {
    const prod = it.liquor_products as any;
    return {
      product_id: it.product_id as string,
      qty: it.qty as number,
      line_total_cents: it.line_total_cents as number,
      name: (prod?.name ?? 'Unknown') as string,
      category: (prod?.category ?? 'other') as string,
      purchase_price_cents: (prod?.purchase_price_cents ?? null) as number | null,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Report: Overview (money received)
// ─────────────────────────────────────────────────────────────────────────────

function OverviewReport({ venueId, fromISO, toISO }: RangeProps) {
  const state = useReportData(async () => {
    const events = await fetchMoneyReceived(venueId, fromISO, toISO);
    const summary = summarizeMoney(events);
    // Daily buckets (local time), new money only.
    const daily = new Map<string, number>();
    for (const e of events) {
      if (!e.isNewMoney) continue;
      const key = format(new Date(e.at), 'dd MMM');
      daily.set(key, (daily.get(key) ?? 0) + e.amountCents);
    }
    const dailyRows = [...daily.entries()].map(([label, cents]) => ({ label, cents }));
    return { summary, dailyRows };
  }, [venueId, fromISO, toISO]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorNote />;
  const { summary, dailyRows } = state.data;
  const c = summary.byChannel;

  return (
    <div className="space-y-6">
      <KpiGrid
        items={[
          { label: 'Total Received', value: formatCents(summary.receivedCents), hint: `${summary.count} payments` },
          { label: 'Cash', value: formatCents(c.bar_cash.totalCents) },
          { label: 'Card (incl. Yoco tab)', value: formatCents(c.bar_card.totalCents) },
          { label: 'Credit Top-ups', value: formatCents(c.yoco_credit_topup.totalCents) },
        ]}
      />
      <KpiGrid
        items={[
          { label: 'Online Bookings', value: formatCents(c.yoco_booking.totalCents) },
          { label: 'Settled from Credit', value: formatCents(summary.creditRedeemedCents), hint: 'pre-paid, not new money' },
        ]}
      />

      <div>
        <SectionHeader title="Received by channel" note="Cash, card and Yoco top-ups/bookings, de-duplicated across rails." />
        <DataTable
          columns={[
            { key: 'ch', label: 'Channel', render: (r: any) => (
              <span className="inline-flex items-center gap-2 font-medium">
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: r.color }} />{r.label}
              </span>
            ) },
            { key: 'n', label: 'Count', align: 'right', render: (r: any) => r.count },
            { key: 't', label: 'Total', align: 'right', render: (r: any) => formatCents(r.total) },
          ]}
          rows={(Object.keys(CHANNEL_META) as Array<keyof typeof CHANNEL_META>)
            .map((ch) => ({ label: CHANNEL_META[ch].label, color: CHANNEL_META[ch].color, count: c[ch].count, total: c[ch].totalCents }))
            .filter((r) => r.count > 0)}
          empty="No money received in this period."
        />
      </div>

      <div>
        <SectionHeader title="Daily takings" note="New money received per day (excludes credit redemption)." />
        <HBars data={dailyRows.map((d) => ({ label: d.label, value: d.cents, display: formatCents(d.cents) }))} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report: Products & Margin
// ─────────────────────────────────────────────────────────────────────────────

function ProductsReport({ venueId, fromISO, toISO }: RangeProps) {
  const state = useReportData(async () => {
    const items = await fetchSoldItems(venueId, fromISO, toISO);
    const byProduct = new Map<string, { name: string; category: string; units: number; revenue: number; cost: number; costKnown: boolean }>();
    const byCategory = new Map<string, { units: number; revenue: number; cost: number; costKnown: boolean }>();
    for (const it of items) {
      const cost = (it.purchase_price_cents ?? 0) * it.qty;
      const costKnown = it.purchase_price_cents != null;
      const p = byProduct.get(it.product_id);
      if (p) { p.units += it.qty; p.revenue += it.line_total_cents; p.cost += cost; p.costKnown = p.costKnown && costKnown; }
      else byProduct.set(it.product_id, { name: it.name, category: it.category, units: it.qty, revenue: it.line_total_cents, cost, costKnown });
      const cat = byCategory.get(it.category);
      if (cat) { cat.units += it.qty; cat.revenue += it.line_total_cents; cat.cost += cost; cat.costKnown = cat.costKnown && costKnown; }
      else byCategory.set(it.category, { units: it.qty, revenue: it.line_total_cents, cost, costKnown });
    }
    const products = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);
    const categories = [...byCategory.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.revenue - a.revenue);
    const totRevenue = products.reduce((s, p) => s + p.revenue, 0);
    const totCost = products.reduce((s, p) => s + p.cost, 0);
    return { products, categories, totRevenue, totCost };
  }, [venueId, fromISO, toISO]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorNote />;
  const { products, categories, totRevenue, totCost } = state.data;
  const profit = totRevenue - totCost;
  const margin = totRevenue > 0 ? Math.round((profit / totRevenue) * 100) : 0;

  const marginCell = (revenue: number, cost: number, costKnown: boolean) => {
    if (!costKnown || revenue === 0) return <span style={{ color: '#94A3B8' }}>—</span>;
    return `${Math.round(((revenue - cost) / revenue) * 100)}%`;
  };

  return (
    <div className="space-y-6">
      <KpiGrid
        items={[
          { label: 'Gross Sales', value: formatCents(totRevenue) },
          { label: 'Cost of Sales', value: formatCents(totCost) },
          { label: 'Gross Profit', value: formatCents(profit) },
          { label: 'Gross Margin', value: `${margin}%` },
        ]}
      />
      <p className="text-[13px] italic" style={{ color: MUTED }}>
        Based on closed tabs in the period. Cost uses each product's purchase price (cost per shot); products without a cost captured are excluded from margin.
      </p>

      <div>
        <SectionHeader title="Sales by category" />
        <DataTable
          columns={[
            { key: 'cat', label: 'Category', render: (r: any) => (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: CATEGORY_COLORS[r.category] ?? '#6B7280' }}>{getCategoryLabel(r.category)}</span>
            ) },
            { key: 'u', label: 'Units', align: 'right', render: (r: any) => r.units },
            { key: 'rev', label: 'Revenue', align: 'right', render: (r: any) => formatCents(r.revenue) },
            { key: 'prof', label: 'Profit', align: 'right', render: (r: any) => (r.costKnown ? formatCents(r.revenue - r.cost) : <span style={{ color: '#94A3B8' }}>—</span>) },
            { key: 'm', label: 'Margin', align: 'right', render: (r: any) => marginCell(r.revenue, r.cost, r.costKnown) },
          ]}
          rows={categories}
          empty="No sales in this period."
        />
      </div>

      <div>
        <SectionHeader title="Top products" />
        <DataTable
          columns={[
            { key: '#', label: '#', render: (r: any) => <span style={{ color: '#94A3B8' }}>{r._rank}</span> },
            { key: 'name', label: 'Product', render: (r: any) => <span className="font-medium">{r.name}</span> },
            { key: 'cat', label: 'Category', render: (r: any) => (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: CATEGORY_COLORS[r.category] ?? '#6B7280' }}>{getCategoryLabel(r.category)}</span>
            ) },
            { key: 'u', label: 'Units', align: 'right', render: (r: any) => r.units },
            { key: 'rev', label: 'Revenue', align: 'right', render: (r: any) => formatCents(r.revenue) },
            { key: 'prof', label: 'Profit', align: 'right', render: (r: any) => (r.costKnown ? formatCents(r.revenue - r.cost) : <span style={{ color: '#94A3B8' }}>—</span>) },
            { key: 'm', label: 'Margin', align: 'right', render: (r: any) => marginCell(r.revenue, r.cost, r.costKnown) },
          ]}
          rows={products.map((p, i) => ({ ...p, _rank: i + 1 }))}
          empty="No sales in this period."
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report: Yoco online income
// ─────────────────────────────────────────────────────────────────────────────

function YocoReport({ venueId, fromISO, toISO }: RangeProps) {
  const state = useReportData(async () => {
    const { data, error } = await supabase
      .from('checkout_sessions')
      .select('purpose, amount_cents')
      .eq('venue_id', venueId)
      .eq('status', 'completed')
      .gte('completed_at', fromISO)
      .lte('completed_at', toISO);
    if (error) throw error;
    const buckets = {
      tab_payment: { count: 0, total: 0 },
      credit_load: { count: 0, total: 0 },
      booking_payment: { count: 0, total: 0 },
    } as Record<string, { count: number; total: number }>;
    for (const s of (data ?? []) as Array<{ purpose: string; amount_cents: number }>) {
      const b = buckets[s.purpose];
      if (b) { b.count += 1; b.total += s.amount_cents ?? 0; }
    }
    return buckets;
  }, [venueId, fromISO, toISO]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorNote />;
  const b = state.data;
  const rows = [
    { label: 'Bar tab payments', ...b.tab_payment },
    { label: 'Credit top-ups', ...b.credit_load },
    { label: 'Caravan / site bookings', ...b.booking_payment },
  ];
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const totalCents = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-3">
      <SectionHeader title="Yoco online income" note="Online card payments processed via Yoco, split by what was paid for. Use these figures to reconcile against your Yoco dashboard." />
      <DataTable
        columns={[
          { key: 'c', label: 'Category', render: (r: any) => <span className="font-medium">{r.label}</span> },
          { key: 'n', label: 'Transactions', align: 'right', render: (r: any) => r.count },
          { key: 't', label: 'Total', align: 'right', render: (r: any) => formatCents(r.total) },
        ]}
        rows={[...rows, { label: 'Total online', count: totalCount, total: totalCents, _total: true }] as any}
        empty="No online payments in this period."
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report: Members
// ─────────────────────────────────────────────────────────────────────────────

function MembersReport({ venueId, fromISO, toISO }: RangeProps) {
  const state = useReportData(async () => {
    // Top spenders (period): payments joined to tabs → members.
    const { data: pmts, error: e1 } = await supabase
      .from('payments')
      .select('amount_cents, method, tab_id')
      .eq('venue_id', venueId)
      .gte('paid_at', fromISO)
      .lte('paid_at', toISO);
    if (e1) throw e1;

    const tabIds = [...new Set((pmts ?? []).map((p) => p.tab_id).filter(Boolean))] as string[];
    const tabsById = new Map<string, any>();
    if (tabIds.length) {
      const { data: tabs } = await supabase.from('tabs').select('id, member_id, is_cash_customer, cash_customer_name').in('id', tabIds);
      (tabs ?? []).forEach((t) => tabsById.set(t.id, t));
    }

    // Credit liability (snapshot, whole history): top-ups minus credit redeemed.
    const { data: credits } = await supabase.from('member_credits').select('member_id, amount_cents').eq('venue_id', venueId);
    const balByMember = new Map<string, number>();
    (credits ?? []).forEach((c) => balByMember.set(c.member_id, (balByMember.get(c.member_id) ?? 0) + (c.amount_cents ?? 0)));
    // Subtract credit redeemed via payments (method CREDIT) across all time.
    const { data: creditPmts } = await supabase.from('payments').select('amount_cents, tab_id').eq('venue_id', venueId).eq('method', 'CREDIT');
    const creditTabIds = [...new Set((creditPmts ?? []).map((p) => p.tab_id).filter(Boolean))] as string[];
    const creditTabMember = new Map<string, string>();
    if (creditTabIds.length) {
      const { data: ctabs } = await supabase.from('tabs').select('id, member_id').in('id', creditTabIds);
      (ctabs ?? []).forEach((t) => { if (t.member_id) creditTabMember.set(t.id, t.member_id); });
    }
    (creditPmts ?? []).forEach((p) => {
      const mid = p.tab_id ? creditTabMember.get(p.tab_id) : undefined;
      if (mid) balByMember.set(mid, (balByMember.get(mid) ?? 0) - (p.amount_cents ?? 0));
    });

    // Names for everyone referenced.
    const memberIds = [...new Set([
      ...[...tabsById.values()].map((t) => t.member_id),
      ...balByMember.keys(),
    ].filter(Boolean))] as string[];
    const nameById = new Map<string, { name: string; num: string | null }>();
    if (memberIds.length) {
      const { data: mem } = await supabase.from('members').select('id, first_name, last_name, membership_number').in('id', memberIds);
      (mem ?? []).forEach((m) => nameById.set(m.id, { name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim(), num: m.membership_number }));
    }

    const spendByMember = new Map<string, number>();
    let cashCustomerSpend = 0;
    (pmts ?? []).forEach((p) => {
      const tab = p.tab_id ? tabsById.get(p.tab_id) : undefined;
      if (tab?.member_id) spendByMember.set(tab.member_id, (spendByMember.get(tab.member_id) ?? 0) + (p.amount_cents ?? 0));
      else cashCustomerSpend += p.amount_cents ?? 0;
    });
    const spenders = [...spendByMember.entries()]
      .map(([id, cents]) => ({ name: nameById.get(id)?.name || 'Member', num: nameById.get(id)?.num ?? null, cents }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 20);

    const balances = [...balByMember.entries()]
      .map(([id, cents]) => ({ name: nameById.get(id)?.name || 'Member', num: nameById.get(id)?.num ?? null, cents }))
      .filter((r) => r.cents > 0)
      .sort((a, b) => b.cents - a.cents);
    const totalLiability = balances.reduce((s, r) => s + r.cents, 0);

    return { spenders, cashCustomerSpend, balances, totalLiability };
  }, [venueId, fromISO, toISO]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorNote />;
  const { spenders, cashCustomerSpend, balances, totalLiability } = state.data;

  return (
    <div className="space-y-6">
      <KpiGrid
        items={[
          { label: 'Members Who Paid', value: String(spenders.length) },
          { label: 'Cash Customer Spend', value: formatCents(cashCustomerSpend) },
          { label: 'Credit Liability', value: formatCents(totalLiability), hint: 'unspent member credit (current)' },
        ]}
      />

      <div>
        <SectionHeader title="Top spenders" note="Total settled on bar tabs during this period." />
        <DataTable
          columns={[
            { key: 'm', label: 'Member', render: (r: any) => <span className="font-medium">{r.name}{r.num && <span style={{ color: '#94A3B8' }}>{`  (${r.num})`}</span>}</span> },
            { key: 's', label: 'Spend', align: 'right', render: (r: any) => formatCents(r.cents) },
          ]}
          rows={spenders}
          empty="No member payments in this period."
        />
      </div>

      <div>
        <SectionHeader title="Outstanding credit balances" note="Members holding pre-paid credit (top-ups minus credit redeemed). This is a current snapshot, not period-scoped." />
        <DataTable
          columns={[
            { key: 'm', label: 'Member', render: (r: any) => <span className="font-medium">{r.name}{r.num && <span style={{ color: '#94A3B8' }}>{`  (${r.num})`}</span>}</span> },
            { key: 'b', label: 'Balance', align: 'right', render: (r: any) => formatCents(r.cents) },
          ]}
          rows={balances}
          empty="No members hold credit."
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report: Accommodation
// ─────────────────────────────────────────────────────────────────────────────

interface BookingDetailRow {
  booking_code: string;
  guest_name: string;
  guest_email: string;
  site: string;
  check_in: string;
  check_out: string;
  nights: number;
  num_guests: number;
  status: string;
  method: string;
  total_price_cents: number;
}

function downloadCsv(filename: string, rows: BookingDetailRow[]) {
  const headers = ['Code', 'Guest', 'Email', 'Site', 'Check-in', 'Check-out', 'Nights', 'Guests', 'Status', 'Method', 'Amount (ZAR)'];
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) => [
      r.booking_code, r.guest_name, r.guest_email, r.site, r.check_in, r.check_out,
      r.nights, r.num_guests, r.status, r.method, (r.total_price_cents / 100).toFixed(2),
    ].map(esc).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function AccommodationReport({ venueId, fromISO, toISO }: RangeProps) {
  const state = useReportData(async () => {
    // Summary basis: bookings CREATED in the period (matches historical report).
    const { data, error } = await supabase
      .from('bookings')
      .select('status, payment_method, total_price_cents')
      .eq('venue_id', venueId)
      .gte('created_at', fromISO)
      .lte('created_at', toISO);
    if (error) throw error;
    const byStatus = new Map<string, { count: number; total: number }>();
    const byMethod = new Map<string, { count: number; total: number }>();
    let paidCount = 0, paidTotal = 0;
    for (const b of (data ?? []) as Array<{ status: string; payment_method: string | null; total_price_cents: number }>) {
      const status = (b.status ?? 'unknown').toUpperCase();
      const method = b.payment_method ? b.payment_method.toUpperCase() : 'NOT CHOSEN';
      const cents = b.total_price_cents ?? 0;
      const s = byStatus.get(status) ?? { count: 0, total: 0 }; s.count++; s.total += cents; byStatus.set(status, s);
      const m = byMethod.get(method) ?? { count: 0, total: 0 }; m.count++; m.total += cents; byMethod.set(method, m);
      if (status === 'PAID') { paidCount++; paidTotal += cents; }
    }

    // Detail basis: bookings whose STAY (check-in) falls in the period.
    const fromDay = fromISO.slice(0, 10);
    const toDay = toISO.slice(0, 10);
    const { data: detailData, error: detailErr } = await supabase
      .from('bookings')
      .select('booking_code, guest_name, guest_email, check_in, check_out, num_guests, status, payment_method, total_price_cents, booking_site_link(nights, booking_sites(name))')
      .eq('venue_id', venueId)
      .gte('check_in', fromDay)
      .lte('check_in', toDay)
      .order('check_in', { ascending: true });
    if (detailErr) throw detailErr;

    const detail: BookingDetailRow[] = (detailData ?? []).map((b: any) => {
      const links = b.booking_site_link ?? [];
      return {
        booking_code: b.booking_code,
        guest_name: b.guest_name,
        guest_email: b.guest_email ?? '',
        site: links.map((l: any) => l.booking_sites?.name).filter(Boolean).join(', ') || '—',
        check_in: b.check_in,
        check_out: b.check_out,
        nights: links[0]?.nights ?? 0,
        num_guests: b.num_guests,
        status: (b.status ?? '').toUpperCase(),
        method: b.payment_method ? String(b.payment_method).toUpperCase() : '—',
        total_price_cents: b.total_price_cents ?? 0,
      };
    });
    const stayPaidRevenue = detail.filter((d) => d.status === 'PAID').reduce((s, d) => s + d.total_price_cents, 0);

    return {
      statuses: [...byStatus.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.total - a.total),
      methods: [...byMethod.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.total - a.total),
      paidCount, paidTotal, total: (data ?? []).length,
      detail, stayPaidRevenue,
    };
  }, [venueId, fromISO, toISO]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorNote />;
  const { statuses, methods, paidCount, paidTotal, total, detail, stayPaidRevenue } = state.data;

  const fmtDay = (d: string) => { try { return format(new Date(d + 'T12:00:00'), 'd MMM'); } catch { return d; } };

  return (
    <div className="space-y-6">
      <KpiGrid
        items={[
          { label: 'Bookings Made', value: String(total) },
          { label: 'Paid Bookings', value: String(paidCount) },
          { label: 'Confirmed Revenue', value: formatCents(paidTotal), hint: 'PAID bookings only' },
        ]}
      />
      <p className="text-[13px] italic" style={{ color: MUTED }}>Bookings created in this period, by their current status.</p>

      <div>
        <SectionHeader title="By status" />
        <DataTable
          columns={[
            { key: 's', label: 'Status', render: (r: any) => <span className="font-medium">{r.k}</span> },
            { key: 'n', label: 'Bookings', align: 'right', render: (r: any) => r.count },
            { key: 't', label: 'Value', align: 'right', render: (r: any) => formatCents(r.total) },
          ]}
          rows={statuses}
          empty="No bookings in this period."
        />
      </div>

      <div>
        <SectionHeader title="By payment method" />
        <DataTable
          columns={[
            { key: 'm', label: 'Method', render: (r: any) => <span className="font-medium">{r.k}</span> },
            { key: 'n', label: 'Bookings', align: 'right', render: (r: any) => r.count },
            { key: 't', label: 'Value', align: 'right', render: (r: any) => formatCents(r.total) },
          ]}
          rows={methods}
          empty="No bookings in this period."
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: INK }}>All bookings this period</h3>
            <p className="text-[13px] italic mt-0.5" style={{ color: MUTED }}>
              Every booking with a check-in in the period — {detail.length} booking{detail.length !== 1 ? 's' : ''} · revenue {formatCents(stayPaidRevenue)} (PAID).
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={detail.length === 0}
            onClick={() => downloadCsv(`bookings_${fromISO.slice(0, 10)}_${toISO.slice(0, 10)}.csv`, detail)}
          >
            Export CSV
          </Button>
        </div>
        <DataTable
          columns={[
            { key: 'code', label: 'Code', render: (r: BookingDetailRow) => <span className="font-mono text-[13px]">{r.booking_code}</span> },
            { key: 'guest', label: 'Guest', render: (r: BookingDetailRow) => <span className="font-medium">{r.guest_name}</span> },
            { key: 'site', label: 'Site', render: (r: BookingDetailRow) => r.site },
            { key: 'dates', label: 'Stay', render: (r: BookingDetailRow) => r.check_in === r.check_out ? `${fmtDay(r.check_in)} · day` : `${fmtDay(r.check_in)}–${fmtDay(r.check_out)}` },
            { key: 'n', label: 'Nights', align: 'right', render: (r: BookingDetailRow) => r.nights || '—' },
            { key: 'g', label: 'Pax', align: 'right', render: (r: BookingDetailRow) => r.num_guests },
            { key: 'st', label: 'Status', render: (r: BookingDetailRow) => <span className="font-medium">{r.status}</span> },
            { key: 'm', label: 'Method', render: (r: BookingDetailRow) => r.method },
            { key: 'amt', label: 'Amount', align: 'right', render: (r: BookingDetailRow) => r.total_price_cents === 0 ? 'Free' : formatCents(r.total_price_cents) },
          ]}
          rows={detail}
          empty="No bookings with a check-in in this period."
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report: Trading patterns
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function TradingReport({ venueId, fromISO, toISO }: RangeProps) {
  const state = useReportData(async () => {
    const events = await fetchMoneyReceived(venueId, fromISO, toISO);
    const weekday = new Array(7).fill(0); // 0=Mon
    const hour = new Array(24).fill(0);
    for (const e of events) {
      if (!e.isNewMoney) continue;
      const d = new Date(e.at);
      const jsDay = d.getDay(); // 0=Sun
      const idx = (jsDay + 6) % 7; // → 0=Mon
      weekday[idx] += e.amountCents;
      hour[d.getHours()] += e.amountCents;
    }
    return { weekday, hour };
  }, [venueId, fromISO, toISO]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorNote />;
  const { weekday, hour } = state.data;

  const hourRows = hour
    .map((cents, h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: cents, display: formatCents(cents) }))
    .filter((r) => r.value > 0);

  return (
    <div className="space-y-6">
      <p className="text-[13px] italic" style={{ color: MUTED }}>When money comes in — useful for planning bar staffing. New money only.</p>
      <div>
        <SectionHeader title="Takings by day of week" />
        <HBars data={WEEKDAYS.map((label, i) => ({ label, value: weekday[i], display: formatCents(weekday[i]), color: '#2A9D8F' }))} />
      </div>
      <div>
        <SectionHeader title="Takings by hour" />
        <HBars data={hourRows.length ? hourRows : [{ label: '—', value: 0, display: formatCents(0) }]} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report: Inventory
// ─────────────────────────────────────────────────────────────────────────────

function InventoryReport({ venueId }: RangeProps) {
  const state = useReportData(async () => {
    const { data, error } = await supabase
      .from('liquor_products')
      .select('name, category, stock_level, min_stock_level, purchase_price_cents, selling_price_cents')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    const rows = data ?? [];
    const costValue = rows.reduce((s, r) => s + (r.stock_level ?? 0) * (r.purchase_price_cents ?? 0), 0);
    const retailValue = rows.reduce((s, r) => s + (r.stock_level ?? 0) * (r.selling_price_cents ?? 0), 0);
    const low = rows.filter((r) => (r.stock_level ?? 0) > 0 && (r.stock_level ?? 0) <= (r.min_stock_level ?? 0)).length;
    const out = rows.filter((r) => (r.stock_level ?? 0) === 0).length;
    return { rows, costValue, retailValue, low, out };
  }, [venueId]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorNote />;
  const { rows, costValue, retailValue, low, out } = state.data;

  const status = (stock: number, min: number) => {
    if (stock === 0) return { label: 'Out of Stock', bg: '#7B0000' };
    if (stock <= min) return { label: 'Low Stock', bg: '#C0392B' };
    return { label: 'OK', bg: '#1E8449' };
  };

  return (
    <div className="space-y-6">
      <KpiGrid
        items={[
          { label: 'Stock Value (cost)', value: formatCents(costValue) },
          { label: 'Stock Value (retail)', value: formatCents(retailValue) },
          { label: 'Low Stock', value: String(low) },
          { label: 'Out of Stock', value: String(out) },
        ]}
      />
      <p className="text-[13px] italic" style={{ color: MUTED }}>Current stock levels at time of viewing, not historical stock at period end.</p>
      <DataTable
        columns={[
          { key: 'p', label: 'Product', render: (r: any) => <span className="font-medium">{r.name}</span> },
          { key: 'c', label: 'Category', render: (r: any) => (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: CATEGORY_COLORS[r.category] ?? '#6B7280' }}>{getCategoryLabel(r.category)}</span>
          ) },
          { key: 'st', label: 'Stock', align: 'right', render: (r: any) => r.stock_level },
          { key: 'min', label: 'Min', align: 'right', render: (r: any) => r.min_stock_level },
          { key: 'val', label: 'Value (cost)', align: 'right', render: (r: any) => formatCents((r.stock_level ?? 0) * (r.purchase_price_cents ?? 0)) },
          { key: 'stat', label: 'Status', render: (r: any) => {
            const s = status(r.stock_level ?? 0, r.min_stock_level ?? 0);
            return <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: s.bg }}>{s.label}</span>;
          } },
        ]}
        rows={rows}
        empty="No active products."
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report: Electricity
// ─────────────────────────────────────────────────────────────────────────────

// Purchases are monthly cumulative snapshots (one row per meter per calendar
// month, see electricity_meters migration), not discrete transactions — so
// this report picks a month rather than reusing the shared from/to range,
// same reasoning as InventoryReport ignoring it for a current-stock snapshot.
function ElectricityReport({ venueId }: RangeProps) {
  const monthsState = useReportData(async () => {
    const { data, error } = await supabase
      .from('electricity_purchases')
      .select('period_month')
      .eq('venue_id', venueId)
      .order('period_month', { ascending: false });
    if (error) throw error;
    return [...new Set((data ?? []).map((r) => r.period_month as string))];
  }, [venueId]);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  useEffect(() => {
    if (monthsState.status === 'ok' && monthsState.data.length > 0 && !selectedMonth) {
      setSelectedMonth(monthsState.data[0]);
    }
  }, [monthsState, selectedMonth]);

  const reportState = useReportData(async () => {
    if (!selectedMonth) return null;

    const { data: purchases, error: e1 } = await supabase
      .from('electricity_purchases')
      .select('amount_cents, member_id')
      .eq('venue_id', venueId)
      .eq('period_month', selectedMonth);
    if (e1) throw e1;

    // Every currently-mapped meter, regardless of period — this is what
    // defines "hasn't bought this month" (a member with a meter but no/zero
    // spend) vs. simply having no meter mapped at all (not trackable yet).
    const { data: mappedMeters, error: e2 } = await supabase
      .from('electricity_meters')
      .select('member_id, unit_label, members(first_name, last_name, membership_number)')
      .eq('venue_id', venueId)
      .not('member_id', 'is', null);
    if (e2) throw e2;

    const byMember = new Map<string, { name: string; num: string | null; sites: Set<string>; cents: number }>();
    for (const m of mappedMeters ?? []) {
      const mem = m.members as unknown as { first_name: string; last_name: string; membership_number: string } | null;
      const id = m.member_id as string;
      const rec = byMember.get(id) ?? {
        name: mem ? `${mem.first_name} ${mem.last_name}`.trim() : 'Member',
        num: mem?.membership_number ?? null,
        sites: new Set<string>(),
        cents: 0,
      };
      if (m.unit_label) rec.sites.add(m.unit_label);
      byMember.set(id, rec);
    }

    let unmappedCents = 0;
    for (const p of purchases ?? []) {
      const cents = p.amount_cents ?? 0;
      if (p.member_id && byMember.has(p.member_id)) byMember.get(p.member_id)!.cents += cents;
      else unmappedCents += cents;
    }

    const all = [...byMember.entries()].map(([id, r]) => ({
      id,
      name: r.name,
      num: r.num,
      sites: [...r.sites].sort((a, b) => Number(a) - Number(b)).join(', '),
      cents: r.cents,
    }));
    const spenders = all.filter((r) => r.cents > 0).sort((a, b) => b.cents - a.cents);
    const nonSpenders = all.filter((r) => r.cents === 0).sort((a, b) => a.name.localeCompare(b.name));
    const totalSpend = spenders.reduce((s, r) => s + r.cents, 0);

    return { spenders, nonSpenders, totalSpend, unmappedCents, mappedCount: all.length };
  }, [venueId, selectedMonth]);

  if (monthsState.status === 'loading') return <Loading />;
  if (monthsState.status === 'error') return <ErrorNote />;
  if (monthsState.data.length === 0) {
    return <p className="text-sm text-muted-foreground">No electricity purchase data imported yet.</p>;
  }

  const monthLabel = (m: string) => {
    try { return format(new Date(m + 'T00:00:00'), 'MMMM yyyy'); } catch { return m; }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-[13px] font-medium text-muted-foreground">Month</label>
        <Select value={selectedMonth ?? undefined} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthsState.data.map((m) => (
              <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {reportState.status === 'loading' || !reportState.data ? <Loading /> : reportState.status === 'error' ? <ErrorNote /> : (() => {
        const { spenders, nonSpenders, totalSpend, unmappedCents, mappedCount } = reportState.data;
        return (
          <div className="space-y-6">
            <KpiGrid
              items={[
                { label: 'Total Spend', value: formatCents(totalSpend), hint: `${spenders.length} of ${mappedCount} mapped members` },
                { label: 'Members Who Bought', value: String(spenders.length) },
                { label: "Haven't Bought", value: String(nonSpenders.length) },
                { label: 'Unmapped Meter Spend', value: formatCents(unmappedCents), hint: 'not yet linked to a member' },
              ]}
            />

            <div>
              <SectionHeader title="Spend by member" note="Biggest spender first. A member with two meters (site + shed, say) shows combined spend." />
              <DataTable
                columns={[
                  { key: 'm', label: 'Member', render: (r: any) => <span className="font-medium">{r.name}{r.num && <span style={{ color: '#94A3B8' }}>{`  (${r.num})`}</span>}</span> },
                  { key: 's', label: 'Site(s)', render: (r: any) => r.sites || '—' },
                  { key: 'c', label: 'Spend', align: 'right', render: (r: any) => formatCents(r.cents) },
                ]}
                rows={spenders}
                empty="No electricity purchases this month."
              />
            </div>

            <div>
              <SectionHeader title="Haven't bought this month" note="Members with a linked meter but no purchases recorded for this period." />
              <DataTable
                columns={[
                  { key: 'm', label: 'Member', render: (r: any) => <span className="font-medium">{r.name}{r.num && <span style={{ color: '#94A3B8' }}>{`  (${r.num})`}</span>}</span> },
                  { key: 's', label: 'Site(s)', render: (r: any) => r.sites || '—' },
                ]}
                rows={nonSpenders}
                empty="Every mapped member bought electricity this month."
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────────────────────

const REPORTS = [
  { key: 'overview', label: 'Overview', Comp: OverviewReport },
  { key: 'products', label: 'Products & Margin', Comp: ProductsReport },
  { key: 'yoco', label: 'Yoco Online', Comp: YocoReport },
  { key: 'members', label: 'Members', Comp: MembersReport },
  { key: 'accommodation', label: 'Accommodation', Comp: AccommodationReport },
  { key: 'trading', label: 'Trading Patterns', Comp: TradingReport },
  { key: 'inventory', label: 'Inventory', Comp: InventoryReport },
  { key: 'electricity', label: 'Electricity', Comp: ElectricityReport },
] as const;

function toRange(from: Date, to: Date) {
  return {
    fromISO: format(from, 'yyyy-MM-dd') + 'T00:00:00',
    toISO: format(to, 'yyyy-MM-dd') + 'T23:59:59',
  };
}

export default function Reports() {
  const { venueId } = useVenue();
  const now = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState<Date>(startOfMonth(now));
  const [toDate, setToDate] = useState<Date>(endOfMonth(now));
  const [applied, setApplied] = useState(() => toRange(startOfMonth(now), endOfMonth(now)));
  const [active, setActive] = useState<(typeof REPORTS)[number]['key']>('overview');

  const setThisMonth = () => { setFromDate(startOfMonth(now)); setToDate(endOfMonth(now)); };
  const setLastMonth = () => { const l = subMonths(now, 1); setFromDate(startOfMonth(l)); setToDate(endOfMonth(l)); };
  const setThisWeek = () => { setFromDate(startOfWeek(now, { weekStartsOn: 1 })); setToDate(endOfWeek(now, { weekStartsOn: 1 })); };
  const setToday = () => { setFromDate(now); setToDate(now); };

  const ActiveComp = REPORTS.find((r) => r.key === active)!.Comp;

  return (
    <AdminLayout title="Reports">
      <div className="space-y-6 max-w-5xl">
        {/* Date range selector */}
        <div className="bg-card rounded-lg border border-border p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            {[
              { label: 'From', value: fromDate, set: setFromDate },
              { label: 'To', value: toDate, set: setToDate },
            ].map((f) => (
              <div key={f.label}>
                <label className="block text-[13px] font-medium text-muted-foreground mb-1">{f.label}</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-[160px] justify-start text-left font-normal h-10')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(f.value, 'dd MMM yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={f.value} onSelect={(d) => d && f.set(d)} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={setToday}>Today</Button>
            <Button variant="outline" size="sm" onClick={setThisWeek}>This Week</Button>
            <Button variant="outline" size="sm" onClick={setThisMonth}>This Month</Button>
            <Button variant="outline" size="sm" onClick={setLastMonth}>Last Month</Button>
            <Button
              onClick={() => setApplied(toRange(fromDate, toDate))}
              className="h-11 px-6 rounded-[6px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Generate Report
            </Button>
          </div>
          <p className="text-[13px]" style={{ color: MUTED }}>
            Showing {format(new Date(applied.fromISO), 'dd MMM yyyy')} – {format(new Date(applied.toISO), 'dd MMM yyyy')}
          </p>
        </div>

        {/* Report selector */}
        <div className="flex flex-wrap gap-2">
          {REPORTS.map((r) => (
            <button
              key={r.key}
              onClick={() => setActive(r.key)}
              className="text-sm font-semibold rounded-full px-4 py-2 transition-colors"
              style={active === r.key
                ? { background: '#1B3A4B', color: 'white' }
                : { background: '#F1F5F9', color: '#334155' }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Active report */}
        <ActiveComp venueId={venueId} fromISO={applied.fromISO} toISO={applied.toISO} />
      </div>
    </AdminLayout>
  );
}
