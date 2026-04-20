export type Recurrence = 'none' | 'weekly' | 'monthly';
export type MonthlyMode = 'day_of_month' | 'nth_weekday';

export interface EventSeries {
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

export interface EventOccurrence {
  event_id: string;
  occurrence_date: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  recurrence: Recurrence;
  is_recurring: boolean;
}

function parseISODate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function formatISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const targetMonth = r.getMonth() + n;
  r.setMonth(targetMonth);
  if (r.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    r.setDate(0);
  }
  return r;
}

/**
 * Given a seed date's day-of-month, return which "Nth weekday of the month"
 * it represents (1 = first, 2 = second, 3 = third, 4 = fourth, 5 = fifth).
 */
export function nthWeekdayOrdinal(dayOfMonth: number): number {
  return Math.ceil(dayOfMonth / 7);
}

/**
 * Return the Nth occurrence of `weekday` (0=Sun..6=Sat) in the given year/month,
 * or null if that month doesn't have an Nth of that weekday.
 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, ordinal: number): Date | null {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (ordinal - 1) * 7;
  const lastDay = new Date(year, month + 1, 0).getDate();
  if (day > lastDay) return null;
  return new Date(year, month, day);
}

export function expandOccurrences(
  series: EventSeries,
  rangeStart: string,
  rangeEnd: string,
  exceptionDates: Set<string>,
): EventOccurrence[] {
  const start = parseISODate(series.event_date);
  const rStart = parseISODate(rangeStart);
  const rEnd = parseISODate(rangeEnd);
  const seriesEnd = series.recurrence_end_date
    ? parseISODate(series.recurrence_end_date)
    : null;

  const base: Omit<EventOccurrence, 'occurrence_date'> = {
    event_id: series.id,
    title: series.title,
    description: series.description,
    start_time: series.start_time,
    end_time: series.end_time,
    location: series.location,
    recurrence: series.recurrence,
    is_recurring: series.recurrence !== 'none',
  };

  if (series.recurrence === 'none') {
    const key = series.event_date;
    if (start >= rStart && start <= rEnd && !exceptionDates.has(key)) {
      return [{ ...base, occurrence_date: key }];
    }
    return [];
  }

  const out: EventOccurrence[] = [];
  const effectiveEnd = seriesEnd && seriesEnd < rEnd ? seriesEnd : rEnd;

  const push = (d: Date) => {
    if (d < start || d > effectiveEnd) return;
    if (d < rStart) return;
    const key = formatISODate(d);
    if (!exceptionDates.has(key)) {
      out.push({ ...base, occurrence_date: key });
    }
  };

  if (series.recurrence === 'weekly') {
    let cursor = new Date(start);
    for (let i = 0; i < 600 && cursor <= effectiveEnd; i++) {
      push(cursor);
      cursor = addDays(cursor, 7);
    }
  } else if (series.monthly_mode === 'nth_weekday') {
    const weekday = start.getDay();
    const ordinal = nthWeekdayOrdinal(start.getDate());
    let cursorMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), 1);
    for (let i = 0; i < 240 && cursorMonth <= endMonth; i++) {
      const d = nthWeekdayOfMonth(cursorMonth.getFullYear(), cursorMonth.getMonth(), weekday, ordinal);
      if (d) push(d);
      cursorMonth = addMonths(cursorMonth, 1);
    }
  } else {
    let cursor = new Date(start);
    for (let i = 0; i < 240 && cursor <= effectiveEnd; i++) {
      push(cursor);
      cursor = addMonths(cursor, 1);
    }
  }

  return out;
}

export function expandAllOccurrences(
  seriesList: EventSeries[],
  rangeStart: string,
  rangeEnd: string,
  exceptions: { event_id: string; occurrence_date: string }[],
): EventOccurrence[] {
  const byEvent = new Map<string, Set<string>>();
  for (const ex of exceptions) {
    let s = byEvent.get(ex.event_id);
    if (!s) {
      s = new Set<string>();
      byEvent.set(ex.event_id, s);
    }
    s.add(ex.occurrence_date);
  }

  const out: EventOccurrence[] = [];
  for (const series of seriesList) {
    const ex = byEvent.get(series.id) ?? new Set<string>();
    out.push(...expandOccurrences(series, rangeStart, rangeEnd, ex));
  }
  out.sort((a, b) => {
    if (a.occurrence_date !== b.occurrence_date) {
      return a.occurrence_date.localeCompare(b.occurrence_date);
    }
    return (a.start_time ?? '').localeCompare(b.start_time ?? '');
  });
  return out;
}
