# PRD: Personal Finance Planner (Web + Android)

**Version:** 1.2
**Owner:** Single developer / single user (personal project)
**Status:** Ready to build — see `PLAN.md` for phases, `SKILL.md` for code conventions
**Currency:** INR only

---

## 1. Why this exists

The planning work is already done. The salary split, the petrol formula, the category list, the emergency-fund targets, the Sunday review, all of it exists as a document. The problem is that a document cannot tell you on the 19th of the month whether you have already blown the tea-and-cigarette budget, and it cannot re-do the Excel categorisation every month.

So the app has exactly one job: **turn a fixed monthly plan into a live number that says "you can still spend ₹X in this category this month."**

Everything else is secondary.

### The specific pain points it solves

| Pain today | What the app does |
|---|---|
| 114 of 523 transactions uncategorised, ₹53,928 unaccounted | Rule engine auto-categorises by description; manual sweep of the rest takes minutes, and rules persist so next month it is near-zero |
| "Sutta", "Tea", "Chai", "Sutta + badishep", "Sutta + badishep + chai" counted separately | One canonical category with aliases, so the real total is visible |
| Account-balance numbers (26920.10, 30780.41) sitting in the category column | Numeric-looking categories are auto-flagged as junk, never counted as spending |
| Transfers, reimbursements, trip settlements inflate "expenses" | Explicit `Excluded` flag; these are tracked but kept out of every budget number |
| A friend pays for trip tickets now, you repay next month, and neither month's numbers make sense | Commitments: the obligation is tracked from day one, counted as spending only when you settle it, and it reduces next month's plan before salary is allocated |
| No idea if ₹8,000/month to Kotak is actually survivable | Month-end verdict screen: how much was pulled back, and a recommendation to hold, raise, or lower the transfer |
| Small cash spends (tea, sutta, badishep) never recorded | Two-tap quick-add on Android home screen widget |

### Non-goals (explicitly out of scope)

- Multi-user, family accounts, sharing, signup flows, password reset emails, roles and permissions (one hardcoded user, one login)
- Bank API / account-aggregator integration (needs licences, not worth it for one user)
- Automatic investment tracking, NAV fetching, portfolio returns
- Tax filing, GST, loans, credit-card statement reconciliation
- Any kind of advice engine, AI chat, or "insights" feed
- Notifications beyond three fixed ones (salary day, Sunday review, budget breach)

Keeping these out is what makes it lightweight.

---

## 2. User and context

One user. Salary ₹26,250 credited monthly. Pune-based, commutes ~48–50 km/day on a Yamaha MT-15. Runs a ₹5,000 SIP and is building an emergency fund in a separate Kotak 811 account. Spends mostly via UPI from a primary account, with a meaningful amount of small cash spending that never gets recorded.

Design consequences:

- **Offline-capable, cloud-backed.** Entry happens at a tea stall or petrol pump, where the network may be bad. Writes must succeed locally and sync when connectivity returns.
- **Speed over polish.** If logging a ₹20 tea takes more than 3 seconds, it will not happen, and the whole dataset rots.
- **Web and Android must show the same data.** Phone for entry, laptop for the monthly Excel import and review. This is what makes a server mandatory rather than optional.
- **Log in once, never again.** Long-lived refresh token. A login screen on every launch kills the two-tap quick-add.

---

## 3. Scope

### V1 (MVP) — build this first

1. Backend API + Postgres + single-user auth (see §7)
2. Manual transaction entry + quick-add
3. Local cache + sync engine (offline writes, background push/pull)
4. Categories with aliases and budget limits
5. Monthly budget plan (envelope style)
6. Dashboard with remaining-per-category
7. Excel/CSV import with column mapping and dedupe
8. Rule-based auto-categorisation
9. Emergency fund balance + target progress
10. Salary-day checklist

### V2

11. Petrol calculator and odometer-based tracking
12. Weekly (Sunday) review screen
13. Month-end close: rollover of unused petrol and misc to emergency fund
14. Charts: category trend over months, savings rate
15. Android home-screen widget + notifications
16. Automated nightly database backup to object storage

### V3 (only if V1/V2 actually get used for 3 months)

17. SMS auto-capture of UPI debits (Android, sideload only, see §8)
18. Export back to Excel
19. Habit-reduction tracker with weekly targets for the tea/sutta category

---

## 4. Core features in detail

### 4.1 Transaction entry

**Full entry form:** date, amount, direction (debit/credit), description, category, account, note, and an `Excluded from spending` toggle.

**Quick-add:** a row of user-configurable buttons on the dashboard. Tapping one records an amount immediately with today's date and a preset category. Defaults to configure: Tea ₹15, Sutta ₹20, Badishep ₹10, Petrol ₹300, Snack ₹50. Long-press to edit the amount before saving.

This is the single most important feature for data quality. Cash spending is currently invisible, and it is exactly the category that needs to come down.

### 4.2 Categories

Each category has: name, group, monthly budget, an `is_spending` flag, and a list of **aliases**.

Groups: `Essential`, `Lifestyle`, `Savings`, `Excluded`.

Seed list:

| Category | Group | Monthly budget | Counts as spending |
|---|---|---:|---|
| Petrol | Essential | ₹4,000 | Yes |
| Protein powder | Essential | ₹2,500 | Yes |
| Creatine | Essential | ₹500 | Yes |
| Food / snacks | Essential | ₹2,000 | Yes |
| Tea + Sutta + Badishep | Lifestyle | ₹2,000 | Yes |
| Personal / misc | Lifestyle | ₹1,750 | Yes |
| Shopping | Lifestyle | from sinking fund | Yes |
| Bike accessories & repairs | Lifestyle | from sinking fund | Yes |
| Trips | Lifestyle | from sinking fund | Yes |
| Subscriptions | Lifestyle | ₹0 (ad-hoc) | Yes |
| SIP | Savings | ₹5,000 | No |
| Emergency fund transfer | Savings | ₹7,000 | No |
| Sinking fund transfer | Savings | ₹1,500 | No |
| Transfer between own accounts | Excluded | — | No |
| Reimbursement / settlement | Excluded | — | No |
| Salary / income | Excluded | — | No |
| Uncategorised | — | — | Pending |

**Total: ₹26,250.** This revises the plan's Option 2 by moving ₹1,000 out of the emergency transfer and ₹500 out of misc into a **sinking fund**. See §4.10 for why.

Aliases on `Tea + Sutta + Badishep` at minimum: `sutta`, `tea`, `chai`, `badishep`, `sutta + badishep`, `sutta + badishep + tea`, `sutta + badishep + chai`. The import should match these case-insensitively and collapse them into one.

**Junk-value guard:** if an imported category value parses as a number (e.g. `26920.10`, `35067.83`), it is discarded and the transaction goes to `Uncategorised`. Never create a category from a numeric string.

### 4.3 Excel / CSV import

Flow: upload file → pick sheet → map columns (date, description, debit, credit, balance, and the existing `Treatment` column) → preview first 20 rows → confirm → import.

Rules:
- **Dedupe** on a hash of `date + amount + description`. Re-importing the same statement must not double-count.
- The `Treatment` column is read as a *suggestion*, matched against category names and aliases. Numeric values and unrecognised values fall through to the rule engine, then to `Uncategorised`.
- After import, show a summary: total rows, matched, auto-categorised by rule, still uncategorised, and the rupee value of each bucket.

### 4.4 Rule engine

A rule is: `if description contains <text> then category = <X>`, with optional amount range and priority. Rules run at import time and on manual entry.

Seed rules to write: `HP`/`IOCL`/`BHARAT PETRO`/`PETROL` → Petrol. `SWIGGY`/`ZOMATO`/`BLINKIT`/`ZEPTO` → Food. `SIP`/`GROWW`/`ZERODHA`/`MF` → SIP. `KOTAK` self-transfer → Emergency fund transfer. `SALARY`/`NEFT CR` from employer → Salary.

**Learning:** whenever a transaction is manually recategorised, offer "Always categorise descriptions containing *[extracted keyword]* as *[category]*?" One tap creates the rule. This is what makes month 2 onward take five minutes instead of two hours.

### 4.5 Dashboard (the home screen)

Top line: **days left in month** and **total safe-to-spend remaining**.

Then one card per budgeted category:

```
Tea + Sutta + Badishep     ₹1,340 / ₹2,000
[██████████████░░░░░░]  67%
₹660 left · 11 days · ₹60/day
```

The per-day figure is the important part. It converts an abstract limit into a daily decision.

Colour: green under 70%, amber 70–100%, red over 100%.

Below the cards: emergency fund progress toward the next milestone (₹10,000 → ₹25,000 → ₹50,000 → ₹1,00,000), and a count of uncategorised transactions as a nagging badge.

### 4.6 Salary-day checklist

Triggered by a notification on the configured salary date. A three-step checklist, each with a "done" tick:

1. Transfer ₹5,000 to SIP
2. Transfer ₹8,000 to Kotak emergency fund
3. Confirm ₹13,250 remains for the month

Ticking step 2 credits the emergency fund balance. The month's budget envelopes reset only after the checklist completes, which enforces save-first rather than save-what's-left.

### 4.7 Petrol calculator

Inputs: office days, daily km, actual mileage, petrol price. Output: expected monthly cost.

`office_days × daily_km ÷ mileage × price`

Example shown in-app: `26 × 49 ÷ 43 × 130 ≈ ₹3,850`.

Optional odometer log: record km at each fill-up and the app computes real mileage, which then feeds the estimate automatically. This is the difference between a ₹4,000 budget being a guess and being a measurement.

### 4.8 Weekly review (Sunday)

A single screen, generated, not manually filled: spend per category this week, the biggest three transactions, remaining budget per category, projected month-end position at current pace, and any uncategorised items needing a decision.

### 4.9 Month-end close

Runs on the last day. Shows:

- Actual vs planned for every category
- Unused petrol and unused personal/misc, with a one-tap "sweep to emergency fund"
- Whether money was pulled *back* from Kotak this month, and how much
- A verdict on the transfer amount, using the rule already decided: no withdrawals → suggest raising to ₹10,000; repeated withdrawals → suggest holding at ₹7,000–8,000; surplus → sweep it across

Then it locks the month read-only and opens the next one.

### 4.10 Commitments (money owed, in both directions)

This covers the case where a friend books trip tickets in September and you repay them in October. It also covers the reverse: you pay for a group and collect later. The Excel analysis already showed trip settlements muddying the numbers, so this is not a hypothetical.

Without this feature, one of two wrong things happens. Either the September spend is invisible and October looks like a blowout, or you record it in September and the totals count money you never paid.

**The model:** a commitment is a known future cash movement that is not yet a transaction.

| Field | Meaning |
|---|---|
| `direction` | `payable` (you owe) or `receivable` (owed to you) |
| `counterparty` | Free text: "Rahul", "office", "self" |
| `amount` | Total |
| `settled_amount` | Running total paid or received so far |
| `category_id` | Where it lands **when settled** (e.g. Trips) |
| `due_month` | `YYYY-MM`, when you expect to settle |
| `status` | `open` / `partial` / `settled` / `written_off` |

**Rules, in order of importance:**

1. **A commitment is never spending.** It does not appear in any category total, any month total, or the dashboard's spent figures. Only the settling transaction does. Getting this wrong double-counts every trip.
2. **Settling creates a real transaction** dated the day you actually paid, categorised to the commitment's category, and linked back. The commitment moves to `settled`.
3. **Partial settlement is allowed.** Pay ₹3,000 of ₹6,000, and `settled_amount` updates while `status` becomes `partial`.
4. **Receivables settle as excluded credits.** When Rahul pays you back, the incoming money is categorised `Reimbursement / settlement` with `is_excluded = true`. It is not income. It never inflates your savings rate.
5. **Commitments due this month reduce safe-to-spend**, shown as their own line on the dashboard above the category cards:

```
⚠ Committed this month          ₹6,000
   Trip tickets · Rahul · due 15 Oct
Safe to spend after commitments  ₹4,320
```

**Salary-day integration.** This is the point of the whole feature. The checklist reads open commitments for the month before it proposes transfer amounts:

> You have **₹6,000** committed this month (trip repayment to Rahul).
> Sinking fund balance: **₹4,500**.
> Suggested: take ₹4,500 from the sinking fund, reduce this month's emergency transfer to ₹5,500, cover the rest.
> Emergency fund is untouched.

A known obligation should change the plan **before** salary is allocated, not surface on the 22nd when the money is gone.

**Reminders.** Three days before `due_month` ends, notify on any commitment still `open`.

### 4.11 Sinking fund

Trips, bike service, shopping, and annual charges are irregular but entirely foreseeable. The statement showed roughly ₹7,069 on a trip and ₹3,200 on bike accessories in the analysed period. A ₹1,750 misc budget cannot absorb either.

With no mechanism, those costs come out of the Kotak emergency fund, which is exactly the failure the plan is trying to prevent. **A trip you knew about is not an emergency.**

So: ₹1,500/month into a sinking fund, sourced by moving ₹1,000 from the emergency transfer and ₹500 from misc. The monthly total is unchanged at ₹26,250, and combined savings and investment stays at ₹13,500.

**Keep it in the same Kotak account, tracked as two virtual buckets in the app.** Opening a third bank account adds friction without adding discipline. The app shows:

```
Kotak 811                        ₹31,500
  Emergency (do not touch)       ₹27,000
  Sinking fund (planned spends)   ₹4,500
```

Hard rule in code: a sinking-fund withdrawal can never exceed the sinking-fund balance. If a trip costs more than the bucket holds, the app makes you explicitly acknowledge that you are dipping into emergency money, and logs it. Friction is the feature.

**Effect on the emergency-fund timeline:** at ₹7,000/month instead of ₹8,000, you reach ₹25,000 in four months instead of three, and ₹50,000 in about seven. That is the price of not raiding it every time a trip comes up, and it is worth paying. Review at three months per the original plan: if the sinking fund keeps building a surplus, shift the split back toward the emergency transfer.

*This is budgeting structure rather than financial advice. I am not a licensed financial advisor, and the split between the two buckets is your call.*

---

## 5. Data model

Nine tables. That is the whole thing. **Postgres on the server, SQLite on each client, identical schema.**

Every table carries the same four sync columns, so the sync engine is written once and works for all of them:

```
id           UUID     generated client-side, never a sequence
updated_at   TIMESTAMPTZ  set on every write
deleted_at   TIMESTAMPTZ  soft delete, NULL when live
device_id    TEXT     which client last wrote it
```

UUIDs generated on the client are what let an offline device create a transaction with a real primary key before the server has ever seen it. Soft deletes are what let a delete propagate; a hard delete is invisible to the other device and the row simply reappears on the next pull.

**accounts** — `name, type (spending|savings), opening_balance, is_emergency_fund`

**categories** — `name, group, monthly_budget, is_spending, sort_order`

**category_aliases** — `category_id, alias`

**transactions** — `date, amount, direction, description, category_id, account_id, note, is_excluded, source (manual|quickadd|import), import_hash, created_at`

**rules** — `match_text, match_field, amount_min, amount_max, category_id, priority, created_at`

**monthly_plans** — `year_month, salary, sip_amount, emergency_transfer, sinking_transfer, status (open|closed), closed_at`
plus **plan_lines** — `plan_id, category_id, planned_amount, actual_amount`

**commitments** — `direction (payable|receivable), counterparty, description, amount, settled_amount, category_id, due_month, status, notes`
plus **commitment_settlements** — `commitment_id, transaction_id, amount, settled_on`

**fund_buckets** — `account_id, name (emergency|sinking), balance` — the two virtual buckets inside the Kotak account

Amounts are stored as `NUMERIC(12,2)` in Postgres and as paise in an integer column in SQLite. Never floats. A rounding drift of a few paise across 500 transactions is the kind of bug that destroys trust in the whole dashboard.

Derived, never stored: remaining per category, per-day allowance, savings rate, emergency fund total (sum of transfers minus withdrawals).

**Core query for every spending number:**

```sql
SELECT category_id, SUM(amount)
FROM transactions
WHERE direction = 'debit'
  AND is_excluded = false
  AND deleted_at IS NULL
  AND category_id IN (SELECT id FROM categories WHERE is_spending = true)
  AND date BETWEEN :month_start AND :month_end
GROUP BY category_id;
```

Two filters (`is_excluded`, `is_spending`) are what keep transfers, reimbursements, salary credits, and SIP/savings outflows from ever being counted as expenses. The third (`deleted_at`) is what keeps soft-deleted rows from silently inflating every total. Get these right once and every screen is correct.

---

## 6. Screens

**Web (laptop, for import and review)**
1. Dashboard
2. Transactions (filterable table, bulk recategorise, inline edit)
3. Import wizard
4. Categories & rules settings
5. Monthly plan editor
6. Reports (trends, month-end close)

**Android (phone, for entry and checking)**
1. Dashboard with quick-add row
2. Add transaction
3. Transactions list (search, filter by month/category)
4. Emergency fund
5. Settings
6. Home-screen widget: remaining safe-to-spend + two quick-add buttons

Categories, rules, import, and the plan editor can be web-only in V1. Nothing is lost by making the phone read-mostly plus fast entry.

---

## 7. Tech stack and hosting

**Decision: React + TypeScript + Vite frontend, Bun + Elysia.js backend, PostgreSQL, self-hosted on Oracle Cloud Always Free Compute.** One VM, three Docker containers, ₹0/month, no platform terms to negotiate.

This replaces the earlier Next.js/Vercel/Neon recommendation. It is also, in one respect, a simplification: a Vite React app builds to a folder of static files, full stop. There is no dual-build-target problem the way there was with Next.js — the same `dist/` that Caddy serves on the web is the same `dist/` Capacitor wraps for Android. One build, two shells.

### 7.1 Architecture

```
┌──────────────────────┐        ┌──────────────────────┐
│  Android (Capacitor) │        │  Web browser         │
│  same Vite build,    │        │  same Vite build,    │
│  wrapped as APK      │        │  served by Caddy     │
│  SQLite cache        │        │  IndexedDB cache     │
└──────────┬───────────┘        └──────────┬───────────┘
           │  HTTPS + JWT                  │  HTTPS + JWT
           └───────────────┬───────────────┘
                           ▼
         ┌─────────────────────────────────────┐
         │  Caddy — automatic TLS               │
         │   ├── serves /  → React static build │
         │   └── proxies /api → Elysia          │
         └─────────────────┬───────────────────┘
                           ▼
         ┌─────────────────────────────────────┐
         │  Bun + Elysia.js API                 │
         │  TypeBox validation on every route   │
         │  JWT auth · rate limiting · CORS     │
         └─────────────────┬───────────────────┘
                           ▼
              ┌────────────────────────┐
              │  PostgreSQL 16         │
              │  Docker volume         │
              └────────────────────────┘
      All four containers on one Oracle ARM VM, Mumbai region
```

### 7.2 Client

| Layer | Choice | Notes |
|---|---|---|
| Framework | React 18 + TypeScript + Vite | Builds to static `dist/`, used as-is by both web and Capacitor |
| Android shell | Capacitor 6 | Wraps `dist/` directly, no export step or special config |
| Styling | Tailwind + shadcn/ui | |
| Server state | TanStack Query | Event-driven refetch, no polling — see §7.4 |
| Client state | Zustand | |
| Local store | SQLite (`@capacitor-community/sqlite`) on Android, Dexie/IndexedDB on web | Behind one interface, see SKILL.md |
| Validation | TypeBox, the same schema objects the API defines, imported into the client | One schema, not two |
| Excel parsing | SheetJS, client-side | File never leaves the device |
| Charts | Recharts | |
| API client | `lib/api-client.ts`, the only place `fetch()` is called | Reads `VITE_API_BASE` |

### 7.3 Server: Bun + Elysia.js

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Bun 1.3+ | Built-in test runner, bundler, and a native Postgres client if you want it, though Drizzle is still the better fit here for migrations |
| Framework | Elysia.js | TypeBox validation is native to the framework, not bolted on — every route declares its own `body`, `query`, `params`, and `response` schema, and Elysia rejects anything that doesn't match before your handler runs |
| ORM | Drizzle | Parameterised queries by construction; this is most of your SQL-injection defence |
| Auth | `@elysiajs/jwt` + `@elysiajs/bearer`, argon2 password hashing (`Bun.password`, built in) | Access token short-lived, refresh token long-lived |
| Rate limiting | `elysia-rate-limit` on `/api/auth/*` and `/api/sync` | Brute-force and abuse defence |
| CORS | `@elysiajs/cors`, explicit origin allowlist | Never `*` |
| Security headers | `@elysiajs/helmet` or hand-set headers in Caddy | HSTS, `X-Content-Type-Options`, `X-Frame-Options`, CSP |
| Docs | `@elysiajs/swagger` | Auto-generated from the same TypeBox schemas, dev-only |

**Why Elysia's validation matters here specifically:** every route in this app touches money or personal financial history. A body schema that rejects a malformed `amount_paise` before it reaches your handler is not boilerplate, it's the first of several layers between a bad request and your database. Every route handler in this project must declare `body`, `query`, and `response` schemas. A route with no schema is a route with no input validation, and in Elysia that is a choice you have to make explicitly rather than something you can forget.

```ts
// Example: every write route looks like this, no exceptions
app.post('/api/transactions', async ({ body, user }) => {
  return createTransaction(user.id, body);
}, {
  body: t.Object({
    id: t.String({ format: 'uuid' }),
    date: t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    amountPaise: t.Integer({ minimum: 0 }),
    direction: t.Union([t.Literal('debit'), t.Literal('credit')]),
    categoryId: t.String({ format: 'uuid' }),
    description: t.String({ maxLength: 500 }),
    isExcluded: t.Boolean(),
  }),
  response: t.Object({ id: t.String() }),
})
```

### 7.4 Database

**PostgreSQL 16 in Docker on the VM.** Not a managed service, not Autonomous Database — see §7.5 for why Autonomous Database specifically is the wrong call even though it's free.

- Amounts: `bigint` paise, never `numeric` cast through floats, never `real`.
- One Docker volume for `pgdata`, backed up per §8.
- Connection pooling via `pg` pool settings in Drizzle; with one user and two devices you will never need PgBouncer.

### 7.5 Oracle Cloud Compute: what you're actually signing up for

You don't have an account yet, so start clean with accurate terms, not last year's blog posts — Oracle's Always Free limits changed in mid-2026.

**What you get:**
- Arm Ampere A1 compute, capped for Always Free tenancies at **2 OCPUs and 12 GB memory total**, down from the 4 OCPU / 24 GB some older guides still quote. Still roughly ten times what a single-user app needs.
- 2 AMD micro instances (1/8 OCPU, 1 GB) as a fallback if Arm capacity is unavailable in your region.
- 200 GB block storage, object storage, 10 TB/month egress.
- Mumbai and Hyderabad as home regions — pick **Mumbai**, low latency from Pune, and the home region cannot be changed after signup.

**Provisioning:**
1. Sign up with a mobile number and card (a small authorisation hold, refunded).
2. Home region: Mumbai. This is permanent for the tenancy.
3. Create one `VM.Standard.A1.Flex` instance, 2 OCPU / 12 GB, Ubuntu 24.04 minimal, in the home region.
4. `Out of host capacity` is common on Ampere A1 in busy regions — retry across availability domains, or fall back to the AMD micro instance, which is enough to run this app.
5. Open ports 22 (restricted to your IP if possible), 80, 443 in the VM's security list. Everything else closed.

**Use PostgreSQL in Docker on the VM. Do not use Oracle Autonomous Database**, even though it's also free. An Always Free Autonomous Database stops automatically after 7 days of inactivity, and one that stays stopped for 90 cumulative days may be reclaimed and permanently deleted — a two-week holiday could cost you your financial history. The VM itself has no such inactivity clock; a Postgres container on it stays up as long as the VM does.

**Docker layout:**

```yaml
# docker-compose.yml — the whole server
services:
  postgres:
    image: postgres:16-alpine
    volumes: [pgdata:/var/lib/postgresql/data]
    environment: [POSTGRES_PASSWORD_FILE=/run/secrets/pg_password]
    restart: unless-stopped

  api:
    build: ./server         # Bun + Elysia
    depends_on: [postgres]
    environment: [DATABASE_URL, JWT_SECRET]
    restart: unless-stopped

  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile, caddy_data:/data]
    depends_on: [api]
    restart: unless-stopped

volumes: { pgdata:, caddy_data: }
```

```
# Caddyfile — free domain, automatic TLS
your-app.duckdns.org {
  handle /api/* { reverse_proxy api:3000 }
  handle       { root * /srv/web
                 try_files {path} /index.html
                 file_server }
}
```

Deploy is `git pull && docker compose up -d --build`.

**Known friction, budget time for it:** signup card checks sometimes fail on the first Indian card, a different card usually works; Ampere capacity errors need a retry loop; and Oracle has a documented history of reclaiming idle Always Free tenancies, so log into the console occasionally even once the app is running fine unattended.

### 7.6 Website and domain: free options

You asked whether a free domain is possible anywhere — yes, several ways, all compatible with the Oracle VM approach above:

| Option | Cost | Notes |
|---|---|---|
| **DuckDNS subdomain** (`yourname.duckdns.org`) | Free | A tiny script on the VM keeps it pointed at your (possibly changing) public IP. Caddy gets a Let's Encrypt cert for it automatically. Recommended starting point. |
| **nip.io** (`<ip>.nip.io`) | Free | No account needed at all, resolves directly to your VM's IP. Fine for development, less presentable long-term. |
| **Cloudflare** free plan + a $1–2/year domain from Porkbun/Namecheap | ~₹150/year | Nicer URL, Cloudflare's free proxy and DNS in front of your VM. The only line item in this entire plan with a cost, and it's optional. |
| **Vercel/Netlify free hosting** | Free, but not chosen | These are excellent for a *frontend-only* deploy, but your backend is Bun + Elysia on your own VM, so using them would mean splitting hosting across two providers and managing CORS between them for no real benefit at single-user scale. |

Start with DuckDNS. It costs nothing, takes ten minutes, and Caddy handles the certificate without any manual steps.

### 7.7 Sync protocol

One user, at most two devices. Conflicts are rare enough that last-write-wins is honest rather than lazy.

**Pull:** `GET /api/sync?since=<iso8601>` returns every row across all tables with `updated_at > since`, soft-deleted rows included.

**Push:** `POST /api/sync` sends the client's outbox: rows created or modified since the last successful sync. TypeBox-validated per table.

**Rules:**
- Client generates UUIDs, so offline creates need no server round trip.
- Server compares `updated_at`; the later write wins.
- Deletes are `deleted_at` timestamps, never `DELETE` statements.
- Every local write lands in an outbox table first. Sync drains it. Network down means the UI still updates instantly.
- Triggers: app foreground, after a write (2s debounce), manual refresh. No timer — this VM has no scale-to-zero quirk to work around, but polling is still wasted battery and bandwidth on the phone for no benefit.

### 7.8 Security and VAPT

The server holds your complete financial history behind one login. "Proper security" for a single-user app is not about scale, it's about not leaving an obvious door open. This is the checklist to actually implement, organised the way a VAPT report would group it.

**Authentication & session**
- Password hashed with `Bun.password.hash` (argon2id), never stored or logged in plaintext.
- JWT access token short-lived (15 min), refresh token longer-lived (90 days), rotated on use.
- Refresh tokens stored server-side (a `sessions` table) so a compromised token can be revoked — a stateless-only refresh token cannot be.
- Rate limit `/api/auth/login` (e.g. 5 attempts / 15 min / IP) via `elysia-rate-limit`. This is the single highest-value control for a public-facing login endpoint.
- No password reset flow in V1 — one user, no email sending surface to secure. Recovery is a manual DB update if you forget the password.

**Input validation & injection**
- Every route has a TypeBox `body`/`query`/`params` schema. No handler reads `request.body` unvalidated.
- All queries through Drizzle's parameterised query builder. No string-concatenated SQL, anywhere, ever — grep for template-literal SQL in review.
- File upload (Excel import) size-capped, MIME-type checked, and parsed client-side only — the file itself never reaches the server, which removes an entire class of upload-handling vulnerabilities.

**Transport & headers**
- HTTPS only, enforced by Caddy; HTTP requests redirect.
- HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and a CSP restricting script sources to self, set either via `@elysiajs/helmet` or directly in the Caddyfile.
- CORS allowlist limited to your exact web origin and `capacitor://localhost` / `http://localhost` for the Android WebView. Never a wildcard.

**Infrastructure**
- VM firewall (OCI security list, and `ufw` on the box itself) open only on 22, 80, 443. SSH restricted to key-based auth, password auth disabled.
- `unattended-upgrades` enabled for OS security patches.
- Secrets (`JWT_SECRET`, `DATABASE_URL`, Postgres password) in a `.env` file outside version control, or Docker secrets — never committed, never logged.
- Dependency scanning: `bun audit` (or `npm audit` equivalent) and Dependabot on the repo, checked before each deploy.

**Data-at-rest**
- Postgres data directory on the VM's block volume, which is encrypted at rest by OCI by default.
- Backups (§8) encrypted before they leave the VM if stored anywhere off it.

**A basic VAPT pass before you trust it with real data**, once phase 8 is done:
1. Run `nmap` against your own VM's public IP — confirm only 22, 80, 443 respond.
2. Try the login endpoint past its rate limit — confirm it actually locks out.
3. Send a malformed body to three or four write routes — confirm Elysia rejects with 4xx, not a 500 with a stack trace.
4. Check response headers with `curl -I` — confirm HSTS and the CSP are present.
5. Confirm an expired or tampered JWT is rejected on every protected route, not just some.

This is not a substitute for a professional penetration test, but it is a real, concrete bar, and it is achievable in an afternoon.

### 7.9 Fallback stacks

Keeping the API as plain Elysia routes over Drizzle, with no Oracle-specific SDKs anywhere in the code, is what makes any of these a short migration rather than a rewrite:

| Option | Free tier | Catch |
|---|---|---|
| **Fly.io** | Small always-on VMs | Card required, allowance has narrowed over time |
| **Railway** | Small monthly free credit | Credit-based, not a permanent free tier |
| **Supabase** | Postgres + auth bundled | Free projects pause after ~7 days idle; you'd still run Elysia elsewhere |
| **Neon** | Serverless Postgres, generous free branch | DB only — you'd still need a place to run Bun + Elysia |

If the Oracle VM itself becomes the problem (repeated `Out of host capacity`, or an account getting flagged), the AMD micro instance in the same Always Free tenancy is the first thing to try before moving providers entirely.

---

## 8. Known constraints

**SMS auto-capture (V3):** parsing bank SMS would eliminate most manual entry, but `READ_SMS` is restricted on Google Play and an app like this will not get the permission approved. It is fine for a sideloaded personal build. Plan it as optional, never as the primary input path.

**Kotak 811 limits:** the app should store UPI, NEFT, IMPS, and ATM limits as editable settings rather than hardcoding them, since they change. Verify current values from the official Kotak site or the in-app limits screen before entering them. Treat any number in the planning document as an estimate until confirmed.

**Backups are the single most important operational task.** A free VM that gets reclaimed, disk-corrupted, or misconfigured takes your entire financial history with it — there is no managed provider absorbing that risk for you anymore. Nightly `pg_dump` inside the VM, pushed to OCI Object Storage, plus a weekly copy pulled down to your laptop, plus the app's own Excel export as a human-readable third copy. Test a restore once, before you have a year of data to lose.

**You are the sysadmin now.** Self-hosting on the Oracle VM means OS patches, Docker image updates, certificate renewal (Caddy handles this part automatically), a swap file so Postgres and Bun don't get OOM-killed on a small instance, and occasionally logging into the OCI console so the account isn't flagged as idle. Budget a couple of hours a month. This is the real price of ₹0/month and full data ownership, and it's worth being honest about upfront.

**Security is not optional because the app is personal.** The server holds your complete spending history behind one login. §7.8 is the checklist: rate-limited auth, TypeBox validation on every route, parameterised queries only, a locked-down firewall, and secrets that never touch version control. Run the basic VAPT pass in §7.8 once phase 8 is done, before you trust the app with the full statement history.

**Estimates vs facts, carried into the app:** transaction amounts from the statement are facts. Category assignments, the ₹2,700 tea/sutta figure, mileage, and office-day counts are estimates. The UI should mark estimated figures (e.g. projected petrol) differently from recorded ones, so a projection is never mistaken for a measurement.

---

## 9. Build order

Full detail, including acceptance criteria per phase, lives in `PLAN.md`. Summary:

| Phase | Deliverable | Rough effort |
|---|---|---|
| 0 | Oracle account, VM provisioned in Mumbai, Docker + Caddy + Postgres + Elysia skeleton live on a free DuckDNS domain over HTTPS | 1 weekend |
| 1 | Drizzle schema with sync columns, seed categories and aliases, argon2 + JWT auth with rate limiting | 1 weekend |
| 2 | Local SQLite/Dexie mirror, outbox, `/api/sync` push and pull end to end | 1 weekend |
| 3 | Manual entry + transaction list + quick-add | 1 weekend |
| 4 | Monthly plan + dashboard with remaining-per-category | 1 weekend |
| 5 | Commitments + sinking fund buckets | 4–5 days |
| 6 | Excel import + column mapping + dedupe | 1 weekend |
| 7 | Rule engine + learn-from-correction | 3–4 days |
| 8 | Emergency fund + salary-day checklist + notifications + VAPT pass | 4–5 days |
| 9 | Capacitor Android build, widget | 1 weekend |
| 10 | Weekly review + month-end close + charts + automated backups | 1 weekend |

Phases 0–6 are the usable product. Ship at phase 6 and start using it daily before building anything else. A finance app you are not entering data into is worthless no matter how many features it has.

**Three sequencing rules, each learned the expensive way:**

- **Phase 0 must prove the whole chain end to end** — VM up, Postgres reachable, Elysia responding, Caddy serving HTTPS on the domain — before any feature work. A broken link anywhere in that chain is far cheaper to fix with an empty app than with six phases of features sitting on top of it.
- **Phase 2 before any feature.** Retrofitting sync onto local-only assumptions means touching every write path. Building the skeleton with two tables and no UI takes a weekend. Doing it at phase 9 takes three.
- **Phase 5 before phase 6.** Import the real statement only once commitments exist, otherwise every trip settlement in the history gets miscategorised and you import the mess you are trying to fix.
- **Run the §7.8 VAPT checklist at phase 8, not as an afterthought.** By then auth, sync, and import are all built — it's the first point where there's a full attack surface worth actually testing, and it's before real financial data goes on the server long-term.

---

## 10. Success criteria

After three months of use:

- Uncategorised transactions under 5% of the month's count, without a manual sweep
- Cash tea/sutta/badishep spending actually recorded (currently near-zero, so any number above ₹1,000/month proves the quick-add works)
- Real monthly spending figure known to within ₹500
- A data-backed answer to whether ₹8,000/month to Kotak is sustainable
- Emergency fund past ₹25,000
- Month-end close run three times without falling back to Excel
- Zero data-loss incidents, and at least one successfully tested restore from backup
- Sync never once required manual intervention or produced a duplicate transaction

If the app is open fewer than four days a week by month two, entry is too slow. Fix that before adding features. If you find yourself avoiding the app because the server is down, the server is the problem, not the features.

---

## 11. Decisions (previously open questions)

| # | Question | Decision |
|---|---|---|
| 1 | Salary credit date | User-configurable in settings. A local notification fires on that date and opens the salary-day checklist. Not hardcoded, since the date can move. |
| 2 | SIP | **Auto-debited.** The checklist therefore *confirms* the SIP landed rather than reminding you to transfer it. The rule engine should match the SIP debit automatically and tick step 1 without you touching it. |
| 3 | Statement history to import | 3–5 months of backfill, then monthly imports going forward. Design the importer for repeated small imports with dedupe, not a one-time bulk load. |
| 4 | Trips and shopping budgeting | **Sinking fund.** ₹1,500/month, funded by ₹1,000 from the emergency transfer and ₹500 from misc. See §4.11. |
| 5 | Framework | **React + TypeScript + Vite, web-first, wrapped with Capacitor.** No dual-build-target complication — a Vite build is static files either way. See §7.2. |
| 6 | Backend & hosting | **Bun + Elysia.js + PostgreSQL, self-hosted on an Oracle Cloud Always Free Compute VM** (no account yet, provisioned in phase 0). TypeBox validation on every route, argon2 + rate-limited JWT auth, VAPT checklist in §7.8. |
| 7 | Domain | Free DuckDNS subdomain with Caddy's automatic HTTPS. A paid `.in` domain via Cloudflare is optional and purely cosmetic. See §7.6. |
| 8 | Deferred expenses | New feature. See §4.10 Commitments. |

### Still genuinely open

1. Notification permission on Android 13+ must be requested at runtime. Ask on first launch, or at the moment the user sets a salary date? Asking in context converts better.
2. Should the month-end close auto-sweep unused petrol and misc into the sinking fund first, and only overflow into the emergency fund once the sinking fund hits a ceiling? That is probably the right behaviour, but it needs a ceiling number.
3. Do you want a PIN or biometric lock on app open? Recommended, given what the app holds, but it fights the two-tap quick-add.
