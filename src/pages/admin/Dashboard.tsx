import { useEffect, useState } from 'react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import AdminLayout from '@/components/admin/AdminLayout';
import BarTabRemindersCard from '@/components/admin/BarTabRemindersCard';
import OpenTabsDrawer from '@/components/admin/OpenTabsDrawer';
import { useVenue } from '@/contexts/VenueContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { Skeleton } from '@/components/ui/skeleton';
import { expandAllOccurrences, type EventSeries, type MonthlyMode, type Recurrence } from '@/utils/eventOccurrences';

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  padding: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

const sectionHeading: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#64748B',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 12,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 16,
};

const bigNumber: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 700,
  color: '#2E5FA3',
  lineHeight: 1.1,
};

const subText: React.CSSProperties = {
  fontSize: 14,
  color: '#475569',
  marginTop: 4,
};

const labelText: React.CSSProperties = {
  fontSize: 13,
  color: '#64748B',
  marginTop: 12,
};

const mutedText: React.CSSProperties = {
  fontSize: 14,
  color: '#94A3B8',
};

const errorText: React.CSSProperties = {
  fontSize: 13,
  color: '#DC2626',
};

export default function Dashboard() {
  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">
        <section>
          <h3 style={sectionHeading}>Needs Attention</h3>
          <div style={gridStyle}>
            <OpenTabsCard />
            <PendingEftBookingsCard />
          </div>
        </section>

        <section>
          <h3 style={sectionHeading}>Upcoming</h3>
          <div style={gridStyle}>
            <NextEventCard />
            <BookingsThisWeekCard />
          </div>
        </section>

        <BarTabRemindersCard />
      </div>
    </AdminLayout>
  );
}

function OpenTabsCard() {
  const { venueId } = useVenue();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ok'; count: number; outstandingCents: number }
  >({ status: 'loading' });
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ status: 'loading' });
      const { data: openTabs, error } = await supabase
        .from('tabs')
        .select('id')
        .eq('venue_id', venueId)
        .eq('status', 'OPEN');

      if (cancelled) return;
      if (error) {
        setState({ status: 'error' });
        return;
      }

      const tabIds = (openTabs ?? []).map((t) => t.id);
      const count = tabIds.length;

      if (count === 0) {
        setState({ status: 'ok', count: 0, outstandingCents: 0 });
        return;
      }

      const [itemsRes, pmtsRes] = await Promise.all([
        supabase.from('tab_items').select('line_total_cents').in('tab_id', tabIds),
        supabase.from('payments').select('amount_cents').in('tab_id', tabIds),
      ]);

      if (cancelled) return;
      if (itemsRes.error || pmtsRes.error) {
        setState({ status: 'error' });
        return;
      }

      const itemsTotal = (itemsRes.data ?? []).reduce((s, r) => s + (r.line_total_cents ?? 0), 0);
      const pmtsTotal = (pmtsRes.data ?? []).reduce((s, r) => s + (r.amount_cents ?? 0), 0);
      setState({ status: 'ok', count, outstandingCents: Math.max(0, itemsTotal - pmtsTotal) });
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  return (
    <div style={cardStyle}>
      {state.status === 'loading' && (
        <>
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-4 w-32 mt-2" />
          <Skeleton className="h-4 w-24 mt-3" />
        </>
      )}
      {state.status === 'error' && <p style={errorText}>Failed to load open tabs.</p>}
      {state.status === 'ok' && state.count === 0 && <p style={mutedText}>No open tabs</p>}
      {state.status === 'ok' && state.count > 0 && (
        <>
          <div style={bigNumber}>{state.count}</div>
          <p style={subText}>{formatCents(state.outstandingCents)} outstanding</p>
          <p style={labelText}>Open Bar Tabs</p>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            style={{
              marginTop: 12,
              background: 'transparent',
              color: '#2E5FA3',
              fontSize: 14,
              fontWeight: 600,
              border: '1px solid #2E5FA3',
              borderRadius: 6,
              padding: '8px 14px',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2E5FA3';
              e.currentTarget.style.color = '#FFFFFF';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#2E5FA3';
            }}
          >
            View Open Tabs
          </button>
        </>
      )}
      <OpenTabsDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} venueId={venueId} />
    </div>
  );
}

function PendingEftBookingsCard() {
  const { venueId } = useVenue();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ok'; count: number; totalCents: number }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ status: 'loading' });
      const { data, error } = await supabase
        .from('bookings')
        .select('total_price_cents')
        .eq('venue_id', venueId)
        .eq('status', 'pending')
        .eq('payment_method', 'eft');

      if (cancelled) return;
      if (error) {
        setState({ status: 'error' });
        return;
      }

      const count = data?.length ?? 0;
      const totalCents = (data ?? []).reduce((s, r) => s + (r.total_price_cents ?? 0), 0);
      setState({ status: 'ok', count, totalCents });
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  return (
    <div style={cardStyle}>
      {state.status === 'loading' && (
        <>
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-4 w-32 mt-2" />
          <Skeleton className="h-4 w-28 mt-3" />
        </>
      )}
      {state.status === 'error' && <p style={errorText}>Failed to load pending EFT bookings.</p>}
      {state.status === 'ok' && state.count === 0 && <p style={mutedText}>No pending EFT bookings</p>}
      {state.status === 'ok' && state.count > 0 && (
        <>
          <div style={bigNumber}>{state.count}</div>
          <p style={subText}>{formatCents(state.totalCents)} total value</p>
          <p style={labelText}>Pending EFT Bookings</p>
        </>
      )}
    </div>
  );
}

function NextEventCard() {
  const { venueId } = useVenue();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ok'; event: { title: string; event_date: string } | null }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ status: 'loading' });
      const todayISO = format(new Date(), 'yyyy-MM-dd');
      const horizon = format(new Date(Date.now() + 366 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

      const [seriesRes, exceptionsRes] = await Promise.all([
        supabase
          .from('club_events')
          .select('id, title, description, event_date, start_time, end_time, location, recurrence, recurrence_end_date, monthly_mode')
          .eq('venue_id', venueId)
          .lte('event_date', horizon),
        supabase
          .from('event_exceptions')
          .select('event_id, occurrence_date')
          .eq('venue_id', venueId)
          .gte('occurrence_date', todayISO),
      ]);

      if (cancelled) return;
      if (seriesRes.error || exceptionsRes.error) {
        setState({ status: 'error' });
        return;
      }

      const series: EventSeries[] = (seriesRes.data ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        event_date: e.event_date,
        start_time: e.start_time,
        end_time: e.end_time,
        location: e.location,
        recurrence: (e.recurrence ?? 'none') as Recurrence,
        recurrence_end_date: e.recurrence_end_date,
        monthly_mode: (e.monthly_mode ?? 'day_of_month') as MonthlyMode,
      }));
      const occs = expandAllOccurrences(series, todayISO, horizon, exceptionsRes.data ?? []);
      const next = occs[0];
      setState({
        status: 'ok',
        event: next ? { title: next.title, event_date: next.occurrence_date } : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  return (
    <div style={cardStyle}>
      {state.status === 'loading' && (
        <>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-40 mt-2" />
          <Skeleton className="h-4 w-24 mt-3" />
        </>
      )}
      {state.status === 'error' && <p style={errorText}>Failed to load next event.</p>}
      {state.status === 'ok' && !state.event && <p style={mutedText}>No upcoming events</p>}
      {state.status === 'ok' && state.event && (
        <>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1A202C' }}>{state.event.title}</div>
          <p style={subText}>{format(new Date(state.event.event_date + 'T00:00:00'), 'EEEE, d MMMM yyyy')}</p>
          <p style={labelText}>Next Event</p>
        </>
      )}
    </div>
  );
}

function BookingsThisWeekCard() {
  const { venueId } = useVenue();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ok'; count: number; totalCents: number }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ status: 'loading' });
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

      const { data, error } = await supabase
        .from('bookings')
        .select('total_price_cents')
        .eq('venue_id', venueId)
        .neq('status', 'cancelled')
        .gte('created_at', weekStart.toISOString())
        .lte('created_at', weekEnd.toISOString());

      if (cancelled) return;
      if (error) {
        setState({ status: 'error' });
        return;
      }
      const count = data?.length ?? 0;
      const totalCents = (data ?? []).reduce((s, r) => s + (r.total_price_cents ?? 0), 0);
      setState({ status: 'ok', count, totalCents });
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  return (
    <div style={cardStyle}>
      {state.status === 'loading' && (
        <>
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-4 w-32 mt-2" />
          <Skeleton className="h-4 w-32 mt-3" />
        </>
      )}
      {state.status === 'error' && <p style={errorText}>Failed to load bookings this week.</p>}
      {state.status === 'ok' && state.count === 0 && <p style={mutedText}>No bookings this week</p>}
      {state.status === 'ok' && state.count > 0 && (
        <>
          <div style={bigNumber}>{state.count}</div>
          <p style={subText}>{formatCents(state.totalCents)} total value</p>
          <p style={labelText}>Bookings This Week</p>
        </>
      )}
    </div>
  );
}
