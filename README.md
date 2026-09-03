# LedraPOS

Multi-tenant, browser-based point-of-sale and club-management platform for venue bars
(yacht clubs, sports clubs). Sold under the **Ledra** brand by Dear Ziva Pty Ltd. First
production tenant: the Vaal Cruising Association (VCA).

## Stack

- **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Supabase — Postgres + RLS, Edge Functions (Deno), Auth, Storage
- **Payments:** Yoco Checkout API
- **Email:** Resend
- **WhatsApp:** Twilio (tab reminders + inbound router)

## Local development

```sh
npm install
npm run dev
```

Create a `.env` from `.env.example` and fill in the Supabase project values (see a
maintainer for keys). All client env vars are `VITE_`-prefixed and ship in the bundle —
never put a private secret in `.env`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest run |
| `npx tsc -p tsconfig.app.json --noEmit` | Type-check (run before pushing) |

## Architecture

- **Multi-tenant by `venue_id`** — every table is scoped; client queries always filter on
  `venue_id`, Edge Functions cross-check it against the caller's `admin_users` row.
- **Path-based routing** — tenants served at `/:slug/*` (e.g. `/vca/pos`, `/vca/portal`,
  `/vca/admin`); some venues also have custom domains (see `src/config/customDomains.ts`).
- **Schema-first** — apply DB migrations before wiring UI.
- **Sensitive ops in Edge Functions** — payments, email, PIN auth.

See [CLAUDE.md](CLAUDE.md) for the full project context, database schema, and rules.

## Deployment

Cloudflare Pages builds on push to `main` (npm, not bun — do not commit `bun.lock`).
Database migrations: `supabase db push` from the repo root.
