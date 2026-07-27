import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
import { useVenue } from '@/contexts/VenueContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useVenueNav } from '@/hooks/useVenueNav';
import { supabase } from '@/integrations/supabase/client';
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

const bigNumber: React.CSSProperties = { fontSize: 36, fontWeight: 700, color: '#2E5FA3', lineHeight: 1.1 };
const subText: React.CSSProperties = { fontSize: 14, color: '#475569', marginTop: 4 };
const labelText: React.CSSProperties = { fontSize: 13, color: '#64748B', marginTop: 12 };
const mutedText: React.CSSProperties = { fontSize: 14, color: '#94A3B8' };
const errorText: React.CSSProperties = { fontSize: 13, color: '#DC2626' };

const linkBtn: React.CSSProperties = {
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
};

function hoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = '#2E5FA3';
  e.currentTarget.style.color = '#FFFFFF';
}
function hoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'transparent';
  e.currentTarget.style.color = '#2E5FA3';
}

export default function ManagerDashboard() {
  const { adminUser } = useAdminAuth();
  return (
    <AdminLayout title={`Welcome${adminUser?.name ? `, ${adminUser.name.split(' ')[0]}` : ''}`}>
      <div className="space-y-6">
        <section>
          <h3 style={sectionHeading}>My Work</h3>
          <div style={gridStyle}>
            <MyOpenJobsCard />
            <OpenIssuesCard />
            <MyLeaveCard />
          </div>
        </section>

        <section>
          <h3 style={sectionHeading}>Upcoming</h3>
          <div style={gridStyle}>
            <NextEventCard />
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

function MyOpenJobsCard() {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const navigate = useNavigate();
  const { adminPath } = useVenueNav();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ok'; count: number }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!adminUser) return;
      setState({ status: 'loading' });
      const { count, error } = await supabase
        .from('staff_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .eq('assigned_to', adminUser.id)
        .neq('status', 'done');
      if (cancelled) return;
      if (error) { setState({ status: 'error' }); return; }
      setState({ status: 'ok', count: count ?? 0 });
    })();
    return () => { cancelled = true; };
  }, [venueId, adminUser]);

  return (
    <div style={cardStyle}>
      {state.status === 'loading' && (<><Skeleton className="h-9 w-16" /><Skeleton className="h-4 w-32 mt-2" /><Skeleton className="h-4 w-24 mt-3" /></>)}
      {state.status === 'error' && <p style={errorText}>Failed to load jobs.</p>}
      {state.status === 'ok' && (
        <>
          <div style={bigNumber}>{state.count}</div>
          <p style={subText}>{state.count === 1 ? 'job' : 'jobs'} still to do</p>
          <p style={labelText}>My Open Jobs</p>
          <button type="button" onClick={() => navigate(adminPath('jobs'))} style={linkBtn} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
            View Jobs
          </button>
        </>
      )}
    </div>
  );
}

function OpenIssuesCard() {
  const { venueId } = useVenue();
  const navigate = useNavigate();
  const { adminPath } = useVenueNav();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ok'; count: number }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ status: 'loading' });
      const { count, error } = await supabase
        .from('issue_reports')
        .select('id', { count: 'exact', head: true })
        .eq('venue_id', venueId)
        .neq('status', 'resolved');
      if (cancelled) return;
      if (error) { setState({ status: 'error' }); return; }
      setState({ status: 'ok', count: count ?? 0 });
    })();
    return () => { cancelled = true; };
  }, [venueId]);

  return (
    <div style={cardStyle}>
      {state.status === 'loading' && (<><Skeleton className="h-9 w-16" /><Skeleton className="h-4 w-32 mt-2" /><Skeleton className="h-4 w-24 mt-3" /></>)}
      {state.status === 'error' && <p style={errorText}>Failed to load issues.</p>}
      {state.status === 'ok' && state.count === 0 && <p style={mutedText}>No open issues</p>}
      {state.status === 'ok' && state.count > 0 && (
        <>
          <div style={bigNumber}>{state.count}</div>
          <p style={subText}>{state.count === 1 ? 'issue' : 'issues'} needing attention</p>
          <p style={labelText}>Open Issues</p>
          <button type="button" onClick={() => navigate(adminPath('issues'))} style={linkBtn} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
            View Issues
          </button>
        </>
      )}
    </div>
  );
}

function MyLeaveCard() {
  const { venueId } = useVenue();
  const { adminUser } = useAdminAuth();
  const navigate = useNavigate();
  const { adminPath } = useVenueNav();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ok'; pending: number; nextApproved: string | null }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!adminUser) return;
      setState({ status: 'loading' });
      const todayISO = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('leave_requests')
        .select('status, start_date')
        .eq('venue_id', venueId)
        .eq('admin_user_id', adminUser.id);
      if (cancelled) return;
      if (error) { setState({ status: 'error' }); return; }
      const pending = (data ?? []).filter((r) => r.status === 'pending').length;
      const upcoming = (data ?? [])
        .filter((r) => r.status === 'approved' && r.start_date >= todayISO)
        .map((r) => r.start_date)
        .sort();
      setState({ status: 'ok', pending, nextApproved: upcoming[0] ?? null });
    })();
    return () => { cancelled = true; };
  }, [venueId, adminUser]);

  return (
    <div style={cardStyle}>
      {state.status === 'loading' && (<><Skeleton className="h-9 w-16" /><Skeleton className="h-4 w-32 mt-2" /><Skeleton className="h-4 w-24 mt-3" /></>)}
      {state.status === 'error' && <p style={errorText}>Failed to load leave.</p>}
      {state.status === 'ok' && (
        <>
          {state.pending > 0 ? (
            <>
              <div style={bigNumber}>{state.pending}</div>
              <p style={subText}>awaiting committee approval</p>
            </>
          ) : state.nextApproved ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1A202C' }}>
                {format(new Date(state.nextApproved + 'T00:00:00'), 'd MMM yyyy')}
              </div>
              <p style={subText}>next approved leave</p>
            </>
          ) : (
            <p style={mutedText}>No leave requests</p>
          )}
          <p style={labelText}>My Leave</p>
          <button type="button" onClick={() => navigate(adminPath('leave'))} style={linkBtn} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
            Manage Leave
          </button>
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
      if (seriesRes.error || exceptionsRes.error) { setState({ status: 'error' }); return; }

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
      setState({ status: 'ok', event: next ? { title: next.title, event_date: next.occurrence_date } : null });
    })();
    return () => { cancelled = true; };
  }, [venueId]);

  return (
    <div style={cardStyle}>
      {state.status === 'loading' && (<><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-40 mt-2" /><Skeleton className="h-4 w-24 mt-3" /></>)}
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
