import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { formatCents } from '@/utils/currency';
import { Button } from '@/components/ui/button';
import { X, Delete, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CreditLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  memberName: string;
  currentBalance: number;
  onSuccess: () => void;
}

export default function CreditLoadModal({
  isOpen, onClose, memberId, memberName, currentBalance, onSuccess,
}: CreditLoadModalProps) {
  const { venueId } = useVenue();
  const [input, setInput] = useState('0');
  const [method, setMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [isLoading, setIsLoading] = useState(false);

  const amountCents = parseInt(input) || 0;
  const isValid = amountCents >= 1000;

  const handleNumpad = (key: string) => {
    if (key === 'backspace') {
      setInput(prev => prev.length <= 1 ? '0' : prev.slice(0, -1));
    } else {
      setInput(prev => prev === '0' ? key : prev + key);
    }
  };

  const handleConfirm = async () => {
    if (!isValid) return;
    setIsLoading(true);
    const { error } = await supabase.from('member_credits').insert({
      venue_id: venueId,
      member_id: memberId,
      amount_cents: amountCents,
      type: 'CREDIT',
      method,
      description: `Credit top-up — ${method}`,
    });
    setIsLoading(false);
    if (error) {
      toast.error('Failed to load credit');
      return;
    }
    toast.success(`${formatCents(amountCents)} credit loaded for ${memberName}`);
    setInput('0');
    onSuccess();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-card rounded-xl shadow-2xl w-[480px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Load Credit — {memberName}</h2>
            <p className="text-sm text-success mt-0.5">Current balance: {formatCents(currentBalance)}</p>
          </div>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-accent transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Amount display */}
          <div className="text-center mb-4">
            <p className="text-3xl font-semibold text-foreground">{formatCents(amountCents)}</p>
            {amountCents > 0 && amountCents < 1000 && (
              <p className="text-xs text-destructive mt-1">Minimum load is R 10.00</p>
            )}
          </div>

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
          <p className="text-xs text-muted-foreground text-center mb-4">
            Enter amount in cents — e.g. 5000 = {formatCents(5000)}
          </p>

          {/* Method selection */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMethod('CASH')}
              className={cn(
                'flex-1 h-14 rounded-lg font-semibold text-base border-2 transition-colors',
                method === 'CASH' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-primary border-primary'
              )}
            >
              CASH
            </button>
            <button
              onClick={() => setMethod('CARD')}
              className={cn(
                'flex-1 h-14 rounded-lg font-semibold text-base border-2 transition-colors',
                method === 'CARD' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-primary border-primary'
              )}
            >
              CARD
            </button>
          </div>
          {method === 'CARD' && (
            <p className="text-xs text-muted-foreground text-center mb-2">
              Confirm card payment on Yoco terminal, then tap Confirm.
            </p>
          )}
        </div>

        {/* Confirm */}
        <div className="shrink-0 border-t border-border px-5 py-4">
          <Button
            className="w-full h-14 text-base font-semibold bg-success hover:bg-success/90 text-success-foreground"
            disabled={!isValid || isLoading}
            onClick={handleConfirm}
          >
            {isLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</>
            ) : (
              `Load ${formatCents(amountCents)} Credit`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
