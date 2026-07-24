// calendar-feed — Public iCalendar (.ics) feed of a venue's club events.
//
// GET /functions/v1/calendar-feed?token=<uuid>
//   → 200 text/calendar with a VEVENT per event occurrence, so Outlook /
//     Google / Apple Calendar can *subscribe* to the club calendar and have it
//     refresh automatically. Recurring events are expanded (not emitted as
//     RRULE) using the shared eventOccurrences port, so the two monthly modes
//     and per-occurrence exceptions stay in exact sync with the portal calendar.
//
// The endpoint is unauthenticated because calendar clients can't log in; access
// is gated by the unguessable per-venue token (venues.calendar_feed_token).
// The feed carries only public club events — no per-member data — so a single
// shared token per venue is fine. Rotating the token invalidates old URLs.
//
// Window: a rolling 1 month back to 18 months ahead, recomputed on every fetch,
// so the subscription always shows recent history plus the upcoming season.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  expandAllOccurrences,
  type EventSeries,
  type MonthlyMode,
  type Recurrence,
} from "../_shared/eventOccurrences.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const WINDOW_MONTHS_BACK = 1;
const WINDOW_MONTHS_AHEAD = 18;
// How often calendar clients are asked to re-poll the feed.
const REFRESH = "PT6H";

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}

// RFC 5545 text escaping: backslash, semicolon, comma, and newlines.
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

// Fold lines longer than 75 octets (RFC 5545 §3.1). We approximate octets with
// characters — fine for the mostly-ASCII club data — folding onto a space.
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  parts.push(" " + rest);
  return parts.join("\r\n");
}

// "18:30:00" / "18:30" → "183000"
function icalTime(t: string): string {
  const [h = "00", m = "00", s = "00"] = t.split(":");
  return `${h.padStart(2, "0")}${m.padStart(2, "0")}${s.padStart(2, "0")}`;
}

// "2026-07-24" → "20260724"
function icalDate(d: string): string {
  return d.replace(/-/g, "");
}

function icalStamp(dt: Date): string {
  // UTC basic format for DTSTAMP: 20260724T101500Z
  return dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  if (!UUID_RE.test(token)) {
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: venue } = await supabase
    .from("venues")
    .select("id, name")
    .eq("calendar_feed_token", token)
    .maybeSingle();

  if (!venue) {
    // Don't distinguish bad-token from unknown-token — no enumeration.
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }

  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setMonth(rangeStart.getMonth() - WINDOW_MONTHS_BACK);
  const rangeEnd = new Date(now);
  rangeEnd.setMonth(rangeEnd.getMonth() + WINDOW_MONTHS_AHEAD);
  const startStr = isoDate(rangeStart);
  const endStr = isoDate(rangeEnd);

  const { data: eventRows, error: evErr } = await supabase
    .from("club_events")
    .select(
      "id, title, description, event_date, start_time, end_time, location, recurrence, recurrence_end_date, monthly_mode",
    )
    .eq("venue_id", venue.id)
    .lte("event_date", endStr)
    .or(`recurrence.neq.none,event_date.gte.${startStr}`);

  if (evErr) {
    console.error("calendar-feed events error:", evErr.message);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }

  const { data: exceptionRows } = await supabase
    .from("event_exceptions")
    .select("event_id, occurrence_date")
    .eq("venue_id", venue.id)
    .gte("occurrence_date", startStr)
    .lte("occurrence_date", endStr);

  const series: EventSeries[] = (eventRows ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    event_date: e.event_date,
    start_time: e.start_time,
    end_time: e.end_time,
    location: e.location,
    recurrence: (e.recurrence ?? "none") as Recurrence,
    recurrence_end_date: e.recurrence_end_date,
    monthly_mode: (e.monthly_mode ?? "day_of_month") as MonthlyMode,
  }));

  const occurrences = expandAllOccurrences(
    series,
    startStr,
    endStr,
    (exceptionRows ?? []) as { event_id: string; occurrence_date: string }[],
  );

  const dtstamp = icalStamp(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ledra//LedraPOS Club Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${esc(venue.name)} Events`),
    "X-WR-TIMEZONE:Africa/Johannesburg",
    `X-PUBLISHED-TTL:${REFRESH}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH}`,
  ];

  for (const ev of occurrences) {
    // Stable per-occurrence UID so re-fetches update in place rather than
    // duplicating. Occurrence date makes each instance of a series distinct.
    const uid = `${ev.event_id}-${ev.occurrence_date}@ledrapos`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);

    if (ev.start_time) {
      // Floating local time (no TZID / no Z): displays as the club's wall-clock
      // time in every member's calendar. All members are in SA (UTC+2, no DST).
      const startTime = icalTime(ev.start_time);
      lines.push(`DTSTART:${icalDate(ev.occurrence_date)}T${startTime}`);
      const endTime = ev.end_time ? icalTime(ev.end_time) : null;
      if (endTime) {
        lines.push(`DTEND:${icalDate(ev.occurrence_date)}T${endTime}`);
      }
    } else {
      // No time → all-day event.
      lines.push(`DTSTART;VALUE=DATE:${icalDate(ev.occurrence_date)}`);
      lines.push(`DTEND;VALUE=DATE:${icalDate(nextDay(ev.occurrence_date))}`);
    }

    lines.push(fold(`SUMMARY:${esc(ev.title)}`));
    if (ev.location) lines.push(fold(`LOCATION:${esc(ev.location)}`));
    if (ev.description) {
      lines.push(fold(`DESCRIPTION:${esc(ev.description)}`));
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n") + "\r\n";

  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${venue.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-events.ics"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
});
