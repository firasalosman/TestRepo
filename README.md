# Business Expense Tracker

A personal dashboard that scans your Gmail for 2026 business-expense receipts
(hotels, car rentals, the Toronto condo rental at 771 Yonge Street via Menkes,
business-card Uber trips, and VIA Rail) and organizes them by month.

This is a **personal-use application**. It uses Google OAuth with a
**read-only** Gmail scope and never sends, deletes, archives, labels, or
modifies any email.

> **Status:** Phases 2 and 3 complete. The dashboard, monthly detail view,
> review workflow, filters, and CSV/ZIP export work end-to-end against
> realistic **mock data**, and real Google OAuth + Gmail read-only sync is
> wired up for when you're ready to connect a real inbox (`DATA_MODE=gmail`).
> Automated duplicate-merging and richer manual-review polish land in
> Phase 4.

## Stack

- Next.js 14 (App Router) + React 18 + TypeScript
- Prisma + SQLite (local file database)
- Google OAuth (`googleapis`) with the `gmail.readonly` scope only
- `pdf-parse` / `cheerio` for attachment and HTML body text extraction
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
npm test          # unit tests: classification, date attribution, dedup, totals, field extraction
npm run lint
npm run build
```

## Project structure

```
prisma/schema.prisma        Data model (SQLite, plain-string enums)
prisma/seed.ts               Mock 2026 expense data generator
src/lib/classification.ts    Deterministic rule-based email → category classifier
src/lib/fieldExtraction.ts   Regex-based amount/date/invoice#/card-last4/route extraction
src/lib/dateAttribution.ts   Service date > invoice date > received date rules
src/lib/dedup.ts             Duplicate detection (booking confirmation vs final invoice, etc.)
src/lib/totals.ts            Monthly/yearly total aggregation (confirmed vs potential)
src/lib/data.ts              Prisma query + serialization helpers
src/lib/googleAuth.ts        OAuth client, encrypted token storage, refresh handling
src/lib/gmailClient.ts       Read-only Gmail API wrapper (list/get message, get attachment)
src/lib/gmailQueries.ts      Per-category Gmail search queries (2026 date range)
src/lib/emailParsing.ts      Gmail message → subject/sender/body/attachments + PDF/HTML text
src/lib/sync.ts              Sync orchestrator: search → classify → extract → dedup → persist
src/app/page.tsx             Dashboard: monthly tiles + yearly summary
src/app/month/[month]/       Monthly detail view
src/components/ExpenseTable  Filters, search, review actions, manual add, merge
src/app/api/                 Expenses CRUD, review actions, CSV/ZIP export, delete-all, OAuth, sync
```

## Business-expense rules implemented

- **Hotels** — prefers the final folio/invoice over a booking confirmation;
  both are linked via dedup so only one counts. **Marriott reservation
  confirmations** (`reservations@res-marriott.com`) are a special case: they
  are captured as potential hotel expenses even when no final invoice ever
  arrives, since a business trip's hotel invoice isn't guaranteed to show up.
  See "Hotel reservation confirmations" below.
- **Car rentals** — final rental agreement/closing invoice only; authorization
  holds are flagged `NEEDS_REVIEW`, not counted as final expenses.
- **Toronto condo rental** — sender/content matching for Menkes and
  "771 Yonge Street, Toronto"; category `Toronto Condo Rental`.
- **Uber** — qualifies as a potential business expense when **either**:
  the trip was charged to the business card ending **4647**, **or** the
  trip occurred **outside both Ottawa and Toronto** (detected from
  pickup/drop-off city in the receipt, `src/lib/uberLocation.ts`) — a trip
  is only auto-marked `PERSONAL` when neither condition holds (unknown
  location is never assumed to be "outside"; it falls back to the
  card-only rule). Pickup/drop-off address, city, and trip country are
  extracted where present. Only the last 4 digits of any card are ever
  stored — never the full number.
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
service date — see `src/lib/dedup.ts` and its tests. During a real Gmail
sync, `src/lib/sync.ts` re-runs this reconciliation over the year's
expenses after each sync so newly-arrived final invoices get linked to
(and supersede) earlier confirmations automatically.

### Hotel reservation confirmations

Emails from `reservations@res-marriott.com` are captured as potential hotel
expenses even when no final invoice/folio ever arrives - previously, a
reservation confirmation with no matching final invoice risked never being
reviewed at all.

- A `sourceType` field distinguishes `Final Invoice` / `Paid Receipt` /
  `Reservation Confirmation` / `Reservation Confirmation – Missing Amount` /
  `Possible Cancellation` for every hotel expense (see
  `SOURCE_TYPE_LABELS` in `src/lib/format.ts`).
- A reservation confirmation always starts `Needs Review` and is included in
  the *potential* monthly/yearly total, never the confirmed one, until a
  human approves it (or a final invoice supersedes it).
- Hotel name, city, check-in/check-out dates, confirmation number, and guest
  name are extracted where present (`src/lib/fieldExtraction.ts`); when no
  amount can be found, the record is still created with the amount left
  blank and flagged "Missing Amount" rather than being dropped.
- When a later final invoice/folio for the same stay is found,
  `src/lib/dedup.ts` matches it to the reservation by confirmation number
  first, then by hotel name/check-in/check-out dates + guest name/similar
  amount as a fallback - the final invoice becomes the authoritative primary
  record and the reservation is linked as a superseded supporting record
  (never double-counted).
- Cancellation emails ("...has been cancelled") are matched to their
  reservation the same way; a match sets `possibleCancellation: true` on the
  reservation (visible as a "Possible Cancellation" badge) without
  auto-rejecting it, since a charge may still have been incurred - the
  monthly view lets you confirm, reject, edit the amount, or mark it
  cancelled/personal/duplicate directly.
- The monthly view has a dedicated "Hotel filter" for reservation
  confirmations, stays missing a final invoice, and hotel expenses missing
  an amount.

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

### Bulk review

Every row in the monthly table has a checkbox, plus a header checkbox that
selects/deselects all *currently filtered* rows (never the whole year) -
selection persists as you keep adjusting filters, and clears automatically
once a bulk action succeeds.

Selecting one or more rows shows a sticky bulk-action toolbar with the
selected count and the combined total grouped by currency (different
currencies are never summed together). Available actions: Approve selected,
Reject selected, Mark as personal, Mark as duplicate, Change category,
Change month, Clear selection.

Each action opens a confirmation dialog showing the count, grouped totals,
and a warning if the selection has mixed statuses. Approving, rejecting,
marking personal, or marking duplicate will skip any row that already has a
prior manual decision (`Rejected`/`Personal`/`Duplicate`) unless you tick the
override checkbox shown in that case - the server re-validates this itself
via `POST /api/expenses/bulk` regardless of what the client sends. The whole
action runs as one database transaction: either every eligible row updates,
or none does. The response always reports which rows were skipped and why.

Every status/category/month change - individual or bulk - is recorded in a
structured `AuditLog` (action type, previous/new values, reason, timestamp,
and whether it was part of a bulk action) alongside the existing free-text
`AuditNote` system notes; expand a row to see the merged "Audit history"
timeline for that expense.

## Export

- Month CSV: `2026-03-business-expenses.csv`
- Full-year CSV: `2026-business-expenses.csv`
- Month ZIP (CSV + receipt attachments where locally cached):
  `2026-03-business-expense-receipts.zip`
- Printable report: the "Print report" button opens the browser print dialog
  with action buttons hidden.

All exports include only `CONFIRMED` expenses.

## Connecting real Gmail (Phase 3)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project and enable the **Gmail API**.
2. Under "APIs & Services > OAuth consent screen", configure an **internal**
   or **testing** app (this is a personal tool, not a public app) and add
   your own Google account as a test user.
3. Under "Credentials", create an **OAuth 2.0 Client ID** (Web application).
   Add `http://localhost:3000/api/auth/google/callback` as an authorized
   redirect URI.
4. Copy the client ID/secret into `.env` as `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`, and set `GOOGLE_REDIRECT_URI` to the same
   callback URL.
5. Generate `TOKEN_ENCRYPTION_KEY` and `SESSION_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
6. Set `DATA_MODE="gmail"` in `.env` and restart the dev server.
7. On the dashboard, click **Connect Gmail** — you'll be sent through
   Google's consent screen requesting only
   `https://www.googleapis.com/auth/gmail.readonly`. This app has no code
   path that requests or uses send/modify/delete scopes.
8. Click **Sync Gmail now** to run a sync. Each sync call processes up to
   ~40 new messages per category (paginated, incremental — already-processed
   messages are tracked in the `EmailRecord` table and skipped on the next
   run) so very large mailboxes are synced over several clicks rather than
   one long-running request.
9. Use **Logout / revoke access** to revoke the Google OAuth grant at any
   time; this does not delete your already-synced local expense data — use
   **Delete all local data** for that.

### Troubleshooting: "Unknown argument `guestName`" (or any other field) during sync

This means your running server's generated Prisma Client is out of date with
`prisma/schema.prisma` — usually after pulling new code that added a schema
field without re-running the Prisma setup steps locally. Fix:

```bash
git pull
npm install
npx prisma generate
npx prisma db push
```

Then restart the dev server (`npm run dev`). This regenerates the Prisma
Client from the current schema and applies any new columns to your local
SQLite database; it does not delete existing data.

### How sync works

`src/lib/sync.ts` runs, per category query in `src/lib/gmailQueries.ts`:

1. List matching message IDs (paginated, 25 at a time).
2. Skip any message ID already recorded in `EmailRecord` (incremental sync).
3. Fetch the full message, extract the plain-text/HTML body
   (`src/lib/emailParsing.ts`) and up to 5 attachments (PDF text via
   `pdf-parse`, HTML via `cheerio`; images are not OCR'd).
4. Classify the message deterministically (`src/lib/classification.ts`) and
   extract amount/dates/invoice number/card-last-4/route
   (`src/lib/fieldExtraction.ts`).
5. Attribute the expense to a month/year and a status (`Confirmed` only when
   confidence is high, the document is a final invoice/receipt, an amount
   was found, and the date didn't have to fall back to the received date;
   otherwise `Needs Review`, or `Personal` for off-card Uber trips).
6. Persist the `Expense`, its `Attachment` metadata, and mark the
   `EmailRecord` as processed.
7. After all categories, re-run duplicate reconciliation across the year's
   expenses and link/status any newly-detected duplicates.

No AI-assisted classification step is implemented or called — see
`AI_ASSISTED_EXTRACTION_ENABLED` below.

## Security & privacy

- Gmail scope is (and will only ever be) `gmail.readonly` — the app cannot
  send, delete, archive, or label email even if instructed to, because the
  OAuth grant itself doesn't permit it, and no API call in `src/lib/gmailClient.ts`
  targets a mutating Gmail endpoint.
- OAuth tokens are encrypted at rest with AES-256-GCM (`src/lib/crypto.ts`,
  `OAuthToken` table) using `TOKEN_ENCRYPTION_KEY`, and are never logged or
  sent to the client. The app's own session cookie carries no token data —
  see `src/lib/logger.ts`, which only ever logs event names, counts, and
  IDs, never email content, amounts, or tokens.
- Only the last 4 digits of any payment card are stored; full card numbers
  are never retained (`src/lib/fieldExtraction.ts` only captures the last-4
  group from the card-last-4 regex).
- No email content, receipts, or extracted financial data are sent to any
  third-party service by default. This will only change if you explicitly
  set `AI_ASSISTED_EXTRACTION_ENABLED=true` and configure a provider in
  `.env` — off by default, and not called anywhere in this codebase yet.
- `.env`, the SQLite database file, and any locally cached receipt files are
  git-ignored (see `.gitignore`).
- A "Delete all local data" button on the dashboard permanently erases the
  local database (`/api/privacy/delete-all`), separate from revoking Gmail
  access.
- Full privacy notice: `/privacy` in the running app.

See `.env.example` for every configuration variable and what it controls.

## Known limitations / roadmap (Phase 4+)

- Sync is triggered manually ("Sync Gmail now") and bounded per call
  (~40 messages/category); there's no background scheduler yet.
- Attachment images are not OCR'd — image-only receipts fall back to the
  email body and are flagged for review if no amount can be found.
- Duplicate reconciliation runs automatically after each sync, but you can
  also merge manually from the monthly detail view.
- Receipt attachments are not cached to local disk yet, so ZIP export only
  bundles what's locally cached (currently none from a live sync) plus a
  placeholder note; the CSV export and "open in Gmail" link always work.
