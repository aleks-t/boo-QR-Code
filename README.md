# Partbook

A mobile-first shared parts inventory, editable inventory sheet, permanent QR labels, and revision history. Built with Next.js App Router, TypeScript, PostgreSQL, Prisma, Tailwind CSS, html5-qrcode, qrcode, web-push, and Resend.

## What you can do

- Scan a QR label or search names and numbers as you type.
- Create parts using vendor, name, and category; the server assigns the permanent ID and V1.
- Edit names, vendors, and categories from the inventory sheet or part detail.
- Review an edit history and restore previous details.
- Delete parts into Trash and restore them with their original number and history.
- Log revisions through a confirmation gate, undo for 60 seconds, or void later with a reason.
- Create vendors immediately, approve them later, or merge duplicates without renumbering parts.
- Print a label, export Print Master CSV, or download QR PNGs in a ZIP.
- Install on a phone's home screen and receive push updates with email fallback.

PostgreSQL is the shared online source of truth. There is no Google Sheet to keep in sync. No offline writes are queued. The editable inventory is available at `/inventory`.

## Local development

Node.js 22+ is recommended. Copy `.env.example` to `.env` and set `DATABASE_URL`. This is a single-owner installation, so there is no login screen or access-code prompt.

```sh
npm ci
npm run db:local
```

The optional development-only embedded PostgreSQL server runs on port 54329 and persists in `.local-db/`. Leave that terminal open. In another terminal:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. The seed creates three vendors, four categories, and five example parts, and is safe to rerun. Do not seed example parts into an existing production inventory unless you want them there.

For an existing PostgreSQL server, set `DATABASE_URL` and skip `db:local`.

## Railway deployment

1. Create a Railway project and add a PostgreSQL service.
2. Add a service from this GitHub repository.
3. Set `DATABASE_URL` on the app service to `${{Postgres.DATABASE_URL}}` (use your actual Postgres service name).
4. Set `APP_URL` to the app’s HTTPS address. Login is intentionally disabled for this single-owner installation.
5. Generate a Railway public HTTPS domain. Set `APP_URL` to that exact origin, e.g. `https://your-app.up.railway.app`, then redeploy.
6. Railway reads `railway.json`: it builds the app, runs `prisma migrate deploy` as the pre-deploy command, starts Next.js, and checks `/api/health`.
7. Add vendors/categories through **New part**. For a new demo database only, run `npm run db:seed` against that database.

Do not publish `.env` or database files. `.gitignore` excludes them. The QR resolver and all inventory writes are connected directly to the Railway PostgreSQL database.

## Notifications

Generate VAPID keys:

```sh
npx web-push generate-vapid-keys
```

Set these environment variables on Railway:

| Variable            | Value                                                |
| ------------------- | ---------------------------------------------------- |
| `VAPID_PUBLIC_KEY`  | Generated public key                                 |
| `VAPID_PRIVATE_KEY` | Generated private key                                |
| `VAPID_SUBJECT`     | A real `mailto:you@your-domain.com` contact          |
| `RESEND_API_KEY`    | Resend API key                                       |
| `RESEND_FROM`       | Sender at a domain verified in Resend                |
| `APP_URL`           | App HTTPS origin                                     |
| `CRON_SECRET`       | Optional random secret for an external retry trigger |

Every revision transaction also writes durable notification jobs for all other users. The app attempts push first, then email. Jobs that fail both are retained. A server worker retries pending jobs every minute when a delivery provider is configured. A PostgreSQL advisory lock prevents multiple app replicas from draining the queue at the same time. Email requests use provider idempotency keys. Push is at-least-once: a crash between delivery and database commit may cause a duplicate notification.

An external scheduler can optionally POST `/api/notifications/retry` with `Authorization: Bearer <CRON_SECRET>`. Users can also retry from Settings. Configure the Railway app as an always-running service for the internal retry worker.

Users must enable push or supply an email address to receive notifications. The UI reports unconfigured delivery, rather than pretending it sent an update. Email entry is optional at login and editable in Settings. On iPhone, push requires Safari → Share → Add to Home Screen → Add. The app explains this once; its notification permission prompt starts on a second browser session.

This installation intentionally has one owner record (`Owner`) and no login flow. Anyone with the private Railway URL can edit, restore, approve vendors, and log revisions. Add a network access control layer later if the URL must be private.

## Identity and recovery guarantees

- QR payload: `ACM-0043`; display ID: `ACM-0043-V3`, computed on read.
- The scan resolver normalizes case/whitespace and removes one trailing `-V\d+` suffix.
- Sequence assignment uses the maximum for the **historical identifier prefix**, including trashed parts. Using the editable current vendor would regress after a merge or supplier change. This is a deliberate correction to the original assignment algorithm.
- Revision assignment uses the maximum over **all** rows, including voided ones. Unique constraints reject races and the transaction retries once.
- Part creation and initial revision are one transaction. Revision creation and notification queueing are one transaction.
- Current revision is the highest non-voided revision. If all entries are voided, the UI explicitly has no current revision.
- Voids preserve the original note and require a reason. Immediate undo is limited to the logging session and 60 seconds, enforced by the server.
- Edits require the `updatedAt` version the editor originally loaded. A conflicting edit returns 409 instead of overwriting.
- Part deletion is soft deletion. Trash remains resolvable by QR, with a clear restore action. Restoring a deleted part preserves its full revision and edit history.
- Restoring an earlier edit creates another audit entry. If its old vendor has since been merged away, choose the authoritative current vendor in the edit form instead.
- Vendor merge intentionally removes the duplicate reference record as specified. Parts retain their original prefix.
- Revisions never clear `labelPrinted`. CSV/ZIP export marks selected parts as exported. Browser printing has an explicit “I printed this label” action so cancelling the print dialog doesn't falsely mark it printed.
- CSV quoting protects commas, quotes, multiline values, and spreadsheet formula injection.
- Four-digit sequence space is capped at 9999 per prefix; the server never silently produces a different identifier shape.

## Verification

Run tests only on an isolated **local** database with sample data. Browser tests create fixtures and put their parts in Trash afterward.

```sh
npm run typecheck
npm test
npm run build
npm start
# In another terminal, with Chrome installed:
npm run test:browser
```

`PLAYWRIGHT_CHROME_PATH` overrides the local Chrome executable. The default is the macOS Google Chrome path. For another OS, point this variable at the installed browser.

Automated checks cover PostgreSQL concurrency, transaction rollback, void numbering gaps, historical prefix allocation, notification dispatch with mocked transports, immutable QR payloads decoded from real PNGs, revision confirmation/undo, editable details and restoration, delete/restore, stale edit rejection, CSV/ZIP exports, unknown scans, and desktop/phone-sized layouts.

A physical phone check is still required for camera permissions, actual printed-label scanning time, iPhone installed-app behavior, and real push/email delivery. Camera access on a phone requires the deployed HTTPS URL; an ordinary HTTP LAN URL won't work. Print Master column mapping needs verification with the label template and printer actually used in the workshop.
