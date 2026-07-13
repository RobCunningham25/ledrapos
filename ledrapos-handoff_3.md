# LedraPOS Session Handoff #3

**Date:** 2026-04-20
**Session theme:** Fix confusing balance / tab card on the member portal dashboard

---

## TL;DR

Rebalanced the top card on `/:slug/portal`. Money owed on the open tab is now the hero; credit balance sits in a small labelled chip on the right (wraps below on mobile). No data, routing, or theming changes — purely a layout rework inside one component.

Nothing blocking. One visual check at the browser and it's ready to commit.

---

## What shipped this session

### 1. `CreditTabCard` redesign

Path: `src/pages/portal/PortalDashboard.tsx:72-181`

- **Hero block (left):**
  - Label `YOU OWE ON YOUR TAB` — 11px uppercase, tracked, 0.7 alpha white.
  - Amount — `clamp(32px, 8vw, 36px)`, weight 700.
    - Gold `#FBBF24` when `netOutstanding > 0`
    - Green `#86EFAC` when tab exists and is settled
    - Muted white `rgba(255,255,255,0.9)` when there is no open tab (renders as `R 0.00`)
  - Secondary line: `Tab total R x,xxx.xx` when a tab exists, or `No open tab` muted when none.
- **Credit chip (top-right on desktop, wraps under the hero block on mobile):**
  - Pill: `border-radius: 999`, `rgba(255,255,255,0.15)` background, `rgba(255,255,255,0.2)` border, `align-self: flex-start`.
  - Label `CREDIT` (11px uppercase) + amount (16px, weight 700 white).
- **Buttons** (`Load Credit`, `View Bar Tab`) unchanged.
- `CreditLoadSheet` and the `usePortalCredit` / `usePortalOpenTab` hooks are untouched.

### 2. Responsive behaviour (no media queries)

- Outer flex container uses `flex-wrap: wrap` + `flex: 1 1 220px` on the hero block, so the chip sits top-right on wide screens and naturally drops under the hero block on narrow ones.
- Big amount uses `clamp(32px, 8vw, 36px)` so it won't clip at 320px widths.

---

## Design decisions (answers Rob picked)

| Decision | Choice |
|---|---|
| Layout | **Hero owed + credit chip** (vs. 50/50 split or two stacked rows) |
| Label for money owed | **"You owe"** (vs. Outstanding / Balance due / Amount owed) |
| Empty state (no open tab) | **Show `R 0.00` with "No open tab" below** (vs. muted-only, or hide section) |

Rejected alternatives (captured in the plan file):

- **50/50 split** — neither amount dominates, defeats the point of making "owed" the hero.
- **Two stacked rows** — wastes vertical space with a second full-width row for a number members rarely care about.

Plan file (reference): `C:\Users\MSI\.claude\plans\modular-jingling-garden.md`

---

## Current state

- Change is a single edit inside `src/pages/portal/PortalDashboard.tsx` — nothing else touched.
- No migrations, no edge functions, no hooks changed, no type changes.
- Typecheck was not run explicitly this session; the change is pure JSX restructuring of existing typed values so no new type surfaces were introduced.

---

## What Rob needs to do next

1. **Visual check** at `/vca/portal` as a member with:
   - Open tab with outstanding balance → hero gold.
   - Open tab fully paid → hero green, `R 0.00`.
   - No open tab → hero muted white, `R 0.00`, "No open tab" below.
2. **Width sweep** in devtools at 320 / 375 / 414 / 768 / 1024px — the credit chip should be top-right on ≥640px and drop under the hero block below that, staying inside the card padding.
3. Commit when happy.

---

## Known context / gotchas

- **Card is not a modal.** Rob referred to it as a "modal" but it's the top card in the dashboard grid at `PortalDashboard.tsx:342`. Grid placement unchanged.
- **`netOutstanding` is already net of credit applied** — computed inside `usePortalOpenTab` as `tabTotal - totalPaidCents`. The hero number is what the member owes right now; the credit chip is what's available to apply on the next payment. Separate concepts, separately labelled.
- **Colour tokens:** `#FBBF24` (gold-for-owed) and `#86EFAC` (green-for-settled) were already used in this file for the same semantics — no new colours introduced, no brand-token drift.
- **Empty-state `R 0.00` is deliberate** — keeps card height roughly constant across states so the dashboard grid doesn't jump as tabs open / close.

---

## Files touched

```
M src/pages/portal/PortalDashboard.tsx   — CreditTabCard JSX rework
```

Everything else in `git status` (carryover from previous sessions) is unchanged:

```
M package-lock.json
M src/pages/admin/Dashboard.tsx
M src/pages/admin/Members.tsx
M supabase/functions/invite-member/index.ts
?? src/components/admin/OpenTabsDrawer.tsx
```

---

## Possible follow-ups (not done)

- Apply the same "owed-is-hero, credit-is-chip" treatment to the `OpenTabCard` / `CreditBalanceBarCard` pair on the dedicated `PortalBarTab` page for consistency — that page still leads with credit balance in its own card.
- Consider a one-tap "Pay my tab" action on this card once online tab settlement exists (Yoco Checkout flow for tab balances, not just credit top-ups).
- If credit balances become more common later, revisit whether the chip is too demoted — current layout is optimised for VCA's rare-credit reality.
