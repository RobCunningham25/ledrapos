import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { formatCents } from '@/utils/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Loader2, Delete } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tabId: string;
  tabTotal: number;
  memberId: string | null;
  memberName: string;
  onPaymentComplete: (result: any) => void;
}

type ActiveField = 'credit' | 'cash' | 'card';

export default function PaymentModal({
  isOpen, onClose, tabId, tabTotal, memberId, memberName, onPaymentComplete,
}: PaymentModalProps) {
  const { venueId } = useVenue();
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditInput, setCreditInput] = useState('');
  const [cashInput, setCashInput] = useState('');
  const [cardInput, setCardInput] = useState('');
  const [cardRef, setCardRef] = useState('');
  const [activeField, setActiveField] = useState<ActiveField>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  // Fetch credit balance on open
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setIsProcessing(false);
    setCardRef('');

    if (memberId) {
      supabase
        .from('member_credits')
        .select('amount_cents, type')
        .eq('member_id', memberId)
        .eq('venue_id', venueId)
        .then(({ data }) => {
          const bal = (data || []).reduce((s, r) => s + (r.type === 'CREDIT' ? r.amount_cents : -r.amount_cents), 0);
          setCreditBalance(Math.max(0, bal));
          const autoCredit = Math.min(Math.max(0, bal), tabTotal);
          setCreditInput(autoCredit > 0 ? String(autoCredit) : '0');
          const remaining = Math.max(0, tabTotal - autoCredit);
          setCashInput(String(remaining));
          setCardInput('0');
          setActiveField(remaining > 0 ? 'cash' : 'credit');
        });
    } else {
      setCreditBalance(0);
      setCreditInput('0');
      setCashInput(String(tabTotal));
      setCardInput('0');
      setActiveField('cash');
    }
  }, [isOpen, memberId, venueId, tabTotal]);

  const creditCents = Math.max(0, parseInt(creditInput) || 0);
  const cashCents = Math.max(0, parseInt(cashInput) || 0);
  const cardCents = Math.max(0, parseInt(cardInput) || 0);
  const totalEntered = creditCents + cashCents + cardCents;
  const remaining = tabTotal - totalEntered;
  const changeDue = Math.max(0, totalEntered - tabTotal);
  const canConfirm = totalEntered >= tabTotal && !isProcessing;

  const setActiveValue = useCallback((val: string) => {
    if (activeField === 'credit') {
      const n = parseInt(val) || 0;
      const capped = Math.min(n, creditBalance, tabTotal);
      setCreditInput(String(capped));
    } else if (activeField === 'cash') {
      setCashInput(val || '0');
    } else {
      setCardInput(val || '0');
    }
  }, [activeField, creditBalance, tabTotal]);

  const activeValue = activeField === 'credit' ? creditInput : activeField === 'cash' ? cashInput : cardInput;

  const activeValue = activeField === 'credit' ? creditInput : activeField === 'cash' ? cashInput : cardInput;

  const handleNumpad = (key: string) => {
    if (key === 'backspace') {
      const newVal = activeValue.length <= 1 ? '0' : activeValue.slice(0, -1);
      setActiveValue(newVal);
    } else {
      const newVal = activeValue === '0' ? key : activeValue + key;
      setActiveValue(newVal);
    }
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    setError('');

    const { data, error: rpcError } = await (supabase.rpc as any)('process_payment', {
      p_venue_id: venueId,
      p_tab_id: tabId,
      p_member_id: memberId ?? null,
      p_credit_amount: creditCents,
      p_cash_amount: cashCents,
      p_card_amount: cardCents,
      p_card_reference: cardRef || '',
    });

    setIsProcessing(false);

    if (rpcError) {
      setError(rpcError.message || 'Payment failed');
      return;
    }

    onPaymentComplete(data);
  };

  if (!isOpen) return null;

  const rows: { key: ActiveField; label: string; color: string; value: number; show: boolean }[] = [
    { key: 'credit', label: 'Credit', color: 'text-success', value: creditCents, show: !!memberId },
    { key: 'cash', label: 'Cash', color: 'text-foreground', value: cashCents, show: true },
    { key: 'card', label: 'Card', color: 'text-foreground', value: cardCents, show: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-card rounded-xl shadow-2xl w-[560px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Payment — {memberName}</h2>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-accent transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Credit balance */}
          {memberId && (
            <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-success/10">
              <span className="text-sm font-medium text-success">Credit Available</span>
              <span className="text-sm font-semibold text-success">{formatCents(creditBalance)}</span>
            </div>
          )}

          {/* Payment rows */}
          <div className="space-y-2 mb-4">
            {rows.filter(r => r.show).map(r => (
              <button
                key={r.key}
                onClick={() => setActiveField(r.key)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors min-h-[48px] ${
                  activeField === r.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                }`}
              >
                <span className={`text-sm font-medium ${r.color}`}>{r.label}</span>
                <span className={`text-base font-semibold ${r.color}`}>{formatCents(r.value)}</span>
              </button>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-border pt-3 space-y-1 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tab Total</span>
              <span className="font-semibold text-foreground">{formatCents(tabTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Entered</span>
              <span className="font-semibold text-foreground">{formatCents(totalEntered)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Balance Remaining</span>
              {remaining > 0 ? (
                <span className="font-semibold text-destructive">{formatCents(remaining)}</span>
              ) : (
                <span className="font-semibold text-success">Paid ✓</span>
              )}
            </div>
            {changeDue > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Change Due</span>
                <span className="font-semibold text-warning">{formatCents(changeDue)}</span>
              </div>
            )}
          </div>

          {/* Card reference */}
          {cardCents > 0 && (
            <div className="mb-4">
              <Input
                placeholder="Card reference / approval code (optional)"
                value={cardRef}
                onChange={e => setCardRef(e.target.value)}
                className="h-12 text-base"
              />
            </div>
          )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {['1','2','3','4','5','6','7','8','9','00','0','backspace'].map(key => (
              <button
                key={key}
                onClick={() => handleNumpad(key)}
                className="h-16 rounded-lg border border-border bg-card text-foreground font-semibold text-lg flex items-center justify-center hover:bg-accent/50 active:bg-accent transition-colors"
              >
                {key === 'backspace' ? <Delete className="h-5 w-5" /> : key}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mb-3">
            Enter amount in cents — e.g. 3500 = {formatCents(3500)}
          </p>
        </div>

        {/* Actions */}
        <div className="shrink-0 border-t border-border px-5 py-4">
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          <Button
            className="w-full h-14 text-base font-semibold"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {isProcessing ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processing…</>
            ) : (
              'Confirm Payment'
            )}
          </Button>
          <button
            onClick={onClose}
            className="w-full mt-2 h-11 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
