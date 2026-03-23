import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TabItem {
  id: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
  product_name: string;
  category: string;
}

export function usePortalOpenTab(memberId: string, venueId: string) {
  const [items, setItems] = useState<TabItem[] | null>(null);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [totalPaidCents, setTotalPaidCents] = useState(0);
  const [tabId, setTabId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (silent = false) => {
    if (!memberId) return;
    if (!silent) setIsLoading(true);
    setError(null);

    const { data: tabData, error: tabErr } = await supabase
      .from('tabs')
      .select('id, opened_at')
      .eq('member_id', memberId)
      .eq('venue_id', venueId)
      .eq('status', 'OPEN')
      .limit(1)
      .maybeSingle();

    if (tabErr) { setError(tabErr.message); setIsLoading(false); return; }

    if (!tabData) {
      setItems(null); setOpenedAt(null); setTotalPaidCents(0); setTabId(null);
      setIsLoading(false); return;
    }

    setOpenedAt(tabData.opened_at);
    setTabId(tabData.id);

    const [itemsRes, paymentsRes] = await Promise.all([
      supabase.from('tab_items').select('id, qty, unit_price_cents, line_total_cents, product_id')
        .eq('tab_id', tabData.id).eq('venue_id', venueId),
      supabase.from('payments').select('amount_cents').eq('tab_id', tabData.id).eq('venue_id', venueId),
    ]);

    if (itemsRes.data) {
      const productIds = itemsRes.data.map(i => i.product_id);
      const { data: products } = await supabase.from('liquor_products').select('id, name, category').in('id', productIds);
      const pMap = new Map((products || []).map(p => [p.id, p]));
      setItems(
        itemsRes.data.map(i => ({
          id: i.id, qty: i.qty, unit_price_cents: i.unit_price_cents, line_total_cents: i.line_total_cents,
          product_name: pMap.get(i.product_id)?.name || 'Unknown',
          category: pMap.get(i.product_id)?.category || '',
        })).sort((a, b) => a.product_name.localeCompare(b.product_name))
      );
    }

    setTotalPaidCents((paymentsRes.data || []).reduce((s, p) => s + p.amount_cents, 0));
    setIsLoading(false);
  }, [memberId, venueId]);

  useEffect(() => { fetch(); }, [fetch]);

  const tabTotal = items ? items.reduce((s, i) => s + i.line_total_cents, 0) : 0;
  const amountDue = tabTotal - totalPaidCents;

  return { items, openedAt, totalPaidCents, tabId, tabTotal, amountDue, isLoading, error, refetch: fetch };
}
