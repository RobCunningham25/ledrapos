import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVenueNav } from '@/hooks/useVenueNav';
import AdminLayout from '@/components/admin/AdminLayout';
import MemberDrawer from '@/components/admin/MemberDrawer';
import MemberDetailsTab from '@/components/admin/MemberDetailsTab';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/contexts/VenueContext';
import { formatCents } from '@/utils/currency';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Pencil, ChevronDown, ChevronUp, Shield, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/utils/time';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  membership_number: string;
  membership_type: string;
  email: string | null;
  phone: string | null;
  partner_name: string | null;
  partner_first_name: string | null;
  partner_last_name: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  is_active: boolean;
  auth_user_id: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
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

interface AdminAccessRow {
  id: string;
  role: 'admin' | 'superadmin';
  is_active: boolean;
}

import { MEMBERSHIP_TYPE_COLORS, getMembershipLabel } from '@/constants/membershipTypes';

function getMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { adminPath } = useVenueNav();
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const isSuperadmin = adminUser?.role === 'superadmin';

  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tabs' | 'credit' | 'details'>('tabs');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Admin access state
  const [adminRow, setAdminRow] = useState<AdminAccessRow | null>(null);
  const [roleChoice, setRoleChoice] = useState<'admin' | 'superadmin'>('admin');
  const [adminBusy, setAdminBusy] = useState(false);

  // Credit state
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditDateFrom, setCreditDateFrom] = useState(getMonthStart);
  const [creditDateTo, setCreditDateTo] = useState(getToday);

  // Balance due state
  const [balanceDue, setBalanceDue] = useState(0);

  // Tabs state
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [tabsLoading, setTabsLoading] = useState(true);
  const [tabsOffset, setTabsOffset] = useState(0);
  const [hasMoreTabs, setHasMoreTabs] = useState(false);
  const [expandedTab, setExpandedTab] = useState<string | null>(null);
  const [tabDetails, setTabDetails] = useState<Record<string, { items: TabItemDetail[]; payments: PaymentDetail[] }>>({});

  // Tab history date filter
  const [tabDateFrom, setTabDateFrom] = useState(getMonthStart);
  const [tabDateTo, setTabDateTo] = useState(getToday);

  // Tab history summary state
  const [tabSummary, setTabSummary] = useState({ spendPeriod: 0, lifetimeSpend: 0, tabsClosed: 0 });
  const [tabSummaryLoading, setTabSummaryLoading] = useState(true);

  const fetchMember = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .rpc('get_members_with_auth', { p_venue_id: venueId })
      .eq('id', id)
      .maybeSingle();
    setMember(data as Member | null);
    setLoading(false);
  }, [id, venueId]);

  const fetchAdminAccess = useCallback(async (email: string | null) => {
    if (!email || !venueId) {
      setAdminRow(null);
      return;
    }
    const { data } = await supabase
      .from('admin_users')
      .select('id, role, is_active')
      .eq('venue_id', venueId)
      .ilike('email', email)
      .maybeSingle();
    const row = (data as AdminAccessRow | null) ?? null;
    setAdminRow(row);
    if (row && row.is_active) setRoleChoice(row.role);
  }, [venueId]);

  const handleSetAdmin = async (grant: boolean) => {
    if (!member?.id || !venueId) return;
    setAdminBusy(true);
    try {
      const res = await supabase.functions.invoke('set-member-admin', {
        body: { member_id: member.id, venue_id: venueId, grant, role: grant ? roleChoice : undefined },
      });
      if (res.error) {
        let detail: string | null = null;
        const ctx = (res.error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) detail = body.error;
          } catch { /* body wasn't JSON */ }
        }
        toast.error(detail || res.error.message || 'Failed to update admin access');
      } else if (res.data?.error) {
        toast.error(res.data.error);
      } else {
        const action = res.data?.action as string | undefined;
        const label = `${member.first_name} ${member.last_name}`.trim();
        if (action === 'granted') toast.success(`${label} now has ${roleChoice} access`);
        else if (action === 'updated') toast.success(`${label}'s role updated to ${roleChoice}`);
        else if (action === 'revoked') toast.success(`Admin access revoked from ${label}`);
        else toast.success('Admin access updated');
        await fetchAdminAccess(member.email);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update admin access');
    }
    setAdminBusy(false);
  };

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

  const fetchBalanceDue = useCallback(async () => {
    if (!id) return;
    const { data: openTabs } = await supabase
      .from('tabs')
      .select('id')
      .eq('member_id', id)
      .eq('venue_id', venueId)
      .eq('status', 'OPEN')
      .eq('is_cash_customer', false);

    if (!openTabs || openTabs.length === 0) {
      setBalanceDue(0);
      return;
    }

    let total = 0;
    for (const tab of openTabs) {
      const [{ data: items }, { data: payments }] = await Promise.all([
        supabase.from('tab_items').select('line_total_cents').eq('tab_id', tab.id).eq('venue_id', venueId),
        supabase.from('payments').select('amount_cents').eq('tab_id', tab.id).eq('venue_id', venueId),
      ]);
      const tabTotal = items?.reduce((s: number, i: any) => s + i.line_total_cents, 0) || 0;
      const paidTotal = payments?.reduce((s: number, p: any) => s + p.amount_cents, 0) || 0;
      total += Math.max(0, tabTotal - paidTotal);
    }
    setBalanceDue(total);
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

    if (creditDateFrom) q = q.gte('created_at', `${creditDateFrom}T00:00:00`);
    if (creditDateTo) q = q.lte('created_at', `${creditDateTo}T23:59:59`);

    const { data } = await q;
    setCredits((data as CreditRow[]) || []);
    setCreditsLoading(false);
  }, [id, venueId, creditDateFrom, creditDateTo]);

  const fetchTabs = useCallback(async (offset = 0, append = false) => {
    if (!id) return;
    if (!append) setTabsLoading(true);

    // Fetch open tabs (always shown)
    const openTabsPromise = offset === 0
      ? supabase
          .from('tabs')
          .select('id, status, opened_at, closed_at')
          .eq('member_id', id)
          .eq('venue_id', venueId)
          .eq('is_cash_customer', false)
          .eq('status', 'OPEN')
          .order('opened_at', { ascending: false })
      : null;

    // Fetch closed tabs within date range
    let closedQ = supabase
      .from('tabs')
      .select('id, status, opened_at, closed_at')
      .eq('member_id', id)
      .eq('venue_id', venueId)
      .eq('is_cash_customer', false)
      .eq('status', 'CLOSED')
      .order('closed_at', { ascending: false });

    if (tabDateFrom) closedQ = closedQ.gte('closed_at', `${tabDateFrom}T00:00:00`);
    if (tabDateTo) closedQ = closedQ.lte('closed_at', `${tabDateTo}T23:59:59`);

    // For pagination on closed tabs
    const closedOffset = offset === 0 ? 0 : offset;
    closedQ = closedQ.range(closedOffset, closedOffset + 19);

    const [openResult, closedResult] = await Promise.all([
      openTabsPromise ? openTabsPromise : Promise.resolve({ data: [] as any[] }),
      closedQ,
    ]);

    const openData = offset === 0 ? (openResult.data || []) : [];
    const closedData = closedResult.data || [];
    const allTabData = [...openData, ...closedData];

    if (allTabData.length > 0) {
      const enriched: TabRow[] = await Promise.all(
        allTabData.map(async (t: any) => {
          const [{ data: items }, { data: payments }] = await Promise.all([
            supabase.from('tab_items').select('line_total_cents').eq('tab_id', t.id).eq('venue_id', venueId),
            supabase.from('payments').select('amount_cents').eq('tab_id', t.id).eq('venue_id', venueId),
          ]);
          return {
            ...t,
            item_count: items?.length || 0,
            total_cents: items?.reduce((s: number, i: any) => s + i.line_total_cents, 0) || 0,
            paid_cents: payments?.reduce((s: number, p: any) => s + p.amount_cents, 0) || 0,
          };
        })
      );
      setTabs(prev => append ? [...prev, ...enriched] : enriched);
      setHasMoreTabs(closedData.length === 20);
      setTabsOffset(closedOffset + closedData.length);
    } else {
      if (!append) setTabs([]);
      setHasMoreTabs(false);
    }
    setTabsLoading(false);
  }, [id, venueId, tabDateFrom, tabDateTo]);

  const fetchTabSummary = useCallback(async () => {
    if (!id) return;
    setTabSummaryLoading(true);

    // Spend this period: sum line_total_cents from tab_items for closed tabs in date range
    let periodTabsQ = supabase
      .from('tabs')
      .select('id')
      .eq('member_id', id)
      .eq('venue_id', venueId)
      .eq('status', 'CLOSED')
      .eq('is_cash_customer', false);
    if (tabDateFrom) periodTabsQ = periodTabsQ.gte('closed_at', `${tabDateFrom}T00:00:00`);
    if (tabDateTo) periodTabsQ = periodTabsQ.lte('closed_at', `${tabDateTo}T23:59:59`);

    const { data: periodTabs } = await periodTabsQ;

    let spendPeriod = 0;
    const tabsClosed = periodTabs?.length || 0;
    if (periodTabs && periodTabs.length > 0) {
      const tabIds = periodTabs.map((t: any) => t.id);
      const { data: periodItems } = await supabase
        .from('tab_items')
        .select('line_total_cents')
        .eq('venue_id', venueId)
        .in('tab_id', tabIds);
      spendPeriod = periodItems?.reduce((s: number, i: any) => s + i.line_total_cents, 0) || 0;
    }

    // Lifetime spend: all closed tabs
    const { data: allClosedTabs } = await supabase
      .from('tabs')
      .select('id')
      .eq('member_id', id)
      .eq('venue_id', venueId)
      .eq('status', 'CLOSED')
      .eq('is_cash_customer', false);

    let lifetimeSpend = 0;
    if (allClosedTabs && allClosedTabs.length > 0) {
      const allTabIds = allClosedTabs.map((t: any) => t.id);
      const { data: allItems } = await supabase
        .from('tab_items')
        .select('line_total_cents')
        .eq('venue_id', venueId)
        .in('tab_id', allTabIds);
      lifetimeSpend = allItems?.reduce((s: number, i: any) => s + i.line_total_cents, 0) || 0;
    }

    setTabSummary({ spendPeriod, lifetimeSpend, tabsClosed });
    setTabSummaryLoading(false);
  }, [id, venueId, tabDateFrom, tabDateTo]);

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

  useEffect(() => { fetchMember(); fetchCreditBalance(); fetchBalanceDue(); }, [fetchMember, fetchCreditBalance, fetchBalanceDue]);
  useEffect(() => { fetchAdminAccess(member?.email ?? null); }, [member?.email, fetchAdminAccess]);
  useEffect(() => { fetchCredits(); }, [fetchCredits]);
  useEffect(() => { fetchTabs(); fetchTabSummary(); }, [fetchTabs, fetchTabSummary]);

  const handleExpandTab = (tabId: string) => {
    if (expandedTab === tabId) {
      setExpandedTab(null);
    } else {
      setExpandedTab(tabId);
      fetchTabDetail(tabId);
    }
  };

  const setCreditQuickDate = (which: 'this' | 'last') => {
    const now = new Date();
    if (which === 'this') {
      setCreditDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
      setCreditDateTo(now.toISOString().slice(0, 10));
    } else {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setCreditDateFrom(first.toISOString().slice(0, 10));
      setCreditDateTo(last.toISOString().slice(0, 10));
    }
  };

  const setTabQuickDate = (which: 'this' | 'last') => {
    const now = new Date();
    if (which === 'this') {
      setTabDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
      setTabDateTo(now.toISOString().slice(0, 10));
    } else {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setTabDateFrom(first.toISOString().slice(0, 10));
      setTabDateTo(last.toISOString().slice(0, 10));
    }
  };

  const totalLoaded = credits.filter(c => c.type === 'CREDIT').reduce((s, c) => s + c.amount_cents, 0);
  const totalSpent = credits.filter(c => c.type === 'DEBIT').reduce((s, c) => s + c.amount_cents, 0);

  const tc = member ? MEMBERSHIP_TYPE_COLORS[member.membership_type] || MEMBERSHIP_TYPE_COLORS.ordinary : MEMBERSHIP_TYPE_COLORS.ordinary;

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
        onClick={() => navigate(adminPath('members'))}
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
          {getMembershipLabel(member.membership_type)}
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
        {adminRow?.is_active && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 999,
            fontSize: 12, fontWeight: 600, color: '#2E5FA3', background: 'rgba(46,95,163,0.1)',
          }}>
            <Shield size={12} />
            {adminRow.role === 'superadmin' ? 'Superadmin' : 'Admin'}
          </span>
        )}
      </div>

      {/* Info card */}
      <div style={{
        background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0',
        padding: 24, marginBottom: 24,
      }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          <div>
            <p style={{ fontSize: 13, color: '#718096', fontWeight: 500 }}>Email</p>
            <p style={{ fontSize: 15, fontWeight: 500, color: '#1A202C' }}>{member.email || '—'}</p>
          </div>
          <div>
            <p style={{ fontSize: 13, color: '#718096', fontWeight: 500 }}>Phone</p>
            <p style={{ fontSize: 15, fontWeight: 500, color: '#1A202C' }}>{member.phone || '—'}</p>
          </div>
          <div>
            <p style={{ fontSize: 13, color: '#718096', fontWeight: 500 }}>Partner</p>
            <p style={{ fontSize: 15, fontWeight: 500, color: '#1A202C' }}>
              {[member.partner_first_name, member.partner_last_name].filter(Boolean).join(' ') || '—'}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 13, color: '#718096', fontWeight: 500 }}>Emergency Contact</p>
            <p style={{ fontSize: 15, fontWeight: 500, color: '#1A202C' }}>
              {[member.emergency_contact_name, member.emergency_contact_phone].filter(Boolean).join(' — ') || '—'}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 13, color: '#718096', fontWeight: 500 }}>Member since</p>
            <p style={{ fontSize: 15, fontWeight: 500, color: '#1A202C' }}>
              {member.created_at ? format(new Date(member.created_at), 'dd MMM yyyy') : '—'}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 13, color: '#718096', fontWeight: 500 }}>Last Login</p>
            <p
              style={{ fontSize: 15, fontWeight: 500, color: '#1A202C' }}
              title={member.last_sign_in_at ? new Date(member.last_sign_in_at).toLocaleString('en-ZA') : undefined}
            >
              {member.last_sign_in_at ? formatRelativeTime(member.last_sign_in_at) : '—'}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 13, color: '#718096', fontWeight: 500 }}>Membership #</p>
            <p style={{ fontSize: 15, fontWeight: 500, color: '#1A202C' }}>{member.membership_number}</p>
          </div>
          <div>
            <p style={{ fontSize: 13, color: '#718096', fontWeight: 500 }}>Credit balance</p>
            <p style={{
              fontSize: 15, fontWeight: 500,
              color: creditBalance > 0 ? '#1E8449' : '#718096',
            }}>
              {formatCents(creditBalance)}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 13, color: '#718096', fontWeight: 500 }}>Balance due</p>
            <p style={{
              fontSize: 15,
              fontWeight: balanceDue > 0 ? 600 : 400,
              color: balanceDue > 0 ? '#C0392B' : '#718096',
            }}>
              {formatCents(balanceDue)}
            </p>
          </div>
        </div>
      </div>

      {/* Admin access — superadmin only */}
      {isSuperadmin && (
        <div style={{
          background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0',
          padding: 20, marginBottom: 24,
        }}>
          <div className="flex items-center gap-2 mb-3">
            <Shield size={18} style={{ color: '#2E5FA3' }} />
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1A202C', margin: 0 }}>Admin access</h3>
          </div>
          <p style={{ fontSize: 13, color: '#718096', marginBottom: 16 }}>
            {adminRow?.is_active
              ? `This member has ${adminRow.role === 'superadmin' ? 'superadmin' : 'admin'} access to the admin area.`
              : 'Grant this member access to the admin area. They will sign in with the same email they use for the portal.'}
          </p>
          {!member.email ? (
            <p style={{ fontSize: 13, color: '#C0392B' }}>
              Member has no email address. Add an email before granting admin access.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label style={{ fontSize: 12, color: '#718096', display: 'block', marginBottom: 4 }}>Role</label>
                <Select
                  value={roleChoice}
                  onValueChange={(v) => setRoleChoice(v as 'admin' | 'superadmin')}
                  disabled={adminBusy}
                >
                  <SelectTrigger style={{ width: 160, height: 36 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="superadmin">Superadmin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => handleSetAdmin(true)}
                disabled={adminBusy || (adminRow?.is_active === true && adminRow.role === roleChoice)}
                style={{ height: 36, background: '#2E5FA3', color: '#FFFFFF', fontWeight: 600 }}
              >
                {adminBusy ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                {adminRow?.is_active ? 'Update role' : 'Grant admin access'}
              </Button>
              {adminRow?.is_active && (
                <Button
                  variant="outline"
                  onClick={() => handleSetAdmin(false)}
                  disabled={adminBusy}
                  style={{ height: 36, borderColor: '#C0392B', color: '#C0392B' }}
                >
                  Revoke
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab navigation — Tab History, Credit History, Details */}
      <div className="flex border-b mb-6" style={{ borderColor: '#E2E8F0' }}>
        {([['tabs', 'Tab History'], ['credit', 'Credit History'], ['details', 'Details']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '12px 16px', fontSize: 14, fontWeight: 500,
              color: activeTab === key ? '#2E5FA3' : '#718096',
              borderBottom: activeTab === key ? '2px solid #2E5FA3' : '2px solid transparent',
              background: 'transparent',
            }}
          >
            {label}
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
              <input type="date" value={creditDateFrom} onChange={e => setCreditDateFrom(e.target.value)}
                style={{ display: 'block', height: 36, border: '1px solid #E2E8F0', borderRadius: 6, padding: '0 10px', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#718096' }}>To</label>
              <input type="date" value={creditDateTo} onChange={e => setCreditDateTo(e.target.value)}
                style={{ display: 'block', height: 36, border: '1px solid #E2E8F0', borderRadius: 6, padding: '0 10px', fontSize: 13 }} />
            </div>
            <button onClick={() => setCreditQuickDate('this')}
              style={{ height: 36, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, fontWeight: 500, background: '#FFFFFF', color: '#1A202C' }}>
              This Month
            </button>
            <button onClick={() => setCreditQuickDate('last')}
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
          {/* Date filters */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label style={{ fontSize: 12, color: '#718096' }}>From</label>
              <input type="date" value={tabDateFrom} onChange={e => setTabDateFrom(e.target.value)}
                style={{ display: 'block', height: 36, border: '1px solid #E2E8F0', borderRadius: 6, padding: '0 10px', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#718096' }}>To</label>
              <input type="date" value={tabDateTo} onChange={e => setTabDateTo(e.target.value)}
                style={{ display: 'block', height: 36, border: '1px solid #E2E8F0', borderRadius: 6, padding: '0 10px', fontSize: 13 }} />
            </div>
            <button onClick={() => setTabQuickDate('this')}
              style={{ height: 36, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, fontWeight: 500, background: '#FFFFFF', color: '#1A202C' }}>
              This Month
            </button>
            <button onClick={() => setTabQuickDate('last')}
              style={{ height: 36, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, fontWeight: 500, background: '#FFFFFF', color: '#1A202C' }}>
              Last Month
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 16 }}>
              <p style={{ fontSize: 13, color: '#718096', fontWeight: 400 }}>Open Tab</p>
              <p style={{ fontSize: 20, fontWeight: 600, color: balanceDue > 0 ? '#C0392B' : '#718096' }}>
                {formatCents(balanceDue)}
              </p>
            </div>
            <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 16 }}>
              <p style={{ fontSize: 13, color: '#718096', fontWeight: 400 }}>Spend This Period</p>
              <p style={{ fontSize: 20, fontWeight: 600, color: '#1A202C' }}>
                {tabSummaryLoading ? '...' : formatCents(tabSummary.spendPeriod)}
              </p>
            </div>
            <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 16 }}>
              <p style={{ fontSize: 13, color: '#718096', fontWeight: 400 }}>Lifetime Spend</p>
              <p style={{ fontSize: 20, fontWeight: 600, color: '#1A202C' }}>
                {tabSummaryLoading ? '...' : formatCents(tabSummary.lifetimeSpend)}
              </p>
            </div>
            <div style={{ background: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 16 }}>
              <p style={{ fontSize: 13, color: '#718096', fontWeight: 400 }}>Tabs Closed</p>
              <p style={{ fontSize: 20, fontWeight: 600, color: '#1A202C' }}>
                {tabSummaryLoading ? '...' : tabSummary.tabsClosed}
              </p>
            </div>
          </div>

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

      {/* DETAILS TAB */}
      {activeTab === 'details' && (
        <MemberDetailsTab
          memberId={member.id}
          venueId={venueId}
          onMemberUpdated={() => { fetchMember(); fetchCreditBalance(); fetchBalanceDue(); }}
        />
      )}

      {/* Edit drawer */}
      <MemberDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        venueId={venueId}
        member={member}
        onSuccess={() => { fetchMember(); fetchCreditBalance(); fetchBalanceDue(); }}
      />
    </AdminLayout>
  );
}
