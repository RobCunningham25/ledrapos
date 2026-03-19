import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useCart } from '@/contexts/CartContext';
import { formatCents } from '@/utils/currency';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  item_count: number;
  total_cents: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function OpenTabsModal({ open, onClose }: Props) {
  const { venueId } = useVenue();
  const { selectMember, clearActiveTab } = useCart();
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTabs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tabs')
      .select('id, member_id, is_cash_customer, cash_customer_name, status, opened_at, members(first_name, last_name, membership_number)')
      .eq('venue_id', venueId)
      .eq('status', 'OPEN')
      .order('opened_at', { ascending: false });

    if (data) {
      // Fetch item counts and totals for each tab
      const tabIds = data.map((t: any) => t.id);
      const { data: items } = await supabase
        .from('tab_items')
        .select('tab_id, qty, line_total_cents')
        .in('tab_id', tabIds);

      const itemMap: Record<string, { count: number; total: number }> = {};
      (items || []).forEach((i: any) => {
        if (!itemMap[i.tab_id]) itemMap[i.tab_id] = { count: 0, total: 0 };
        itemMap[i.tab_id].count += i.qty;
        itemMap[i.tab_id].total += i.line_total_cents;
      });

      setTabs(data.map((t: any) => ({
        id: t.id,
        member_id: t.member_id,
        is_cash_customer: t.is_cash_customer,
        cash_customer_name: t.cash_customer_name,
        status: t.status,
        opened_at: t.opened_at,
        member_first_name: t.members?.first_name,
        member_last_name: t.members?.last_name,
        membership_number: t.members?.membership_number,
        item_count: itemMap[t.id]?.count || 0,
        total_cents: itemMap[t.id]?.total || 0,
      })));
    }
    setLoading(false);
  }, [venueId]);

  useEffect(() => {
    if (open) fetchTabs();
  }, [open, fetchTabs]);

  // Auto refresh every 30s
  useEffect(() => {
    if (!open) return;
    const id = setInterval(fetchTabs, 30000);
    return () => clearInterval(id);
  }, [open, fetchTabs]);

  const handleSelectTab = (tab: OpenTab) => {
    clearActiveTab();
    if (tab.is_cash_customer) {
      // For cash customers, we need a different flow — set state directly via context isn't exposed
      // We'll use selectMember with a pseudo-member approach? No — use the cart context properly.
      // Actually for cash customers we set the state manually. Let's just close and
      // let the caller handle it. For now, select member if available.
    }
    if (tab.member_id && tab.member_first_name && tab.member_last_name) {
      selectMember({
        id: tab.member_id,
        firstName: tab.member_first_name,
        lastName: tab.member_last_name,
        membershipNumber: tab.membership_number || '',
      });
    }
    onClose();
  };

  const getInitials = (first: string, last: string) =>
    `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[640px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Open Tabs</DialogTitle>
            <Button variant="ghost" size="icon" onClick={fetchTabs} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {tabs.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CheckCircle className="h-10 w-10 mb-3" />
              <p className="text-sm">No open tabs</p>
            </div>
          )}

          {tabs.map(tab => {
            const openedTime = tab.opened_at
              ? new Date(tab.opened_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
              : '';
            const name = tab.is_cash_customer
              ? (tab.cash_customer_name || 'Cash Customer')
              : `${tab.member_first_name} ${tab.member_last_name}`;

            return (
              <button
                key={tab.id}
                onClick={() => handleSelectTab(tab)}
                className="w-full flex items-center gap-3 px-3 py-3 min-h-[56px] hover:bg-accent/50 active:bg-accent transition-colors text-left border-b border-border"
              >
                {tab.is_cash_customer ? (
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Wallet className="h-5 w-5 text-muted-foreground" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary-foreground">
                      {getInitials(tab.member_first_name || '', tab.member_last_name || '')}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tab.is_cash_customer ? 'Walk-in' : tab.membership_number}
                    {openedTime && ` • Opened ${openedTime}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {tab.item_count > 0 && (
                    <Badge variant="secondary" className="text-xs">{tab.item_count} items</Badge>
                  )}
                  <span className="text-sm font-bold text-primary">{formatCents(tab.total_cents)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
