# LedraPOS Session Handoff #5

**Date:** 2026-04-20
**Session theme:** Recurring club events + per-occurrence cancellation

---

## TL;DR

Added recurring events to the calendar. Admins can toggle any event to repeat **weekly** or **monthly**, and monthly events can recur either on a fixed day-of-month or on an Nth-weekday-of-month (e.g. "first Saturday of every month"). Individual occurrences can be cancelled without affecting the rest of the series.

Code-complete and type-checks (`npx tsc --noEmit` passes). **One outstanding action for Rob: apply the migration.** `supabase db push` currently fails because the remote `schema_migrations` table has drifted from the local migrations folder (22 Lovable-applied entries with no matching local file). The drift predates this session; details and remedies below.

---

## Architecture

Parent-row + exceptions model (chosen over materialising every occurrence as its own row):

- Each `club_events` row is a **series definition**: start date + recurrence rule.
- Occurrences are **computed at render time** by a shared util.
- Cancellations of individual occurrences go into a new `event_exceptions` table as `(event_id, occurrence_date)` rows — these get subtracted during expansion.

Trade-off: slightly more client-side work, but editing a series stays a single row update, and one-off cancellations never require mass row cleanup.

---

## What shipped this session

### 1. New migration — `supabase/migrations/20260420120000_club_events_recurrence.sql`

Adds to `club_events`:

- `recurrence TEXT NOT NULL DEFAULT 'none'` — `none` | `weekly` | `monthly`
- `recurrence_end_date DATE` — optional series end
- `monthly_mode TEXT NOT NULL DEFAULT 'day_of_month'` — `day_of_month` | `nth_weekday`

Creates `event_exceptions`:

- `id`, `event_id` (FK → `club_events.id` ON DELETE CASCADE), `venue_id`, `occurrence_date`, `created_at`
- Unique constraint `(event_id, occurrence_date)` — cancelling the same date twice is a no-op
- RLS: `SELECT` open; `INSERT`/`DELETE` for authenticated users
- Indexes on `event_id` and `(venue_id, occurrence_date)`

### 2. New expansion util — `src/utils/eventOccurrences.ts`

Pure functions (no Supabase dependency) reused by all consumers:

- `expandOccurrences(series, rangeStart, rangeEnd, exceptionDates)` — expands one series within a window
- `expandAllOccurrences(seriesList, rangeStart, rangeEnd, exceptions)` — batch variant, sorted
- `nthWeekdayOrdinal(dayOfMonth)` — returns 1–5, used by the drawer to build human labels

Monthly `nth_weekday` logic: derive weekday + ordinal from the series' seed `event_date`, then for each target month compute the Nth occurrence of that weekday. If a given month doesn't have an Nth of that weekday (e.g. a "fifth Saturday" in a short month), that month is skipped.

Safety bounds: 600 iterations for weekly, 240 months for monthly.

### 3. `src/components/admin/EventDrawer.tsx`

- New **Recurring event** switch at the bottom of the form.
- When on: **Repeats** dropdown (Weekly / Monthly) and **Ends on** date field.
- When Monthly is selected: **Monthly pattern** radio with both labels auto-derived from the event date:
  - "On day _N_ of each month" (default)
  - "On the _first/second/third/…_ _Weekday_ of each month"
- Falls back to a hint if no event date is set yet.

### 4. `src/pages/admin/Events.tsx`

- Fetches series + exceptions; expands to occurrences in a 6-months-back → 12-months-forward window.
- Each row shows a "Weekly" / "Monthly" badge on recurring occurrences.
- **Delete** on a recurring occurrence opens a three-button dialog:
  - Cancel
  - **Cancel this occurrence** (inserts into `event_exceptions`)
  - **Delete entire series** (deletes the parent row — cascade clears its exceptions)
- Delete on a non-recurring event keeps the original simple confirm.

### 5. `src/pages/portal/PortalCalendar.tsx`

- Replaces the old date-range query with series-fetch + exceptions-fetch scoped to the current month.
- Expands in-memory; calendar grid, "Upcoming events", and detail panel now render recurring occurrences.
- Compact `Repeat` icon on event cards (portal aesthetic, not a big badge).

### 6. Dashboards

- **Admin `NextEventCard`** in [src/pages/admin/Dashboard.tsx](src/pages/admin/Dashboard.tsx) — expands up to 1 year forward and picks the first upcoming occurrence (respecting exceptions).
- **Portal `UpcomingEventsCard`** in [src/pages/portal/PortalDashboard.tsx](src/pages/portal/PortalDashboard.tsx) — same approach, returns the first 3.

### 7. Supabase types — `src/integrations/supabase/types.ts`

Added `recurrence`, `recurrence_end_date`, `monthly_mode` to the `club_events` Row / Insert / Update types, and a full `event_exceptions` table definition with FKs.

---

## Design decisions (answers Rob picked)

| Decision | Choice |
|---|---|
| Storage model | **Parent row + exceptions table** (not materialised occurrences) |
| Recurrence options | **Weekly or Monthly** only |
| Monthly mode | **`day_of_month` or `nth_weekday`** (radio, labels auto-derived from event date) |
| "Last Saturday" support | **Deferred** — pick an explicit late date if needed |
| Override behaviour | Per-occurrence cancellation **does not touch** the parent series |
| Delete a recurring occurrence | Always prompts: **Cancel this occurrence** vs **Delete entire series** |

---

## Outstanding work

### 1. Apply the migration

`supabase db push` fails with:

> Remote migration versions not found in local migrations directory.

The remote `schema_migrations` table has 22 entries (applied by Lovable) with timestamps that don't match any local file. This drift predates this session and is **not** caused by our new migration.

**Quick path (recommended for today):** Supabase Dashboard → SQL Editor → paste the contents of [supabase/migrations/20260420120000_club_events_recurrence.sql](supabase/migrations/20260420120000_club_events_recurrence.sql) and run it. Feature works immediately.

**Proper path (separate task):** run the CLI's own repair command, then regenerate a fresh baseline:

```powershell
supabase migration repair --status reverted 20260319142012 20260319142046 20260319152506 20260319165621 20260319170402 20260319174824 20260320060928 20260320061000 20260321072806 20260322061046 20260322070650 20260322102927 20260322123007 20260322123033 20260323060355 20260323060428 20260323070610 20260323070748 20260323075529 20260323090118 20260323090211 20260323121307
supabase db pull
```

Then delete the old mismatched local `.sql` files. Full reasoning in [C:\Users\MSI\.claude\plans\running-the-migration-and-refactored-hennessy.md](C:\Users\MSI\.claude\plans\running-the-migration-and-refactored-hennessy.md).

### 2. Verify end-to-end

Once the migration is applied:

1. **Schema check** — Supabase Studio → Database → Tables: `club_events` has the three new columns; `event_exceptions` exists with RLS enabled.
2. **Create a recurring event** — Admin → Events → Add Event. Title "First Saturday Test", date 2026-05-02, toggle Recurring on, pick Monthly, select "On the first Saturday of each month". Save.
3. **Confirm expansion** — Admin Events list and portal calendar should show occurrences on 2026-05-02, 2026-06-06, 2026-07-04, 2026-08-01, 2026-09-05, each with a Monthly badge / repeat icon.
4. **Cancel one occurrence** — Delete the 2026-06-06 row, choose "Cancel this occurrence". June disappears; May, July, August still show. An `event_exceptions` row should exist for `(series_id, '2026-06-06')`.
5. **Delete the whole series** — Delete any remaining occurrence, choose "Delete entire series". All occurrences vanish; the `event_exceptions` row from step 4 cascades out.

---

## Files touched

| File | Change |
|---|---|
| `supabase/migrations/20260420120000_club_events_recurrence.sql` | **new** — schema + RLS |
| `src/utils/eventOccurrences.ts` | **new** — expansion util |
| `src/integrations/supabase/types.ts` | added `recurrence` / `recurrence_end_date` / `monthly_mode` + `event_exceptions` |
| `src/components/admin/EventDrawer.tsx` | recurrence toggle, cadence, end date, monthly-mode radio |
| `src/pages/admin/Events.tsx` | expansion; per-occurrence vs whole-series delete dialog; Repeats badge |
| `src/pages/portal/PortalCalendar.tsx` | series + exceptions fetch; expansion; repeat icon |
| `src/pages/admin/Dashboard.tsx` | `NextEventCard` expands over 1-year horizon |
| `src/pages/portal/PortalDashboard.tsx` | `UpcomingEventsCard` expands over 1-year horizon |

`npx tsc --noEmit` passes cleanly (exit 0).

---

## What was considered and deferred

- **Materialised occurrences** (one row per occurrence). Rejected — editing a series would require bulk updates and cancellations would leave tombstones or need mass cleanup. Parent + exceptions is cleaner for this scale.
- **"Last Saturday" as a third monthly option.** Deferred — not needed for any current VCA event. Simple to add later: expand by finding the last Nth-weekday in each month and stop incrementing `ordinal` once `nthWeekdayOfMonth` returns null.
- **Custom recurrence rules** (RRULE, iCal). Overkill for current needs.
- **Moving a single occurrence to a new date.** Currently only cancel-per-occurrence is supported. If needed later, add an `override_date` column to `event_exceptions`.

---

## Nothing else blocking

No edge-function deploys needed. No secrets to set. Once the one migration is applied, the feature works. The existing migration drift is a long-standing issue worth tackling on its own turn — it does not block this feature via the SQL-editor path.

---

## Plan file

[C:\Users\MSI\.claude\plans\running-the-migration-and-refactored-hennessy.md](C:\Users\MSI\.claude\plans\running-the-migration-and-refactored-hennessy.md) — covers the migration-apply options (CLI link + push vs. SQL editor fallback) and the drift diagnosis.
