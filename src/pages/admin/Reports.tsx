import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useVenue } from '@/contexts/VenueContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { getCategoryLabel, CATEGORY_COLORS } from '@/constants/productCategories';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ReportData {
  totalRevenue: number;
  cashCollected: number;
  cardCollected: number;
  creditRedeemed: number;
  tabsClosed: number;
  openTabsCount: number;
  topProducts: {
    product_name: string;
    category: string;
    units_sold: number;
    revenue: number;
  }[];
}

interface InventoryRow {
  name: string;
  category: string;
  stock_level: number;
  min_stock_level: number;
}

export default function Reports() {
  const { venueId } = useVenue();
  const now = new Date();
  const [fromDate, setFromDate] = useState<Date>(startOfMonth(now));
  const [toDate, setToDate] = useState<Date>(endOfMonth(now));
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);

  const setThisMonth = () => {
    setFromDate(startOfMonth(now));
    setToDate(endOfMonth(now));
  };
  const setLastMonth = () => {
    const last = subMonths(now, 1);
    setFromDate(startOfMonth(last));
    setToDate(endOfMonth(last));
  };

  const generateReport = async () => {
    setLoading(true);
    const fromISO = format(fromDate, 'yyyy-MM-dd') + 'T00:00:00';
    const toISO = format(toDate, 'yyyy-MM-dd') + 'T23:59:59';

    try {
      // Payments query
      const { data: payments } = await supabase
        .from('payments')
        .select('amount_cents, method')
        .eq('venue_id', venueId)
        .gte('paid_at', fromISO)
        .lte('paid_at', toISO);

      const totalRevenue = (payments ?? []).reduce((s, p) => s + p.amount_cents, 0);
      const cashCollected = (payments ?? []).filter(p => p.method === 'CASH').reduce((s, p) => s + p.amount_cents, 0);
      const cardCollected = (payments ?? []).filter(p => p.method === 'CARD').reduce((s, p) => s + p.amount_cents, 0);
      const creditRedeemed = (payments ?? []).filter(p => p.method === 'CREDIT').reduce((s, p) => s + p.amount_cents, 0);

      // Open tabs count
      const { count: openTabsCount } = await supabase
        .from('tabs')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .eq('status', 'OPEN');

      // Closed tabs count in period
      const { count: tabsClosed } = await supabase
        .from('tabs')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .eq('status', 'CLOSED')
        .gte('closed_at', fromISO)
        .lte('closed_at', toISO);

      // Top products: get closed tab ids in range, then tab_items
      const { data: closedTabs } = await supabase
        .from('tabs')
        .select('id')
        .eq('venue_id', venueId)
        .eq('status', 'CLOSED')
        .gte('closed_at', fromISO)
        .lte('closed_at', toISO);

      const closedTabIds = (closedTabs ?? []).map(t => t.id);

      let topProducts: ReportData['topProducts'] = [];
      if (closedTabIds.length > 0) {
        const { data: items } = await supabase
          .from('tab_items')
          .select('product_id, qty, line_total_cents, liquor_products(name, category)')
          .eq('venue_id', venueId)
          .in('tab_id', closedTabIds);

        const productMap = new Map<string, { product_name: string; category: string; units_sold: number; revenue: number }>();
        for (const item of items ?? []) {
          const prod = item.liquor_products as any;
          const existing = productMap.get(item.product_id);
          if (existing) {
            existing.units_sold += item.qty;
            existing.revenue += item.line_total_cents;
          } else {
            productMap.set(item.product_id, {
              product_name: prod?.name ?? 'Unknown',
              category: prod?.category ?? 'other',
              units_sold: item.qty,
              revenue: item.line_total_cents,
            });
          }
        }
        topProducts = Array.from(productMap.values())
          .sort((a, b) => b.units_sold - a.units_sold)
          .slice(0, 20);
      }

      setReport({
        totalRevenue,
        cashCollected,
        cardCollected,
        creditRedeemed,
        tabsClosed: tabsClosed ?? 0,
        openTabsCount: openTabsCount ?? 0,
        topProducts,
      });

      // Inventory (always current)
      if (!inventoryLoaded) {
        const { data: inv } = await supabase
          .from('liquor_products')
          .select('name, category, stock_level, min_stock_level')
          .eq('venue_id', venueId)
          .eq('is_active', true)
          .order('category', { ascending: true })
          .order('name', { ascending: true });
        setInventory(inv ?? []);
        setInventoryLoaded(true);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const stockStatus = (stock: number, min: number) => {
    if (stock === 0) return { label: 'Out of Stock', bg: '#7B0000' };
    if (stock <= min) return { label: 'Low Stock', bg: '#C0392B' };
    return { label: 'OK', bg: '#1E8449' };
  };

  return (
    <AdminLayout title="Reports">
      <div className="space-y-6 max-w-5xl">
        {/* Date range selector */}
        <div className="bg-card rounded-lg border border-border p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">From</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[160px] justify-start text-left font-normal h-10')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(fromDate, 'dd MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={fromDate} onSelect={(d) => d && setFromDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">To</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[160px] justify-start text-left font-normal h-10')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(toDate, 'dd MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={toDate} onSelect={(d) => d && setToDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={setThisMonth}>This Month</Button>
            <Button variant="outline" size="sm" onClick={setLastMonth}>Last Month</Button>
            <Button
              onClick={generateReport}
              disabled={loading}
              className="h-12 px-6 rounded-[6px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? 'Generating…' : 'Generate Report'}
            </Button>
          </div>
        </div>

        {report && (
          <>
            {/* Open tabs warning */}
            {report.openTabsCount > 0 && (
              <div className="flex items-start gap-3 rounded-[6px] border px-4 py-3" style={{ background: '#FEF9C3', borderColor: '#D68910' }}>
                <span className="text-lg leading-none mt-0.5">⚠️</span>
                <p className="text-sm" style={{ color: '#92400E' }}>
                  {report.openTabsCount} open tab(s) not yet settled. The report below reflects only closed tabs. Settle all open tabs for a complete month-end picture.
                </p>
              </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Revenue', value: report.totalRevenue },
                { label: 'Cash Collected', value: report.cashCollected },
                { label: 'Card Collected', value: report.cardCollected },
                { label: 'Credit Redeemed', value: report.creditRedeemed },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="bg-card rounded-lg border border-border p-5"
                  style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                >
                  <p className="text-[13px] font-medium" style={{ color: '#718096' }}>{kpi.label}</p>
                  <p className="text-[28px] font-bold mt-1" style={{ color: '#1A202C' }}>{formatCents(kpi.value)}</p>
                </div>
              ))}
            </div>

            {/* Tabs closed */}
            <p className="text-base font-medium" style={{ color: '#1A202C' }}>
              Tabs closed this period: {report.tabsClosed}
            </p>

            {/* Top Products */}
            <div>
              <h3 className="text-lg font-semibold mb-3" style={{ color: '#1A202C' }}>Top Products</h3>
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: '#F4F6F9' }}>
                      {['#', 'Product', 'Category', 'Units Sold', 'Revenue'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[13px] font-semibold uppercase" style={{ color: '#718096' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.topProducts.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No sales data for this period</td></tr>
                    ) : (
                      report.topProducts.map((p, i) => (
                        <tr key={i} className="h-12 text-sm" style={{ background: i % 2 === 1 ? '#FAFAFA' : 'white', color: '#1A202C' }}>
                          <td className="px-4">{i + 1}</td>
                          <td className="px-4 font-medium">{p.product_name}</td>
                          <td className="px-4">
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: CATEGORY_COLORS[p.category] ?? '#6B7280' }}>
                              {getCategoryLabel(p.category)}
                            </span>
                          </td>
                          <td className="px-4">{p.units_sold}</td>
                          <td className="px-4">{formatCents(p.revenue)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Inventory — always shown once loaded */}
        {inventoryLoaded && (
          <div>
            <h3 className="text-lg font-semibold mb-1" style={{ color: '#1A202C' }}>Inventory</h3>
            <p className="text-[13px] italic mb-3" style={{ color: '#718096' }}>
              This report reflects current stock levels at time of viewing, not historical stock at period end.
            </p>
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: '#F4F6F9' }}>
                    {['Product', 'Category', 'Current Stock', 'Min Stock', 'Status'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[13px] font-semibold uppercase" style={{ color: '#718096' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item, i) => {
                    const s = stockStatus(item.stock_level, item.min_stock_level);
                    return (
                      <tr key={i} className="h-12 text-sm" style={{ background: i % 2 === 1 ? '#FAFAFA' : 'white', color: '#1A202C' }}>
                        <td className="px-4 font-medium">{item.name}</td>
                        <td className="px-4">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: CATEGORY_COLORS[item.category] ?? '#6B7280' }}>
                            {getCategoryLabel(item.category)}
                          </span>
                        </td>
                        <td className="px-4">{item.stock_level}</td>
                        <td className="px-4">{item.min_stock_level}</td>
                        <td className="px-4">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: s.bg }}>
                            {s.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Email Report button */}
        <Button
          className="w-full h-12 rounded-[6px] font-semibold text-base"
          style={{ background: '#1E8449', color: 'white' }}
          onClick={() => toast.info('Email delivery not yet configured — coming soon.')}
        >
          ✉️ Email Report
        </Button>
      </div>
    </AdminLayout>
  );
}
