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
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { formatCents } from '@/utils/currency';
import { PORTAL_THEME as T } from '@/constants/portalTheme';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronUp, Loader2, ArrowLeft, Receipt } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import CreditLoadSheet from '@/components/portal/CreditLoadSheet';
import CreditBalanceBarCard from '@/components/portal/CreditBalanceBarCard';
import SpendingSnapshotCard from '@/components/portal/SpendingSnapshotCard';
import FavouritesCard from '@/components/portal/FavouritesCard';

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

const cardStyle: React.CSSProperties = {
  background: T.cardBg, borderRadius: 12, border: `1px solid ${T.cardBorder}`,
  boxShadow: T.cardShadow, padding: 24,
};

// ─── Pay Tab Confirmation Dialog ─────────────────────────────────────
function PayTabDialog({ amountCents, onConfirm, onCancel, loading }: {
  amountCents: number; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        maxWidth: 320, width: 'calc(100% - 32px)', background: T.cardBg, borderRadius: 12,
        padding: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 51, textAlign: 'center',
        border: `1px solid ${T.cardBorder}`,
      }}>
        <p style={{ fontSize: 16, color: T.textPrimary }}>Pay your tab of {formatCents(amountCents)} via card?</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button onClick={onCancel} style={{
            flex: 1, height: 44, border: `1px solid ${T.cardBorder}`, background: T.cardBg,
            color: T.textSecondary, fontWeight: 500, borderRadius: 10, cursor: 'pointer',
          }}>Cancel</button>
          <button disabled={loading} onClick={onConfirm} style={{
            flex: 1, height: 44, background: T.teal, color: '#FFFFFF',
            fontWeight: 600, borderRadius: 10, border: 'none',
            cursor: loading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
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
  items: TabItem[] | null; openedAt: string | null; totalPaidCents: number;
  tabId: string | null; memberId: string; venueId: string; isLoading: boolean; error: string | null;
}) {
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payLoading, setPayLoading] = useState(false);

  if (isLoading) {
    return (
      <div style={cardStyle}>
        <Skeleton className="h-5 w-[140px] mb-2" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full mb-2" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: T.danger }}>Couldn't load data — pull down to retry</p>
      </div>
    );
  }

  if (!items) {
    return (
      <div style={{
        ...cardStyle, textAlign: 'center', minHeight: 200,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <Receipt size={40} color={T.cardBorder} />
        <p style={{ fontSize: 16, fontWeight: 500, color: T.textMuted, margin: 0 }}>No open tab</p>
        <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Your next tab will appear here</p>
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

  const thStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase',
    letterSpacing: '0.05em', padding: '8px 8px', borderBottom: `1px solid ${T.cardBorder}`,
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: T.textPrimary, margin: 0 }}>Your Open Tab</p>
        <span style={{
          fontSize: 12, fontWeight: 600, color: '#FFFFFF', background: T.amber,
          padding: '2px 10px', borderRadius: 12,
        }}>OPEN</span>
      </div>
      {openedAt && (
        <p style={{ fontSize: 13, color: T.textMuted, margin: '0 0 12px' }}>
          Opened {formatDistanceToNow(new Date(openedAt), { addSuffix: true })}
        </p>
      )}

      {/* Items table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left' }}>Product</th>
              <th style={{ ...thStyle, textAlign: 'center', width: 50 }}>Qty</th>
              <th style={{ ...thStyle, textAlign: 'right', width: 90 }}>Unit</th>
              <th style={{ ...thStyle, textAlign: 'right', width: 90 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} style={{ background: idx % 2 === 0 ? '#FAF8F5' : '#FFFFFF' }}>
                <td style={{ fontSize: 14, fontWeight: 500, color: T.textPrimary, padding: '10px 8px' }}>{item.product_name}</td>
                <td style={{ fontSize: 14, color: T.textSecondary, padding: '10px 8px', textAlign: 'center' }}>{item.qty}</td>
                <td style={{ fontSize: 14, color: T.textMuted, padding: '10px 8px', textAlign: 'right' }}>{formatCents(item.unit_price_cents)}</td>
                <td style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, padding: '10px 8px', textAlign: 'right' }}>{formatCents(item.line_total_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{ borderTop: `2px solid ${T.cardBorder}`, paddingTop: 12, marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary }}>Total:</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary }}>{formatCents(tabTotal)}</span>
        </div>
        {totalPaidCents > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <span style={{ fontSize: 14, color: T.teal }}>Credit Applied:</span>
            <span style={{ fontSize: 14, color: T.teal }}>- {formatCents(totalPaidCents)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: amountDue > 0 ? T.danger : T.teal }}>
            {amountDue > 0 ? 'Outstanding:' : 'Settled'}
          </span>
          {amountDue > 0 && (
            <span style={{ fontSize: 15, fontWeight: 600, color: T.danger }}>{formatCents(amountDue)}</span>
          )}
        </div>
      </div>

      {/* Pay button */}
      {amountDue >= 200 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            onClick={() => setShowPayDialog(true)}
            className="w-full lg:w-auto"
            style={{
              minWidth: 200, height: 48, background: T.navy, color: '#FFFFFF',
              fontWeight: 600, fontSize: 16, borderRadius: 10, border: 'none', cursor: 'pointer',
            }}
          >
            Pay {formatCents(amountDue)} Now
          </button>
        </div>
      )}
      {amountDue > 0 && amountDue < 200 && (
        <p style={{ fontSize: 13, color: T.textMuted, textAlign: 'center', marginTop: 12 }}>
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
      style={{
        background: T.cardBg, borderRadius: 12, border: `1px solid ${T.cardBorder}`,
        boxShadow: T.cardShadow, padding: 16, marginBottom: 8, cursor: 'pointer',
      }}
      onClick={() => setExpanded(e => !e)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 500, color: T.textPrimary }}>
            {format(new Date(tab.closed_at), 'dd MMM yyyy')}
          </span>
          <p style={{ fontSize: 12, color: T.textMuted, margin: '2px 0 0' }}>
            Opened {format(new Date(tab.opened_at), 'HH:mm')} — Closed {format(new Date(tab.closed_at), 'HH:mm')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: T.teal,
            background: 'rgba(42,157,143,0.1)', padding: '2px 8px', borderRadius: 10,
          }}>CLOSED</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{formatCents(tab.total_cents)}</span>
          {expanded ? <ChevronUp size={16} color={T.textMuted} /> : <ChevronDown size={16} color={T.textMuted} />}
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${T.cardBorder}`, paddingTop: 8, background: '#FAF8F5', borderRadius: 8, padding: 8 }}>
          {!items ? (
            <Skeleton className="h-4 w-full" />
          ) : items.length === 0 ? (
            <p style={{ fontSize: 13, color: T.textMuted }}>No items</p>
          ) : (
            items.map((it, i) => (
              <p key={i} style={{ fontSize: 13, color: T.textSecondary, padding: '6px 0', margin: 0 }}>
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
  const navigate = useNavigate();
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

  // ─── Right column cards ──────────────────────────────────────────
  const rightColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CreditBalanceBarCard
        balance={creditBalance}
        isLoading={creditLoading && isFirstLoad}
        onLoadCredit={() => setShowCreditSheet(true)}
        memberId={memberId}
        venueId={venueId}
      />
      <SpendingSnapshotCard memberId={memberId} venueId={venueId} />
      <FavouritesCard memberId={memberId} venueId={venueId} />
    </div>
  );

  // ─── Left column cards ──────────────────────────────────────────
  const openTabCard = (
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
  );

  const tabHistory = (
    <>
      {historyLoading && isFirstLoad ? (
        <div>
          <p style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary, marginBottom: 12 }}>Tab History</p>
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-16 w-full mb-2 rounded-lg" />
          ))}
        </div>
      ) : closedTabs.length > 0 ? (
        <div>
          <p style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary, marginBottom: 12 }}>Tab History</p>
          {closedTabs.map(tab => (
            <ClosedTabCard key={tab.id} tab={tab} venueId={venueId} />
          ))}
          {hasMore && (
            <p
              onClick={loadingMore ? undefined : handleLoadMore}
              style={{ fontSize: 14, color: T.teal, textAlign: 'center', padding: 12, cursor: 'pointer', opacity: loadingMore ? 0.5 : 1 }}
            >
              {loadingMore ? 'Loading…' : 'Load older tabs'}
            </p>
          )}
        </div>
      ) : null}
    </>
  );

  return (
    <div>
      {/* Back to Home */}
      <button
        onClick={() => navigate('/portal')}
        className="flex items-center gap-1"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 500, color: T.teal, marginBottom: 20, padding: 0,
        }}
      >
        <ArrowLeft size={16} />
        Home
      </button>

      {/* Mobile layout */}
      <div className="flex flex-col lg:hidden" style={{ gap: 16, paddingBottom: 100 }}>
        <CreditBalanceBarCard
          balance={creditBalance}
          isLoading={creditLoading && isFirstLoad}
          onLoadCredit={() => setShowCreditSheet(true)}
          memberId={memberId}
          venueId={venueId}
        />
        {openTabCard}
        <SpendingSnapshotCard memberId={memberId} venueId={venueId} />
        <FavouritesCard memberId={memberId} venueId={venueId} />
        {tabHistory}
      </div>

      {/* Desktop layout */}
      <div className="hidden lg:grid" style={{ gridTemplateColumns: '1fr 0.67fr', gap: 24, maxWidth: 1200, margin: '0 auto', paddingBottom: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {openTabCard}
          {tabHistory}
        </div>
        {rightColumn}
      </div>

      <CreditLoadSheet
        open={showCreditSheet}
        onClose={() => setShowCreditSheet(false)}
        memberId={memberId}
        venueId={venueId}
      />
    </div>
  );
}
