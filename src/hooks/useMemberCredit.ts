import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useMemberCredit(memberId: string | null, venueId: string) {
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!memberId) { setBalance(0); return; }
    setIsLoading(true);
    const { data } = await supabase
      .from('member_credits')
      .select('amount_cents, type')
      .eq('member_id', memberId)
      .eq('venue_id', venueId);

    if (data) {
      const bal = data.reduce((sum, r) => sum + (r.type === 'CREDIT' ? r.amount_cents : -r.amount_cents), 0);
      setBalance(bal);
    }
    setIsLoading(false);
  }, [memberId, venueId]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  return { balance, isLoading, refetch: fetchBalance };
}
