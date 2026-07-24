// Single-event iCalendar (.ics) generation for the "Add to calendar" button on
// portal event cards. Produces one VEVENT the member downloads and opens in
// Outlook / Google / Apple Calendar. This is a one-shot snapshot — it does NOT
// stay in sync with later edits; the subscribable feed (calendar-feed Edge
// Function) is the live-syncing path. Keep the VEVENT shape in step with that
// function so the two produce identical events.

interface IcsEvent {
  id: string;
  occurrence_date: string; // 'YYYY-MM-DD'
  title: string;
  description?: string | null;
  location?: string | null;
  start_time?: string | null; // 'HH:MM' or 'HH:MM:SS'
  end_time?: string | null;
}

function esc(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

function icalDate(d: string): string {
  return d.replace(/-/g, '');
}

function icalTime(t: string): string {
  const [h = '00', m = '00', s = '00'] = t.split(':');
  return `${h.padStart(2, '0')}${m.padStart(2, '0')}${s.padStart(2, '0')}`;
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildEventIcs(ev: IcsEvent): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ledra//LedraPOS Club Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.id}-${ev.occurrence_date}@ledrapos`,
    `DTSTAMP:${stamp()}`,
  ];

  if (ev.start_time) {
    // Floating local time — matches the calendar-feed function.
    lines.push(`DTSTART:${icalDate(ev.occurrence_date)}T${icalTime(ev.start_time)}`);
    if (ev.end_time) {
      lines.push(`DTEND:${icalDate(ev.occurrence_date)}T${icalTime(ev.end_time)}`);
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${icalDate(ev.occurrence_date)}`);
    lines.push(`DTEND;VALUE=DATE:${icalDate(nextDay(ev.occurrence_date))}`);
  }

  lines.push(`SUMMARY:${esc(ev.title)}`);
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}

// Trigger a browser download of a single event as an .ics file.
export function downloadEventIcs(ev: IcsEvent): void {
  const ics = buildEventIcs(ev);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${ev.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'event'}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);
}
