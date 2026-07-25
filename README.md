# Business Expense Tracker

A personal dashboard that scans your Gmail for 2026 business-expense receipts
(hotels, car rentals, the Toronto condo rental at 771 Yonge Street via Menkes,
business-card Uber trips, and VIA Rail) and organizes them by month.

This is a **personal-use application**. It uses Google OAuth with a
**read-only** Gmail scope and never sends, deletes, archives, labels, or
modifies any email.

> **Status:** Phase 2 complete — the full dashboard, monthly detail view,
> review workflow, filters, and CSV/ZIP export work end-to-end against
> realistic **mock data**. Phase 3 (real Gmail OAuth + sync) has not been
> wired up yet; see "Roadmap" below.

## Stack

- Next.js 14 (App Router) + React 18 + TypeScript
- Prisma + SQLite (local file database)
- Vitest for unit tests
- ESLint (`next/core-web-vitals`)

## Getting started (mock-data mode — no Gmail needed)

```bash
npm install
cp .env.example .env        # DATA_MODE defaults to "mock"
npx prisma db push          # create the local SQLite schema
npm run db:seed             # load realistic mock 2026 expenses
npm run dev                 # http://localhost:3000
```

Open http://localhost:3000 to see the 12 monthly tiles and yearly summary.
Click any month to see the detailed expense list, filters, review actions,
and export buttons. A "MOCK DATA MODE" badge is shown whenever
`DATA_MODE=mock`, and every seeded row is flagged `isMock: true` internally
so mock data is never confused with real Gmail data.

## Running tests

```bash
npm test          # unit tests for classification, date attribution, dedup, totals
npm run lint
npm run build
```

## Project structure

```
prisma/schema.prisma        Data model (SQLite, plain-string enums)
prisma/seed.ts               Mock 2026 expense data generator
src/lib/classification.ts    Deterministic rule-based email → category classifier
src/lib/dateAttribution.ts   Service date > invoice date > received date rules
src/lib/dedup.ts             Duplicate detection (booking confirmation vs final invoice, etc.)
src/lib/totals.ts            Monthly/yearly total aggregation (confirmed vs potential)
src/lib/data.ts              Prisma query + serialization helpers
src/app/page.tsx             Dashboard: monthly tiles + yearly summary
src/app/month/[month]/       Monthly detail view
src/components/ExpenseTable  Filters, search, review actions, manual add, merge
src/app/api/                 Expenses CRUD, review actions, CSV/ZIP export, delete-all
```

## Business-expense rules implemented

- **Hotels** — prefers the final folio/invoice over a booking confirmation;
  both are linked via dedup so only one counts.
- **Car rentals** — final rental agreement/closing invoice only; authorization
  holds are flagged `NEEDS_REVIEW`, not counted as final expenses.
- **Toronto condo rental** — sender/content matching for Menkes and
  "771 Yonge Street, Toronto"; category `Toronto Condo Rental`.
- **Uber** — only trips charged to the business card ending **4647** are
  eligible for `CONFIRMED`; any other card is excluded from business totals.
  Only the last 4 digits of any card are ever stored.
- **VIA Rail** — final e-ticket/receipt preferred over itinerary/booking
  updates for the same trip.
- **Other Potential Business Expense** — catch-all for anything that looks
  business-related but doesn't match a known category; always starts as
  `NEEDS_REVIEW` and never counts toward confirmed totals until approved.

Date attribution: service/transaction date first, then invoice date, then
email received date (flagged for review in that last case) — see
`src/lib/dateAttribution.ts`.

Duplicate detection matches on invoice/confirmation number, attachment
filename, thread/subject similarity, and vendor+amount+currency+nearby
service date — see `src/lib/dedup.ts` and its tests.

Only `CONFIRMED` expenses count toward the main monthly/yearly totals;
`NEEDS_REVIEW` items appear in a separate "potential" total so nothing is
silently included or double-counted.

## Review workflow

Expand any row in the monthly view to: confirm, reject, mark personal, edit
(vendor/category/amount/currency/description), merge a duplicate into
another expense, or add an expense manually. Every change is recorded as an
audit note (`AuditNote` table) alongside the system's own classification
reason, so you can always see *why* something was categorized the way it was.

Statuses: `Confirmed`, `Needs Review`, `Rejected`, `Personal`, `Duplicate`.

## Export

- Month CSV: `2026-03-business-expenses.csv`
- Full-year CSV: `2026-business-expenses.csv`
- Month ZIP (CSV + receipt attachments where locally cached):
  `2026-03-business-expense-receipts.zip`
- Printable report: the "Print report" button opens the browser print dialog
  with action buttons hidden.

All exports include only `CONFIRMED` expenses.

## Security & privacy

- Gmail scope is (and will only ever be) `gmail.readonly` — the app cannot
  send, delete, archive, or label email even if instructed to, because the
  OAuth grant itself doesn't permit it.
- OAuth tokens are stored encrypted at rest (`OAuthToken` table) and are
  never logged or sent to the client — see `src/lib/logger.ts`, which only
  ever logs event names, counts, and IDs, never email content or amounts.
- Only the last 4 digits of any payment card are stored; full card numbers
  are never retained.
- No email content, receipts, or extracted financial data are sent to any
  third-party service by default. This will only change if you explicitly
  set `AI_ASSISTED_EXTRACTION_ENABLED=true` and configure a provider in
  `.env` — off by default.
- `.env`, the SQLite database file, and any locally cached receipt files are
  git-ignored (see `.gitignore`).
- A "Delete all local data" button on the dashboard permanently erases the
  local database (`/api/privacy/delete-all`).
- Full privacy notice: `/privacy` in the running app.

See `.env.example` for every configuration variable and what it controls.

## Setting up real Gmail access (Phase 3 — not yet implemented)

This section documents the intended setup once OAuth/Gmail sync is wired up:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project and enable the **Gmail API**.
2. Under "APIs & Services > OAuth consent screen", configure an **internal**
   or **testing** app (this is a personal tool, not a public app).
3. Under "Credentials", create an **OAuth 2.0 Client ID** (Web application).
   Add `http://localhost:3000/api/auth/callback/google` as an authorized
   redirect URI.
4. Copy the client ID/secret into `.env` as `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`.
5. Set `DATA_MODE=gmail` and generate `TOKEN_ENCRYPTION_KEY` /
   `SESSION_SECRET` as described in `.env.example`.
6. Request only the `https://www.googleapis.com/auth/gmail.readonly` scope
   during the consent flow.

## Roadmap (Phases 3–4, not yet built)

- Google OAuth + Gmail API read-only sync with pagination and incremental
  processing (`SyncState`, `EmailRecord`).
- Attachment text extraction (PDF/HTML/plain-text/image).
- Wiring the classification/dedup libraries (already implemented and unit
  tested) into a live Gmail sync pipeline.
- Logout/revoke-access UI.
