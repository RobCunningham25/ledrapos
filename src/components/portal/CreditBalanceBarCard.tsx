import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { PORTAL_THEME as T } from '@/constants/portalTheme';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const cardStyle: React.CSSProperties = {
  background: T.cardBg, borderRadius: 12, border: `1px solid ${T.cardBorder}`,
  boxShadow: T.cardShadow, padding: 20,
};

interface CreditRow {
  type: string;
  description: string | null;
  amount_cents: number;
  created_at: string | null;
}

export default function CreditBalanceBarCard({
  balance, isLoading, onLoadCredit, memberId, venueId,
}: {
  balance: number; isLoading: boolean; onLoadCredit: () => void; memberId: string; venueId: string;
}) {
  const [recentCredits, setRecentCredits] = useState<CreditRow[]>([]);
  const [creditsLoaded, setCreditsLoaded] = useState(false);

  useEffect(() => {
    if (!memberId || !venueId) return;
    let cancelled = false;
    supabase
      .from('member_credits')
      .select('type, description, amount_cents, created_at')
      .eq('member_id', memberId)
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (!cancelled) {
          setRecentCredits(data || []);
          setCreditsLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [memberId, venueId]);

  return (
    <div style={cardStyle}>
      <p style={{ fontSize: 13, fontWeight: 500, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Credit Balance
      </p>
      {isLoading ? (
        <Skeleton className="h-8 w-[120px] mt-1" />
      ) : (
        <p style={{ fontSize: 28, fontWeight: 700, color: T.gold, marginTop: 4 }}>
          {formatCents(balance)}
        </p>
      )}
      <button
        onClick={onLoadCredit}
        style={{
          width: '100%', height: 44, background: T.teal, color: '#FFFFFF',
          fontWeight: 600, fontSize: 15, borderRadius: 10, border: 'none', marginTop: 12, cursor: 'pointer',
        }}
      >
        Load Credit
      </button>

      {creditsLoaded && recentCredits.length > 0 && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${T.cardBorder}`, paddingTop: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Recent Activity
          </p>
          {recentCredits.map((r, i) => {
            const isCredit = r.type === 'CREDIT';
            const color = isCredit ? T.teal : T.danger;
            const Icon = isCredit ? ArrowUpRight : ArrowDownRight;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                <Icon size={14} color={color} style={{ flexShrink: 0 }} />
                <span style={{
                  fontSize: 13, color: T.textSecondary, flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{r.description || (isCredit ? 'Credit' : 'Debit')}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color, whiteSpace: 'nowrap' }}>
                  {isCredit ? '+' : '-'}{formatCents(r.amount_cents)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
