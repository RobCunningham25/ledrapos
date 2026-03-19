import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePOSAuth } from '@/contexts/POSAuthContext';
import { usePOSProducts } from '@/hooks/usePOSProducts';
import { formatCents } from '@/utils/currency';
import { CATEGORIES, CATEGORY_COLORS, getCategoryLabel } from '@/constants/productCategories';
import PINLogin from '@/components/pos/PINLogin';
import LockScreen from '@/components/pos/LockScreen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const POS = () => {
  const { currentUser, isAuthenticated, isLocked, refreshActivity, logout, setIsLocked } = usePOSAuth();
  const navigate = useNavigate();

  // Activity tracking
  useEffect(() => {
    if (!currentUser) return;
    const handler = () => refreshActivity();
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => { events.forEach((e) => window.removeEventListener(e, handler)); };
  }, [currentUser, refreshActivity]);

  if (!currentUser) return <PINLogin />;
  if (isLocked) return <LockScreen />;

  const handleLogout = async () => { await logout(); navigate('/pos'); };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <TopBar
        userName={currentUser.name}
        userRole={currentUser.role}
        onTestLock={() => setIsLocked(true)}
        onLogout={handleLogout}
      />
      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0">
        <div className="w-[60%] flex flex-col min-h-0 bg-page">
          <ProductBrowser />
        </div>
        <div className="w-[40%] flex flex-col min-h-0 bg-card border-l border-border">
          <div className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">Active Tab</p>
          </div>
        </div>
      </div>
    </div>
  );
};

function TopBar({
  userName, userRole, onTestLock, onLogout,
}: {
  userName: string; userRole: string; onTestLock: () => void; onLogout: () => void;
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
        <Button variant="outline" size="sm" className="text-xs text-muted-foreground" onClick={onTestLock}>
          Test Lock
        </Button>
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
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const onSearchChange = useCallback((val: string) => {
    setSearch(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

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

  return (
    <>
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
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No products found
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filtered.map((p) => {
              const lowStock = p.stock_level <= p.min_stock_level;
              return (
                <button
                  key={p.id}
                  onClick={() => console.log('Product tapped:', p.id)}
                  className="relative bg-card border border-border rounded-lg text-left overflow-hidden
                    transition-transform duration-100 active:scale-[0.97] min-h-[100px] flex flex-col"
                >
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
            })}
          </div>
        )}
      </div>
    </>
  );
}

export default POS;
