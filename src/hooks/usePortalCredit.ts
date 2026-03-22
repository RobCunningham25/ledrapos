import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function usePortalCredit(memberId: string, venueId: string) {
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async (silent = false) => {
    if (!memberId) return;
    if (!silent) setIsLoading(true);
    const { data } = await supabase
      .from('member_credits')
      .select('amount_cents, type')
      .eq('member_id', memberId)
      .eq('venue_id', venueId);
    if (data) {
      const bal = data.reduce((s, r) => s + (r.type === 'CREDIT' ? r.amount_cents : -r.amount_cents), 0);
      setBalance(Math.max(0, bal));
    }
    setIsLoading(false);
  }, [memberId, venueId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { balance, isLoading, refetch: fetch };
}
