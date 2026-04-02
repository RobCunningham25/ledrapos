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
import ledraLogo from '@/assets/ledra-logo.svg';


const POS = () => {
  const { currentUser, isAuthenticated, isLocked, refreshActivity, logout } = usePOSAuth();
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
      {/* VCA Logo Watermark — future: replace Base64 with venue?.logo_url from VenueContext */}
      <img
        src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAT6B9ADASIAAhEBAxEB/8QAHAABAAIDAQEBAAAAAAAAAAAAAAUGAwQHAgEI/8QARBABAAIBAwAGBQkGBQUAAwADAAECAwQFEQYSITFRcRMyQWGBByIjQ1JikaHBFXKCkuHRFCRC8fIWJzRUk2ODokTw8f/EABwBAQABBQEBAAAAAAAAAAAAAAAEAgMFBgcBCP/EAEcRAQABAwICBQoEAgQFAQkBAQABAgMEBREhMQYSEkFREzJhcYGRobHB0RQiM0LiI+EHUrLwFRYXQ2IkNHOCkvEWJVNUg6LSJv/aAAwDAQACEQMRAD8APxkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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"
        alt="VCA Logo"
        className="absolute bottom-5 right-5 w-[350px] h-auto opacity-[0.05] pointer-events-none z-0"
      />
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
      <span className="flex items-center gap-1.5 text-base font-bold text-primary">
        <img src={ledraLogo} alt="Ledra" className="h-5" />
        <span>POS</span>
      </span>
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
