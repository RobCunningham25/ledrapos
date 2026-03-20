import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { useCart } from '@/contexts/CartContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { User, Wallet, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MemberResult {
  id: string;
  first_name: string;
  last_name: string;
  membership_number: string;
  partner_name: string | null;
}

export default function MemberSearch() {
  const { venueId } = useVenue();
  const { activeMember, isCashCustomer, cashCustomerName, activeTab, localCart, selectMember, startCashCustomerTab, clearActiveTab } = useCart();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<MemberResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [cashFlow, setCashFlow] = useState(false);
  const [cashName, setCashName] = useState('');
  const [confirmChange, setConfirmChange] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setIsSearching(true);
    const pattern = `%${q.trim()}%`;
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, membership_number, partner_name')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},membership_number.ilike.${pattern},partner_name.ilike.${pattern}`)
      .limit(8);
    setResults(data || []);
    setIsSearching(false);
  }, [venueId]);

  const onSearchChange = (val: string) => {
    setSearch(val);
    setIsOpen(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 300);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectMember = (m: MemberResult) => {
    selectMember({
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      membershipNumber: m.membership_number,
    });
    setSearch('');
    setIsOpen(false);
    setResults([]);
  };

  const handleStartCashTab = () => {
    startCashCustomerTab(cashName);
    setCashFlow(false);
    setCashName('');
  };

  const handleChangeCustomer = () => {
    if (localCart.length > 0) {
      setConfirmChange(true);
    } else {
      clearActiveTab();
    }
  };

  const getInitials = (first: string, last: string) =>
    `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

  // Active member/cash customer display
  if (activeMember || isCashCustomer) {
    return (
      <div className="shrink-0 px-3 py-2 border-b border-border bg-card">
        {confirmChange && (
          <div className="mb-2 p-2 rounded bg-warning/10 border border-warning/30 text-sm">
            <p className="text-foreground font-medium">You have unsaved items. Change customer?</p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="destructive" className="h-9" onClick={() => { setConfirmChange(false); clearActiveTab(); }}>
                Yes, change
              </Button>
              <Button size="sm" variant="outline" className="h-9" onClick={() => setConfirmChange(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 min-h-[48px]">
          {isCashCustomer ? (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary-foreground">
                {activeMember ? getInitials(activeMember.firstName, activeMember.lastName) : ''}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {isCashCustomer ? `Cash Customer — ${cashCustomerName}` : `${activeMember?.firstName} ${activeMember?.lastName}`}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {isCashCustomer ? 'Walk-in' : activeMember?.membershipNumber}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-9 text-xs shrink-0" onClick={handleChangeCustomer}>
            Change
          </Button>
        </div>
      </div>
    );
  }

  // Cash customer flow
  if (cashFlow) {
    return (
      <div className="shrink-0 px-3 py-2 border-b border-border bg-card">
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Customer name (optional)"
            value={cashName}
            onChange={e => setCashName(e.target.value)}
            className="h-11"
            autoFocus
          />
          <div className="flex gap-2">
            <Button className="flex-1 h-11" onClick={handleStartCashTab}>Start Tab</Button>
            <Button variant="outline" className="flex-1 h-11" onClick={() => { setCashFlow(false); setCashName(''); }}>Cancel</Button>
          </div>
        </div>
      </div>
    );
  }

  // Search mode
  return (
    <div ref={containerRef} className="shrink-0 relative border-b border-border bg-card">
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={() => { if (search.trim()) setIsOpen(true); }}
            className="pl-9 h-11"
          />
        </div>
      </div>
      {isOpen && (search.trim() || true) && (
        <div className="absolute left-0 right-0 top-full z-50 bg-card border border-border border-t-0 rounded-b-lg shadow-lg max-h-[400px] overflow-y-auto">
          {results.map(m => (
            <button
              key={m.id}
              onClick={() => handleSelectMember(m)}
              className="w-full flex items-center gap-3 px-3 py-2 min-h-[48px] hover:bg-accent/50 active:bg-accent transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary-foreground">
                  {getInitials(m.first_name, m.last_name)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{m.first_name} {m.last_name}</p>
                <p className="text-xs text-muted-foreground">{m.membership_number}</p>
              </div>
              {m.partner_name && (
                <span className="text-xs text-muted-foreground shrink-0">{m.partner_name}</span>
              )}
            </button>
          ))}
          {search.trim() && results.length === 0 && !isSearching && (
            <div className="px-3 py-3 text-sm text-muted-foreground text-center">No members found</div>
          )}
          <button
            onClick={() => { setIsOpen(false); setCashFlow(true); }}
            className="w-full flex items-center gap-3 px-3 py-2 min-h-[48px] hover:bg-accent/50 active:bg-accent transition-colors text-left border-t border-border"
          >
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium text-foreground">Cash Customer</span>
          </button>
        </div>
      )}
    </div>
  );
}
