import { useEffect, useState } from 'react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
import AttentionCenter from '@/components/admin/AttentionCenter';
import LivePaymentsCard from '@/components/admin/LivePaymentsCard';
import OpenTabsDrawer from '@/components/admin/OpenTabsDrawer';
import { useVenue } from '@/contexts/VenueContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCents } from '@/utils/currency';
import { Skeleton } from '@/components/ui/skeleton';
import { expandAllOccurrences, type EventSeries, type MonthlyMode, type Recurrence } from '@/utils/eventOccurrences';
import ManagerDashboard from './ManagerDashboard';

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
  const { adminUser } = useAdminAuth();

  // The club manager has nothing to do with the bar — show a facilities-focused
  // dashboard instead of the bar KPI cards.
  if (adminUser?.role === 'manager') {
    return <ManagerDashboard />;
  }

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">
        <AttentionCenter />

        <section>
          <h3 style={sectionHeading}>Today</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
            <LivePaymentsCard />
            <StaysCard />
          </div>
        </section>

        <section>
          <h3 style={sectionHeading}>At a Glance</h3>
          <div style={gridStyle}>
            <OpenTabsCard />
            <OnTheWaterCard />
            <NextEventCard />
          </div>
        </section>
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

interface StayRow {
  id: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  status: string;
}

function StaysCard() {
  const { venueId } = useVenue();
  const { adminPath } = useVenueNav();
  const navigate = useNavigate();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ok'; rows: StayRow[] }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ status: 'loading' });
      const now = new Date();
      const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');

      // A stay belongs to this week if it overlaps it — NOT if it was created this week.
      const { data, error } = await supabase
        .from('bookings')
        .select('id, guest_name, check_in, check_out, num_guests, status')
        .eq('venue_id', venueId)
        .lte('check_in', weekEnd)
        .gte('check_out', weekStart)
        .order('check_in');

      if (cancelled) return;
      if (error) {
        setState({ status: 'error' });
        return;
      }
      // Status casing varies (PENDING/EXPIRED vs lowercase) — compare case-insensitively.
      const rows = (data ?? []).filter((b) => !['CANCELLED', 'EXPIRED'].includes((b.status ?? '').toUpperCase()));
      setState({ status: 'ok', rows });
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const rows = state.status === 'ok' ? state.rows : [];
  const arriving = rows.filter((r) => r.check_in === today);
  const departing = rows.filter((r) => r.check_out === today);
  const inHouse = rows.filter((r) => r.check_in < today && r.check_out > today);
  const upcoming = rows.filter((r) => r.check_in > today);

  const fmt = (d: string) => format(new Date(d + 'T00:00:00'), 'EEE d MMM');
  const line = (r: StayRow, detail: string) => (
    <div key={`${r.id}-${detail}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, padding: '6px 0', borderTop: '1px solid #F1F5F9' }}>
      <span style={{ color: '#1A202C', fontWeight: 500 }}>
        {r.guest_name}
        <span style={{ color: '#94A3B8', fontWeight: 400 }}>{`  ·  ${r.num_guests} guest${r.num_guests === 1 ? '' : 's'}`}</span>
      </span>
      <span style={{ color: '#64748B', whiteSpace: 'nowrap' }}>{detail}</span>
    </div>
  );

  const stats: Array<[string, number]> = [
    ['Arriving today', arriving.length],
    ['Staying', inHouse.length],
    ['Leaving today', departing.length],
  ];

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Stays This Week
        </span>
        <button
          type="button"
          onClick={() => navigate(adminPath('bookings'))}
          style={{ background: 'none', border: 'none', color: '#2E5FA3', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          All bookings
        </button>
      </div>

      {state.status === 'loading' && <Skeleton className="h-20 w-full mt-4" />}
      {state.status === 'error' && <p style={{ ...errorText, marginTop: 12 }}>Failed to load bookings.</p>}
      {state.status === 'ok' && rows.length === 0 && <p style={{ ...mutedText, marginTop: 12 }}>No stays this week</p>}
      {state.status === 'ok' && rows.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
            {stats.map(([label, n]) => (
              <div key={label}>
                <div style={{ fontSize: 26, fontWeight: 700, color: n > 0 ? '#2E5FA3' : '#CBD5E1', lineHeight: 1.1 }}>{n}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            {arriving.map((r) => line(r, `Arrives today → ${fmt(r.check_out)}`))}
            {inHouse.map((r) => line(r, `Until ${fmt(r.check_out)}`))}
            {departing.map((r) => line(r, 'Leaves today'))}
            {upcoming.map((r) => line(r, `Arrives ${fmt(r.check_in)}`))}
          </div>
        </>
      )}
    </div>
  );
}

function OnTheWaterCard() {
  const { venueId } = useVenue();
  const { adminPath } = useVenueNav();
  const navigate = useNavigate();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ok'; out: number; overdue: number }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('water_signouts')
        .select('expected_return_at')
        .eq('venue_id', venueId)
        .eq('status', 'out');
      if (cancelled) return;
      if (error) {
        setState({ status: 'error' });
        return;
      }
      const nowMs = Date.now();
      const rows = data ?? [];
      setState({
        status: 'ok',
        out: rows.length,
        overdue: rows.filter((r) => new Date(r.expected_return_at).getTime() < nowMs).length,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  return (
    <div style={cardStyle}>
      {state.status === 'loading' && <Skeleton className="h-16 w-full" />}
      {state.status === 'error' && <p style={errorText}>Failed to load water sign-outs.</p>}
      {state.status === 'ok' && state.out === 0 && <p style={mutedText}>No boats signed out</p>}
      {state.status === 'ok' && state.out > 0 && (
        <>
          <div style={bigNumber}>{state.out}</div>
          <p style={{ ...subText, color: state.overdue > 0 ? '#DC2626' : '#475569', fontWeight: state.overdue > 0 ? 600 : 400 }}>
            {state.overdue > 0 ? `${state.overdue} overdue` : 'all within expected return time'}
          </p>
          <p style={labelText}>Boats On the Water</p>
          <button
            type="button"
            onClick={() => navigate(adminPath('water-signouts'))}
            style={{ marginTop: 12, background: 'transparent', color: '#2E5FA3', fontSize: 14, fontWeight: 600, border: '1px solid #2E5FA3', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}
          >
            View Sign-Outs
          </button>
        </>
      )}
    </div>
  );
}
