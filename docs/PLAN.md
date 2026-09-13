# Build Plan

Eleven phases. Each has a goal, a definition of done you can actually check, and a starting prompt for Claude Code.

**Ship at phase 6.** Phases 7–10 are improvements to a product you are already using daily. Do not build them first.

Track progress by editing the status column below.

| Phase | Deliverable | Effort | Status |
|---|---|---|---|
| 0 | Oracle VM + Docker stack, HTTPS domain, health check on web and Android | 1 weekend | ☑ (local; VM/DNS steps in `deploy/README.md` still manual) |
| 1 | Schema, seed data, auth (with rate limiting from day one) | 1 weekend | ☑ |
| 2 | Local store, outbox, sync | 1 weekend | ☑ |
| 3 | Transaction entry + quick-add | 1 weekend | ☐ |
| 4 | Monthly plan + dashboard | 1 weekend | ☐ |
| 5 | Commitments + sinking fund | 4–5 days | ☐ |
| 6 | Excel import | 1 weekend | ☐ |
| 7 | Rule engine | 3–4 days | ☐ |
| 8 | Salary-day checklist + notifications + VAPT pass | 4–5 days | ☐ |
| 9 | Android build + widget | 1 weekend | ☐ |
| 10 | Weekly review, month-end close, charts, backups | 1 weekend | ☐ |

---

## Phase 0 — Foundation

**Goal:** the whole chain — VM, Postgres, Elysia, Caddy, HTTPS domain, React shell — working end to end. No product features yet.

This phase exists to de-risk everything expensive to discover late: a misconfigured firewall, a broken Docker network, a certificate that won't issue. Far cheaper to debug with an empty app than with six phases of features sitting on top of it.

**Tasks**

1. Create an Oracle Cloud account. Home region: **Mumbai**. This is permanent for the tenancy — don't rush past this choice.
2. Provision one `VM.Standard.A1.Flex` instance, 2 OCPU / 12 GB, Ubuntu 24.04 minimal. Retry across availability domains if you hit `Out of host capacity`; fall back to the AMD micro instance if Arm stays unavailable.
3. Security list + `ufw` on the box: open only 22, 80, 443. SSH key-based only, password auth disabled.
4. Install Docker + Docker Compose on the VM.
5. Register a free DuckDNS subdomain, point it at the VM's public IP, and set up the tiny cron script DuckDNS provides to keep it updated if the IP changes.
6. Scaffold `server/`: Bun + Elysia, one route (`GET /api/health`) that runs `SELECT 1` against Postgres via Drizzle.
7. Scaffold `client/`: Vite + React + TypeScript. One page that calls `/api/health` through `lib/api-client.ts` and displays the result.
8. `docker-compose.yml` with three services: `postgres`, `api` (the Elysia app), `caddy`. `Caddyfile` serving the client's `dist/` at `/` and reverse-proxying `/api/*` to the `api` container, with automatic TLS on the DuckDNS domain.
9. `docker compose up -d --build` on the VM. Confirm the health check is reachable over HTTPS from outside.
10. Push to GitHub. Write a short `deploy/README.md`: `git pull && docker compose up -d --build` is the entire deploy process.
11. Add Capacitor to `client/`, `npx cap add android`, point `webDir` at `dist/`, build, and confirm the APK also reaches the same `/api/health` over the network from a device or emulator.

**Done when**

- `https://<yourname>.duckdns.org` loads the React page and shows a green health check with a live database round trip
- The same health check works from the Android build on a real device or emulator
- `git pull && docker compose up -d --build` on the VM is the entire deploy process, confirmed by actually running it once
- `nmap` against the VM's public IP shows only 22, 80, 443 open

**Watch for:** CORS. The Android app's origin is `capacitor://localhost`, not your domain — set the allowlist in Elysia now, or you'll debug it mid-feature later. Also: card verification at Oracle signup sometimes fails on the first Indian card; try a different one before assuming something's broken.

> **Claude Code prompt**
> Read PRD.md sections 7.1–7.5 and SKILL.md. Set up phase 0 from PLAN.md: a Bun + Elysia server with a health-check route that queries Postgres via Drizzle, a Vite + React client that calls it through lib/api-client.ts, a docker-compose.yml running postgres/api/caddy, and a Caddyfile serving the client build and reverse-proxying /api to Elysia with automatic HTTPS on a DuckDNS domain. Include the CORS allowlist for capacitor://localhost. Then add Capacitor and confirm the same health check works from an Android build. Do not build any product features.

---

## Phase 1 — Schema, seed data, auth

**Goal:** the database exists, is seeded, and only you can reach it — with the security controls from PRD §7.8 in place from the start, not bolted on later.

**Tasks**

1. Drizzle schema for all nine tables from PRD §5, every one with the four sync columns.
2. Money columns as `bigint` paise. `lib/money.ts` for conversion and formatting, shared between client and server where practical.
3. Seed script: the categories from PRD §4.2 with budgets, the tea/sutta aliases, the two accounts, the two fund buckets. Idempotent, keyed on category name.
4. TypeBox schemas for the auth routes in `server/schemas/`.
5. `POST /api/auth/login` — argon2 verify via `Bun.password`, issue JWT access (15 min) + refresh (90 days). Refresh tokens stored server-side in a `sessions` table so they can be revoked.
6. `POST /api/auth/refresh`, rotating the refresh token on use.
7. `requireAuth()` guard applied via `.group()` to everything under `/api/*` except `/api/auth/*`.
8. `elysia-rate-limit` on `/api/auth/login` (e.g. 5 attempts / 15 min / IP).
9. Login screen on the client. Access token in memory, refresh token in Capacitor secure storage on device / an httpOnly-equivalent pattern on web.

**Done when**

- `bun run db:migrate` produces all nine tables in Postgres
- Seeding twice does not duplicate categories
- The tea/sutta category has all seven aliases
- An unauthenticated call to any `/api/*` route (except `/api/auth/*`) returns 401
- Six failed login attempts in a row return 429, not a 6th 401
- Login persists across an app restart with no re-entry

**Watch for:** seed idempotently, keyed on category name — you will re-run it. Also don't skip the rate limit "because it's just me using it" — this endpoint is internet-facing the moment DNS resolves.

> **Claude Code prompt**
> Phase 1 from PLAN.md. Build the Drizzle schema for all nine tables in PRD.md section 5, with the four sync columns on every table and money as bigint paise. Add an idempotent seed script using the categories and aliases in PRD section 4.2. Then single-user auth per SKILL.md hard rules 8–12: TypeBox schemas, argon2 via Bun.password, JWT access plus server-side-revocable refresh tokens, a requireAuth guard applied via .group(), rate limiting on login, and a login screen with secure token storage.

---

## Phase 2 — Local store, outbox, sync

**Goal:** create a row offline on one device, see it on the other.

Build this now, with two tables and no UI. Retrofitting it later means touching every write path you have written.

**Tasks**

1. `client/src/lib/local/` — one interface, two implementations (Capacitor SQLite, Dexie). Mirror the Postgres schema.
2. `outbox` table: `id, table_name, row_id, operation, payload, created_at, attempts`.
3. `GET /api/sync?since=` (Elysia, TypeBox query schema) → all rows across all tables with `updated_at > since`, soft-deleted included.
4. `POST /api/sync` (TypeBox body schema per table) → accept outbox batch, last-`updated_at`-wins merge, return server time. Rate-limited per SKILL.md hard rule 12.
5. `client/src/lib/sync/` — drain outbox, pull, merge, persist `lastSyncedAt`.
6. Triggers: app foreground, after a write (2s debounce), manual refresh. **No timer** — there's no scale-to-zero database to work around on this VM, but a polling loop is still wasted battery on the phone for zero benefit.
7. Sync status indicator: synced / pending / offline.

**Done when**

- Airplane mode: create a row, it appears in the UI instantly, and syncs on reconnect
- Two devices editing the same row converge on the later `updated_at`
- A soft delete on one device removes it from the other and does not resurrect
- A failed sync retries without duplicating rows
- `grep -r "setInterval\|refetchInterval" client/src/` returns nothing
- A malformed sync payload is rejected with 4xx by TypeBox, not a 500

**Watch for:** clock skew. Use the server's returned timestamp as the next sync cursor, not the device's own clock.

> **Claude Code prompt**
> Phase 2 from PLAN.md, following SKILL.md hard rules 3–7. Build the local store abstraction with SQLite and Dexie implementations behind one interface, the outbox table, the Elysia /api/sync GET and POST routes with TypeBox schemas and last-write-wins merge on updated_at, rate limiting, and event-driven sync triggers with no polling. Include tests for the merge cases listed in PLAN.md.

---

## Phase 3 — Transaction entry

**Goal:** logging a ₹20 tea takes two taps.

This is the feature the dataset depends on. Your cash spending is currently invisible, and it is the category you most want to reduce.

**Tasks**

1. Full entry form: date, amount, direction, description, category, account, note, excluded toggle.
2. Transaction list: month grouped, search, filter by category, infinite scroll.
3. Inline recategorise from the list.
4. Quick-add row: configurable buttons. Seed Tea ₹15, Sutta ₹20, Badishep ₹10, Petrol ₹300, Snack ₹50. Tap saves instantly, long-press edits the amount first.
5. Swipe to soft-delete, with undo.
6. Numeric keypad by default on the amount field.

**Done when**

- Quick-add is genuinely two taps from cold launch and works offline
- The amount field opens a numeric keypad, not a full keyboard
- Recategorising from the list needs no navigation
- 500 rows scroll without lag

**Watch for:** this is the screen to over-invest in. If entry is slow, nothing else matters.

> **Claude Code prompt**
> Phase 3 from PLAN.md. Build the transaction entry form, the month-grouped transaction list with inline recategorisation and swipe-to-delete with undo, and the configurable quick-add button row from PRD section 4.1. All writes go through the outbox from phase 2. Optimise the quick-add path for two taps from cold launch.

---

## Phase 4 — Monthly plan and dashboard

**Goal:** the number that answers "can I spend this?"

**Tasks**

1. Monthly plan editor: salary, SIP, emergency transfer, sinking transfer, per-category budgets. Copy from last month.
2. `lib/queries/spending.ts` with all three filters. Everything else calls it.
3. Dashboard: days left, safe-to-spend, one card per budgeted category with spent/budget, progress bar, remaining, and **remaining per day**.
4. Colour thresholds: green under 70%, amber to 100%, red over.
5. Uncategorised count badge.
6. Month switcher.

**Done when**

- Numbers reconcile exactly against a hand-calculated month
- Transfers, reimbursements, SIP, and savings outflows appear nowhere in spending
- Per-day remaining recalculates as the month progresses
- Dashboard renders from local data with no network

**Watch for:** the per-day figure is the point of the screen. "₹660 left over 11 days is ₹60/day" is actionable in a way that "₹660 left" is not.

> **Claude Code prompt**
> Phase 4 from PLAN.md. Build lib/queries/spending.ts implementing SKILL.md hard rule 2, the monthly plan editor, and the dashboard from PRD section 4.5 with per-category cards showing spent, remaining, and remaining-per-day. Write a test that reconciles a fixture month against hand-calculated totals.

---

## Phase 5 — Commitments and sinking fund

**Goal:** handle the case where someone else paid and you settle later.

Build this before the import, or every trip settlement in your 3–5 months of history gets miscategorised.

**Tasks**

1. Commitments CRUD: direction, counterparty, amount, category, due month.
2. Settle flow: full or partial. Creates the linked transaction, updates `settled_amount` and status.
3. Receivable settlement creates an excluded credit categorised `Reimbursement / settlement`.
4. Dashboard line: committed-this-month, and safe-to-spend after commitments.
5. Fund buckets UI: Kotak total split into emergency and sinking.
6. Sinking-fund withdrawal, blocked above the bucket balance, with an explicit acknowledgement path for dipping into emergency money.

**Done when**

- An open commitment appears in **no** spending total
- Settling creates exactly one transaction, categorised correctly, dated the settlement date
- Partial settlement leaves the right remainder
- A receivable settlement never counts as income
- Sinking-fund overdraw is rejected by the API, not just hidden in the UI

**Watch for:** the double-count bug. Test that a commitment plus its settlement contributes the amount exactly once.

> **Claude Code prompt**
> Phase 5 from PLAN.md, implementing PRD sections 4.10 and 4.11. Build commitments with full and partial settlement, the dashboard committed-this-month line, and the emergency/sinking fund buckets with overdraw protection enforced in the API. Follow SKILL.md hard rules 6 and 7. Test that a commitment and its settlement contribute to spending exactly once.

---

## Phase 6 — Excel import

**Goal:** load 3–5 months of history without creating a mess. **This is the ship point.**

**Tasks**

1. Upload, sheet picker, column mapping (date, description, debit, credit, balance, Treatment), 20-row preview.
2. Parse with SheetJS, client-side only.
3. Dedupe on `date + amount_paise + normalised description`.
4. Treatment column matched against names and aliases, case-insensitive.
5. **Junk-value guard:** numeric Treatment values discarded to `Uncategorised`.
6. Post-import summary: rows, matched, auto-categorised, uncategorised, and rupee value of each.
7. Bulk recategorise: select many, assign one category.

**Done when**

- The same file imported twice produces no duplicates
- `26920.10` and similar never become categories
- All tea/sutta/chai variants land in one category
- Bulk recategorising 50 rows takes one action
- The file never leaves the device

**Then stop and use the app for a month.** Import the backfill, clear the uncategorised queue, log every tea. Phases 7–10 will be better designed once you know which parts annoy you.

> **Claude Code prompt**
> Phase 6 from PLAN.md, implementing PRD section 4.3. Build the client-side Excel import wizard with SheetJS: sheet selection, column mapping, preview, dedupe hashing, Treatment-column alias matching with the numeric junk-value guard from SKILL.md, a post-import summary, and bulk recategorisation. Test that importing the same file twice creates no duplicates.

---

## Phase 7 — Rule engine

**Goal:** month two takes five minutes, not two hours.

**Tasks**

1. Rules CRUD: match text, field, optional amount range, category, priority.
2. Apply on import and on manual entry.
3. Seed rules: HP / IOCL / BHARAT PETRO → Petrol. SWIGGY / ZOMATO / BLINKIT / ZEPTO → Food. SIP / GROWW / ZERODHA → SIP. Kotak self-transfer → Emergency fund transfer. Employer name → Salary.
4. **Learn from correction:** on manual recategorisation, offer "Always categorise descriptions containing X as Y?" One tap creates the rule.
5. Re-run all rules over existing uncategorised rows.

**Done when**

- A fresh import of a typical month leaves under 10% uncategorised
- Correcting one row and accepting the rule fixes every similar row
- Rules never overwrite a manually-set category

**Watch for:** the auto-detected SIP rule should tick step 1 of the salary-day checklist without you doing anything, since the SIP is auto-debited.

> **Claude Code prompt**
> Phase 7 from PLAN.md, implementing PRD section 4.4. Build the rule engine with priority ordering, the seed rules listed in PLAN.md, learn-from-correction that offers to create a rule from a manual recategorisation, and a re-run action over uncategorised rows. Rules must never overwrite a manually-assigned category.

---

## Phase 8 — Salary day, notifications, and the VAPT pass

**Goal:** save first, spend what remains, with commitments accounted for before allocation. Also: by this phase auth, sync, and import are all built, so it's the first point with a full attack surface worth actually testing — run the checklist before the app carries your full statement history long-term.

**Tasks**

1. Configurable salary date in settings.
2. Local notification on that date, opening the checklist.
3. Checklist: (a) confirm the auto-debited SIP landed, matched by rule; (b) transfer to emergency fund; (c) transfer to sinking fund; (d) confirm the remainder.
4. **Commitment-aware step zero:** read open commitments for the month, show the suggested adjustment to the transfers before any step is ticked.
5. Ticking the transfer steps credits the fund buckets.
6. Budget envelopes reset only after the checklist completes.
7. Two more notifications: Sunday review, and a budget breach at 90% of any category.
8. Commitment due-date reminder, three days before month end.
9. **Run the VAPT checklist from PRD §7.8:**
   - `nmap` your VM's public IP — confirm only 22, 80, 443 respond.
   - Hit `/api/auth/login` past the rate limit — confirm it actually locks out.
   - Send malformed bodies to several write routes — confirm 4xx from TypeBox, never a 500 with a stack trace.
   - `curl -I` a few responses — confirm HSTS and CSP headers are present.
   - Confirm an expired and a tampered JWT are both rejected, on more than one route.
   - Confirm `.env` and any secrets are absent from the Git history (`git log -p | grep -i secret`, or similar).

**Done when**

- The notification fires on the configured date and deep-links to the checklist
- An open commitment visibly changes the suggested transfer amounts
- The month does not open for spending until the checklist is done
- Android 13+ notification permission is requested in context, not on first launch
- Every item in the VAPT checklist above passes, and any failure is fixed before moving on

**Watch for:** because the SIP is auto-debited, step (a) confirms rather than reminds. If the rule matched the debit, pre-tick it.

> **Claude Code prompt**
> Phase 8 from PLAN.md, implementing PRD section 4.6 plus the salary-day integration in section 4.10. Build the configurable salary date, local notifications, and the checklist with the commitment-aware suggestion step. The SIP step confirms an auto-debit matched by the rule engine rather than prompting a manual transfer. Envelopes reset only on completion. Then walk through the VAPT checklist in PRD section 7.8 against the deployed VM and report the result of each check.

---

## Phase 9 — Android polish

**Goal:** the phone app is the one you actually reach for.

**Tasks**

1. Home-screen widget: safe-to-spend plus two quick-add buttons.
2. App icon, splash, status bar theming.
3. Back button, safe areas, keyboard avoidance.
4. Optional PIN or biometric lock.
5. Signed release APK.

**Done when**

- Widget logs a tea without opening the app
- Cold start to usable dashboard is under two seconds
- Back navigation never strands you on a blank screen

**Watch for:** the widget needs to write through the same outbox. Do not let it write directly to SQLite.

> **Claude Code prompt**
> Phase 9 from PLAN.md. Build the Android home-screen widget showing safe-to-spend with two quick-add buttons that write through the existing outbox, app icon and splash, back-button and safe-area handling, an optional biometric lock, and a signed release build configuration.

---

## Phase 10 — Review, close, backups

**Goal:** the monthly loop closes itself, and the data is safe — this is the phase that makes self-hosting on a free VM a responsible choice rather than a risky one.

**Tasks**

1. Sunday review screen: week by category, top three transactions, remaining budgets, projected month-end, pending uncategorised.
2. Month-end close: actual vs planned, sweep unused petrol and misc, whether money came back from Kotak, and the transfer verdict (no withdrawals → suggest raising the emergency transfer; repeated withdrawals → hold; surplus → sweep).
3. Lock the closed month read-only.
4. Charts: category trend across months, savings rate, emergency fund growth, tea/sutta trend against the reduction target.
5. Nightly `pg_dump` inside the Postgres container, via a cron job on the VM, pushed to OCI Object Storage.
6. A weekly job that also pulls a copy down to your laptop — two independent locations, not one.
7. Excel export as a third, human-readable copy of the data.
8. **Perform one restore**: spin up a throwaway Postgres container, restore the latest dump into it, and verify row counts match the live database.

**Done when**

- Month-end close runs without falling back to Excel
- A closed month cannot be edited without an explicit unlock
- The tea/sutta chart shows the trend against the ₹2,000 target
- A backup exists in at least two places outside the VM's own disk
- A restore has actually been tested, not just configured

**Watch for:** an untested backup is not a backup. Do the restore, and time how long it takes — that's the number you'll want if this ever happens for real.

> **Claude Code prompt**
> Phase 10 from PLAN.md, implementing PRD sections 4.8 and 4.9. Build the Sunday review screen, the month-end close with the transfer verdict logic and month locking, the four charts listed in PLAN.md, a cron-driven nightly pg_dump inside the Postgres container pushed to OCI Object Storage plus a weekly laptop pull, and Excel export. Then walk through one full restore into a throwaway container and report the row-count comparison.

---

## Working notes

**One phase at a time.** Do not let Claude Code build ahead. If it proposes phase 7 work during phase 4, redirect it.

**Test the mobile build before every merge that touches the client.** `bun run build` in `client/` produces the same `dist/` that both Caddy and Capacitor use, so there's no separate mobile build to forget — but do run `npx cap sync android` and confirm the app still launches after any dependency or routing change.

**Commit after each task, not each phase.** Small commits make it obvious which change broke the money maths.

**Spot-check the totals by hand each month.** Pick one category, add it up in the spreadsheet, compare. Do this for the first three months. A finance app that is quietly wrong is worse than no app, because you will act on the numbers.

**Log into the Oracle console occasionally**, even once the app is running unattended. Always Free tenancies have a documented history of being reclaimed for inactivity, and the console login itself is what resets that clock.
