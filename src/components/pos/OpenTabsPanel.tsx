import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useCart } from '@/contexts/CartContext';
import { formatCents } from '@/utils/currency';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wallet, RefreshCw, CheckCircle } from 'lucide-react';

interface OpenTab {
  id: string;
  member_id: string | null;
  is_cash_customer: boolean;
  cash_customer_name: string | null;
  status: string;
  opened_at: string | null;
  member_first_name?: string;
  member_last_name?: string;
  membership_number?: string;
  partner_first_name?: string | null;
  item_count: number;
  total_cents: number;
}

export default function OpenTabsPanel() {
  const { venueId } = useVenue();
  const { selectMember, selectCashTab, openTabsRefetchTrigger } = useCart();
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTabs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tabs')
      .select('id, member_id, is_cash_customer, cash_customer_name, status, opened_at, members(first_name, last_name, membership_number, partner_first_name)')
      .eq('venue_id', venueId)
      .eq('status', 'OPEN')
      .order('opened_at', { ascending: false });

    if (data) {
      const tabIds = data.map((t: any) => t.id);
      let itemMap: Record<string, { count: number; total: number }> = {};
      if (tabIds.length > 0) {
        const { data: items } = await supabase
          .from('tab_items')
          .select('tab_id, qty, line_total_cents')
          .in('tab_id', tabIds);

        (items || []).forEach((i: any) => {
          if (!itemMap[i.tab_id]) itemMap[i.tab_id] = { count: 0, total: 0 };
          itemMap[i.tab_id].count += i.qty;
          itemMap[i.tab_id].total += i.line_total_cents;
        });
      }

      // Filter out cash customer tabs with no items (ghost tabs)
      const mapped = data.map((t: any) => ({
        id: t.id,
        member_id: t.member_id,
        is_cash_customer: t.is_cash_customer,
        cash_customer_name: t.cash_customer_name,
        status: t.status,
        opened_at: t.opened_at,
        member_first_name: t.members?.first_name,
        member_last_name: t.members?.last_name,
        membership_number: t.members?.membership_number,
        partner_first_name: t.members?.partner_first_name,
        item_count: itemMap[t.id]?.count || 0,
        total_cents: itemMap[t.id]?.total || 0,
      })).filter((t: OpenTab) => !t.is_cash_customer || t.item_count > 0);

      setTabs(mapped);
    }
    setLoading(false);
  }, [venueId]);

  useEffect(() => {
    fetchTabs();
  }, [fetchTabs, openTabsRefetchTrigger]);

  useEffect(() => {
    const id = setInterval(fetchTabs, 30000);
    return () => clearInterval(id);
  }, [fetchTabs]);

  const handleSelectTab = (tab: OpenTab) => {
    if (tab.is_cash_customer) {
      selectCashTab({
        id: tab.id,
        member_id: null,
        is_cash_customer: true,
        cash_customer_name: tab.cash_customer_name,
        status: tab.status,
        opened_at: tab.opened_at,
      });
    } else if (tab.member_id && tab.member_first_name && tab.member_last_name) {
      selectMember({
        id: tab.member_id,
        firstName: tab.member_first_name,
        lastName: tab.member_last_name,
        membershipNumber: tab.membership_number || '',
      });
    }
  };

  const getInitials = (first: string, last: string) =>
    `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

  if (tabs.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <CheckCircle className="h-12 w-12 mb-3 text-emerald-400" />
        <p className="text-base font-semibold text-foreground">No open tabs</p>
        <p className="text-sm mt-1">Search for a member to start a new tab</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-primary">Open Tabs</span>
          <span className="text-sm text-muted-foreground">{tabs.length} open</span>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchTabs} disabled={loading} className="h-9 w-9">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Tab cards grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="grid grid-cols-2 gap-3">
          {tabs.map(tab => {
            const openedTime = tab.opened_at
              ? new Date(tab.opened_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
              : '';
            const displayFirst = tab.partner_first_name
              ? `${tab.member_first_name} & ${tab.partner_first_name}`
              : tab.member_first_name;
            const name = tab.is_cash_customer
              ? (tab.cash_customer_name || 'Cash Customer')
              : `${displayFirst} ${tab.member_last_name}`;
            const isEmpty = tab.total_cents === 0;

            return (
              <button
                key={tab.id}
                onClick={() => handleSelectTab(tab)}
                className="bg-card border border-border rounded-lg p-4 text-left transition-transform duration-100 active:scale-[0.97] hover:border-primary/30"
              >
                <div className="flex items-center gap-3 mb-2">
                  {tab.is_cash_customer ? (
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary-foreground">
                        {getInitials(tab.member_first_name || '', tab.member_last_name || '')}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {tab.is_cash_customer ? 'Cash Customer' : tab.membership_number}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {tab.item_count > 0 ? (
                      <Badge variant="secondary" className="text-xs">{tab.item_count} items</Badge>
                    ) : null}
                    {isEmpty && (
                      <span className="text-xs font-medium text-warning">Empty tab</span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-primary">{formatCents(tab.total_cents)}</span>
                </div>
                {openedTime && (
                  <p className="text-xs text-muted-foreground mt-2">Opened {openedTime}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
