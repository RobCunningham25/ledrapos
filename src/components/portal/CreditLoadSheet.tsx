import { useState } from 'react';
import { formatCents } from '@/utils/currency';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const QUICK_AMOUNTS = [5000, 10000, 20000, 50000];
const MIN_AMOUNT = 200;

interface CreditLoadSheetProps {
  open: boolean;
  onClose: () => void;
  memberId: string;
  venueId: string;
}

export default function CreditLoadSheet({ open, onClose, memberId, venueId }: CreditLoadSheetProps) {
  const { venueSlug } = useVenue();
  const [selectedQuick, setSelectedQuick] = useState<number | null>(null);
  const [customValue, setCustomValue] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const customCents = customValue ? Math.round(parseFloat(customValue) * 100) : 0;
  const amountCents = selectedQuick ?? (customCents > 0 ? customCents : 0);
  const belowMin = amountCents > 0 && amountCents < MIN_AMOUNT;
  const canConfirm = amountCents >= MIN_AMOUNT && !loading;

  const handleQuickSelect = (amt: number) => {
    setSelectedQuick(amt);
    setCustomValue('');
  };

  const handleCustomChange = (val: string) => {
    setCustomValue(val);
    setSelectedQuick(null);
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { member_id: memberId, venue_id: venueId, venue_slug: venueSlug, purpose: 'credit_load', amount_cents: amountCents },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to create checkout');

      window.location.href = data.redirect_url;
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--portal-card-bg)',
        borderRadius: '16px 16px 0 0', padding: 24, zIndex: 51,
        animation: 'slideUp 200ms ease-out',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* Handle bar */}
        <div style={{ width: 40, height: 4, background: 'var(--portal-card-border)', borderRadius: 2, margin: '0 auto 20px' }} />

        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--portal-text-primary)', marginBottom: 20 }}>Load Credit</p>

        {/* Quick amounts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {QUICK_AMOUNTS.map(amt => (
            <button
              key={amt}
              onClick={() => handleQuickSelect(amt)}
              style={{
                height: 56, border: `2px solid ${selectedQuick === amt ? 'var(--portal-accent)' : 'var(--portal-card-border)'}`,
                borderRadius: 8, background: selectedQuick === amt ? 'rgba(42,157,143,0.06)' : 'var(--portal-card-bg)',
                fontSize: 18, fontWeight: 600, color: 'var(--portal-text-primary)', cursor: 'pointer',
              }}
            >
              {formatCents(amt)}
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', marginTop: 16, marginBottom: 8 }}>Or enter a custom amount</p>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, fontWeight: 600, color: 'var(--portal-text-muted)' }}>R</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={customValue}
            onChange={e => handleCustomChange(e.target.value)}
            style={{
              width: '100%', height: 48, border: `1px solid var(--portal-card-border)`, borderRadius: 6,
              fontSize: 18, fontWeight: 600, paddingLeft: 32, paddingRight: 12,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        {belowMin && (
          <p style={{ fontSize: 13, color: 'var(--portal-danger)', marginTop: 4 }}>Minimum amount is R 2.00</p>
        )}

        {/* Confirm */}
        <button
          disabled={!canConfirm}
          onClick={handleConfirm}
          style={{
            width: '100%', height: 48, background: 'var(--portal-primary)', color: '#FFFFFF',
            fontWeight: 600, fontSize: 16, borderRadius: 'var(--portal-button-radius)', border: 'none', marginTop: 20,
            cursor: canConfirm ? 'pointer' : 'default', opacity: canConfirm ? 1 : 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading ? (
            <><Loader2 size={18} className="animate-spin" /> Redirecting to payment...</>
          ) : (
            amountCents >= MIN_AMOUNT ? `Pay ${formatCents(amountCents)} via Card` : 'Select an amount'
          )}
        </button>
      </div>
    </>
  );
}
