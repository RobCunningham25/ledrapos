import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';

export interface CartItem {
  productId: string;
  name: string;
  brand: string | null;
  size: string | null;
  unitPriceCents: number;
  qty: number;
}

export interface TabItemRow {
  id: string;
  product_id: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
  product_name?: string;
  product_brand?: string | null;
  product_size?: string | null;
}

export interface ActiveMember {
  id: string;
  firstName: string;
  lastName: string;
  membershipNumber: string;
}

export interface ActiveTab {
  id: string;
  member_id: string | null;
  is_cash_customer: boolean;
  cash_customer_name: string | null;
  status: string;
  opened_at: string | null;
}

interface CartContextType {
  activeMember: ActiveMember | null;
  activeTab: ActiveTab | null;
  activeTabItems: TabItemRow[];
  localCart: CartItem[];
  isCashCustomer: boolean;
  cashCustomerName: string | null;
  isCommitting: boolean;
  commitError: string | null;
  openTabsRefetchTrigger: number;
  selectMember: (member: ActiveMember) => Promise<void>;
  selectCashTab: (tab: ActiveTab) => Promise<void>;
  startCashCustomerTab: (name: string) => void;
  addToCart: (product: { id: string; name: string; brand: string | null; size: string | null; selling_price_cents: number }) => void;
  removeFromCart: (productId: string) => void;
  updateCartQty: (productId: string, qty: number) => void;
  commitCart: () => Promise<{ success: boolean; error?: string; memberName?: string }>;
  clearActiveTab: () => void;
  loadTabItems: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { venueId } = useVenue();
  const [activeMember, setActiveMember] = useState<ActiveMember | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
  const [activeTabItems, setActiveTabItems] = useState<TabItemRow[]>([]);
  const [localCart, setLocalCart] = useState<CartItem[]>([]);
  const [isCashCustomer, setIsCashCustomer] = useState(false);
  const [cashCustomerName, setCashCustomerName] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [openTabsRefetchTrigger, setOpenTabsRefetchTrigger] = useState(0);

  const loadTabItems = useCallback(async () => {
    if (!activeTab) return;
    const { data } = await supabase
      .from('tab_items')
      .select('id, product_id, qty, unit_price_cents, line_total_cents, liquor_products(name, brand, size)')
      .eq('tab_id', activeTab.id);

    if (data) {
      setActiveTabItems(data.map((d: any) => ({
        id: d.id,
        product_id: d.product_id,
        qty: d.qty,
        unit_price_cents: d.unit_price_cents,
        line_total_cents: d.line_total_cents,
        product_name: d.liquor_products?.name,
        product_brand: d.liquor_products?.brand,
        product_size: d.liquor_products?.size,
      })));
    }
  }, [activeTab]);

  const selectMember = useCallback(async (member: ActiveMember) => {
    setActiveMember(member);
    setIsCashCustomer(false);
    setCashCustomerName(null);
    setLocalCart([]);
    setCommitError(null);

    const { data } = await supabase
      .from('tabs')
      .select('*')
      .eq('venue_id', venueId)
      .eq('member_id', member.id)
      .eq('status', 'OPEN')
      .limit(1)
      .single();

    if (data) {
      setActiveTab(data as ActiveTab);
      const { data: items } = await supabase
        .from('tab_items')
        .select('id, product_id, qty, unit_price_cents, line_total_cents, liquor_products(name, brand, size)')
        .eq('tab_id', data.id);

      if (items) {
        setActiveTabItems(items.map((d: any) => ({
          id: d.id,
          product_id: d.product_id,
          qty: d.qty,
          unit_price_cents: d.unit_price_cents,
          line_total_cents: d.line_total_cents,
          product_name: d.liquor_products?.name,
          product_brand: d.liquor_products?.brand,
          product_size: d.liquor_products?.size,
        })));
      }
    } else {
      setActiveTab(null);
      setActiveTabItems([]);
    }
  }, [venueId]);

  const selectCashTab = useCallback(async (tab: ActiveTab) => {
    setActiveMember(null);
    setIsCashCustomer(true);
    setCashCustomerName(tab.cash_customer_name || 'Cash Customer');
    setActiveTab(tab);
    setLocalCart([]);
    setCommitError(null);

    const { data: items } = await supabase
      .from('tab_items')
      .select('id, product_id, qty, unit_price_cents, line_total_cents, liquor_products(name, brand, size)')
      .eq('tab_id', tab.id);

    if (items) {
      setActiveTabItems(items.map((d: any) => ({
        id: d.id,
        product_id: d.product_id,
        qty: d.qty,
        unit_price_cents: d.unit_price_cents,
        line_total_cents: d.line_total_cents,
        product_name: d.liquor_products?.name,
        product_brand: d.liquor_products?.brand,
        product_size: d.liquor_products?.size,
      })));
    } else {
      setActiveTabItems([]);
    }
  }, []);

  const startCashCustomerTab = useCallback((name: string) => {
    const displayName = name.trim();
    setIsCashCustomer(true);
    setCashCustomerName(displayName);
    setActiveMember(null);
    setActiveTab(null);
    setActiveTabItems([]);
    setLocalCart([]);
    setCommitError(null);
  }, []);

  const addToCart = useCallback((product: { id: string; name: string; brand: string | null; size: string | null; selling_price_cents: number }) => {
    setCommitError(null);
    setLocalCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        brand: product.brand,
        size: product.size,
        unitPriceCents: product.selling_price_cents,
        qty: 1,
      }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setLocalCart(prev => prev.filter(i => i.productId !== productId));
  }, []);

  const updateCartQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      setLocalCart(prev => prev.filter(i => i.productId !== productId));
    } else {
      setLocalCart(prev => prev.map(i => i.productId === productId ? { ...i, qty } : i));
    }
  }, []);

  const commitCart = useCallback(async (): Promise<{ success: boolean; error?: string; memberName?: string }> => {
    if (localCart.length === 0) return { success: false, error: 'Cart is empty' };
    if (!activeMember && !isCashCustomer) return { success: false, error: 'No customer selected' };

    setIsCommitting(true);
    setCommitError(null);

    const items = localCart.map(i => ({
      product_id: i.productId,
      qty: i.qty,
      unit_price_cents: i.unitPriceCents,
    }));

    const memberName = activeMember
      ? `${activeMember.firstName} ${activeMember.lastName}`
      : cashCustomerName || 'Cash Customer';

    const { error } = await supabase.rpc('commit_cart_items', {
      p_venue_id: venueId,
      p_member_id: activeMember?.id ?? null,
      p_is_cash_customer: isCashCustomer,
      p_cash_customer_name: cashCustomerName,
      p_items: items,
    });

    setIsCommitting(false);

    if (error) {
      const msg = error.message || 'Failed to commit cart';
      setCommitError(msg);
      return { success: false, error: msg };
    }

    // Success — clear everything so panel resets
    setActiveMember(null);
    setActiveTab(null);
    setActiveTabItems([]);
    setLocalCart([]);
    setIsCashCustomer(false);
    setCashCustomerName(null);
    setCommitError(null);
    setOpenTabsRefetchTrigger(prev => prev + 1);

    return { success: true, memberName };
  }, [localCart, activeMember, isCashCustomer, cashCustomerName, venueId]);

  const clearActiveTab = useCallback(() => {
    setActiveMember(null);
    setActiveTab(null);
    setActiveTabItems([]);
    setLocalCart([]);
    setIsCashCustomer(false);
    setCashCustomerName(null);
    setCommitError(null);
  }, []);

  return (
    <CartContext.Provider value={{
      activeMember,
      activeTab,
      activeTabItems,
      localCart,
      isCashCustomer,
      cashCustomerName,
      isCommitting,
      commitError,
      openTabsRefetchTrigger,
      selectMember,
      selectCashTab,
      startCashCustomerTab,
      addToCart,
      removeFromCart,
      updateCartQty,
      commitCart,
      clearActiveTab,
      loadTabItems,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
}
