import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/** Yoco rejects checkouts below R2.00 — anything smaller must be settled at the bar. */
export const MIN_ONLINE_PAYMENT_CENTS = 200;

interface UsePayTabArgs {
  memberId: string;
  venueId: string;
  venueSlug: string;
  tabId: string | null;
  amountCents: number;
}

/**
 * Shared "pay my open tab by card" flow — opens a confirmation dialog, then
 * redirects to a Yoco checkout session for the outstanding amount.
 * Used by both the portal dashboard hero card and the Bar Tab page.
 */
export function usePayTab({ memberId, venueId, venueSlug, tabId, amountCents }: UsePayTabArgs) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const canPay = !!tabId && amountCents >= MIN_ONLINE_PAYMENT_CENTS;

  const openDialog = useCallback(() => setIsOpen(true), []);
  const closeDialog = useCallback(() => setIsOpen(false), []);

  const confirmPay = useCallback(async () => {
    if (!canPay) return;
    setIsPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          member_id: memberId,
          venue_id: venueId,
          venue_slug: venueSlug,
          purpose: 'tab_payment',
          amount_cents: amountCents,
          tab_id: tabId,
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to create checkout');
      window.location.href = data.redirect_url;
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
      setIsPaying(false);
      setIsOpen(false);
    }
  }, [canPay, memberId, venueId, venueSlug, amountCents, tabId]);

  return { isOpen, openDialog, closeDialog, isPaying, confirmPay, canPay };
}
