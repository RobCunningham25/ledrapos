// ============================================================
// YOCO CHECKOUT INTEGRATION — SETUP REQUIRED
// ============================================================
// Before Yoco payments will work, the following manual steps are needed:
//
// 1. Create a Yoco account at yoco.com and get API keys from:
//    Yoco App → Sales → Payment Gateway
//
// 2. Register a webhook in the Yoco dashboard:
//    URL: {SUPABASE_PROJECT_URL}/functions/v1/yoco-webhook
//    Events: payment.succeeded
//    Copy the webhook signing secret (starts with whsec_)
//
// 3. Add Edge Function secrets in Supabase Dashboard → Edge Functions → Secrets:
//    - YOCO_SECRET_KEY: sk_test_xxx (test) or sk_live_xxx (live)
//    - YOCO_WEBHOOK_SECRET: whsec_xxx
//    - PORTAL_BASE_URL: https://your-portal-domain.com (no trailing slash)
//
// 4. For testing, use Yoco test keys (sk_test_ / pk_test_) and test card:
//    Card: 4111 1111 1111 1111, Exp: any future date, CVV: any 3 digits
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { formatCents } from '@/utils/currency';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import CreditLoadSheet from '@/components/portal/CreditLoadSheet';

// ─── Types ───────────────────────────────────────────────────────────
interface TabItem {
  id: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
  product_name: string;
  category: string;
}

interface ClosedTab {
  id: string;
  opened_at: string;
  closed_at: string;
  total_cents: number;
}

// ─── Credit Balance Card ─────────────────────────────────────────────
function CreditBalanceCard({ balance, isLoading, onLoadCredit }: { balance: number; isLoading: boolean; onLoadCredit: () => void }) {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 20, marginBottom: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Credit Balance
      </p>
      {isLoading ? (
        <Skeleton className="h-10 w-[120px] mt-1" />
      ) : (
        <p style={{ fontSize: 32, fontWeight: 700, color: balance === 0 ? '#718096' : '#1A202C', marginTop: 4 }}>
          {formatCents(balance)}
        </p>
      )}
      <button
        onClick={onLoadCredit}
        style={{
          width: '100%', height: 48, background: '#2E5FA3', color: '#FFFFFF',
          fontWeight: 600, fontSize: 16, borderRadius: 6, border: 'none', marginTop: 16, cursor: 'pointer',
        }}
      >
        Load Credit
      </button>
    </div>
  );
}

// ─── Pay Tab Confirmation Dialog ─────────────────────────────────────
function PayTabDialog({ amountCents, onConfirm, onCancel, loading }: {
  amountCents: number; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        maxWidth: 320, width: 'calc(100% - 32px)', background: '#FFFFFF', borderRadius: 8,
        padding: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 51, textAlign: 'center',
      }}>
        <p style={{ fontSize: 16, color: '#1A202C' }}>Pay your tab of {formatCents(amountCents)} via card?</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, height: 44, border: '1px solid #E2E8F0', background: '#FFFFFF',
              color: '#718096', fontWeight: 500, borderRadius: 6, cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            disabled={loading}
            onClick={onConfirm}
            style={{
              flex: 1, height: 44, background: '#1E8449', color: '#FFFFFF',
              fontWeight: 600, borderRadius: 6, border: 'none', cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            Pay Now
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Open Tab Card ───────────────────────────────────────────────────
function OpenTabCard({
  items, openedAt, totalPaidCents, tabId, memberId, venueId, isLoading, error,
}: {
  items: TabItem[] | null;
  openedAt: string | null;
  totalPaidCents: number;
  tabId: string | null;
  memberId: string;
  venueId: string;
  isLoading: boolean;
  error: string | null;
}) {
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payLoading, setPayLoading] = useState(false);

  if (isLoading) {
    return (
      <div style={{ background: '#FFFFFF', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 20, marginBottom: 16 }}>
        <Skeleton className="h-5 w-[140px] mb-2" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full mb-2" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: '#FFFFFF', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 24, marginBottom: 16, textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#C0392B' }}>Couldn't load data — pull down to retry</p>
      </div>
    );
  }

  if (!items) {
    return (
      <div style={{ background: '#FFFFFF', borderRadius: 8, padding: 24, marginBottom: 16, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 15, color: '#718096' }}>No open tab</p>
      </div>
    );
  }

  const tabTotal = items.reduce((s, i) => s + i.line_total_cents, 0);
  const amountDue = tabTotal - totalPaidCents;

  const handlePayTab = async () => {
    setPayLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('create-checkout', {
        body: { member_id: memberId, venue_id: venueId, purpose: 'tab_payment', amount_cents: amountDue, tab_id: tabId },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to create checkout');
      window.location.href = data.redirect_url;
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
      setPayLoading(false);
      setShowPayDialog(false);
    }
  };

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 20, marginBottom: 16 }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: '#1A202C' }}>Your Open Tab</p>
      {openedAt && (
        <p style={{ fontSize: 13, color: '#718096' }}>
          Opened {formatDistanceToNow(new Date(openedAt), { addSuffix: true })}
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        {items.map((item, idx) => (
          <div
            key={item.id}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0',
              borderBottom: idx < items.length - 1 ? '1px solid #E2E8F0' : 'none',
            }}
          >
            <div>
              <p style={{ fontSize: 15, fontWeight: 500, color: '#1A202C', margin: 0 }}>{item.product_name}</p>
              <p style={{ fontSize: 13, color: '#718096', margin: 0 }}>× {item.qty}</p>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1A202C' }}>{formatCents(item.line_total_cents)}</span>
          </div>
        ))}
      </div>

      <div style={{ paddingTop: 12, marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Tab Total</span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{formatCents(tabTotal)}</span>
        </div>
        {totalPaidCents > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 14, color: '#1E8449' }}>Credit Applied</span>
            <span style={{ fontSize: 14, color: '#1E8449' }}>- {formatCents(totalPaidCents)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1A202C' }}>Amount Due</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: amountDue > 0 ? '#C0392B' : '#1E8449' }}>
            {formatCents(amountDue)}
          </span>
        </div>
      </div>

      {/* Pay Tab button */}
      {amountDue >= 200 && (
        <button
          onClick={() => setShowPayDialog(true)}
          style={{
            width: '100%', height: 48, background: '#1E8449', color: '#FFFFFF',
            fontWeight: 600, fontSize: 16, borderRadius: 6, border: 'none', marginTop: 16, cursor: 'pointer',
          }}
        >
          Pay {formatCents(amountDue)} Now
        </button>
      )}
      {amountDue > 0 && amountDue < 200 && (
        <p style={{ fontSize: 13, color: '#718096', textAlign: 'center', marginTop: 12 }}>
          Remaining balance of {formatCents(amountDue)} is below the minimum online payment amount. Please settle at the bar.
        </p>
      )}

      {showPayDialog && (
        <PayTabDialog
          amountCents={amountDue}
          onConfirm={handlePayTab}
          onCancel={() => setShowPayDialog(false)}
          loading={payLoading}
        />
      )}
    </div>
  );
}

// ─── Closed Tab Card ─────────────────────────────────────────────────
function ClosedTabCard({ tab, venueId }: { tab: ClosedTab; venueId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<{ product_name: string; qty: number; line_total_cents: number }[] | null>(null);

  useEffect(() => {
    if (!expanded || items) return;
    supabase
      .from('tab_items')
      .select('qty, unit_price_cents, line_total_cents, product_id')
      .eq('tab_id', tab.id)
      .eq('venue_id', venueId)
      .then(async ({ data }) => {
        if (!data) { setItems([]); return; }
        const productIds = data.map(d => d.product_id);
        const { data: products } = await supabase
          .from('liquor_products')
          .select('id, name')
          .in('id', productIds);
        const nameMap = new Map((products || []).map(p => [p.id, p.name]));
        setItems(
          data.map(d => ({
            product_name: nameMap.get(d.product_id) || 'Unknown',
            qty: d.qty,
            line_total_cents: d.line_total_cents,
          })).sort((a, b) => a.product_name.localeCompare(b.product_name))
        );
      });
  }, [expanded, items, tab.id, venueId]);

  return (
    <div
      style={{ background: '#FFFFFF', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 16, marginBottom: 8, cursor: 'pointer' }}
      onClick={() => setExpanded(e => !e)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#1A202C' }}>
            {format(new Date(tab.closed_at), 'dd MMM yyyy')}
          </span>
          <p style={{ fontSize: 12, color: '#718096', margin: '2px 0 0' }}>
            Opened {format(new Date(tab.opened_at), 'HH:mm')} — Closed {format(new Date(tab.closed_at), 'HH:mm')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1A202C' }}>{formatCents(tab.total_cents)}</span>
          {expanded
            ? <ChevronUp size={16} color="#718096" />
            : <ChevronDown size={16} color="#718096" />}
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
          {!items ? (
            <Skeleton className="h-4 w-full" />
          ) : items.length === 0 ? (
            <p style={{ fontSize: 13, color: '#718096' }}>No items</p>
          ) : (
            items.map((it, i) => (
              <p key={i} style={{ fontSize: 13, color: '#718096', padding: '6px 0', margin: 0 }}>
                {it.product_name} × {it.qty} — {formatCents(it.line_total_cents)}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────
export default function PortalBarTab() {
  const { member } = usePortalAuth();
  const memberId = member?.id ?? '';
  const venueId = member?.venue_id ?? '';

  // Credit balance
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditLoading, setCreditLoading] = useState(true);

  // Open tab
  const [openTabItems, setOpenTabItems] = useState<TabItem[] | null>(null);
  const [openTabOpenedAt, setOpenTabOpenedAt] = useState<string | null>(null);
  const [openTabPaid, setOpenTabPaid] = useState(0);
  const [openTabId, setOpenTabId] = useState<string | null>(null);
  const [tabLoading, setTabLoading] = useState(true);
  const [tabError, setTabError] = useState<string | null>(null);

  // History
  const [closedTabs, setClosedTabs] = useState<ClosedTab[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Credit load sheet
  const [showCreditSheet, setShowCreditSheet] = useState(false);

  const fetchCredit = useCallback(async (silent = false) => {
    if (!memberId) return;
    if (!silent) setCreditLoading(true);
    const { data } = await supabase
      .from('member_credits')
      .select('amount_cents, type')
      .eq('member_id', memberId)
      .eq('venue_id', venueId);
    if (data) {
      const bal = data.reduce((s, r) => s + (r.type === 'CREDIT' ? r.amount_cents : -r.amount_cents), 0);
      setCreditBalance(Math.max(0, bal));
    }
    setCreditLoading(false);
  }, [memberId, venueId]);

  const fetchOpenTab = useCallback(async (silent = false) => {
    if (!memberId) return;
    if (!silent) setTabLoading(true);
    setTabError(null);

    const { data: tabData, error: tabErr } = await supabase
      .from('tabs')
      .select('id, opened_at')
      .eq('member_id', memberId)
      .eq('venue_id', venueId)
      .eq('status', 'OPEN')
      .limit(1)
      .maybeSingle();

    if (tabErr) { setTabError(tabErr.message); setTabLoading(false); return; }

    if (!tabData) {
      setOpenTabItems(null);
      setOpenTabOpenedAt(null);
      setOpenTabPaid(0);
      setOpenTabId(null);
      setTabLoading(false);
      return;
    }

    setOpenTabOpenedAt(tabData.opened_at);
    setOpenTabId(tabData.id);

    const [itemsRes, paymentsRes] = await Promise.all([
      supabase
        .from('tab_items')
        .select('id, qty, unit_price_cents, line_total_cents, product_id')
        .eq('tab_id', tabData.id)
        .eq('venue_id', venueId),
      supabase
        .from('payments')
        .select('amount_cents')
        .eq('tab_id', tabData.id)
        .eq('venue_id', venueId),
    ]);

    if (itemsRes.data) {
      const productIds = itemsRes.data.map(i => i.product_id);
      const { data: products } = await supabase
        .from('liquor_products')
        .select('id, name, category')
        .in('id', productIds);
      const pMap = new Map((products || []).map(p => [p.id, p]));
      setOpenTabItems(
        itemsRes.data
          .map(i => ({
            id: i.id,
            qty: i.qty,
            unit_price_cents: i.unit_price_cents,
            line_total_cents: i.line_total_cents,
            product_name: pMap.get(i.product_id)?.name || 'Unknown',
            category: pMap.get(i.product_id)?.category || '',
          }))
          .sort((a, b) => a.product_name.localeCompare(b.product_name))
      );
    }

    setOpenTabPaid(
      (paymentsRes.data || []).reduce((s, p) => s + p.amount_cents, 0)
    );
    setTabLoading(false);
  }, [memberId, venueId]);

  const fetchHistory = useCallback(async (offset: number, append = false, silent = false) => {
    if (!memberId) return;
    if (!silent && !append) setHistoryLoading(true);

    const { data } = await supabase
      .from('tabs')
      .select('id, opened_at, closed_at')
      .eq('member_id', memberId)
      .eq('venue_id', venueId)
      .eq('status', 'CLOSED')
      .order('closed_at', { ascending: false })
      .range(offset, offset + 19);

    if (!data) { setHistoryLoading(false); return; }

    const tabIds = data.map(t => t.id);
    const { data: allItems } = await supabase
      .from('tab_items')
      .select('tab_id, line_total_cents')
      .eq('venue_id', venueId)
      .in('tab_id', tabIds);

    const totalMap = new Map<string, number>();
    (allItems || []).forEach(i => {
      totalMap.set(i.tab_id, (totalMap.get(i.tab_id) || 0) + i.line_total_cents);
    });

    const mapped: ClosedTab[] = data.map(t => ({
      id: t.id,
      opened_at: t.opened_at!,
      closed_at: t.closed_at!,
      total_cents: totalMap.get(t.id) || 0,
    }));

    if (append) {
      setClosedTabs(prev => [...prev, ...mapped]);
    } else {
      setClosedTabs(mapped);
    }
    setHasMore(data.length === 20);
    setHistoryLoading(false);
    setLoadingMore(false);
  }, [memberId, venueId]);

  // Initial load
  useEffect(() => {
    if (!memberId) return;
    Promise.all([fetchCredit(), fetchOpenTab(), fetchHistory(0)]).then(() => setIsFirstLoad(false));
  }, [memberId, fetchCredit, fetchOpenTab, fetchHistory]);

  // Polling every 30s (silent)
  useEffect(() => {
    if (!memberId || isFirstLoad) return;
    const interval = setInterval(() => {
      fetchCredit(true);
      fetchOpenTab(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [memberId, isFirstLoad, fetchCredit, fetchOpenTab]);

  const handleLoadMore = () => {
    const newOffset = historyOffset + 20;
    setHistoryOffset(newOffset);
    setLoadingMore(true);
    fetchHistory(newOffset, true, true);
  };

  return (
    <div>
      <CreditBalanceCard balance={creditBalance} isLoading={creditLoading && isFirstLoad} onLoadCredit={() => setShowCreditSheet(true)} />

      <OpenTabCard
        items={tabLoading && isFirstLoad ? null : openTabItems}
        openedAt={openTabOpenedAt}
        totalPaidCents={openTabPaid}
        tabId={openTabId}
        memberId={memberId}
        venueId={venueId}
        isLoading={tabLoading && isFirstLoad}
        error={tabError}
      />

      {historyLoading && isFirstLoad ? (
        <div>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1A202C', marginBottom: 12 }}>Tab History</p>
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-16 w-full mb-2 rounded-lg" />
          ))}
        </div>
      ) : closedTabs.length > 0 ? (
        <div>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1A202C', marginBottom: 12 }}>Tab History</p>
          {closedTabs.map(tab => (
            <ClosedTabCard key={tab.id} tab={tab} venueId={venueId} />
          ))}
          {hasMore && (
            <p
              onClick={loadingMore ? undefined : handleLoadMore}
              style={{ fontSize: 14, color: '#2E5FA3', textAlign: 'center', padding: 12, cursor: 'pointer', opacity: loadingMore ? 0.5 : 1 }}
            >
              {loadingMore ? 'Loading…' : 'Load older tabs'}
            </p>
          )}
        </div>
      ) : null}

      <CreditLoadSheet
        open={showCreditSheet}
        onClose={() => setShowCreditSheet(false)}
        memberId={memberId}
        venueId={venueId}
      />
    </div>
  );
}
