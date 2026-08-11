import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { Skeleton } from '@/components/ui/skeleton';
import { Landmark } from 'lucide-react';
import ClubRatesModal from './ClubRatesModal';

// Club-account position (subs, levies, mooring fees) imported from the club's
// accounting system. This is a statement snapshot as at a date — not live, and
// not the bar tab or POS credit balance.
export default function ClubAccountCard({ memberId, venueId }: { memberId: string; venueId: string }) {
  const [showRates, setShowRates] = useState(false);
  const { data, isLoading, fetchStatus } = useQuery({
    queryKey: ['portal-club-balance', venueId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_club_balances')
        .select('total_due_cents, as_of_date')
        .eq('venue_id', venueId)
        .eq('member_id', memberId)
        .order('as_of_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!venueId && !!memberId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const showLoading = isLoading && fetchStatus !== 'idle';

  const asAt = data
    ? new Date(data.as_of_date + 'T00:00:00').toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;

  const owed = data?.total_due_cents ?? 0;

  return (
    <div style={{
      background: 'var(--portal-card-bg)', border: `1px solid var(--portal-card-border)`, borderRadius: 'var(--portal-card-radius)',
      padding: 20, boxShadow: 'var(--portal-card-shadow)',
    }}>
      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--portal-text-primary)' }}>Club Account</span>

      {showLoading ? (
        <Skeleton className="h-8 w-[140px] mt-2" />
      ) : !data ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
          <Landmark size={40} color="var(--portal-card-border)" />
          <p style={{ fontSize: 14, color: 'var(--portal-text-muted)', marginTop: 8 }}>No statement available yet</p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: '8px 0 0' }}>
            {owed > 0 ? 'Amount owing to the club' : owed < 0 ? 'Your account is in credit' : 'Nothing owing'}
          </p>
          <p style={{
            fontSize: 28, fontWeight: 700, margin: '4px 0 0',
            color: owed > 0 ? 'var(--portal-danger)' : 'var(--portal-accent)',
          }}>
            {formatCents(Math.abs(owed))}
          </p>
          <p style={{ fontSize: 13, color: 'var(--portal-text-secondary)', margin: '10px 0 0' }}>
            Statement balance as at <strong>{asAt}</strong> — subs, levies and other club fees.
            Payments made after this date are not yet reflected.
          </p>
        </>
      )}

      {!showLoading && (
        <button onClick={() => setShowRates(true)} style={{
          marginTop: 14, width: '100%', height: 40,
          background: 'transparent', color: 'var(--portal-accent)',
          border: `1px solid var(--portal-accent)`, borderRadius: 'var(--portal-button-radius)',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          See current rates
        </button>
      )}

      {showRates && <ClubRatesModal venueId={venueId} onClose={() => setShowRates(false)} />}
    </div>
  );
}
