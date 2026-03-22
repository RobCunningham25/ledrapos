import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
import MemberDrawer from '@/components/admin/MemberDrawer';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { formatCents } from '@/utils/currency';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  membership_number: string;
  membership_type: string;
  email: string | null;
  phone: string | null;
  partner_name: string | null;
  is_active: boolean;
  auth_user_id: string | null;
  created_at: string | null;
}

interface CreditRow {
  id: string;
  amount_cents: number;
  type: string;
  method: string | null;
  description: string | null;
  created_at: string | null;
}

interface TabRow {
  id: string;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  item_count: number;
  total_cents: number;
  paid_cents: number;
}

interface TabItemDetail {
  id: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
  product_name: string;
}

interface PaymentDetail {
  id: string;
  method: string;
  amount_cents: number;
  paid_at: string | null;
  reference: string | null;
}

const TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  member: { text: '#2E5FA3', bg: 'rgba(46,95,163,0.1)' },
  associate: { text: '#D68910', bg: 'rgba(214,137,16,0.1)' },
  honorary: { text: '#1E8449', bg: 'rgba(30,132,73,0.1)' },
};

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { venueId } = useVenue();

  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'credit' | 'tabs'>('credit');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Credit state
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [creditBalance, setCreditBalance] = useState(0);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Tabs state
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [tabsLoading, setTabsLoading] = useState(true);
  const [tabsOffset, setTabsOffset] = useState(0);
  const [hasMoreTabs, setHasMoreTabs] = useState(false);
  const [expandedTab, setExpandedTab] = useState<string | null>(null);
  const [tabDetails, setTabDetails] = useState<Record<string, { items: TabItemDetail[]; payments: PaymentDetail[] }>>({});

  const fetchMember = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, membership_number, membership_type, email, phone, partner_name, is_active, auth_user_id, created_at')
      .eq('id', id)
      .eq('venue_id', venueId)
      .single();
    setMember(data as Member | null);
    setLoading(false);
  }, [id, venueId]);

  const fetchCreditBalance = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('member_credits')
      .select('amount_cents, type')
      .eq('member_id', id)
      .eq('venue_id', venueId);
    if (data) {
      const bal = data.reduce((s, r) => s + (r.type === 'CREDIT' ? r.amount_cents : -r.amount_cents), 0);
      setCreditBalance(bal);
    }
  }, [id, venueId]);

  const fetchCredits = useCallback(async () => {
    if (!id) return;
    setCreditsLoading(true);
    let q = supabase
      .from('member_credits')
      .select('id, amount_cents, type, method, description, created_at')
      .eq('member_id', id)
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false });

    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59`);

    const { data } = await q;
    setCredits((data as CreditRow[]) || []);
    setCreditsLoading(false);
  }, [id, venueId, dateFrom, dateTo]);

  const fetchTabs = useCallback(async (offset = 0, append = false) => {
    if (!id) return;
    if (!append) setTabsLoading(true);

    const { data: tabData } = await supabase
      .from('tabs')
      .select('id, status, opened_at, closed_at')
      .eq('member_id', id)
      .eq('venue_id', venueId)
      .eq('is_cash_customer', false)
      .order('opened_at', { ascending: false })
      .range(offset, offset + 19);

    if (tabData) {
      const enriched: TabRow[] = await Promise.all(
        tabData.map(async (t: any) => {
          const { data: items } = await supabase
            .from('tab_items')
            .select('line_total_cents')
            .eq('tab_id', t.id)
            .eq('venue_id', venueId);
          const { data: payments } = await supabase
            .from('payments')
            .select('amount_cents')
            .eq('tab_id', t.id)
            .eq('venue_id', venueId);
          return {
            ...t,
            item_count: items?.length || 0,
            total_cents: items?.reduce((s: number, i: any) => s + i.line_total_cents, 0) || 0,
            paid_cents: payments?.reduce((s: number, p: any) => s + p.amount_cents, 0) || 0,
          };
        })
      );
      setTabs(prev => append ? [...prev, ...enriched] : enriched);
      setHasMoreTabs(tabData.length === 20);
      setTabsOffset(offset + tabData.length);
    }
    setTabsLoading(false);
  }, [id, venueId]);

  const fetchTabDetail = async (tabId: string) => {
    if (tabDetails[tabId]) return;
    const [{ data: items }, { data: payments }] = await Promise.all([
      supabase
        .from('tab_items')
        .select('id, qty, unit_price_cents, line_total_cents, product_id, liquor_products(name)')
        .eq('tab_id', tabId)
        .eq('venue_id', venueId)
        .order('created_at'),
      supabase
        .from('payments')
        .select('id, method, amount_cents, paid_at, reference')
        .eq('tab_id', tabId)
        .eq('venue_id', venueId)
        .order('paid_at'),
    ]);

    setTabDetails(prev => ({
      ...prev,
      [tabId]: {
        items: (items || []).map((i: any) => ({
          id: i.id,
          qty: i.qty,
          unit_price_cents: i.unit_price_cents,
          line_total_cents: i.line_total_cents,
          product_name: i.liquor_products?.name || 'Unknown',
        })),
        payments: (payments || []) as PaymentDetail[],
      },
    }));
  };

  useEffect(() => { fetchMember(); fetchCreditBalance(); }, [fetchMember, fetchCreditBalance]);
  useEffect(() => { fetchCredits(); }, [fetchCredits]);
  useEffect(() => { fetchTabs(); }, [fetchTabs]);

  const handleExpandTab = (tabId: string) => {
    if (expandedTab === tabId) {
      setExpandedTab(null);
    } else {
      setExpandedTab(tabId);
      fetchTabDetail(tabId);
    }
  };

  const setQuickDate = (which: 'this' | 'last') => {
    const now = new Date();
    if (which === 'this') {
      setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    } else {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(first.toISOString().slice(0, 10));
      setDateTo(last.toISOString().slice(0, 10));
    }
  };

  const totalLoaded = credits.filter(c => c.type === 'CREDIT').reduce((s, c) => s + c.amount_cents, 0);
  const totalSpent = credits.filter(c => c.type === 'DEBIT').reduce((s, c) => s + c.amount_cents, 0);

  const tc = member ? TYPE_COLORS[member.membership_type] || TYPE_COLORS.member : TYPE_COLORS.member;

  if (loading) {
    return (
      <AdminLayout title="Member">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!member) {
    return (
      <AdminLayout title="Member">
        <p className="text-muted-foreground">Member not found.</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={`${member.first_name} ${member.last_name}`} action={
      <Button
        variant="outline"
        onClick={() => setDrawerOpen(true)}
        style={{ height: 40, borderColor: '#2E5FA3', color: '#2E5FA3' }}
      >
        <Pencil className="h-4 w-4 mr-2" />
        Edit
      </Button>
    }>
      {/* Back link */}
      <button
        onClick={() => navigate('/admin/members')}
        className="flex items-center gap-1 mb-4 transition-colors"
        style={{ fontSize: 14, color: '#718096' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#2E5FA3')}
        onMouseLeave={e => (e.currentTarget.style.color = '#718096')}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Members
      </button>

      {/* Header badges */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <span style={{ fontSize: 14, color: '#718096' }}>{member.membership_number}</span>
        <span
          style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 999,
            fontSize: 12, fontWeight: 600, color: tc.text, background: tc.bg,
          }}
        >
          {member.membership_type.charAt(0).toUpperCase() + member.membership_type.slice(1)}
        </span>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 999,
            fontSize: 12, fontWeight: 600,
            color: member.is_active ? '#1E8449' : '#C0392B',
            background: member.is_active ? 'rgba(30,132,73,0.1)' : 'rgba(192,57,43,0.1)',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: member.is_active ? '#1E8449' : '#C0392B' }} />
          {member.is_active ? 'Active' : 'Inactive'}
        </span>
        {member.auth_user_id && (
          <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 999,
            fontSize: 12, fontWeight: 600, color: '#1E8449', background: 'rgba(30,132,73,0.1)',
          }}>
            Portal access
          </span>
        )}
      </div>

      {/* Info card */}
      <div style={{
        background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0',
        padding: 24, marginBottom: 24,
      }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          {[
            ['Email', member.email || '—'],
            ['Phone', member.phone || '—'],
            ['Partner', member.partner_name || '—'],
            ['Member since', member.created_at ? format(new Date(member.created_at), 'dd MMM yyyy') : '—'],
            ['Credit balance', formatCents(creditBalance)],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p style={{ fontSize: 13, color: '#718096', fontWeight: 500 }}>{label}</p>
              <p style={{
                fontSize: 15, fontWeight: 500,
                color: label === 'Credit balance' ? (creditBalance > 0 ? '#1E8449' : '#718096') : '#1A202C',
              }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b mb-6" style={{ borderColor: '#E2E8F0' }}>
        {(['credit', 'tabs'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 16px', fontSize: 14, fontWeight: 500,
              color: activeTab === tab ? '#2E5FA3' : '#718096',
              borderBottom: activeTab === tab ? '2px solid #2E5FA3' : '2px solid transparent',
              background: 'transparent',
            }}
          >
            {tab === 'credit' ? 'Credit History' : 'Tab History'}
          </button>
        ))}
      </div>

      {/* CREDIT HISTORY TAB */}
      {activeTab === 'credit' && (
        <div>
          {/* Date filters */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label style={{ fontSize: 12, color: '#718096' }}>From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ display: 'block', height: 36, border: '1px solid #E2E8F0', borderRadius: 6, padding: '0 10px', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#718096' }}>To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ display: 'block', height: 36, border: '1px solid #E2E8F0', borderRadius: 6, padding: '0 10px', fontSize: 13 }} />
            </div>
            <button onClick={() => setQuickDate('this')}
              style={{ height: 36, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, fontWeight: 500, background: '#FFFFFF', color: '#1A202C' }}>
              This Month
            </button>
            <button onClick={() => setQuickDate('last')}
              style={{ height: 36, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, fontWeight: 500, background: '#FFFFFF', color: '#1A202C' }}>
              Last Month
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 16 }}>
              <p style={{ fontSize: 12, color: '#718096', fontWeight: 500 }}>Total Loaded</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#1E8449' }}>{formatCents(totalLoaded)}</p>
            </div>
            <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 16 }}>
              <p style={{ fontSize: 12, color: '#718096', fontWeight: 500 }}>Total Spent</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#C0392B' }}>{formatCents(totalSpent)}</p>
            </div>
            <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 16 }}>
              <p style={{ fontSize: 12, color: '#718096', fontWeight: 500 }}>Current Balance</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: creditBalance > 0 ? '#1E8449' : '#718096' }}>{formatCents(creditBalance)}</p>
            </div>
          </div>

          {/* Credits table */}
          <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0', background: '#F9FAFB' }}>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: '#718096' }}>Date</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: '#718096' }}>Type</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: '#718096' }}>Method</th>
                  <th className="text-right px-4 py-3 font-medium" style={{ color: '#718096' }}>Amount</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: '#718096' }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {creditsLoading && [1, 2, 3].map(i => (
                  <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td className="px-4 py-3" colSpan={5}><Skeleton className="h-5 w-full" /></td>
                  </tr>
                ))}
                {!creditsLoading && credits.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center" colSpan={5} style={{ color: '#718096' }}>
                      No credit transactions found for this period.
                    </td>
                  </tr>
                )}
                {credits.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td className="px-4 py-3" style={{ color: '#1A202C', fontSize: 13 }}>
                      {c.created_at ? format(new Date(c.created_at), 'dd MMM yyyy, HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                        color: c.type === 'CREDIT' ? '#1E8449' : '#C0392B',
                        background: c.type === 'CREDIT' ? 'rgba(30,132,73,0.1)' : 'rgba(192,57,43,0.1)',
                      }}>
                        {c.type}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: '#1A202C' }}>{c.method || '—'}</td>
                    <td className="px-4 py-3 text-right" style={{
                      fontWeight: 600,
                      color: c.type === 'CREDIT' ? '#1E8449' : '#C0392B',
                    }}>
                      {c.type === 'DEBIT' ? '−' : ''}{formatCents(c.amount_cents)}
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: '#718096', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.description || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB HISTORY TAB */}
      {activeTab === 'tabs' && (
        <div>
          {tabsLoading && [1, 2].map(i => (
            <Skeleton key={i} className="h-16 w-full mb-3" />
          ))}

          {!tabsLoading && tabs.length === 0 && (
            <p style={{ fontSize: 15, color: '#718096' }}>No tab history found for this member.</p>
          )}

          {!tabsLoading && tabs.length > 0 && (
            <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', background: '#F9FAFB' }}>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: '#718096' }}>Opened</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: '#718096' }}>Closed</th>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: '#718096' }}>Status</th>
                    <th className="text-center px-4 py-3 font-medium" style={{ color: '#718096' }}>Items</th>
                    <th className="text-right px-4 py-3 font-medium" style={{ color: '#718096' }}>Total</th>
                    <th className="text-right px-4 py-3 font-medium" style={{ color: '#718096' }}>Payments</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {tabs.map(t => (
                    <>
                      <tr
                        key={t.id}
                        onClick={() => handleExpandTab(t.id)}
                        className="cursor-pointer hover:bg-accent/30 transition-colors"
                        style={{ borderBottom: '1px solid #E2E8F0' }}
                      >
                        <td className="px-4 py-3" style={{ fontSize: 13, color: '#1A202C' }}>
                          {t.opened_at ? format(new Date(t.opened_at), 'dd MMM yyyy, HH:mm') : '—'}
                        </td>
                        <td className="px-4 py-3" style={{ fontSize: 13, color: '#1A202C' }}>
                          {t.closed_at ? format(new Date(t.closed_at), 'dd MMM yyyy, HH:mm') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                            color: t.status === 'OPEN' ? '#D68910' : '#1E8449',
                            background: t.status === 'OPEN' ? 'rgba(214,137,16,0.1)' : 'rgba(30,132,73,0.1)',
                          }}>
                            {t.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center" style={{ color: '#1A202C' }}>{t.item_count}</td>
                        <td className="px-4 py-3 text-right" style={{ fontWeight: 600, color: '#1A202C' }}>{formatCents(t.total_cents)}</td>
                        <td className="px-4 py-3 text-right" style={{ fontWeight: 600, color: '#1A202C' }}>{formatCents(t.paid_cents)}</td>
                        <td className="px-4 py-3 text-center">
                          {expandedTab === t.id
                            ? <ChevronUp className="h-4 w-4" style={{ color: '#718096' }} />
                            : <ChevronDown className="h-4 w-4" style={{ color: '#718096' }} />
                          }
                        </td>
                      </tr>
                      {expandedTab === t.id && (
                        <tr key={`${t.id}-detail`}>
                          <td colSpan={7} style={{ background: '#F9FAFB', padding: '12px 24px' }}>
                            {!tabDetails[t.id] ? (
                              <Skeleton className="h-8 w-full" />
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                  <p style={{ fontSize: 12, fontWeight: 600, color: '#718096', marginBottom: 8 }}>ITEMS</p>
                                  {tabDetails[t.id].items.map(item => (
                                    <div key={item.id} className="flex justify-between py-1" style={{ fontSize: 13, color: '#1A202C' }}>
                                      <span>{item.product_name} × {item.qty}</span>
                                      <span style={{ fontWeight: 500 }}>{formatCents(item.line_total_cents)}</span>
                                    </div>
                                  ))}
                                </div>
                                <div>
                                  <p style={{ fontSize: 12, fontWeight: 600, color: '#718096', marginBottom: 8 }}>PAYMENTS</p>
                                  {tabDetails[t.id].payments.length === 0 && (
                                    <p style={{ fontSize: 13, color: '#718096' }}>No payments</p>
                                  )}
                                  {tabDetails[t.id].payments.map(p => (
                                    <div key={p.id} className="flex justify-between py-1" style={{ fontSize: 13, color: '#1A202C' }}>
                                      <span>
                                        <span style={{
                                          display: 'inline-block', padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 600, marginRight: 6,
                                          color: p.method === 'CREDIT' ? '#2E5FA3' : p.method === 'CASH' ? '#D68910' : '#1E8449',
                                          background: p.method === 'CREDIT' ? 'rgba(46,95,163,0.1)' : p.method === 'CASH' ? 'rgba(214,137,16,0.1)' : 'rgba(30,132,73,0.1)',
                                        }}>{p.method}</span>
                                        {p.paid_at ? format(new Date(p.paid_at), 'HH:mm') : ''}
                                        {p.reference ? ` — ${p.reference}` : ''}
                                      </span>
                                      <span style={{ fontWeight: 500 }}>{formatCents(p.amount_cents)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasMoreTabs && (
            <button
              onClick={() => fetchTabs(tabsOffset, true)}
              style={{ display: 'block', margin: '16px auto', fontSize: 14, color: '#2E5FA3', fontWeight: 500, background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              Load more
            </button>
          )}
        </div>
      )}

      {/* Edit drawer */}
      <MemberDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        venueId={venueId}
        member={member}
        onSuccess={() => { fetchMember(); fetchCreditBalance(); }}
      />
    </AdminLayout>
  );
}
