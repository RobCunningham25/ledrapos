import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePOSAuth } from '@/contexts/POSAuthContext';
import { useCart } from '@/contexts/CartContext';
import { usePOSProducts } from '@/hooks/usePOSProducts';
import { useMemberFavourites } from '@/hooks/useMemberFavourites';
import { useVenue } from '@/contexts/VenueContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import { formatCents } from '@/utils/currency';
import { CATEGORIES, CATEGORY_COLORS } from '@/constants/productCategories';
import PINLogin from '@/components/pos/PINLogin';
import LockScreen from '@/components/pos/LockScreen';
import TabPanel from '@/components/pos/TabPanel';
import OpenTabsPanel from '@/components/pos/OpenTabsPanel';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

const POS = () => {
  const { currentUser, isAuthenticated, isLocked, refreshActivity, logout, setIsLocked } = usePOSAuth();
  const navigate = useNavigate();
  const { posPath } = useVenueNav();

  useEffect(() => {
    if (!currentUser) return;
    const handler = () => refreshActivity();
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => { events.forEach((e) => window.removeEventListener(e, handler)); };
  }, [currentUser, refreshActivity]);

  if (!currentUser) return <PINLogin />;
  if (isLocked) return <LockScreen />;

  const handleLogout = async () => { await logout(); navigate(posPath); };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar
        userName={currentUser.name}
        userRole={currentUser.role}
        onLogout={handleLogout}
      />
      <div className="flex flex-1 min-h-0">
        <LeftPanel />
        <div className="w-[40%] flex flex-col min-h-0 bg-card border-l border-border">
          <TabPanel />
        </div>
      </div>
    </div>
  );
};

function LeftPanel() {
  const { activeMember, isCashCustomer } = useCart();
  const hasCustomer = !!activeMember || isCashCustomer;

  return (
    <div className="w-[60%] flex flex-col min-h-0 bg-page relative">
      {/* Fade transition */}
      <div
        className={cn(
          'absolute inset-0 flex flex-col transition-opacity duration-150',
          hasCustomer ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none z-0'
        )}
      >
        <ProductBrowser />
      </div>
      <div
        className={cn(
          'absolute inset-0 flex flex-col transition-opacity duration-150',
          !hasCustomer ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none z-0'
        )}
      >
        <OpenTabsPanel />
      </div>
    </div>
  );
}

function TopBar({
  userName, userRole, onLogout,
}: {
  userName: string; userRole: string; onLogout: () => void;
}) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const formatted = time.toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }) + '  •  ' + time.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-4 bg-card border-b border-border">
      <span className="text-base font-bold text-primary">LedraPOS</span>
      <span className="text-sm text-muted-foreground hidden sm:block">{formatted}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {userName} <span className="text-xs">({userRole})</span>
        </span>
        <Button
          variant="outline"
          size="sm"
          className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={onLogout}
        >
          Log Out
        </Button>
      </div>
    </header>
  );
}

function ProductBrowser() {
  const { products, isLoading } = usePOSProducts();
  const { addToCart, localCart, activeMember, isCashCustomer } = useCart();
  const { venueId } = useVenue();
  const { favouriteProducts } = useMemberFavourites(activeMember?.id ?? null, venueId);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [noCustomerMsg, setNoCustomerMsg] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const msgTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const hasCustomer = !!activeMember || isCashCustomer;

  const onSearchChange = useCallback((val: string) => {
    setSearch(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  }, []);

  useEffect(() => () => { clearTimeout(timerRef.current); clearTimeout(msgTimerRef.current); }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (activeCategory !== 'all' && p.category !== activeCategory) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.brand?.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [products, activeCategory, debouncedSearch]);

  const favouriteIds = useMemo(() => new Set(favouriteProducts.map(f => f.id)), [favouriteProducts]);

  const filteredFavourites = useMemo(() => {
    if (!activeMember || favouriteProducts.length === 0) return [];
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      return favouriteProducts.filter(p =>
        p.name.toLowerCase().includes(q) || (p.brand?.toLowerCase().includes(q))
      );
    }
    return favouriteProducts;
  }, [activeMember, favouriteProducts, debouncedSearch]);

  // Remove favourites from main list to avoid duplication
  const mainProducts = useMemo(() => {
    if (filteredFavourites.length === 0) return filtered;
    return filtered.filter(p => !favouriteIds.has(p.id));
  }, [filtered, filteredFavourites, favouriteIds]);

  const showFavourites = activeMember && filteredFavourites.length > 0;

  const cartQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    localCart.forEach(i => { map[i.productId] = i.qty; });
    return map;
  }, [localCart]);

  const handleProductTap = (p: any) => {
    if (!hasCustomer) {
      setNoCustomerMsg(true);
      clearTimeout(msgTimerRef.current);
      msgTimerRef.current = setTimeout(() => setNoCustomerMsg(false), 3000);
      return;
    }
    addToCart(p);
  };

  const renderProductCard = (p: any, isFavourite = false) => {
    const lowStock = p.stock_level <= p.min_stock_level;
    const cartQty = cartQtyMap[p.id];
    return (
      <button
        key={p.id}
        onClick={() => handleProductTap(p)}
        className={cn(
          'relative bg-card rounded-lg text-left overflow-hidden transition-transform duration-100 active:scale-[0.97] min-h-[100px] flex flex-col',
          isFavourite ? 'border-2 border-warning' : 'border border-border'
        )}
      >
        {cartQty > 0 && (
          <span className="absolute top-1 right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center z-10">
            {cartQty}
          </span>
        )}
        {isFavourite && (
          <span className="absolute top-1 right-1 text-sm z-10" style={{ marginRight: cartQty > 0 ? '28px' : '0' }}>⭐</span>
        )}
        <div className="h-1 w-full" style={{ backgroundColor: CATEGORY_COLORS[p.category] }} />
        <div className="flex-1 p-3 flex flex-col justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {[p.brand, p.size].filter(Boolean).join(' • ') || '\u00A0'}
            </p>
          </div>
          <div className="flex items-end justify-between mt-2">
            <span className="text-sm font-bold text-primary">{formatCents(p.selling_price_cents)}</span>
            {lowStock && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warning text-warning bg-warning/10">
                Low Stock
              </Badge>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <>
      {noCustomerMsg && (
        <div className="shrink-0 mx-3 mt-2 px-3 py-2 rounded bg-warning/10 border border-warning/30 text-sm text-warning font-medium">
          Select a member or cash customer first
        </div>
      )}

      {/* Category pills */}
      <div className="shrink-0 px-3 pt-3 pb-2 overflow-x-auto">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'h-10 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors border',
              activeCategory === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-primary border-primary/30 hover:bg-primary/5'
            )}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setActiveCategory(c.value)}
              className={cn(
                'h-10 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors border',
                activeCategory === c.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-primary border-primary/30 hover:bg-primary/5'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-11"
          />
        </div>
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[120px] rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Favourites section */}
            {showFavourites && (
              <>
                <div className="mb-2">
                  <p className="text-sm font-bold text-primary">⭐ Favourites</p>
                  <div className="h-px bg-border mt-1" />
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {filteredFavourites.map(p => renderProductCard(p, true))}
                </div>
                <div className="mb-2">
                  <p className="text-[13px] text-muted-foreground font-medium">All Products</p>
                </div>
              </>
            )}

            {mainProducts.length === 0 && !showFavourites ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                No products found
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {mainProducts.map(p => renderProductCard(p, false))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default POS;
