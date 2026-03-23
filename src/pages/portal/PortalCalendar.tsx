import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { PORTAL_THEME as T } from '@/constants/portalTheme';

interface ClubEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
}

function formatTime(start: string | null, end: string | null) {
  if (!start) return null;
  const s = start.slice(0, 5);
  return end ? `${s} – ${end.slice(0, 5)}` : s;
}

function formatFullDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday = 0
  let startOffset = (firstDay.getDay() + 6) % 7;
  const days: { date: Date; isCurrentMonth: boolean }[] = [];

  // Previous month fill
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, isCurrentMonth: false });
  }
  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  // Next month fill
  while (days.length % 7 !== 0) {
    const nextD = new Date(year, month + 1, days.length - startOffset - lastDay.getDate() + 1);
    days.push({ date: nextD, isCurrentMonth: false });
  }
  return days;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(d: Date) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export default function PortalCalendar() {
  const { member } = usePortalAuth();
  const venueId = member?.venue_id ?? '';
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const { data: events = [] } = useQuery({
    queryKey: ['portal-club-events', venueId, year, month],
    queryFn: async () => {
      const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0);
      const lastDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('club_events')
        .select('*')
        .eq('venue_id', venueId)
        .gte('event_date', firstDay)
        .lte('event_date', lastDayStr)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as ClubEvent[];
    },
    enabled: !!venueId,
  });

  const eventsByDate = useMemo(() => {
    const m: Record<string, ClubEvent[]> = {};
    events.forEach((ev) => {
      (m[ev.event_date] ??= []).push(ev);
    });
    return m;
  }, [events]);

  const days = useMemo(() => getMonthDays(year, month), [year, month]);

  const monthLabel = new Date(year, month).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

  const goPrev = () => {
    setSelectedDate(null);
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const goNext = () => {
    setSelectedDate(null);
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => {
    setSelectedDate(null);
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  const todayStr = dateKey(now);

  // Upcoming events for panel (when no day selected)
  const upcomingEvents = useMemo(() => {
    return events.filter((ev) => ev.event_date >= todayStr).sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''));
  }, [events, todayStr]);

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const navBtnStyle: React.CSSProperties = {
    border: `1px solid ${T.cardBorder}`, borderRadius: 8, background: T.cardBg,
    color: T.navy, height: 36, width: 36, display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer',
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 100 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: T.navy, marginBottom: 20 }}>Calendar</h1>

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={goPrev} style={navBtnStyle}><ChevronLeft size={18} /></button>
        <span style={{ fontSize: 18, fontWeight: 600, color: T.navy, minWidth: 180, textAlign: 'center' }}>{monthLabel}</span>
        <button onClick={goNext} style={navBtnStyle}><ChevronRight size={18} /></button>
        {!isCurrentMonth && (
          <button onClick={goToday} style={{ ...navBtnStyle, width: 'auto', padding: '0 12px', fontSize: 14, fontWeight: 500 }}>
            Today
          </button>
        )}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {/* Headers */}
        {dayHeaders.map((d) => (
          <div key={d} style={{
            fontSize: 12, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase' as const,
            textAlign: 'center', paddingBottom: 8,
          }}>
            {d}
          </div>
        ))}

        {/* Day cells */}
        {days.map((day, i) => {
          const dk = dateKey(day.date);
          const dayEvents = eventsByDate[dk] ?? [];
          const hasEvents = dayEvents.length > 0;
          const isSelected = selectedDate === dk;

          return (
            <div
              key={i}
              onClick={() => hasEvents && setSelectedDate(dk)}
              style={{
                minHeight: window.innerWidth < 768 ? 56 : 80,
                border: `1px solid ${T.cardBorder}`,
                background: !day.isCurrentMonth ? T.pageBg : isSelected ? 'rgba(42,157,143,0.06)' : T.cardBg,
                padding: 6,
                cursor: hasEvents ? 'pointer' : 'default',
                marginTop: -1,
                marginLeft: i % 7 !== 0 ? -1 : 0,
              }}
            >
              <div style={{
                fontSize: 14, fontWeight: 500,
                color: !day.isCurrentMonth ? T.textMuted : T.textPrimary,
                ...(isToday(day.date) ? {
                  background: T.teal, color: '#FFFFFF', borderRadius: '50%',
                  width: 24, height: 24, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 13,
                } : {}),
              }}>
                {day.date.getDate()}
              </div>

              {/* Desktop: event pills. Mobile: dots */}
              {hasEvents && (
                <div className="hidden md:block">
                  {dayEvents.slice(0, 2).map((ev) => (
                    <div key={ev.id} style={{
                      background: T.teal, borderRadius: 4, padding: '2px 6px',
                      fontSize: 11, color: '#FFFFFF', marginTop: 2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>+{dayEvents.length - 2} more</div>
                  )}
                </div>
              )}
              {hasEvents && (
                <div className="block md:hidden" style={{ marginTop: 4, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.teal }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Event detail panel */}
      <div style={{ marginTop: 24 }}>
        {selectedDate ? (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: T.navy, marginBottom: 12 }}>
              Events on {formatFullDate(selectedDate)}
            </h2>
            {selectedEvents.length === 0 ? (
              <p style={{ color: T.textMuted, fontSize: 14 }}>No events on this day</p>
            ) : (
              selectedEvents.map((ev) => <EventCard key={ev.id} event={ev} />)
            )}
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: T.navy, marginBottom: 12 }}>Upcoming Events</h2>
            {upcomingEvents.length === 0 ? (
              <p style={{ color: T.textMuted, fontSize: 14 }}>No upcoming events this month</p>
            ) : (
              upcomingEvents.map((ev) => <EventCard key={ev.id} event={ev} showDate />)
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EventCard({ event, showDate }: { event: ClubEvent; showDate?: boolean }) {
  const T2 = { cardBg: '#FFFFFF', cardBorder: '#E8E0D8', cardShadow: '0 2px 8px rgba(43,35,25,0.06)', textPrimary: '#2D2A26', textSecondary: '#5C534A', navy: '#1B3A4B' };
  return (
    <div style={{
      background: T2.cardBg, border: `1px solid ${T2.cardBorder}`, borderRadius: 12,
      boxShadow: T2.cardShadow, padding: 16, marginBottom: 12,
    }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: T2.textPrimary, margin: 0 }}>{event.title}</p>
      {showDate && (
        <p style={{ fontSize: 14, color: T2.textSecondary, margin: '4px 0 0' }}>{formatFullDate(event.event_date)}</p>
      )}
      {formatTime(event.start_time, event.end_time) && (
        <p style={{ fontSize: 14, color: T2.textSecondary, margin: '4px 0 0' }}>{formatTime(event.start_time, event.end_time)}</p>
      )}
      {event.location && (
        <p style={{ fontSize: 14, color: T2.textSecondary, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
          <MapPin size={14} /> {event.location}
        </p>
      )}
      {event.description && (
        <p style={{ fontSize: 14, color: T2.textSecondary, marginTop: 8 }}>{event.description}</p>
      )}
    </div>
  );
}
