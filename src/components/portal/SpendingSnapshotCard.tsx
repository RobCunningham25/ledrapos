import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { Skeleton } from '@/components/ui/skeleton';
import { startOfMonth } from 'date-fns';

interface SpendingSnapshot {
  totalSpend: number;
  tabsClosed: number;
  topProduct: string | null;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--portal-card-bg)', borderRadius: 'var(--portal-card-radius)', border: `1px solid var(--portal-card-border)`,
  boxShadow: 'var(--portal-card-shadow)', padding: 20,
};

export default function SpendingSnapshotCard({ memberId, venueId }: { memberId: string; venueId: string }) {
  const [data, setData] = useState<SpendingSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!memberId || !venueId) return;
    let cancelled = false;

    const fetch = async () => {
      const monthStart = startOfMonth(new Date()).toISOString();

      const { data: closedTabs } = await supabase
        .from('tabs')
        .select('id')
        .eq('member_id', memberId)
        .eq('venue_id', venueId)
        .eq('status', 'CLOSED')
        .gte('closed_at', monthStart);

      if (cancelled) return;

      const tabIds = (closedTabs || []).map(t => t.id);
      const tabsClosed = tabIds.length;

      if (tabIds.length === 0) {
        setData({ totalSpend: 0, tabsClosed: 0, topProduct: null });
        setIsLoading(false);
        return;
      }

      const { data: items } = await supabase
        .from('tab_items')
        .select('line_total_cents, qty, product_id')
        .eq('venue_id', venueId)
        .in('tab_id', tabIds);

      if (cancelled) return;

      const totalSpend = (items || []).reduce((s, i) => s + i.line_total_cents, 0);

      const qtyMap = new Map<string, number>();
      (items || []).forEach(i => {
        qtyMap.set(i.product_id, (qtyMap.get(i.product_id) || 0) + i.qty);
      });

      let topProductName: string | null = null;
      if (qtyMap.size > 0) {
        const topId = [...qtyMap.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const { data: prod } = await supabase
          .from('liquor_products')
          .select('name')
          .eq('id', topId)
          .maybeSingle();
        if (!cancelled) topProductName = prod?.name || null;
      }

      if (!cancelled) {
        setData({ totalSpend, tabsClosed, topProduct: topProductName });
        setIsLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [memberId, venueId]);

  if (isLoading) {
    return (
      <div style={cardStyle}>
        <Skeleton className="h-4 w-[100px] mb-4" />
        <Skeleton className="h-6 w-[80px] mb-3" />
        <Skeleton className="h-6 w-[60px] mb-3" />
        <Skeleton className="h-6 w-[120px]" />
      </div>
    );
  }

  if (!data || (data.tabsClosed === 0)) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--portal-text-muted)' }}>No activity this month</p>
      </div>
    );
  }

  const stats = [
    { label: 'Spent', value: formatCents(data.totalSpend), size: 20 },
    { label: 'Tabs', value: String(data.tabsClosed), size: 20 },
    { label: 'Most Ordered', value: data.topProduct || '—', size: 15, muted: !data.topProduct },
  ];

  return (
    <div style={cardStyle}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text-primary)', marginBottom: 16 }}>This Month</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {stats.map(s => (
          <div key={s.label}>
            <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: 0 }}>{s.label}</p>
            <p style={{
              fontSize: s.size, fontWeight: s.size === 15 ? 600 : 700,
              color: s.muted ? 'var(--portal-text-muted)' : 'var(--portal-text-primary)', margin: '2px 0 0',
            }}>{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
