import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subMonths, differenceInMinutes, differenceInDays } from 'date-fns';
import { Plus, CheckCircle, Search } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useVenue } from '@/contexts/VenueContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import BookingDetailDrawer from '@/components/admin/BookingDetailDrawer';
import BlackoutDrawer from '@/components/admin/BlackoutDrawer';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type BookingStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED';

const STATUS_STYLES: Record<BookingStatus, string> = {
  PENDING: 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]',
  PAID: 'bg-[#D1FAE5] text-[#065F46] border border-[#A7F3D0]',
  CANCELLED: 'bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]',
  EXPIRED: 'bg-[#F3F4F6] text-[#6B7280] border border-[#E5E7EB]',
};

function StatusBadge({ status }: { status: string }) {
  const s = status as BookingStatus;
  return (
    <span className={cn('inline-block text-xs font-medium rounded-full px-2.5 py-0.5', STATUS_STYLES[s] || STATUS_STYLES.PENDING)}>
      {status}
    </span>
  );
}

function formatDateRange(checkIn: string, checkOut: string) {
  const cin = new Date(checkIn + 'T00:00:00');
  const cout = new Date(checkOut + 'T00:00:00');
  const nights = differenceInDays(cout, cin);
  const sameMonth = cin.getMonth() === cout.getMonth() && cin.getFullYear() === cout.getFullYear();
  if (sameMonth) {
    return `${format(cin, 'd')}–${format(cout, 'd MMM yyyy')} (${nights} night${nights !== 1 ? 's' : ''})`;
  }
  return `${format(cin, 'd MMM')}–${format(cout, 'd MMM yyyy')} (${nights} night${nights !== 1 ? 's' : ''})`;
}

export default function AdminBookings() {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'all' | 'pending-eft' | 'blackouts' | 'stats'>('all');

  // Filters for All Bookings
  const [statusFilter, setStatusFilter] = useState('All');
  const [siteFilter, setSiteFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Drawer / dialog state
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [cancelBooking, setCancelBooking] = useState<{ id: string; code: string; status: string } | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [eftConfirm, setEftConfirm] = useState<{ id: string; code: string; name: string; amount: number } | null>(null);
  const [eftRef, setEftRef] = useState('');
  const [eftLoading, setEftLoading] = useState(false);
  const [blackoutDrawerOpen, setBlackoutDrawerOpen] = useState(false);
  const [deleteBlackout, setDeleteBlackout] = useState<{ id: string; start: string; end: string } | null>(null);

  // Stats date range
  const now = new Date();
  const [statsFrom, setStatsFrom] = useState<Date>(startOfMonth(now));
  const [statsTo, setStatsTo] = useState<Date>(endOfMonth(now));

  // Timer for expiry countdown
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(iv);
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Fetch booking sites for filters
  const { data: sites } = useQuery({
    queryKey: ['admin-booking-sites', venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from('booking_sites')
        .select('id, name')
        .eq('venue_id', venueId)
        .order('sort_order');
      return data || [];
    },
  });

  // Fetch all bookings with site names
  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ['admin-bookings', venueId, statusFilter, siteFilter, dateFrom, dateTo, debouncedSearch],
    queryFn: async () => {
      let q = supabase
        .from('bookings')
        .select('*, booking_site_link(site_id, nights, price_per_night_cents, subtotal_cents, booking_sites(name))')
        .eq('venue_id', venueId)
        .order('check_in', { ascending: false });

      if (statusFilter !== 'All') q = q.eq('status', statusFilter.toUpperCase());
      if (dateFrom) q = q.gte('check_in', dateFrom);
      if (dateTo) q = q.lte('check_in', dateTo);
      if (debouncedSearch) {
        q = q.or(`booking_code.ilike.%${debouncedSearch}%,guest_name.ilike.%${debouncedSearch}%,guest_email.ilike.%${debouncedSearch}%`);
      }

      const { data } = await q;
      let results = data || [];

      // Client-side site filter (need join data)
      if (siteFilter !== 'All') {
        results = results.filter((b: any) =>
          b.booking_site_link?.some((l: any) => l.site_id === siteFilter)
        );
      }
      return results;
    },
  });

  // Pending EFT count for badge
  const pendingEftCount = useMemo(() => {
    if (!bookings) return 0;
    return bookings.filter((b: any) => b.status === 'PENDING' && b.payment_method === 'eft').length;
  }, [bookings]);

  // Pending EFT bookings (separate query not filtered)
  const { data: pendingEftBookings } = useQuery({
    queryKey: ['admin-bookings-pending-eft', venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from('bookings')
        .select('*, booking_site_link(site_id, nights, price_per_night_cents, subtotal_cents, booking_sites(name))')
        .eq('venue_id', venueId)
        .eq('status', 'PENDING')
        .eq('payment_method', 'eft')
        .order('created_at', { ascending: true });
      return data || [];
    },
  });

  // Blackouts
  const { data: blackouts } = useQuery({
    queryKey: ['admin-blackouts', venueId],
    queryFn: async () => {
      const { data } = await supabase
        .from('booking_blackouts')
        .select('*, booking_sites(name)')
        .eq('venue_id', venueId)
        .order('start_date', { ascending: true });
      return data || [];
    },
  });

  // Stats data
  const { data: statsData } = useQuery({
    queryKey: ['admin-booking-stats', venueId, statsFrom.toISOString(), statsTo.toISOString()],
    queryFn: async () => {
      const fromStr = format(statsFrom, 'yyyy-MM-dd');
      const toStr = format(statsTo, 'yyyy-MM-dd');

      // Total bookings (non-cancelled) in date range
      const { data: allInRange } = await supabase
        .from('bookings')
        .select('id, status, total_price_cents')
        .eq('venue_id', venueId)
        .gte('check_in', fromStr)
        .lte('check_in', toStr)
        .neq('status', 'CANCELLED');

      const totalBookings = allInRange?.length || 0;
      const revenue = allInRange?.filter(b => b.status === 'PAID').reduce((s, b) => s + b.total_price_cents, 0) || 0;

      // Occupancy nights from paid bookings
      const paidIds = allInRange?.filter(b => b.status === 'PAID').map(b => b.id) || [];
      let occupancyNights = 0;
      if (paidIds.length > 0) {
        const { data: links } = await supabase
          .from('booking_site_link')
          .select('nights')
          .in('booking_id', paidIds);
        occupancyNights = links?.reduce((s, l) => s + l.nights, 0) || 0;
      }

      // Pending EFT count (not date filtered)
      const { count: pendingEft } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .eq('status', 'PENDING')
        .eq('payment_method', 'eft');

      // Site breakdown for paid bookings in range
      let siteBreakdown: { name: string; bookings: number; nights: number; revenue: number }[] = [];
      if (paidIds.length > 0) {
        const { data: siteLinks } = await supabase
          .from('booking_site_link')
          .select('site_id, nights, subtotal_cents, booking_sites(name)')
          .in('booking_id', paidIds);
        const map = new Map<string, { name: string; bookings: Set<string>; nights: number; revenue: number }>();
        siteLinks?.forEach((l: any) => {
          const key = l.site_id;
          if (!map.has(key)) map.set(key, { name: l.booking_sites?.name || 'Unknown', bookings: new Set(), nights: 0, revenue: 0 });
          const entry = map.get(key)!;
          entry.nights += l.nights;
          entry.revenue += l.subtotal_cents;
        });
        siteBreakdown = Array.from(map.values()).map(v => ({
          name: v.name,
          bookings: v.bookings.size || 1,
          nights: v.nights,
          revenue: v.revenue,
        })).sort((a, b) => b.revenue - a.revenue);

        // Count bookings per site properly
        const bookingsBySite = new Map<string, Set<string>>();
        siteLinks?.forEach((l: any) => {
          if (!bookingsBySite.has(l.site_id)) bookingsBySite.set(l.site_id, new Set());
          // We don't have booking_id in select, add it
        });
        // Re-fetch with booking_id for counting
        const { data: siteLinks2 } = await supabase
          .from('booking_site_link')
          .select('site_id, booking_id, nights, subtotal_cents, booking_sites(name)')
          .in('booking_id', paidIds);
        const map2 = new Map<string, { name: string; bookingIds: Set<string>; nights: number; revenue: number }>();
        siteLinks2?.forEach((l: any) => {
          const key = l.site_id;
          if (!map2.has(key)) map2.set(key, { name: l.booking_sites?.name || 'Unknown', bookingIds: new Set(), nights: 0, revenue: 0 });
          const entry = map2.get(key)!;
          entry.bookingIds.add(l.booking_id);
          entry.nights += l.nights;
          entry.revenue += l.subtotal_cents;
        });
        siteBreakdown = Array.from(map2.values()).map(v => ({
          name: v.name,
          bookings: v.bookingIds.size,
          nights: v.nights,
          revenue: v.revenue,
        })).sort((a, b) => b.revenue - a.revenue);
      }

      return { totalBookings, revenue, occupancyNights, pendingEft: pendingEft || 0, siteBreakdown };
    },
  });

  // Cancel handler
  const handleCancel = async () => {
    if (!cancelBooking) return;
    setCancelLoading(true);
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString(), cancelled_by: adminUser?.auth_user_id || null })
      .eq('id', cancelBooking.id);
    setCancelLoading(false);
    if (error) {
      toast.error('Failed to cancel booking');
      return;
    }
    toast.success(`Booking ${cancelBooking.code} cancelled`);
    queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['admin-bookings-pending-eft'] });
    queryClient.invalidateQueries({ queryKey: ['admin-booking-stats'] });
    setCancelBooking(null);
    setDetailBookingId(null);
  };

  // EFT confirm handler
  const handleEftConfirm = async () => {
    if (!eftConfirm) return;
    setEftLoading(true);
    await supabase
      .from('booking_payments')
      .update({
        status: 'confirmed',
        confirmed_by: adminUser?.auth_user_id || null,
        confirmed_at: new Date().toISOString(),
        reference: eftRef || null,
      })
      .eq('booking_id', eftConfirm.id)
      .eq('method', 'eft');
    await supabase.from('bookings').update({ status: 'PAID' }).eq('id', eftConfirm.id);
    setEftLoading(false);
    toast.success(`Payment confirmed — booking ${eftConfirm.code} marked as PAID`);
    queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['admin-bookings-pending-eft'] });
    queryClient.invalidateQueries({ queryKey: ['admin-booking-stats'] });
    setEftConfirm(null);
    setEftRef('');
  };

  // Delete blackout handler
  const handleDeleteBlackout = async () => {
    if (!deleteBlackout) return;
    await supabase.from('booking_blackouts').delete().eq('id', deleteBlackout.id);
    queryClient.invalidateQueries({ queryKey: ['admin-blackouts'] });
    toast.success('Blackout removed');
    setDeleteBlackout(null);
  };

  function getSiteNames(booking: any): string {
    return booking.booking_site_link?.map((l: any) => l.booking_sites?.name).filter(Boolean).join(', ') || '—';
  }

  function formatExpiry(expiresAt: string | null) {
    if (!expiresAt) return '—';
    const exp = new Date(expiresAt);
    const now = new Date();
    const mins = differenceInMinutes(exp, now);
    if (mins <= 0) return <span className="text-[#C0392B] font-medium">Expired</span>;
    if (mins <= 60) return <span className="text-[#D68910]">{mins}m remaining</span>;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return <span className="text-muted-foreground">{hours}h {remMins}m remaining</span>;
  }

  const tabs = [
    { key: 'all' as const, label: 'All Bookings' },
    { key: 'pending-eft' as const, label: 'Pending EFT', badge: pendingEftCount > 0 ? pendingEftCount : null },
    { key: 'blackouts' as const, label: 'Blackouts' },
    { key: 'stats' as const, label: 'Stats' },
  ];

  const renderBookingsTable = (data: any[], showStatus = true, showExpiry = false, showConfirm = false) => (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Code</TableHead>
            <TableHead>Guest</TableHead>
            <TableHead className="w-[160px]">Site(s)</TableHead>
            <TableHead className="w-[160px]">Dates</TableHead>
            <TableHead className="w-[70px]">Guests</TableHead>
            <TableHead className="w-[100px]">Total</TableHead>
            {showStatus && <TableHead className="w-[100px]">Status</TableHead>}
            {showExpiry && <TableHead className="w-[130px]">Expires</TableHead>}
            {showConfirm && <TableHead className="w-[140px]">Confirm</TableHead>}
            <TableHead className="w-[120px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showExpiry ? 9 : 8} className="text-center py-12 text-muted-foreground">
                {showExpiry ? (
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle className="h-8 w-8 text-[#1E8449]" />
                    <span>No pending EFT bookings</span>
                  </div>
                ) : 'No bookings found'}
              </TableCell>
            </TableRow>
          ) : data.map((b: any) => (
            <TableRow key={b.id}>
              <TableCell className="font-mono text-[13px]">{b.booking_code}</TableCell>
              <TableCell>
                <div className="font-medium text-sm">{b.guest_name}</div>
                <div className="text-[13px] text-muted-foreground">{b.guest_email}</div>
              </TableCell>
              <TableCell className="text-sm">{getSiteNames(b)}</TableCell>
              <TableCell className="text-sm">{formatDateRange(b.check_in, b.check_out)}</TableCell>
              <TableCell className="text-sm">{b.num_guests}</TableCell>
              <TableCell className="text-sm">
                {b.total_price_cents === 0 ? <span className="text-[#1E8449]">Free</span> : formatCents(b.total_price_cents)}
              </TableCell>
              {showStatus && <TableCell><StatusBadge status={b.status} /></TableCell>}
              {showExpiry && <TableCell className="text-sm">{formatExpiry(b.expires_at)}</TableCell>}
              {showConfirm && (
                <TableCell>
                  <Button
                    size="sm"
                    className="h-9 text-[13px] font-medium bg-[#1E8449] hover:bg-[#1E8449]/90 text-white"
                    onClick={() => setEftConfirm({ id: b.id, code: b.booking_code, name: b.guest_name, amount: b.total_price_cents })}
                  >
                    Confirm Payment
                  </Button>
                </TableCell>
              )}
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-8 text-[13px] text-primary" onClick={() => setDetailBookingId(b.id)}>
                    View
                  </Button>
                  {(b.status === 'PENDING' || b.status === 'PAID') && (
                    <Button variant="ghost" size="sm" className="h-8 text-[13px] text-[#C0392B]"
                      onClick={() => setCancelBooking({ id: b.id, code: b.booking_code, status: b.status })}>
                      Cancel
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <AdminLayout title="Bookings">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === t.key
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            )}
          >
            {t.label}
            {t.badge != null && (
              <span className="ml-1.5 inline-flex items-center justify-center bg-[#D68910] text-white text-xs rounded-full px-2 py-0.5 min-w-[20px]">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: All Bookings */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-[38px] border border-border rounded-md px-3 text-sm bg-card"
            >
              <option>All</option>
              <option>Pending</option>
              <option>Paid</option>
              <option>Cancelled</option>
              <option>Expired</option>
            </select>
            <select
              value={siteFilter}
              onChange={e => setSiteFilter(e.target.value)}
              className="h-[38px] border border-border rounded-md px-3 text-sm bg-card"
            >
              <option value="All">All Sites</option>
              {sites?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-[38px] w-[150px] text-sm"
              placeholder="From"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-[38px] w-[150px] text-sm"
              placeholder="To"
            />
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by code, name or email"
                className="h-[38px] w-[260px] pl-9 text-sm"
              />
            </div>
          </div>
          {renderBookingsTable(bookings || [])}
        </div>
      )}

      {/* TAB 2: Pending EFT */}
      {activeTab === 'pending-eft' && (
        <div>
          {renderBookingsTable(pendingEftBookings || [], false, true, true)}
        </div>
      )}

      {/* TAB 3: Blackouts */}
      {activeTab === 'blackouts' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button className="h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" onClick={() => setBlackoutDrawerOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Blackout
            </Button>
          </div>
          {(!blackouts || blackouts.length === 0) ? (
            <p className="text-center py-12 text-muted-foreground">No blackout dates set</p>
          ) : blackouts.map((bo: any) => {
            const isPast = new Date(bo.end_date + 'T23:59:59') < new Date();
            const days = differenceInDays(new Date(bo.end_date + 'T00:00:00'), new Date(bo.start_date + 'T00:00:00')) + 1;
            return (
              <div key={bo.id} className={cn('bg-card border border-border rounded-lg p-4 shadow-subtle flex justify-between items-start', isPast && 'opacity-50')}>
                <div>
                  <p className="text-[15px] font-semibold text-foreground">
                    {format(new Date(bo.start_date + 'T00:00:00'), 'd MMMM')} – {format(new Date(bo.end_date + 'T00:00:00'), 'd MMMM yyyy')}
                  </p>
                  <p className="text-sm text-muted-foreground">{bo.site_id ? (bo.booking_sites as any)?.name : 'All Sites'}</p>
                  {bo.reason && <p className="text-sm text-muted-foreground">{bo.reason}</p>}
                  <p className="text-[13px] text-muted-foreground">{days} day{days !== 1 ? 's' : ''}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-[#C0392B] border-border"
                  onClick={() => setDeleteBlackout({ id: bo.id, start: bo.start_date, end: bo.end_date })}
                >
                  Delete
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 4: Stats */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Date range */}
          <div className="flex flex-wrap gap-3 items-center">
            <Input type="date" value={format(statsFrom, 'yyyy-MM-dd')} onChange={e => setStatsFrom(new Date(e.target.value + 'T00:00:00'))} className="h-[38px] w-[160px] text-sm" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={format(statsTo, 'yyyy-MM-dd')} onChange={e => setStatsTo(new Date(e.target.value + 'T00:00:00'))} className="h-[38px] w-[160px] text-sm" />
            <Button variant="outline" size="sm" onClick={() => { setStatsFrom(startOfMonth(now)); setStatsTo(endOfMonth(now)); }}>This Month</Button>
            <Button variant="outline" size="sm" onClick={() => { setStatsFrom(startOfMonth(subMonths(now, 1))); setStatsTo(endOfMonth(subMonths(now, 1))); }}>Last Month</Button>
          </div>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Bookings', value: String(statsData?.totalBookings ?? 0) },
              { label: 'Revenue', value: formatCents(statsData?.revenue ?? 0) },
              { label: 'Occupancy Nights', value: `${statsData?.occupancyNights ?? 0} nights` },
              { label: 'Pending EFT', value: String(statsData?.pendingEft ?? 0), warn: (statsData?.pendingEft ?? 0) > 0 },
            ].map(kpi => (
              <div key={kpi.label} className="bg-card border border-border rounded-lg p-4 shadow-subtle">
                <p className="text-[13px] text-muted-foreground font-medium">{kpi.label}</p>
                <p className={cn('text-2xl font-bold text-foreground mt-1', kpi.warn && 'text-[#D68910]')}>{kpi.value}</p>
              </div>
            ))}
          </div>
          {/* Site breakdown */}
          {statsData?.siteBreakdown && statsData.siteBreakdown.length > 0 ? (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead className="w-[100px]">Bookings</TableHead>
                    <TableHead className="w-[100px]">Nights</TableHead>
                    <TableHead className="w-[120px]">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statsData.siteBreakdown.map((s, i) => (
                    <TableRow key={s.name} className={i % 2 === 1 ? 'bg-[#FAFBFC]' : ''}>
                      <TableCell className="text-sm font-medium">{s.name}</TableCell>
                      <TableCell className="text-sm">{s.bookings}</TableCell>
                      <TableCell className="text-sm">{s.nights}</TableCell>
                      <TableCell className="text-sm">{formatCents(s.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">No booking data for this period</p>
          )}
        </div>
      )}

      {/* Booking detail drawer */}
      <BookingDetailDrawer
        open={!!detailBookingId}
        onClose={() => setDetailBookingId(null)}
        bookingId={detailBookingId}
        onCancel={(id, code, status) => setCancelBooking({ id, code, status })}
        onConfirmEft={(id, code, name, amount) => setEftConfirm({ id, code, name, amount })}
      />

      {/* Blackout drawer */}
      <BlackoutDrawer
        open={blackoutDrawerOpen}
        onClose={() => setBlackoutDrawerOpen(false)}
        sites={sites || []}
      />

      {/* Cancel confirmation dialog */}
      <Dialog open={!!cancelBooking} onOpenChange={() => setCancelBooking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel booking {cancelBooking?.code}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {cancelBooking?.status === 'PAID' && (
            <p className="text-sm text-[#C0392B]">This booking has already been paid. A refund may need to be arranged separately.</p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelBooking(null)}>Keep Booking</Button>
            <Button className="bg-[#C0392B] hover:bg-[#C0392B]/90 text-white" onClick={handleCancel} disabled={cancelLoading}>
              {cancelLoading ? 'Cancelling...' : 'Cancel Booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EFT confirm dialog */}
      <Dialog open={!!eftConfirm} onOpenChange={() => { setEftConfirm(null); setEftRef(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm EFT Payment</DialogTitle>
            <DialogDescription>Confirm that the bank transfer has been received.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Booking:</span><span className="font-mono">{eftConfirm?.code}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Guest:</span><span>{eftConfirm?.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span><span className="font-semibold">{formatCents(eftConfirm?.amount ?? 0)}</span></div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Bank reference (optional)</label>
              <Input value={eftRef} onChange={e => setEftRef(e.target.value)} placeholder="Bank reference (optional)" className="text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEftConfirm(null); setEftRef(''); }}>Cancel</Button>
            <Button className="bg-[#1E8449] hover:bg-[#1E8449]/90 text-white" onClick={handleEftConfirm} disabled={eftLoading}>
              {eftLoading ? 'Confirming...' : 'Confirm Payment Received'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete blackout dialog */}
      <Dialog open={!!deleteBlackout} onOpenChange={() => setDeleteBlackout(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Blackout</DialogTitle>
            <DialogDescription>
              Delete this blackout period? This will re-open {deleteBlackout?.start && format(new Date(deleteBlackout.start + 'T00:00:00'), 'd MMM yyyy')} – {deleteBlackout?.end && format(new Date(deleteBlackout.end + 'T00:00:00'), 'd MMM yyyy')} for bookings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteBlackout(null)}>Cancel</Button>
            <Button className="bg-[#C0392B] hover:bg-[#C0392B]/90 text-white" onClick={handleDeleteBlackout}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
