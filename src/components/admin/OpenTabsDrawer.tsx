import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { useVenueNav } from '@/hooks/useVenueNav';

interface OpenTabRow {
  id: string;
  member_id: string | null;
  is_cash_customer: boolean;
  cash_customer_name: string | null;
  opened_at: string;
  member_first_name: string | null;
  member_last_name: string | null;
  membership_number: string | null;
  item_count: number;
  total_cents: number;
  paid_cents: number;
  outstanding_cents: number;
}

interface OpenTabsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
}

export default function OpenTabsDrawer({ isOpen, onClose, venueId }: OpenTabsDrawerProps) {
  const navigate = useNavigate();
  const { adminPath } = useVenueNav();
  const [loading, setLoading] = useState(false);
  const [tabs, setTabs] = useState<OpenTabRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      type TabQueryRow = {
        id: string;
        member_id: string | null;
        is_cash_customer: boolean | null;
        cash_customer_name: string | null;
        opened_at: string;
        members: {
          first_name: string | null;
          last_name: string | null;
          membership_number: string | null;
        } | null;
      };

      const { data: tabRows, error: tabsErr } = await supabase
        .from('tabs')
        .select(
          'id, member_id, is_cash_customer, cash_customer_name, opened_at, members(first_name, last_name, membership_number)'
        )
        .eq('venue_id', venueId)
        .eq('status', 'OPEN')
        .order('opened_at', { ascending: false })
        .returns<TabQueryRow[]>();

      if (cancelled) return;
      if (tabsErr) {
        setError('Failed to load open tabs.');
        setLoading(false);
        return;
      }

      const tabIds = (tabRows ?? []).map((t) => t.id);
      const itemMap: Record<string, { count: number; total: number }> = {};
      const paidMap: Record<string, number> = {};

      if (tabIds.length > 0) {
        const [itemsRes, pmtsRes] = await Promise.all([
          supabase
            .from('tab_items')
            .select('tab_id, qty, line_total_cents')
            .in('tab_id', tabIds)
            .returns<{ tab_id: string; qty: number | null; line_total_cents: number | null }[]>(),
          supabase
            .from('payments')
            .select('tab_id, amount_cents')
            .in('tab_id', tabIds)
            .returns<{ tab_id: string; amount_cents: number | null }[]>(),
        ]);

        if (cancelled) return;
        if (itemsRes.error || pmtsRes.error) {
          setError('Failed to load tab details.');
          setLoading(false);
          return;
        }

        (itemsRes.data ?? []).forEach((i) => {
          if (!itemMap[i.tab_id]) itemMap[i.tab_id] = { count: 0, total: 0 };
          itemMap[i.tab_id].count += i.qty ?? 0;
          itemMap[i.tab_id].total += i.line_total_cents ?? 0;
        });
        (pmtsRes.data ?? []).forEach((p) => {
          paidMap[p.tab_id] = (paidMap[p.tab_id] ?? 0) + (p.amount_cents ?? 0);
        });
      }

      const mapped: OpenTabRow[] = (tabRows ?? [])
        .map((t) => {
          const totalCents = itemMap[t.id]?.total ?? 0;
          const paidCents = paidMap[t.id] ?? 0;
          return {
            id: t.id,
            member_id: t.member_id,
            is_cash_customer: !!t.is_cash_customer,
            cash_customer_name: t.cash_customer_name,
            opened_at: t.opened_at,
            member_first_name: t.members?.first_name ?? null,
            member_last_name: t.members?.last_name ?? null,
            membership_number: t.members?.membership_number ?? null,
            item_count: itemMap[t.id]?.count ?? 0,
            total_cents: totalCents,
            paid_cents: paidCents,
            outstanding_cents: Math.max(0, totalCents - paidCents),
          };
        })
        .filter((t) => !t.is_cash_customer || t.item_count > 0);

      setTabs(mapped);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, venueId]);

  if (!isOpen) return null;

  const totalOutstanding = tabs.reduce((s, t) => s + t.outstanding_cents, 0);

  const goToMember = (memberId: string) => {
    onClose();
    navigate(adminPath(`members/${memberId}`));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[520px] h-full bg-card shadow-lg flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Open Bar Tabs</h3>
            {!loading && !error && tabs.length > 0 && (
              <p style={{ fontSize: 13, color: '#718096', marginTop: 2 }}>
                {tabs.length} open · {formatCents(totalOutstanding)} outstanding
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && error && (
            <p style={{ padding: 24, fontSize: 14, color: '#DC2626' }}>{error}</p>
          )}

          {!loading && !error && tabs.length === 0 && (
            <p style={{ padding: 24, fontSize: 14, color: '#94A3B8' }}>No open tabs</p>
          )}

          {!loading && !error && tabs.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {tabs.map((t) => {
                const name = t.is_cash_customer
                  ? t.cash_customer_name || 'Cash customer'
                  : `${t.member_first_name ?? ''} ${t.member_last_name ?? ''}`.trim() || 'Member';
                const subtitle = t.is_cash_customer
                  ? 'Cash customer'
                  : t.membership_number ?? '';
                const clickable = !t.is_cash_customer && !!t.member_id;

                return (
                  <li
                    key={t.id}
                    onClick={clickable ? () => goToMember(t.member_id!) : undefined}
                    style={{
                      padding: '14px 24px',
                      borderBottom: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      cursor: clickable ? 'pointer' : 'default',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      if (clickable) e.currentTarget.style.background = '#F8FAFC';
                    }}
                    onMouseLeave={(e) => {
                      if (clickable) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: '#1A202C',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {name}
                      </div>
                      <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>
                        {subtitle && <span>{subtitle} · </span>}
                        Opened {format(new Date(t.opened_at), 'd MMM yyyy, HH:mm')}
                      </div>
                      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                        {t.item_count} item{t.item_count === 1 ? '' : 's'}
                        {t.paid_cents > 0 && ` · ${formatCents(t.paid_cents)} paid`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#2E5FA3' }}>
                        {formatCents(t.outstanding_cents)}
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>outstanding</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0">
          <Button
            variant="outline"
            className="w-full"
            onClick={onClose}
            style={{ height: 44, borderRadius: 6, fontWeight: 500 }}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
