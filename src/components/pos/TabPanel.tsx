import { useMemo, useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useVenue } from '@/contexts/VenueContext';
import { useMemberCredit } from '@/hooks/useMemberCredit';
import { formatCents } from '@/utils/currency';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Minus, Plus, X, Loader2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import MemberSearch from './MemberSearch';
import PaymentModal from './PaymentModal';
import CreditLoadModal from './CreditLoadModal';

export default function TabPanel() {
  const {
    activeMember, activeTab, activeTabItems, localCart, isCashCustomer, cashCustomerName,
    isCommitting, commitError, updateCartQty, removeFromCart, commitCart,
    clearActiveTab, loadTabItems,
  } = useCart();
  const { venueId } = useVenue();

  const [showPayment, setShowPayment] = useState(false);
  const [showCreditLoad, setShowCreditLoad] = useState(false);

  const memberId = activeMember?.id ?? null;
  const { balance: creditBalance, refetch: refetchCredit } = useMemberCredit(memberId, venueId);

  const hasCustomer = !!activeMember || isCashCustomer;

  const tabTotal = useMemo(() =>
    activeTabItems.reduce((sum, i) => sum + i.line_total_cents, 0), [activeTabItems]);

  const cartTotal = useMemo(() =>
    localCart.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0), [localCart]);

  const grandTotal = tabTotal + cartTotal;

  const memberName = activeMember
    ? `${activeMember.firstName} ${activeMember.lastName}`
    : cashCustomerName || 'Cash Customer';

  const handleCommit = async () => {
    const result = await commitCart();
    if (result.success && result.memberName) {
      toast.success(`Tab updated — ${result.memberName}`, { duration: 2000 });
    }
  };

  const handlePaymentComplete = (result: any) => {
    setShowPayment(false);

    if (result?.tab_closed) {
      toast.success('Payment recorded — tab closed', { duration: 2000 });
    } else {
      toast.success('Payment recorded', { duration: 2000 });
    }

    // Full reset — return to default state
    clearActiveTab();
  };

  const openedTime = activeTab?.opened_at
    ? new Date(activeTab.opened_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  return (
    <div className="flex flex-col h-full">
      <MemberSearch />

      {/* Credit balance + Load Credit for members */}
      {activeMember && (
        <div className="shrink-0 px-3 py-2 border-b border-border bg-card flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground">Credit balance: </span>
            <span className={`text-sm font-semibold ${creditBalance > 0 ? 'text-success' : 'text-muted-foreground'}`}>
              {formatCents(creditBalance)}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs border-primary text-primary"
            onClick={() => setShowCreditLoad(true)}
          >
            <CreditCard className="h-3 w-3 mr-1" />
            Load Credit
          </Button>
        </div>
      )}

      {/* Tab items list - scrollable */}
      <div className="flex-1 overflow-y-auto">
        {/* Committed items */}
        {activeTabItems.length > 0 && (
          <div className="px-3 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Open Tab</span>
              {openedTime && (
                <span className="text-xs text-muted-foreground">Opened {openedTime}</span>
              )}
            </div>
            {activeTabItems.map(item => (
              <div key={item.id} className="flex items-center gap-2 py-2 border-b border-border min-h-[44px]">
                <Badge variant="secondary" className="text-xs px-2 py-0.5 shrink-0">{item.qty}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.product_name}</p>
                  {item.product_size && (
                    <p className="text-xs text-muted-foreground">{item.product_size}</p>
                  )}
                </div>
                <span className="text-sm font-semibold text-foreground shrink-0">
                  {formatCents(item.line_total_cents)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Local cart items */}
        {localCart.length > 0 && (
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">To Add</span>
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            </div>
            <div className="rounded-lg bg-accent/30 p-1">
              {localCart.map(item => (
                <div key={item.productId} className="flex items-center gap-2 py-2 px-2 min-h-[44px]">
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => updateCartQty(item.productId, item.qty - 1)}
                      className="w-8 h-8 rounded border border-border flex items-center justify-center hover:bg-accent active:bg-accent transition-colors"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                    <button
                      onClick={() => updateCartQty(item.productId, item.qty + 1)}
                      className="w-8 h-8 rounded border border-border flex items-center justify-center hover:bg-accent active:bg-accent transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    {item.size && <p className="text-xs text-muted-foreground">{item.size}</p>}
                  </div>
                  <span className="text-sm font-semibold text-foreground shrink-0">
                    {formatCents(item.unitPriceCents * item.qty)}
                  </span>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    className="w-8 h-8 rounded flex items-center justify-center text-muted-foreground hover:text-destructive active:text-destructive transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {activeTabItems.length === 0 && localCart.length === 0 && hasCustomer && (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm px-4 text-center">
            No items yet — add products from the left
          </div>
        )}

        {!hasCustomer && (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm px-4 text-center">
            Search and select a member or cash customer to start
          </div>
        )}
      </div>

      {/* Totals + action bar */}
      <div className="shrink-0 border-t border-border px-3 py-3 bg-card">
        {activeTabItems.length > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground mb-1">
            <span>Tab</span>
            <span>{formatCents(tabTotal)}</span>
          </div>
        )}
        {localCart.length > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground mb-1">
            <span>To Add</span>
            <span>{formatCents(cartTotal)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold text-primary mb-3">
          <span>Total</span>
          <span>{formatCents(grandTotal)}</span>
        </div>

        {commitError && (
          <p className="text-sm text-destructive mb-2">{commitError}</p>
        )}

        <div className="flex gap-2">
          <Button
            className="flex-1 h-14 text-base font-semibold"
            disabled={localCart.length === 0 || !hasCustomer || isCommitting}
            onClick={handleCommit}
          >
            {isCommitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Adding...</>
            ) : (
              'Add to Tab'
            )}
          </Button>
          {activeTab && activeTabItems.length > 0 && localCart.length === 0 && (
            <Button
              variant="outline"
              className="h-14 px-6 text-base font-semibold border-primary text-primary"
              onClick={() => setShowPayment(true)}
            >
              Pay
            </Button>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {activeTab && (
        <PaymentModal
          isOpen={showPayment}
          onClose={() => setShowPayment(false)}
          tabId={activeTab.id}
          tabTotal={tabTotal}
          memberId={memberId}
          memberName={memberName}
          onPaymentComplete={handlePaymentComplete}
        />
      )}

      {/* Credit Load Modal */}
      {activeMember && (
        <CreditLoadModal
          isOpen={showCreditLoad}
          onClose={() => setShowCreditLoad(false)}
          memberId={activeMember.id}
          memberName={`${activeMember.firstName} ${activeMember.lastName}`}
          currentBalance={creditBalance}
          onSuccess={refetchCredit}
        />
      )}
    </div>
  );
}
