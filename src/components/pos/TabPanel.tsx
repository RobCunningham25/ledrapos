import { useMemo } from 'react';
import { useCart } from '@/contexts/CartContext';
import { formatCents } from '@/utils/currency';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Minus, Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import MemberSearch from './MemberSearch';

export default function TabPanel() {
  const {
    activeMember, activeTab, activeTabItems, localCart, isCashCustomer,
    isCommitting, commitError, updateCartQty, removeFromCart, commitCart,
  } = useCart();

  const hasCustomer = !!activeMember || isCashCustomer;

  const tabTotal = useMemo(() =>
    activeTabItems.reduce((sum, i) => sum + i.line_total_cents, 0), [activeTabItems]);

  const cartTotal = useMemo(() =>
    localCart.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0), [localCart]);

  const grandTotal = tabTotal + cartTotal;

  const handleCommit = async () => {
    const result = await commitCart();
    if (result.success && result.memberName) {
      toast.success(`Tab updated — ${result.memberName}`, { duration: 2000 });
    }
  };

  const openedTime = activeTab?.opened_at
    ? new Date(activeTab.opened_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  return (
    <div className="flex flex-col h-full">
      <MemberSearch />

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

      {/* Totals + commit bar */}
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

        <Button
          className="w-full h-14 text-base font-semibold"
          disabled={localCart.length === 0 || !hasCustomer || isCommitting}
          onClick={handleCommit}
        >
          {isCommitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Adding...
            </>
          ) : (
            'Add to Tab'
          )}
        </Button>
      </div>
    </div>
  );
}
