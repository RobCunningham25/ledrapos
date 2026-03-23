import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVenueNav } from '@/hooks/useVenueNav';
import { useQuery } from '@tanstack/react-query';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { usePortalTheme } from '@/contexts/PortalThemeContext';
import { usePortalCredit } from '@/hooks/usePortalCredit';
import { usePortalOpenTab } from '@/hooks/usePortalOpenTab';
import { formatCents } from '@/utils/currency';
import { Calendar, BedDouble } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import CreditLoadSheet from '@/components/portal/CreditLoadSheet';
import { supabase } from '@/integrations/supabase/client';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate() {
  return new Date().toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ─── Weather Widget ────────────────────────────────────────────
function WeatherWidget() {
  const [weather, setWeather] = useState<{ temp: number; desc: string; icon: string } | null>(null);

  useEffect(() => {
    const key = import.meta.env.VITE_OPENWEATHER_API_KEY;
    if (!key) return;

    const cacheKey = 'portal_weather';
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 30 * 60 * 1000) { setWeather(data); return; }
      } catch { /* ignore */ }
    }

    fetch(`https://api.openweathermap.org/data/2.5/weather?lat=-26.8700&lon=28.1200&units=metric&appid=${key}`)
      .then(r => r.json())
      .then(d => {
        if (d?.main?.temp != null) {
          const w = { temp: Math.round(d.main.temp), desc: d.weather?.[0]?.description || '', icon: d.weather?.[0]?.icon || '' };
          setWeather(w);
          sessionStorage.setItem(cacheKey, JSON.stringify({ data: w, ts: Date.now() }));
        }
      })
      .catch(() => {});
  }, []);

  if (!weather) return null;

  return (
    <div className="flex items-center gap-2 shrink-0">
      {weather.icon && (
        <img src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`} alt="" style={{ width: 48, height: 48 }} />
      )}
      <div style={{ textAlign: 'right' }}>
        <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--portal-text-primary)', margin: 0 }}>{weather.temp}°C</p>
        <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: 0, textTransform: 'capitalize' }}>{weather.desc}</p>
      </div>
    </div>
  );
}

// ─── Credit & Tab Card ─────────────────────────────────────────
function CreditTabCard({ memberId, venueId }: { memberId: string; venueId: string }) {
  const { balance, isLoading: creditLoading } = usePortalCredit(memberId, venueId);
  const { tabTotal, amountDue, isLoading: tabLoading, items } = usePortalOpenTab(memberId, venueId);
  const [showCredit, setShowCredit] = useState(false);
  const { portalPath } = useVenueNav();
  const navigate = useNavigate();

  const hasTab = items !== null && items.length > 0;
  const netOutstanding = amountDue;

  return (
    <>
      <div style={{
        background: 'var(--portal-hero-gradient)',
        borderRadius: 16, padding: 24,
        boxShadow: '0 4px 16px rgba(27,58,75,0.2)',
      }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>Your Balance</p>
        {creditLoading ? (
          <Skeleton className="h-10 w-[140px] mt-1" style={{ background: 'rgba(255,255,255,0.15)' }} />
        ) : (
          <p style={{ fontSize: 36, fontWeight: 700, color: '#FFFFFF', margin: '4px 0 0' }}>{formatCents(balance)}</p>
        )}

        <div style={{ marginTop: 16 }}>
          {tabLoading ? (
            <Skeleton className="h-5 w-[180px]" style={{ background: 'rgba(255,255,255,0.15)' }} />
          ) : hasTab ? (
            <>
              <p style={{ fontSize: 15, fontWeight: 500, color: '#FFFFFF', margin: 0 }}>
                Open tab: {formatCents(tabTotal)}
              </p>
              <p style={{
                fontSize: 14, margin: '4px 0 0',
                color: netOutstanding > 0 ? '#FBBF24' : '#86EFAC',
              }}>
                Outstanding: {formatCents(netOutstanding)}
              </p>
            </>
          ) : (
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0 }}>No open tab</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button
            onClick={() => setShowCredit(true)}
            style={{
              flex: 1, height: 44, borderRadius: 'var(--portal-button-radius)', fontWeight: 600, fontSize: 14,
              background: 'rgba(255,255,255,0.15)', color: '#FFFFFF',
              border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
            }}
          >
            Load Credit
          </button>
          <button
            onClick={() => navigate(portalPath('bar-tab'))}
            style={{
              flex: 1, height: 44, borderRadius: 'var(--portal-button-radius)', fontWeight: 600, fontSize: 14,
              background: 'rgba(255,255,255,0.15)', color: '#FFFFFF',
              border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
            }}
          >
            View Bar Tab
          </button>
        </div>
      </div>

      <CreditLoadSheet open={showCredit} onClose={() => setShowCredit(false)} memberId={memberId} venueId={venueId} />
    </>
  );
}

// ─── Upcoming Bookings Card (real data) ────────────────────────
function UpcomingBookingsCard({ venueId, memberId }: { venueId: string; memberId: string }) {
  const { portalPath } = useVenueNav();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  const { data: bookings, isLoading, fetchStatus } = useQuery({
    queryKey: ['portal-upcoming-bookings', venueId, memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_code, check_in, check_out, status, num_guests, booking_site_link(site_id, nights, booking_sites(name, site_type))')
        .eq('venue_id', venueId)
        .or(`member_id.eq.${memberId},created_by_member_id.eq.${memberId}`)
        .gte('check_in', today)
        .in('status', ['PENDING', 'PAID'])
        .order('check_in', { ascending: true })
        .limit(3);
      if (error) throw error;
      return data || [];
    },
    enabled: !!venueId && !!memberId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const showLoading = isLoading && fetchStatus !== 'idle';

  const fmtShort = (d: string) => {
    const dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  };

  // Semantic status colours — NOT themed
  const STATUS_PILL: Record<string, React.CSSProperties> = {
    PENDING: { background: '#FEF3C7', color: '#92400E' },
    PAID: { background: '#D1FAE5', color: '#065F46' },
  };

  return (
    <div style={{
      background: 'var(--portal-card-bg)', border: `1px solid var(--portal-card-border)`, borderRadius: 'var(--portal-card-radius)',
      padding: 20, boxShadow: 'var(--portal-card-shadow)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--portal-text-primary)' }}>Your Bookings</span>
        <button
          onClick={() => navigate(portalPath('bookings'))}
          style={{ fontSize: 14, fontWeight: 500, color: 'var(--portal-accent)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Book now →
        </button>
      </div>
      {showLoading ? (
        <div>
          {[0, 1].map(i => (
            <div key={i} style={{ padding: '10px 0', borderBottom: i === 0 ? `1px solid var(--portal-card-border)` : 'none' }}>
              <div style={{ height: 14, width: '60%', background: 'var(--portal-card-border)', borderRadius: 4, marginBottom: 6 }} className="animate-pulse" />
              <div style={{ height: 14, width: '40%', background: 'var(--portal-card-border)', borderRadius: 4 }} className="animate-pulse" />
            </div>
          ))}
        </div>
      ) : !bookings || bookings.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
          <BedDouble size={40} color="var(--portal-card-border)" />
          <p style={{ fontSize: 14, color: 'var(--portal-text-muted)', marginTop: 8 }}>No upcoming bookings</p>
        </div>
      ) : (
        <div>
          {bookings.map((b: any, i: number) => {
            const link = b.booking_site_link?.[0];
            const siteName = link?.booking_sites?.name || '—';
            const siteType = link?.booking_sites?.site_type;
            const isDayVisitor = siteType === 'day_visitor';
            const pill = STATUS_PILL[b.status] || STATUS_PILL.PENDING;
            return (
              <div key={b.id} style={{
                padding: '10px 0',
                borderBottom: i < bookings.length - 1 ? `1px solid var(--portal-card-border)` : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--portal-text-primary)' }}>{siteName}</span>
                  <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>
                    {isDayVisitor ? `${fmtShort(b.check_in)} · Day visit` : `${fmtShort(b.check_in)}–${fmtShort(b.check_out)}`}
                  </span>
                </div>
                <span style={{ ...pill, fontSize: 11, borderRadius: 9999, padding: '1px 8px', display: 'inline-block', marginTop: 4 }}>{b.status}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Upcoming Events Card (real data) ──────────────────────────
function UpcomingEventsCard({ venueId }: { venueId: string }) {
  const { portalPath } = useVenueNav();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  const { data: events = [] } = useQuery({
    queryKey: ['portal-upcoming-events', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('club_events')
        .select('id, title, event_date, start_time, end_time')
        .eq('venue_id', venueId)
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: false })
        .limit(3);
      if (error) throw error;
      return data;
    },
    enabled: !!venueId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const formatShort = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const formatTime = (s: string | null, e: string | null) => {
    if (!s) return null;
    const start = s.slice(0, 5);
    return e ? `${start} – ${e.slice(0, 5)}` : start;
  };

  return (
    <div style={{
      background: 'var(--portal-card-bg)', border: `1px solid var(--portal-card-border)`, borderRadius: 'var(--portal-card-radius)',
      padding: 20, boxShadow: 'var(--portal-card-shadow)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--portal-text-primary)' }}>Upcoming Events</span>
        <button
          onClick={() => navigate(portalPath('calendar'))}
          style={{ fontSize: 14, fontWeight: 500, color: 'var(--portal-accent)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          View all →
        </button>
      </div>
      {events.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
          <Calendar size={40} color="var(--portal-card-border)" />
          <p style={{ fontSize: 14, color: 'var(--portal-text-muted)', marginTop: 8 }}>No upcoming events</p>
        </div>
      ) : (
        <div>
          {events.map((ev, i) => (
            <div key={ev.id} style={{
              padding: '10px 0',
              borderBottom: i < events.length - 1 ? `1px solid var(--portal-card-border)` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-primary)' }}>{formatShort(ev.event_date)}</span>
                <span style={{ fontSize: 14, color: 'var(--portal-text-primary)' }}>{ev.title}</span>
              </div>
              {formatTime(ev.start_time, ev.end_time) && (
                <p style={{ fontSize: 13, color: 'var(--portal-text-secondary)', margin: '2px 0 0' }}>{formatTime(ev.start_time, ev.end_time)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Page ────────────────────────────────────────────
export default function PortalDashboard() {
  const { member } = usePortalAuth();
  const T = usePortalTheme();
  const memberId = member?.id ?? '';
  const venueId = member?.venue_id ?? '';

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Greeting + Weather */}
      <div className="flex items-start justify-between" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--portal-text-primary)', margin: 0 }}>
            {getGreeting()}, {member?.first_name}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--portal-text-muted)', marginTop: 4 }}>
            {T.welcomeMessage || formatDate()}
          </p>
        </div>
        <WeatherWidget />
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5">
        <CreditTabCard memberId={memberId} venueId={venueId} />
        <UpcomingEventsCard venueId={venueId} />
        <UpcomingBookingsCard venueId={venueId} memberId={memberId} />
      </div>
    </div>
  );
}
