import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, MapPin, Repeat } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useVenue } from '@/contexts/VenueContext';
import { supabase } from '@/integrations/supabase/client';
import { expandAllOccurrences, type EventSeries, type EventOccurrence, type MonthlyMode, type Recurrence } from '@/utils/eventOccurrences';

// Read-only month calendar for the club manager (and any admin) — a view of the
// same club_events the portal calendar shows, in the admin palette. Events are
// created/edited on the admin Events page, not here.

interface ClubEventRow {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  recurrence: Recurrence;
  recurrence_end_date: string | null;
  monthly_mode: MonthlyMode;
}

const ACCENT = '#2E5FA3';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#94A3B8';
const TEXT_SECONDARY = '#475569';

function formatTime(start: string | null, end: string | null) {
  if (!start) return null;
  const s = start.slice(0, 5);
  return end ? `${s} – ${end.slice(0, 5)}` : s;
}

function formatFullDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const days: { date: Date; isCurrentMonth: boolean }[] = [];

  for (let i = startOffset - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -i), isCurrentMonth: false });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
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

export default function AdminCalendar() {
  const { venueId } = useVenue();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const firstDayStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0);
  const lastDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

  const { data: series = [] } = useQuery({
    queryKey: ['admin-club-events-series', venueId, firstDayStr, lastDayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('club_events')
        .select('id, title, description, event_date, start_time, end_time, location, recurrence, recurrence_end_date, monthly_mode')
        .eq('venue_id', venueId)
        .lte('event_date', lastDayStr)
        .or(`recurrence.neq.none,event_date.gte.${firstDayStr}`);
      if (error) throw error;
      return (data ?? []) as ClubEventRow[];
    },
    enabled: !!venueId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: exceptions = [] } = useQuery({
    queryKey: ['admin-event-exceptions', venueId, firstDayStr, lastDayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_exceptions')
        .select('event_id, occurrence_date')
        .eq('venue_id', venueId)
        .gte('occurrence_date', firstDayStr)
        .lte('occurrence_date', lastDayStr);
      if (error) throw error;
      return (data ?? []) as { event_id: string; occurrence_date: string }[];
    },
    enabled: !!venueId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const occurrences = useMemo<EventOccurrence[]>(() => {
    const s: EventSeries[] = series.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      event_date: e.event_date,
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
      recurrence: e.recurrence ?? 'none',
      recurrence_end_date: e.recurrence_end_date,
      monthly_mode: (e.monthly_mode ?? 'day_of_month') as MonthlyMode,
    }));
    return expandAllOccurrences(s, firstDayStr, lastDayStr, exceptions);
  }, [series, exceptions, firstDayStr, lastDayStr]);

  const eventsByDate = useMemo(() => {
    const m: Record<string, EventOccurrence[]> = {};
    occurrences.forEach((ev) => { (m[ev.occurrence_date] ??= []).push(ev); });
    return m;
  }, [occurrences]);

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
  const upcomingEvents = useMemo(() => occurrences.filter((ev) => ev.occurrence_date >= todayStr), [occurrences, todayStr]);
  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];
  const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const navBtnStyle: React.CSSProperties = {
    border: `1px solid ${BORDER}`, borderRadius: 8, background: '#FFFFFF',
    color: ACCENT, height: 36, width: 36, display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer',
  };

  return (
    <AdminLayout title="Calendar">
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={goPrev} style={navBtnStyle}><ChevronLeft size={18} /></button>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#1A202C', minWidth: 180, textAlign: 'center' }}>{monthLabel}</span>
          <button onClick={goNext} style={navBtnStyle}><ChevronRight size={18} /></button>
          {!isCurrentMonth && (
            <button onClick={goToday} style={{ ...navBtnStyle, width: 'auto', padding: '0 12px', fontSize: 14, fontWeight: 500 }}>
              Today
            </button>
          )}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {dayHeaders.map((d) => (
            <div key={d} style={{ fontSize: 12, fontWeight: 600, color: TEXT_MUTED, textTransform: 'uppercase', textAlign: 'center', paddingBottom: 8 }}>
              {d}
            </div>
          ))}

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
                  border: `1px solid ${BORDER}`,
                  background: !day.isCurrentMonth ? '#F8FAFC' : isSelected ? 'rgba(46,95,163,0.06)' : '#FFFFFF',
                  padding: 6,
                  cursor: hasEvents ? 'pointer' : 'default',
                  marginTop: -1,
                  marginLeft: i % 7 !== 0 ? -1 : 0,
                }}
              >
                <div style={{
                  fontSize: 14, fontWeight: 500,
                  color: !day.isCurrentMonth ? TEXT_MUTED : '#1A202C',
                  ...(isToday(day.date) ? {
                    background: ACCENT, color: '#FFFFFF', borderRadius: '50%',
                    width: 24, height: 24, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 13,
                  } : {}),
                }}>
                  {day.date.getDate()}
                </div>

                {hasEvents && (
                  <div className="hidden md:block">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div key={`${ev.event_id}:${ev.occurrence_date}`} style={{
                        background: ACCENT, borderRadius: 4, padding: '2px 6px',
                        fontSize: 11, color: '#FFFFFF', marginTop: 2,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 2 }}>+{dayEvents.length - 2} more</div>
                    )}
                  </div>
                )}
                {hasEvents && (
                  <div className="block md:hidden" style={{ marginTop: 4, display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Event detail / upcoming list */}
        <div style={{ marginTop: 24 }}>
          {selectedDate ? (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1A202C', marginBottom: 12 }}>
                Events on {formatFullDate(selectedDate)}
              </h2>
              {selectedEvents.length === 0 ? (
                <p style={{ color: TEXT_MUTED, fontSize: 14 }}>No events on this day</p>
              ) : (
                selectedEvents.map((ev) => <EventCard key={`${ev.event_id}:${ev.occurrence_date}`} event={ev} />)
              )}
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1A202C', marginBottom: 12 }}>Upcoming Events</h2>
              {upcomingEvents.length === 0 ? (
                <p style={{ color: TEXT_MUTED, fontSize: 14 }}>No upcoming events this month</p>
              ) : (
                upcomingEvents.map((ev) => <EventCard key={`${ev.event_id}:${ev.occurrence_date}`} event={ev} showDate />)
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function EventCard({ event, showDate }: { event: EventOccurrence; showDate?: boolean }) {
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#1A202C', margin: 0 }}>{event.title}</p>
        {event.is_recurring && (
          <span title={event.recurrence === 'weekly' ? 'Repeats weekly' : 'Repeats monthly'} style={{ color: TEXT_MUTED }}>
            <Repeat size={13} />
          </span>
        )}
      </div>
      {showDate && <p style={{ fontSize: 14, color: TEXT_SECONDARY, margin: '4px 0 0' }}>{formatFullDate(event.occurrence_date)}</p>}
      {formatTime(event.start_time, event.end_time) && (
        <p style={{ fontSize: 14, color: TEXT_SECONDARY, margin: '4px 0 0' }}>{formatTime(event.start_time, event.end_time)}</p>
      )}
      {event.location && (
        <p style={{ fontSize: 14, color: TEXT_SECONDARY, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
          <MapPin size={14} /> {event.location}
        </p>
      )}
      {event.description && <p style={{ fontSize: 14, color: TEXT_SECONDARY, marginTop: 8 }}>{event.description}</p>}
    </div>
  );
}
