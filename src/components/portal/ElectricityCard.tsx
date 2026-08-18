import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { Skeleton } from '@/components/ui/skeleton';
import { Zap } from 'lucide-react';
import ElectricityHistoryModal from './ElectricityHistoryModal';

export const ELECTRICITY_QUERY_KEY = 'portal-electricity';

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

// Prepaid meter purchases imported weekly from the club's "Sales Per Meter"
// export. A member can hold more than one meter (permanent site + boat shed,
// say), so purchases for the same month across meters are summed client-side.
export default function ElectricityCard({ memberId, venueId }: { memberId: string; venueId: string }) {
  const [showHistory, setShowHistory] = useState(false);

  const { data: rows, isLoading, fetchStatus } = useQuery({
    queryKey: [ELECTRICITY_QUERY_KEY, venueId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('electricity_purchases')
        .select('period_month, as_of_date, amount_cents')
        .eq('venue_id', venueId)
        .eq('member_id', memberId)
        .order('period_month', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!venueId && !!memberId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const monthly = useMemo(() => {
    const map = new Map<string, { amount_cents: number; as_of_date: string }>();
    for (const r of rows ?? []) {
      const existing = map.get(r.period_month);
      if (existing) {
        existing.amount_cents += r.amount_cents;
        if (r.as_of_date > existing.as_of_date) existing.as_of_date = r.as_of_date;
      } else {
        map.set(r.period_month, { amount_cents: r.amount_cents, as_of_date: r.as_of_date });
      }
    }
    return Array.from(map.entries())
      .map(([period_month, v]) => ({ period_month, ...v }))
      .sort((a, b) => b.period_month.localeCompare(a.period_month));
  }, [rows]);

  const showLoading = isLoading && fetchStatus !== 'idle';
  const thisMonth = monthly.find(m => m.period_month === currentMonthKey());
  const lifetimeCents = monthly.reduce((sum, m) => sum + m.amount_cents, 0);

  const asAt = thisMonth
    ? new Date(thisMonth.as_of_date + 'T00:00:00').toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;

  return (
    <div style={{
      background: 'var(--portal-card-bg)', border: `1px solid var(--portal-card-border)`, borderRadius: 'var(--portal-card-radius)',
      padding: 20, boxShadow: 'var(--portal-card-shadow)',
    }}>
      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--portal-text-primary)' }}>Electricity</span>

      {showLoading ? (
        <Skeleton className="h-8 w-[140px] mt-2" />
      ) : monthly.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
          <Zap size={40} color="var(--portal-card-border)" />
          <p style={{ fontSize: 14, color: 'var(--portal-text-muted)', marginTop: 8, textAlign: 'center' }}>
            Your prepaid meter isn't linked to your account yet — check back soon.
          </p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: '8px 0 0' }}>
            Purchased this month
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, margin: '4px 0 0', color: 'var(--portal-text-primary)' }}>
            {formatCents(thisMonth?.amount_cents ?? 0)}
          </p>
          {asAt && (
            <p style={{ fontSize: 13, color: 'var(--portal-text-secondary)', margin: '10px 0 0' }}>
              As at <strong>{asAt}</strong>. Updated weekly.
            </p>
          )}
        </>
      )}

      {!showLoading && monthly.length > 0 && (
        <button onClick={() => setShowHistory(true)} style={{
          marginTop: 14, width: '100%', height: 40,
          background: 'transparent', color: 'var(--portal-accent)',
          border: `1px solid var(--portal-accent)`, borderRadius: 'var(--portal-button-radius)',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          View history
        </button>
      )}

      {showHistory && (
        <ElectricityHistoryModal
          monthly={monthly}
          lifetimeCents={lifetimeCents}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
