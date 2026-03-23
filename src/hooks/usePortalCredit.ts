import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function usePortalCredit(memberId: string, venueId: string) {
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetch = useCallback(async (silent = false) => {
    if (!memberId || !venueId) return;
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
    setHasFetched(true);
  }, [memberId, venueId]);

  useEffect(() => { fetch(); }, [fetch]);

  // isLoading is true only during active fetch, not when params are missing
  const effectiveLoading = (!memberId || !venueId) ? false : (isLoading && !hasFetched);

  return { balance, isLoading: effectiveLoading, refetch: fetch };
}
